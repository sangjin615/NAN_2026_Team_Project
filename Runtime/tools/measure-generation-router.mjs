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

const seed = process.argv[2] || 'router-measure';
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

const handler = createHandler({ env, logger: { info() {}, warn() {} } });

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
