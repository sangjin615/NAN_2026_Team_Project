import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateOutput } from '../generation-server.js';

const runtimeRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const reportRoot = path.join(runtimeRoot, 'reports', 'model-benchmark');
const skillRoot = path.join(process.env.USERPROFILE, '.codex', 'skills', 'generate-auction-content');
const skillValidator = path.join(skillRoot, 'scripts', 'validate-output.mjs');
const endpoint = process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434';
const models = (process.env.BENCHMARK_MODELS || 'qwen3.5:9b,qwen3:14b').split(',').filter(Boolean);
const trials = Math.max(1, Number(process.env.BENCHMARK_TRIALS || 1));
const timeoutMs = Math.max(1000, Number(process.env.BENCHMARK_TIMEOUT_MS || 120000));
const runId = process.env.BENCHMARK_RUN_ID || `repair-${new Date().toISOString().replace(/[:.]/g, '-')}`;
const sourceRequestPath = process.env.BENCHMARK_REQUEST_PATH
  ? path.resolve(process.env.BENCHMARK_REQUEST_PATH)
  : path.join(runtimeRoot, 'reports', 'local-model-experiment', 'day-1-request.json');
const sourceRequest = JSON.parse(await readFile(sourceRequestPath, 'utf8'));
const request = sourceRequest.request || sourceRequest;
if (request.mode !== 'daily-content' || request.lots?.length !== 8) throw new Error('benchmark request must contain one daily-content request with 8 LOTs');
const contract = await readFile(path.join(runtimeRoot, 'contracts', 'compact-generation-contract.txt'), 'utf8');

const text = { type: 'string', minLength: 1 };
const boundedText = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const fixedObject = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const lotSchema = ({ lotId }) => fixedObject({ lotId: { const: lotId }, displayName: boundedText(20), description: boundedText(70), rumor: boundedText(45), setHint: boundedText(25), npcReaction: boundedText(45) });
const dailySchema = fixedObject({
  schemaVersion: { const: '1.0' }, day: { const: request.day }, marketHeadline: text,
  lots: { type: 'array', prefixItems: request.lots.map(lotSchema), minItems: request.lots.length, maxItems: request.lots.length },
});
const categoryVocabulary = {
  CER: '유약, 굽, 몸체, 손잡이, 뚜껑, 항아리, 도자',
  CLK: '문자판, 바늘, 태엽, 케이스, 시계, 크로노미터, 유리돔, 골격',
  PNT: '화폭, 안료, 액자, 그림',
  BOK: '종이, 표지, 제본, 책등, 잉크',
  MET: '금속, 표면, 이음새, 녹, 은제, 황동',
  JEW: '보석, 진주, 세팅, 체인, 받침, 장식, 펜던트, 티아라, 팔찌, 목걸이',
};

async function callModel(model, prompt, format, temperature) {
  const startedAt = Date.now();
  const response = await fetch(`${endpoint}/api/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, think: false, format, options: { temperature } }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const raw = await response.json();
  return { output: JSON.parse(raw.response), latencyMs: Date.now() - startedAt, promptEvalCount: raw.prompt_eval_count, evalCount: raw.eval_count };
}

function validationErrors(output) {
  try { validateOutput(request, output); return []; }
  catch (error) { return [error.message]; }
}

function invalidIndexes(errors) {
  if (errors.some((error) => /duplicate descriptions|shape mismatch|LOT IDs mismatch/.test(error))) return request.lots.map((_, index) => index);
  const indexes = new Set();
  for (const error of errors) for (const match of error.matchAll(/lot (\d+)/g)) indexes.add(Number(match[1]) - 1);
  return indexes.size ? [...indexes] : request.lots.map((_, index) => index);
}

await mkdir(reportRoot, { recursive: true });
const requestPath = path.join(reportRoot, `${runId}-request.json`);
await writeFile(requestPath, JSON.stringify(request, null, 2));
const observations = [];

for (const model of models) {
  for (let trial = 1; trial <= trials; trial += 1) {
    const attempts = [];
    let output;
    try {
      const first = await callModel(model, `${contract}\nINPUT:\n${JSON.stringify(request)}`, dailySchema, 0.3);
      output = first.output;
      const errors = validationErrors(output);
      attempts.push({ stage: 'full', temperature: 0.3, ...first, output: undefined, errors });
      const failedPath = path.join(reportRoot, `${runId}-${model.replace(/[:/]/g, '-')}-t${trial}-full.json`);
      await writeFile(failedPath, JSON.stringify({ runId, model, trial, stage: 'full', request, errors, output }, null, 2));

      if (errors.length) {
        const indexes = invalidIndexes(errors);
        for (const index of indexes) {
          const lot = request.lots[index];
          const prompt = `${contract}\nRETRY_ERRORS:\n${errors.join('; ')}\nGenerate exactly one corrected LOT record. Focus only on the errors for lot ${index + 1}. The description must be one complete sentence of 45 Korean characters or fewer, naturally contain at least one of these ${lot.category} words: ${categoryVocabulary[lot.category]}, and end exactly with one of: 남아 있다., 보인다., 확인된다., 이어진다., 드러난다. Keep setHint at 18 Korean characters or fewer.\nINPUT LOT:\n${JSON.stringify(lot)}`;
          const repaired = await callModel(model, prompt, lotSchema(lot), 0.1);
          output.lots[index] = repaired.output;
          attempts.push({ stage: 'repair', lotIndex: index, temperature: 0.1, ...repaired, output: undefined, errors: [] });
        }
      }
    } catch (error) {
      attempts.push({ stage: output ? 'repair' : 'full', errors: [error.message] });
    }

    const errors = output ? validationErrors(output) : ['no output'];
    const artifactPath = path.join(reportRoot, `${runId}-${model.replace(/[:/]/g, '-')}-t${trial}-final.json`);
    await writeFile(artifactPath, JSON.stringify({ runId, model, trial, passed: !errors.length, fallbackRequired: Boolean(errors.length), errors, attempts, output }, null, 2));
    const skillCheck = spawnSync(process.execPath, [skillValidator, requestPath, artifactPath], { encoding: 'utf8' });
    observations.push({
      model, trial, passed: !errors.length, fallbackRequired: Boolean(errors.length), errors,
      skillValidatorPassed: skillCheck.status === 0,
      repairedLots: attempts.filter((item) => item.stage === 'repair').length,
      totalLatencyMs: attempts.reduce((sum, item) => sum + (item.latencyMs || 0), 0),
      totalEvalCount: attempts.reduce((sum, item) => sum + (item.evalCount || 0), 0),
      artifact: path.basename(artifactPath),
    });
    process.stdout.write(`${model} trial ${trial}: ${errors.length ? 'FALLBACK' : 'PASS'}; repaired ${observations.at(-1).repairedLots}; ${observations.at(-1).totalLatencyMs}ms\n`);
  }
}

const combinations = models.map((model) => {
  const rows = observations.filter((item) => item.model === model);
  const passes = rows.filter((item) => item.passed).length;
  return {
    model, harness: 'runtime-schema-selective-lot-repair', trials: rows.length, passes, passRate: passes / rows.length,
    fallbackCount: rows.filter((item) => item.fallbackRequired).length,
    averageRepairedLots: rows.reduce((sum, item) => sum + item.repairedLots, 0) / rows.length,
    averageLatencyMs: Math.round(rows.reduce((sum, item) => sum + item.totalLatencyMs, 0) / rows.length),
    averageEvalCount: Math.round(rows.reduce((sum, item) => sum + item.totalEvalCount, 0) / rows.length),
  };
});
const summary = { runId, measuredAt: new Date().toISOString(), sourceRequestPath, requestDay: request.day, rules: { fullTemperature: 0.3, repairTemperature: 0.1, maxRepairRounds: 1, fallbackAfterRepairFailure: true, timeoutMs }, combinations, observations };
const summaryPath = path.join(reportRoot, `${runId}-summary.json`);
await writeFile(summaryPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ summaryPath, combinations }, null, 2));
