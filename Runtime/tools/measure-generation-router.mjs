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
// 세트 대체는 deterministicFallback 이 아니라 fallbackSetIncident 가 만든다.
// 문구가 서로 달라서 전자와만 비교하면 대체된 세트를 생성으로 잘못 센다.
import { fallbackSetIncident, validateOutput } from '../generation-server.js';

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
// 모델은 환경변수로만 정해진다. 안 주면 라우터의 기본값이 조용히 쓰인다.
// 무엇으로 불렸는지 여기 찍지 않으면 "내가 바꾼 게 먹었나"를 확인할 길이 없다.
for (const [key, fallback, note] of [
  ['PRIMARY_MODEL', 'openai/gpt-oss-120b', 'groq · 일자 생성만'],
  ['SECONDARY_MODEL', 'gpt-4o-mini', 'openai'],
  ['FALLBACK_MODEL', 'gpt-5.6-luna', 'openai'],
]) {
  console.log(`${key}: ${env[key] || `${fallback} (기본값)`}  — ${note}`);
}
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
  for (const { name, provider, model, error, errors, lotId, setId, indices } of mine) {
    const who = model ? `${provider}:${model}` : provider || '-';
    const why = describeReason(error) || describeReason(errors) || name;
    const key = `${who} · ${name} · ${String(why).slice(0, 90)}`;
    const entry = bucket.get(key) || { count: 0, where: [] };
    entry.count += 1;
    // 복구 로그는 lotId 대신 고칠 자리 목록을 남긴다. dailyRepairIndices 가
    // 전체를 돌려줬는지 한 자리만 골랐는지가 진단에서 갈린다.
    const at = lotId || setId || (Array.isArray(indices) ? `lot ${indices.map((index) => index + 1).join(',') || '없음'}` : null);
    if (at) entry.where.push(at);
    bucket.set(key, entry);
  }
  console.log(`  실패 기록 (${label})`);
  for (const [key, { count, where }] of [...bucket].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`    ${String(count).padStart(2)}회  ${key}${where.length ? `  [${where.slice(0, 3).join(', ')}${where.length > 3 ? ' …' : ''}]` : ''}`);
  }
}

// 응답 전체가 fallback 과 같은지만 보면 **부분 대체를 놓친다.** 2026-08-07 실측에서
// groq 가 8 LOT 중 6개를 429 로 잃고 그 자리를 대체 문구로 메웠는데, 헤더에는
// groq 가 찍히고 전체 비교로는 '실제 생성' 으로 보였다. 라우터의 전멸 방지 장치도
// 전부 실패했을 때만 도니 6/8 은 그대로 통과한다. 항목 단위로 센다.
function fallbackShare(request, output) {
  const base = deterministicFallback(request);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const key = output.lots ? 'lots' : 'sets';
  const produced = output[key] || [];
  // 대체 문구의 출처가 둘이다. 일자 LOT 은 deterministicFallback().lots 를 그대로
  // 쓰지만, 세트는 fallbackSetIncident() 가 따로 만든다. 둘 다 대조해야 한다.
  const isFallbackItem = (item, index) => same(item, (base[key] || [])[index])
    || (key === 'sets' && same(item, fallbackSetIncident(request.sets[index], index)));
  const fell = produced.filter(isFallbackItem).length;
  return {
    key,
    total: produced.length,
    fell,
    // 표본은 실제로 생성된 항목에서 뽑아야 한다. 앞자리가 대체된 응답에서
    // [0] 을 찍으면 대체 문구를 생성 결과로 보여주게 된다.
    firstGenerated: produced.findIndex((item, index) => !isFallbackItem(item, index)),
    // 프레임(일자 헤드라인 · 런 premise)은 항목 밖이라 따로 본다.
    frameFell: output.lots ? same(output.marketHeadline, base.marketHeadline) : same(output.premise, base.premise),
    whole: same(output, base),
  };
}

async function measure(label, request) {
  const startedAt = Date.now();
  const response = await handler({ body: JSON.stringify(request), requestContext: { http: { method: 'POST' } } });
  const elapsed = Date.now() - startedAt;
  const source = response.headers['x-generation-source'] || '(없음)';
  const output = JSON.parse(response.body);
  let contractOk = true;
  try { validateOutput(request, output); } catch { contractOk = false; }
  const share = fallbackShare(request, output);
  const isFallback = share.whole;
  const generated = share.total - share.fell;
  console.log(`[${label}] ${response.statusCode} · ${(elapsed / 1000).toFixed(1)}초`);
  console.log(`  x-generation-source : ${source}`);
  console.log(`  계약 검증           : ${contractOk ? '통과' : '실패'}`);
  console.log(`  실제 생성           : ${share.key} ${generated}/${share.total}${share.fell ? ` · 대체 ${share.fell}` : ''}${share.frameFell ? ' · 프레임 대체' : ''}`);
  // 헤더는 공급자가 하나라도 만들면 그 이름을 찍는다. 절반이 대체 문구여도
  // 200 과 provider 이름이 온다. 여기서 그것을 드러낸다.
  // 전체가 fallback 인 경우는 '부분' 이 아니다. 헤더도 static 이라 오해가 없다.
  if (!isFallback && (share.fell || share.frameFell)) {
    console.log(`  ⚠ 부분 대체         : 헤더는 ${source} 지만 내용 일부는 생성이 아니다`);
  }
  if (share.firstGenerated >= 0) {
    const item = output[share.key][share.firstGenerated];
    console.log(`  표본                : ${item.incidentTitle || item.description}  [${share.key.slice(0, -1)} ${share.firstGenerated + 1}]`);
  }
  reportProviderFailures(label);
  return { label, elapsed, source, contractOk, isFallback, share };
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
    const share = fallbackShare(request, output);
    return {
      day,
      elapsed: Date.now() - startedAt,
      source: response.headers['x-generation-source'] || '(없음)',
      isFallback: share.whole,
      share,
    };
  }));
  const waveElapsed = Date.now() - waveStartedAt;
  for (const { day, elapsed, source, isFallback, share } of wave) {
    const made = `${share.total - share.fell}/${share.total} 생성`;
    console.log(`  day ${day}  ${(elapsed / 1000).toFixed(1)}초 · ${source} · ${isFallback ? 'fallback' : made}${share.fell && !isFallback ? ' ⚠ 부분 대체' : ''}`);
  }
  const fell = wave.filter(({ isFallback }) => isFallback).length;
  // 동시 호출에서 부분 대체가 늘어나면 rate limit 이다. 전체 fallback 만 세면
  // 그 신호를 놓친다.
  const partial = wave.filter(({ isFallback, share }) => !isFallback && (share.fell || share.frameFell)).length;
  console.log(`  전체 ${(waveElapsed / 1000).toFixed(1)}초 · fallback ${fell}/${wave.length} · 부분 대체 ${partial}/${wave.length}`);
  reportProviderFailures(`동시 ${waveDays.length}일`);
  // 단건은 되는데 동시에는 떨어진다면 원인은 계약이 아니라 동시성이다.
  if (fell && !results[1].isFallback) {
    console.log('  단건은 생성됐는데 동시 호출에서 떨어졌다. rate limit 을 의심할 것.');
  }
  results.push({ label: `동시 ${waveDays.length}일`, elapsed: waveElapsed, source: `fallback ${fell}/${wave.length}`, isFallback: fell > 0 });
}

console.log('\n[요약]');
for (const { label, elapsed, source, isFallback, share } of results) {
  const made = share ? `${share.total - share.fell}/${share.total} 생성${share.fell ? ` · 대체 ${share.fell}` : ''}` : '생성';
  console.log(`  ${label.padEnd(14)} ${(elapsed / 1000).toFixed(1)}초 · ${source} · ${isFallback ? 'fallback' : made}`);
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
// 부분 대체는 헤더도 200 도 계약 검증도 통과한다. 여기서 걸러내지 않으면
// 절반이 대체 문구인 응답을 성공으로 읽게 된다.
if (results.some(({ isFallback, share }) => !isFallback && share && (share.fell || share.frameFell))) {
  console.log('\n부분 대체가 있다. 헤더에 공급자 이름이 찍혀도 내용 일부는 생성이 아니다.');
  process.exitCode = 1;
}
