import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.GENERATION_PORT || 8787);
const ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434/api/generate';
const model = process.env.OLLAMA_MODEL || 'qwen2.5-coder:14b';
const contract = await readFile(path.join(runtimeRoot, 'contracts', 'compact-generation-contract.txt'), 'utf8');
const reportRoot = path.join(runtimeRoot, 'reports', 'live-generation');

const text = { type: 'string', minLength: 1 };
const fixedObject = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

function outputSchema(request) {
  if (request.mode === 'run-blueprint') return fixedObject({
    schemaVersion: { const: '1.0' }, runSeed: { const: request.runSeed }, premise: text,
    marketArc: { type: 'array', minItems: 12, maxItems: 12, items: fixedObject({ day: { type: 'integer' }, headline: text, mood: text }) },
    sets: { type: 'array', prefixItems: request.sets.map(({ setId }) => fixedObject({ setId: { const: setId }, title: text, sharedSecret: text, revealHint: text })), minItems: request.sets.length, maxItems: request.sets.length },
  });
  return fixedObject({
    schemaVersion: { const: '1.0' }, day: { const: request.day }, marketHeadline: text,
    lots: { type: 'array', prefixItems: request.lots.map(({ lotId }) => fixedObject({ lotId: { const: lotId }, displayName: text, description: text, rumor: text, setHint: text, npcReaction: text })), minItems: request.lots.length, maxItems: request.lots.length },
  });
}

function validateInput(request) {
  if (request?.schemaVersion !== '1.0') throw new Error('unsupported schemaVersion');
  if (request.mode === 'run-blueprint') {
    if (!request.runSeed || request.sets?.length !== 12 || request.marketSignals?.length !== 12) throw new Error('invalid run-blueprint request');
    return;
  }
  if (request.mode === 'daily-content') {
    if (!Number.isInteger(request.day) || request.lots?.length !== 8) throw new Error('invalid daily-content request');
    return;
  }
  throw new Error('unsupported generation mode');
}

function validateOutput(request, output) {
  if (output.schemaVersion !== '1.0') throw new Error('schemaVersion mismatch');
  const serialized = JSON.stringify(output);
  for (const forbidden of ['basePrice', 'trueValue', 'reward', 'multiplier', 'probability']) if (serialized.includes(`"${forbidden}"`)) throw new Error(`forbidden field: ${forbidden}`);
  if (request.mode === 'run-blueprint') {
    if (output.runSeed !== request.runSeed || output.marketArc?.length !== 12) throw new Error('run blueprint shape mismatch');
    if (JSON.stringify(output.sets?.map(({ setId }) => setId)) !== JSON.stringify(request.sets.map(({ setId }) => setId))) throw new Error('set IDs mismatch');
    return;
  }
  if (output.day !== request.day || output.lots?.length !== 8) throw new Error('daily output shape mismatch');
  if (JSON.stringify(output.lots.map(({ lotId }) => lotId)) !== JSON.stringify(request.lots.map(({ lotId }) => lotId))) throw new Error('LOT IDs mismatch');
  if (new Set(output.lots.map(({ description }) => description)).size !== 8) throw new Error('duplicate descriptions');
}

async function preserve(request, attempt, result) {
  if (process.env.GENERATION_LOG === 'off') return;
  await mkdir(reportRoot, { recursive: true });
  const safeSeed = String(request.runSeed || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  await writeFile(path.join(reportRoot, `${safeSeed}-${request.mode}-d${request.day || 0}-attempt-${attempt}.json`), JSON.stringify(result, null, 2));
}

async function generate(request) {
  const prompt = `${contract}\nINPUT:\n${JSON.stringify(request)}`;
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    try {
      const response = await fetch(ollamaEndpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, think: false, format: outputSchema(request), options: { temperature: attempt === 1 ? 0.3 : 0.1 } }),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const raw = await response.json();
      const output = JSON.parse(raw.response);
      validateOutput(request, output);
      await preserve(request, attempt, { valid: true, model, latencyMs: Date.now() - startedAt, request, output });
      return output;
    } catch (error) {
      lastError = error;
      await preserve(request, attempt, { valid: false, model, latencyMs: Date.now() - startedAt, request, error: error.message });
    }
  }
  throw lastError;
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type' };
createServer(async (request, response) => {
  if (request.method === 'OPTIONS') { response.writeHead(204, cors); return response.end(); }
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { ...cors, 'content-type': 'application/json; charset=utf-8' });
    return response.end(JSON.stringify({ ok: true, provider: 'ollama', model }));
  }
  if (request.method !== 'POST' || request.url !== '/generate') {
    response.writeHead(404, { ...cors, 'content-type': 'application/json; charset=utf-8' });
    return response.end(JSON.stringify({ error: 'not found' }));
  }
  try {
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 256 * 1024) throw new Error('request too large'); chunks.push(chunk); }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    validateInput(input);
    const output = await generate(input);
    response.writeHead(200, { ...cors, 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(output));
  } catch (error) {
    response.writeHead(502, { ...cors, 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: error.message }));
  }
}).listen(port, '127.0.0.1', () => console.log(`Unknown Auction generation API: http://127.0.0.1:${port}/generate (${model})`));
