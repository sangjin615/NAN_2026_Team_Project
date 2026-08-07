// 생성 API 감사. 계약 검증은 generation-server.js 의 실제 검증기를 그대로 쓴다.
// 검증 로직을 여기서 다시 구현하면 계약이 갈라지므로 절대 복제하지 않는다.
//
//   node tools/audit-generation.mjs            연결 전. 설정과 fallback, 기존 리포트를 본다
//   node tools/audit-generation.mjs --live     연결 후. 실제 엔드포인트를 호출해 측정한다
//   node tools/audit-generation.mjs --live --days 3 --seed audit-01
//
// 문제가 있으면 종료 코드 1.
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(runtimeRoot, path), 'utf8');

const argv = process.argv.slice(2);
const live = argv.includes('--live');
const flag = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const days = Number(flag('--days', '3'));
const seed = flag('--seed', 'audit-run');

const { createRunSchedule } = await import('../src/schedule.js');
const { createSetGraph } = await import('../src/set-graph.js');
const { createInitialState } = await import('../src/game-state.js');
const { GenerationApiProvider } = await import('../src/generation-api-provider.js');
const { GenerationBuffer } = await import('../src/generation-buffer.js');
const { qualityErrors } = await import('../generation-server.js');

const catalog = JSON.parse(await read('assets/items/catalog.json'));
const balance = JSON.parse(await read('data/balance.json'));
const apiConfig = JSON.parse(await read('data/api-config.json'));
const contractText = await read('contracts/compact-generation-contract.txt');

const findings = [];
const add = (severity, message, detail = '') => findings.push({ severity, message, detail });
// 두 모드 모두 같은 자리에 기준선을 남긴다. 연결 전후를 나란히 비교하기 위함이다.
const summary = { auditedAt: new Date().toISOString(), mode: live ? 'live' : 'offline', seed, apiConfig };
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
};

// 계약서가 선언한 항목별 상한. audit-runtime.mjs 가 서버 강제값과의 일치를 따로 본다.
const limits = {};
const limitsLine = contractText.match(/Daily limits per item:([^\n]+)/);
if (limitsLine) for (const m of limitsLine[1].matchAll(/(\w+)\s+(\d+)/g)) limits[m[1]] = Number(m[2]);

console.log(`생성 API 감사 — ${live ? '라이브' : '오프라인'} 모드\n`);

// ------------------------------------------------------------- 1) 설정 점검
const blueprintTimeout = apiConfig.blueprintTimeoutMs ?? apiConfig.timeoutMs ?? 8000;
const dayTimeout = apiConfig.dayTimeoutMs ?? apiConfig.timeoutMs ?? 8000;
console.log('[설정]');
console.log(`  enabled=${apiConfig.enabled} endpoint=${apiConfig.endpoint}`);
console.log(`  블루프린트 타임아웃 ${blueprintTimeout}ms · 일자 타임아웃 ${dayTimeout}ms · 재시도 ${apiConfig.retries ?? 0}회`);
// ensure 는 당일+2일치를 병렬로 부르므로 최악 대기는 두 타임아웃의 합이다.
console.log(`  새 게임 최악 대기 = ${((blueprintTimeout + dayTimeout) / 1000).toFixed(1)}초 (블루프린트 + 병렬 일자)`);
if (apiConfig.schemaVersion !== '1.0') add('error', `schemaVersion 이 1.0 이 아니다: ${apiConfig.schemaVersion}`);
if (blueprintTimeout + dayTimeout > 60000) {
  add('warn', `새 게임 최악 대기가 ${((blueprintTimeout + dayTimeout) / 1000).toFixed(0)}초다`, '로딩 화면에 취소 수단이 없다');
}
if (live && !apiConfig.enabled) add('error', '--live 인데 api-config.json 의 enabled 가 false 다');
if (!live && apiConfig.enabled) add('warn', 'enabled 가 true 인데 오프라인 모드로 돌렸다', '--live 로 실제 측정을 권한다');

// --------------------------------------------------- 2) fallback 경로 확인
// API 가 죽어도 런이 진행되어야 한다. 연결 전후 모두 이 성질은 유지되어야 한다.
{
  const schedule = createRunSchedule({ catalog, balance, seed: `${seed}-fallback` });
  const sets = createSetGraph(schedule, `${seed}-fallback`);
  const state = createInitialState({ schedule, sets, balance });
  // 반드시 실패하는 설정으로 강제해 fallback 만 남긴다.
  const buffer = new GenerationBuffer({ provider: new GenerationApiProvider({ ...apiConfig, enabled: false }) });
  const startedAt = Date.now();
  await buffer.prepareRun({ runSeed: seed, sets, schedule, market: state.marketPath });
  await buffer.ensure({ currentDay: 1, schedule, sets, aheadDays: 2 });
  const elapsed = Date.now() - startedAt;
  const provenances = new Set(schedule.days.slice(0, 3).flatMap((day) => day.lots).map((lot) => lot.content?.provenance));
  console.log(`\n[fallback] ${elapsed}ms · provenance=${[...provenances].join(',')}`);
  const missing = schedule.days.slice(0, 3).flatMap((day) => day.lots).filter((lot) => !lot.content).length;
  if (missing) add('error', `API 없이 콘텐츠가 비어 있는 LOT 이 ${missing}개다`, 'fallback 이 깨졌다');
  else console.log('  API 실패해도 3일치 콘텐츠가 모두 채워진다');
  if (elapsed > 1000) add('warn', `비활성 상태 fallback 이 ${elapsed}ms 걸린다`, '즉시 반환되어야 한다');
}

// -------------------------------------- 3) 문구 길이를 계약 상한과 대조한다
// 라이브에서 상한을 넘으면 지금 붙은 API 의 문제라 오류다. 오프라인에서 보는 것은
// 과거 기록이므로 개별 항목을 오류로 올리지 않고 아래 표와 요약으로만 알린다.
function measureLots(lots, label, bucket) {
  for (const lot of lots) {
    for (const [field, limit] of Object.entries(limits)) {
      const value = String(lot[field] ?? '');
      if (!value) continue;
      bucket[field] ??= [];
      bucket[field].push(value.length);
      if (value.length > limit && live) {
        add('error', `${label} ${lot.lotId} 의 ${field} 가 상한 ${limit}자를 넘는다 (${value.length}자)`);
      }
    }
  }
}

function reportLengths(bucket) {
  const rows = Object.entries(bucket).filter(([, list]) => list.length);
  if (!rows.length) return;
  console.log('\n[문구 길이] 항목 · 표본 · 중앙 · p90 · 최대 · 상한');
  for (const [field, list] of rows) {
    const over = list.filter((length) => length > (limits[field] ?? Infinity)).length;
    console.log(`  ${field.padEnd(12)} ${String(list.length).padStart(4)} ${String(percentile(list, 0.5)).padStart(5)} ${String(percentile(list, 0.9)).padStart(5)} ${String(Math.max(...list)).padStart(5)} ${String(limits[field] ?? '-').padStart(5)}${over ? `  초과 ${over}건` : ''}`);
    if (over && !live) {
      add('warn', `${field} 가 상한 ${limits[field]}자를 넘긴 기록이 ${over}/${list.length}건 있다`, '서버 검증에 걸려 재시도나 fallback 이 된다');
    }
  }
}

if (!live) {
  // ------------------------------------------- 오프라인: 기존 리포트 분석
  const reportDir = 'reports/live-generation';
  let names = [];
  try { names = (await readdir(resolve(runtimeRoot, reportDir))).filter((name) => name.endsWith('.json')); } catch { /* 없으면 건너뛴다 */ }
  if (!names.length) {
    console.log('\n[기존 리포트] 없음 — 연결 후 --live 로 기준선을 만들 것');
  } else {
    const latencies = { blueprint: [], daily: [] };
    const errorCounts = {};
    let valid = 0;
    const bucket = {};
    for (const name of names) {
      let entry;
      try { entry = JSON.parse(await read(`${reportDir}/${name}`)); } catch { continue; }
      const kind = name.includes('blueprint') ? 'blueprint' : 'daily';
      if (Number.isFinite(entry.latencyMs)) latencies[kind].push(entry.latencyMs);
      if (entry.valid) valid += 1;
      else errorCounts[String(entry.error).slice(0, 60)] = (errorCounts[String(entry.error).slice(0, 60)] || 0) + 1;
      if (Array.isArray(entry.output?.lots)) measureLots(entry.output.lots, name, bucket);
    }
    console.log(`\n[기존 리포트] ${names.length}건 · 성공 ${valid} (${((valid / names.length) * 100).toFixed(0)}%)`);
    for (const kind of ['blueprint', 'daily']) {
      const list = latencies[kind];
      if (list.length) console.log(`  ${kind} 지연 중앙 ${percentile(list, 0.5)}ms · p90 ${percentile(list, 0.9)}ms · 최대 ${Math.max(...list)}ms`);
    }
    const timeoutKey = { blueprint: blueprintTimeout, daily: dayTimeout };
    for (const kind of ['blueprint', 'daily']) {
      const over = latencies[kind].filter((value) => value > timeoutKey[kind]).length;
      if (over) add('warn', `기존 ${kind} 기록 ${latencies[kind].length}건 중 ${over}건이 현재 타임아웃 ${timeoutKey[kind]}ms 를 넘는다`, '연결 후 그만큼 fallback 으로 떨어진다');
    }
    const topErrors = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (topErrors.length) {
      console.log('  실패 사유 상위');
      for (const [message, count] of topErrors) console.log(`    ${String(count).padStart(3)}회  ${message}`);
    }
    reportLengths(bucket);
    add('info', '기존 리포트는 옛 스키마로 만들어졌을 수 있다', '연결 후 --live 기준선으로 대체할 것');
    Object.assign(summary, {
      source: 'reports/live-generation',
      reportCount: names.length,
      validCount: valid,
      latency: Object.fromEntries(Object.entries(latencies).map(([kind, list]) => [kind, list.length
        ? { samples: list.length, p50: percentile(list, 0.5), p90: percentile(list, 0.9), max: Math.max(...list) } : null])),
      errorCounts,
      lengths: bucket,
    });
  }
} else {
  // ------------------------------------------------ 라이브: 실제 호출 측정
  const schedule = createRunSchedule({ catalog, balance, seed });
  const sets = createSetGraph(schedule, seed);
  const state = createInitialState({ schedule, sets, balance });
  const provider = new GenerationApiProvider(apiConfig);

  let blueprint = null;
  const blueprintStart = Date.now();
  try {
    blueprint = await provider.generateBlueprint({ runSeed: seed, sets, schedule, market: state.marketPath });
    console.log(`\n[블루프린트] 성공 ${Date.now() - blueprintStart}ms`);
  } catch (error) {
    console.log(`\n[블루프린트] 실패 ${Date.now() - blueprintStart}ms — ${error.message}`);
    add('error', `블루프린트 생성 실패: ${error.message}`, '런 전체가 fallback 사건 문구를 쓰게 된다');
  }

  const bucket = {};
  const latencies = [];
  let apiDays = 0;
  let fallbackDays = 0;
  console.log('\n[일자 생성]');
  for (let day = 1; day <= days; day += 1) {
    const lots = schedule.days[day - 1].lots;
    const startedAt = Date.now();
    try {
      const generated = await provider.generateDay({ day, lots, sets, blueprint });
      const elapsed = Date.now() - startedAt;
      latencies.push(elapsed);
      apiDays += 1;
      measureLots(generated, `day${day}`, bucket);
      // 서버의 실제 품질 검증기를 그대로 태운다.
      const request = { lots: lots.map(({ lotId, baseName, category, grade, setId }) => ({ lotId, baseName, category, grade, setId })) };
      const errors = qualityErrors(request, { lots: generated });
      console.log(`  ${day}일차 성공 ${elapsed}ms · 품질 지적 ${errors.length}건`);
      for (const message of errors.slice(0, 4)) add('warn', `${day}일차 품질: ${message}`);
    } catch (error) {
      fallbackDays += 1;
      console.log(`  ${day}일차 실패 ${Date.now() - startedAt}ms — ${error.message}`);
      add('error', `${day}일차 생성 실패: ${error.message}`);
    }
  }
  if (latencies.length) {
    console.log(`\n  지연 중앙 ${percentile(latencies, 0.5)}ms · p90 ${percentile(latencies, 0.9)}ms · 최대 ${Math.max(...latencies)}ms · 타임아웃 ${dayTimeout}ms`);
    const near = latencies.filter((value) => value > dayTimeout * 0.8).length;
    if (near) add('warn', `${near}건이 타임아웃의 80% 를 넘었다`, '여유가 부족하다');
  }
  console.log(`  API ${apiDays}일 · fallback ${fallbackDays}일`);
  if (fallbackDays) add('warn', `${days}일 중 ${fallbackDays}일이 fallback 으로 떨어졌다`, '한 런 안에서 생성문과 fallback 문구가 섞인다');
  reportLengths(bucket);

  Object.assign(summary, {
    days,
    apiDays,
    fallbackDays,
    latency: latencies.length ? { samples: latencies.length, p50: percentile(latencies, 0.5), p90: percentile(latencies, 0.9), max: Math.max(...latencies) } : null,
    lengths: bucket,
  });
}

summary.findings = findings;
await mkdir(resolve(runtimeRoot, 'reports'), { recursive: true });
await writeFile(resolve(runtimeRoot, 'reports/generation-audit.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log('\nreports/generation-audit.json 에 기준선을 기록했다');

// ----------------------------------------------------------------- 결과 출력
const mark = { error: 'ERROR', warn: 'WARN ', info: 'INFO ' };
const order = { error: 0, warn: 1, info: 2 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);
const counts = { error: 0, warn: 0, info: 0 };
for (const finding of findings) counts[finding.severity] += 1;

console.log('');
for (const { severity, message, detail } of findings) {
  console.log(`[${mark[severity]}] ${message}`);
  if (detail) console.log(`          ${detail}`);
}
if (!findings.length) console.log('문제 없음');
console.log(`\n오류 ${counts.error} · 경고 ${counts.warn} · 참고 ${counts.info}`);

process.exit(counts.error > 0 ? 1 : 0);
