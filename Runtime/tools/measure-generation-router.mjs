// AWS 라우터를 배포 없이 실제 공급자에 붙여 측정한다.
//
//   LIVE_GENERATION_ENABLED=true OPENAI_API_KEY=... GROQ_API_KEY=... \
//     node tools/measure-generation-router.mjs [seed]
//
// 라우터는 createHandler({ env }) 로 env 를 받으므로 Lambda 에 배포하지 않아도
// 같은 코드 경로를 그대로 탄다. 키는 이 프로세스의 환경변수로만 들어오고 출력에
// 찍히지 않는다.
//
// 무엇을 보는가:
//   x-generation-source  실제 생성인지(provider:model) fallback 인지(static)
//   지연                  로컬 기준선은 blueprint 51~70초, 일자 16~29초
//   fallback 일치 여부     응답이 deterministicFallback 과 같은지. 같으면 생성이
//                        아니라 대체 문구다. 200 이 왔다고 생성된 것이 아니다
import { readFile } from 'node:fs/promises';
import { createRunSchedule } from '../src/schedule.js';
import { createSetGraph } from '../src/set-graph.js';
import { createMarketPath } from '../src/systems.js';
import { createHandler, deterministicFallback } from '../aws/generation-router.mjs';
import { validateOutput } from '../generation-server.js';

// 플래그를 시드로 먹지 않는다. `--single` 만 주면 argv[2] 가 그것이라 시드가
// 문자열 '--single' 이 되어 LOT ID 까지 그 이름으로 나온다.
const seed = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || 'router-measure';
const catalog = JSON.parse(await readFile(new URL('../assets/items/catalog.json', import.meta.url), 'utf8'));
const balance = JSON.parse(await readFile(new URL('../data/balance.json', import.meta.url), 'utf8'));

const schedule = createRunSchedule({ catalog, balance, seed });
const sets = createSetGraph(schedule, seed);
const market = createMarketPath(balance, seed);
const lotById = new Map(schedule.days.flatMap(({ lots }) => lots).map((lot) => [lot.lotId, lot]));
const categories = Object.keys(market);

const blueprintRequest = {
  schemaVersion: '1.0', mode: 'run-blueprint', runSeed: seed,
  sets: sets.map(({ setId, themeKey, lotIds = [] }) => ({
    setId, themeKey,
    members: lotIds.map((lotId) => lotById.get(lotId)).filter(Boolean).map(({ lotId, baseName, category }) => ({ lotId, baseName, category })),
  })),
  marketSignals: Array.from({ length: 12 }, (_, index) => {
    const leading = categories.reduce((best, category) => (Math.abs(market[category][index] - 1) > Math.abs(market[best][index] - 1) ? category : best), categories[0]);
    const value = market[leading][index];
    return { day: index + 1, leadingCategory: leading, direction: value > 1.04 ? '상승' : value < 0.96 ? '하락' : '보합' };
  }),
};

const dailyRequestFor = (day) => ({
  schemaVersion: '1.0', mode: 'daily-content', runSeed: seed, day,
  lots: schedule.days[day - 1].lots.map(({ lotId, baseName, category, grade, setId }) => ({ lotId, baseName, category, grade, setId })),
});
const dailyRequest = dailyRequestFor(1);

const env = process.env;
if (env.LIVE_GENERATION_ENABLED !== 'true') {
  console.error('LIVE_GENERATION_ENABLED=true 가 필요하다. 없으면 라우터가 공급자를 하나도 만들지 않는다.');
}
for (const key of ['OPENAI_API_KEY', 'GROQ_API_KEY']) {
  // 키 값은 찍지 않는다. 있는지만 알린다.
  console.log(`${key}: ${env[key] ? '설정됨' : '없음'}`);
}
console.log(`LIVE_GENERATION_ENABLED: ${env.LIVE_GENERATION_ENABLED === 'true' ? 'true' : String(env.LIVE_GENERATION_ENABLED)}`);
console.log(`seed: ${seed}\n`);

// 라우터는 공급자가 떨어질 때마다 이유를 logger.warn 으로 남긴다. 그걸 삼키면
// "왜 groq 가 안 잡히는지" 같은 질문에 답할 수 없다. 모아서 뒤에 요약한다.
const events = [];
const handler = createHandler({
  env,
  logger: { info() {}, warn(name, detail) { events.push({ name, ...detail }); } },
});

// 라우터의 cleanError 는 { name, message } 객체를 남긴다. 그대로 문자열에 이어
// 붙이면 `[object Object]` 가 되어 사유가 사라진다. 실제로 그래서 "groq 가 왜
// 떨어지나"를 이 도구로 답할 수 없었다.
function describeReason(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(describeReason).filter(Boolean).join('; ');
  if (value.name || value.message) return [value.name, value.message].filter(Boolean).join(': ');
  return JSON.stringify(value);
}

function reportProviderFailures(label) {
  const mine = events.splice(0, events.length);
  if (!mine.length) return;
  const bucket = new Map();
  for (const { name, provider, model, error, errors, lotId, setId } of mine) {
    const who = model ? `${provider}:${model}` : provider || '-';
    const why = describeReason(error) || describeReason(errors) || name;
    const key = `${who} · ${name} · ${String(why).slice(0, 90)}`;
    const entry = bucket.get(key) || { count: 0, where: [] };
    entry.count += 1;
    if (lotId || setId) entry.where.push(lotId || setId);
    bucket.set(key, entry);
  }
  console.log(`  실패 기록 (${label})`);
  for (const [key, { count, where }] of [...bucket].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`    ${String(count).padStart(2)}회  ${key}${where.length ? `  [${where.slice(0, 3).join(', ')}${where.length > 3 ? ' …' : ''}]` : ''}`);
  }
}

async function measure(label, request) {
  const startedAt = Date.now();
  const response = await handler({ body: JSON.stringify(request), requestContext: { http: { method: 'POST' } } });
  const elapsed = Date.now() - startedAt;
  const source = response.headers['x-generation-source'] || '(없음)';
  const output = JSON.parse(response.body);
  let contractOk = true;
  try { validateOutput(request, output); } catch { contractOk = false; }
  const isFallback = JSON.stringify(output) === JSON.stringify(deterministicFallback(request));
  console.log(`[${label}] ${response.statusCode} · ${(elapsed / 1000).toFixed(1)}초`);
  console.log(`  x-generation-source : ${source}`);
  console.log(`  계약 검증           : ${contractOk ? '통과' : '실패'}`);
  console.log(`  대체 문구인가       : ${isFallback ? '그렇다 — 생성이 아니다' : '아니다 — 실제 생성'}`);
  if (!isFallback && output.sets?.[0]) console.log(`  표본                : ${output.sets[0].incidentTitle}`);
  if (!isFallback && output.lots?.[0]) console.log(`  표본                : ${output.lots[0].description}`);
  reportProviderFailures(label);
  return { label, elapsed, source, contractOk, isFallback };
}

const results = [];
results.push(await measure('run-blueprint', blueprintRequest));
console.log('');
results.push(await measure('daily-content', dailyRequest));

// GenerationBuffer.ensure 는 당일+BUFFER_AHEAD_DAYS 를 Promise.all 로 한꺼번에
// 부른다. 즉 실제 플레이에서는 일자 요청 3건이 동시에 나간다. 단건 측정만으로는
// 공급자 rate limit 이 드러나지 않는다 — 로컬 ollama 는 순차 처리라 느릴 뿐이지만
// Groq·OpenAI 는 동시 요청에 다르게 반응한다.
if (!process.argv.includes('--single')) {
  const waveDays = [1, 2, 3];
  console.log(`\n[동시 ${waveDays.length}일] GenerationBuffer.ensure 와 같은 모양으로 한꺼번에 부른다`);
  const waveStartedAt = Date.now();
  const wave = await Promise.all(waveDays.map(async (day) => {
    const startedAt = Date.now();
    const request = dailyRequestFor(day);
    const response = await handler({ body: JSON.stringify(request), requestContext: { http: { method: 'POST' } } });
    const output = JSON.parse(response.body);
    return {
      day,
      elapsed: Date.now() - startedAt,
      source: response.headers['x-generation-source'] || '(없음)',
      isFallback: JSON.stringify(output) === JSON.stringify(deterministicFallback(request)),
    };
  }));
  const waveElapsed = Date.now() - waveStartedAt;
  for (const { day, elapsed, source, isFallback } of wave) {
    console.log(`  day ${day}  ${(elapsed / 1000).toFixed(1)}초 · ${source} · ${isFallback ? 'fallback' : '생성'}`);
  }
  const fell = wave.filter(({ isFallback }) => isFallback).length;
  console.log(`  전체 ${(waveElapsed / 1000).toFixed(1)}초 · fallback ${fell}/${wave.length}`);
  reportProviderFailures(`동시 ${waveDays.length}일`);
  // 단건은 되는데 동시에는 떨어진다면 원인은 계약이 아니라 동시성이다.
  if (fell && !results[1].isFallback) {
    console.log('  단건은 생성됐는데 동시 호출에서 떨어졌다. rate limit 을 의심할 것.');
  }
  results.push({ label: `동시 ${waveDays.length}일`, elapsed: waveElapsed, source: `fallback ${fell}/${wave.length}`, isFallback: fell > 0 });
}

console.log('\n[요약]');
for (const { label, elapsed, source, isFallback } of results) {
  console.log(`  ${label.padEnd(14)} ${(elapsed / 1000).toFixed(1)}초 · ${source} · ${isFallback ? 'fallback' : '생성'}`);
}
console.log('  로컬 기준선     blueprint 51~70초 · daily 16~29초 (qwen3:14b)');
// API Gateway 통합 타임아웃은 보통 29초다. 배포하면 이걸 넘는 요청은 아예 못 쓴다.
for (const { label, elapsed } of results) {
  if (elapsed > 29000) console.log(`  ${label} 이 29초를 넘는다 — API Gateway 통합 타임아웃에 걸린다`);
}
if (results.some(({ isFallback }) => isFallback)) {
  console.log('\n하나라도 fallback 이면 공급자가 실패했거나 꺼져 있다. 200 응답만으로 판단하지 말 것.');
  process.exitCode = 1;
}
