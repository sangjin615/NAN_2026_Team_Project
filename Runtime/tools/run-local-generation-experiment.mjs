// 로컬 모델로 생성 계약을 시험한다.
//
//   node tools/run-local-generation-experiment.mjs [model] <seed>
//
// 생성은 generation-server.js 의 generate() 를 그대로 쓴다. 그쪽은 blueprint 를
// 세트 단위로 만들고, 일자 생성은 실패한 LOT 만 골라 복구한다. 예전에는 이
// 도구가 blueprint 전체를 한 번에 요구했고 그래서 운영과 다른 것을 측정했다.
// 실제로 같은 모델이 이 경로에서는 통과하는데 도구에서는 매번 탈락했다.
//
// 이 도구는 실험 기록만 남긴다. 정식 fixture(run-start-output.json,
// day-1-output.json)는 건드리지 않는다. 통과한 쌍을 올리는 것은 별도 명령이다.
//
//   npm run experiment:promote
//
// 예전에는 request 를 제자리에 덮어쓰면서 output 은 -latest 로만 써서, 실험을
// 돌릴 때마다 request 만 전진하고 output 은 멈춰 있었다.
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const model = process.argv[2] || 'qwen3:14b';
const seed = process.argv[3];
if (!seed) {
  console.error('usage: run-local-generation-experiment.mjs [model] <seed>');
  console.error('seed 를 생략하면 request 가 매번 달라져 결과를 비교할 수 없다.');
  process.exit(2);
}

// generation-server.js 는 불러오는 시점에 모델을 읽는다. 그 전에 정해야 한다.
process.env.OLLAMA_MODEL = model;
const { generate } = await import('../generation-server.js');

const runtimeRoot = new URL('../', import.meta.url);
const reportRoot = new URL('./reports/local-model-experiment/', runtimeRoot);

const prepared = spawnSync(process.execPath, [fileURLToPath(new URL('./tools/prepare-local-generation-experiment.js', runtimeRoot)), seed], { stdio: 'inherit' });
if (prepared.status !== 0) process.exit(prepared.status || 1);

async function run(requestName, outputName) {
  const request = JSON.parse(await readFile(new URL(requestName, reportRoot), 'utf8'));
  const startedAt = Date.now();
  let output;
  try {
    output = await generate(request);
  } catch (error) {
    console.error(`${outputName}: invalid — ${error.message}`);
    return null;
  }
  const artifact = { model, seed, latencyMs: Date.now() - startedAt, output };
  await writeFile(new URL(outputName, reportRoot), JSON.stringify(artifact, null, 2));
  console.log(`${outputName}: valid (${artifact.latencyMs}ms)`);
  return artifact;
}

// generate() 가 시도별 산출물을 reports/live-generation 에 남기므로 실패한
// 시도의 근거는 그쪽에 보존된다. 여기서 따로 쓰지 않는다.
const blueprint = await run('run-start-request.json', 'run-start-output-latest.json');
if (!blueprint) {
  console.error('Run blueprint generation failed; use the local fallback.');
  process.exit(1);
}
const daily = await run('day-1-request.json', 'day-1-output-latest.json');
if (!daily) {
  console.error('Daily content generation failed; use the local fallback.');
  process.exit(1);
}
console.log(JSON.stringify({ valid: true, model, seed, blueprintLatencyMs: blueprint.latencyMs, dailyLatencyMs: daily.latencyMs }));
console.log('정식 fixture 로 올리려면: npm run experiment:promote');
