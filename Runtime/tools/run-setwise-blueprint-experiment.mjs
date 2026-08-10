import { readFile, writeFile } from 'node:fs/promises';

const seed = process.argv[2] || `setwise-${Date.now()}`;
const port = Number(process.env.GENERATION_PORT || 8791);
process.env.GENERATION_PORT = String(port);
process.env.OLLAMA_MODEL ||= 'qwen3:14b';

const { startGenerationServer } = await import('../generation-server.js');
const sourceUrl = new URL('../reports/local-model-experiment/run-start-request.json', import.meta.url);
const reportRoot = new URL('../reports/local-model-experiment/', import.meta.url);
const source = JSON.parse(await readFile(sourceUrl, 'utf8'));
const categories = Object.keys(source.market);
const marketSignals = Array.from({ length: 12 }, (_, index) => {
  const leadingCategory = categories.reduce((best, category) => (
    Math.abs(source.market[category][index] - 1) > Math.abs(source.market[best][index] - 1) ? category : best
  ), categories[0]);
  const value = source.market[leadingCategory][index];
  return { day: index + 1, leadingCategory, direction: value > 1.04 ? '상승' : value < 0.96 ? '하락' : '보합' };
});
const request = { schemaVersion: '1.0', mode: 'run-blueprint', runSeed: seed, sets: source.sets, marketSignals };
const requestUrl = new URL(`run-start-request.${seed}.json`, reportRoot);
const outputUrl = new URL(`run-start-output.${seed}.json`, reportRoot);
await writeFile(requestUrl, JSON.stringify(request, null, 2));

const server = startGenerationServer();
try {
  const startedAt = Date.now();
  const response = await fetch(`http://127.0.0.1:${port}/generate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
  });
  const output = await response.json();
  const artifact = { model: process.env.OLLAMA_MODEL, seed, status: response.status, latencyMs: Date.now() - startedAt, output };
  await writeFile(outputUrl, JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ status: response.status, latencyMs: artifact.latencyMs, setCount: output.sets?.length, request: requestUrl.pathname, output: outputUrl.pathname, error: output.error }));
  if (!response.ok) process.exitCode = 1;
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
