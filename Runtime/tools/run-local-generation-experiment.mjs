import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { outputSchema, validateOutput } from '../generation-server.js';

const model = process.argv[2] || 'qwen3:14b';
const seed = process.argv[3] || `local-${Date.now()}`;
const runtimeRoot = new URL('../', import.meta.url);
const reportRoot = new URL('./reports/local-model-experiment/', runtimeRoot);
const contract = await readFile(new URL('./contracts/compact-generation-contract.txt', runtimeRoot), 'utf8');

const prepared = spawnSync(process.execPath, [fileURLToPath(new URL('./tools/prepare-local-generation-experiment.js', runtimeRoot)), seed], { stdio: 'inherit' });
if (prepared.status !== 0) process.exit(prepared.status || 1);

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
    const attemptUrl = new URL(`${outputName.replace('.json', '')}.${seed}.attempt-${attempt}.json`, reportRoot);
    await writeFile(attemptUrl, JSON.stringify(artifact, null, 2));
    try {
      validateOutput(requestObject, output);
      process.stdout.write(`${outputName} attempt ${attempt}: ${JSON.stringify({ valid: true, errors: [] })}\n`);
      await writeFile(new URL(outputName, reportRoot), JSON.stringify(artifact, null, 2));
      return artifact;
    } catch (error) {
      process.stdout.write(`${outputName} attempt ${attempt}: ${JSON.stringify({ valid: false, errors: [error.message] })}\n`);
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
