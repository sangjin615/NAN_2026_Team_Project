// 로컬 모델로 생성 계약을 시험한다.
//
//   node tools/run-local-generation-experiment.mjs [model] [seed]
//
// 이 도구는 실험 기록만 남긴다. 정식 fixture(run-start-output.json,
// day-1-output.json)는 건드리지 않는다. 통과한 쌍을 정식으로 올리는 것은
// 별도 명령이다.
//
//   npm run experiment:promote
//
// 예전에는 이 파일이 request 를 제자리에 덮어쓰면서 output 은 -latest 로만
// 써서, 실험을 돌릴 때마다 request 만 전진하고 output 은 멈춰 있었다. 짝이
// 깨진 fixture 로 검증이 실패하는 것이 정상 동작이 되어 있었다.
//
// 계약과 검증기는 저장소 것을 쓴다. 사용자 홈의 스킬 자산을 운영 계약으로
// 쓰면 다른 PC 나 제출 환경에서 재현되지 않는다.
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateOutput } from '../generation-server.js';

const model = process.argv[2] || 'qwen3:14b';
const seed = process.argv[3];
if (!seed) {
  console.error('usage: run-local-generation-experiment.mjs [model] <seed>');
  console.error('seed 를 생략하면 request 가 매번 달라져 결과를 비교할 수 없다.');
  process.exit(2);
}
const runtimeRoot = new URL('../', import.meta.url);
const reportRoot = new URL('./reports/local-model-experiment/', runtimeRoot);
const contract = await readFile(new URL('./contracts/compact-generation-contract.txt', runtimeRoot), 'utf8');

const prepared = spawnSync(process.execPath, [fileURLToPath(new URL('./tools/prepare-local-generation-experiment.js', runtimeRoot)), seed], { stdio: 'inherit' });
if (prepared.status !== 0) process.exit(prepared.status || 1);

// Ollama 의 제한 디코딩에 넘길 스키마. 계약서의 RUN/DAY 형태와 같아야 한다.
// 합격 여부를 정하는 것은 아래 validateOutput 이지 이 스키마가 아니다 —
// 여기에 계약에 없는 필드를 넣으면 모델이 그걸 만들어내고 검증에서 떨어진다.
const text = { type: 'string', minLength: 1 };
const fixedObject = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
function outputSchema(request) {
  if (request.mode === 'run-blueprint') return fixedObject({
    schemaVersion: { const: '1.0' }, runSeed: { const: request.runSeed }, premise: text,
    marketArc: { type: 'array', minItems: 12, maxItems: 12, items: fixedObject({ day: { type: 'integer' }, headline: text, mood: text }) },
    sets: { type: 'array', prefixItems: request.sets.map(({ setId }) => fixedObject({
      setId: { const: setId }, title: text, sharedSecret: text, revealHint: text,
      incidentTitle: text, incidentSummary: text, newspaperLead: text,
    })), minItems: request.sets.length, maxItems: request.sets.length },
  });
  return fixedObject({
    schemaVersion: { const: '1.0' }, day: { const: request.day }, marketHeadline: text,
    lots: { type: 'array', prefixItems: request.lots.map(({ lotId }) => fixedObject({ lotId: { const: lotId }, displayName: text, description: text, rumor: text, setHint: text, npcReaction: text })), minItems: request.lots.length, maxItems: request.lots.length },
  });
}

async function generate(requestName, outputName, extraContext = '') {
  const requestUrl = new URL(requestName, reportRoot);
  const request = await readFile(requestUrl, 'utf8');
  const requestObject = JSON.parse(request);
  const prompt = `${contract}\n${extraContext}\nINPUT:\n${request}`;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    const response = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, think: false, format: outputSchema(requestObject), options: { temperature: attempt === 1 ? 0.3 : 0.1 } }),
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    const raw = await response.json();
    let output;
    try { output = JSON.parse(raw.response); } catch { output = { invalidJson: raw.response }; }
    const artifact = { model, seed, attempt, temperature: attempt === 1 ? 0.3 : 0.1, latencyMs: Date.now() - startedAt, output };
    // 실패한 시도도 보존한다. 무엇이 왜 떨어졌는지가 다음 계약 수정의 근거다.
    await writeFile(new URL(`${outputName.replace('.json', '')}.${seed}.attempt-${attempt}.json`, reportRoot), JSON.stringify(artifact, null, 2));
    let failure = '';
    try { validateOutput(requestObject, output); } catch (error) { failure = error.message; }
    console.log(`${outputName} attempt ${attempt}: ${failure ? `invalid — ${failure}` : 'valid'}`);
    if (!failure) {
      await writeFile(new URL(outputName, reportRoot), JSON.stringify(artifact, null, 2));
      return artifact;
    }
  }
  return null;
}

const blueprint = await generate('run-start-request.json', 'run-start-output-latest.json');
if (!blueprint) {
  console.error('Run blueprint validation failed twice; use the local fallback.');
  process.exit(1);
}
const daily = await generate('day-1-request.json', 'day-1-output-latest.json', `RUN BLUEPRINT:\n${JSON.stringify(blueprint.output)}`);
if (!daily) {
  console.error('Daily content validation failed twice; use the local fallback.');
  process.exit(1);
}
console.log(JSON.stringify({ valid: true, model, seed, blueprintLatencyMs: blueprint.latencyMs, dailyLatencyMs: daily.latencyMs }));
console.log('정식 fixture 로 올리려면: npm run experiment:promote');
