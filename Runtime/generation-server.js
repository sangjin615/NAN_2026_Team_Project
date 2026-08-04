import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.GENERATION_PORT || 8787);
const ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434/api/generate';
const model = process.env.OLLAMA_MODEL || 'qwen3:14b';
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

const bannedDescription = [
  /할 수 있/, /해 ?준다/, /번역/, /새로운 세계/, /힘[을이]?\s/, /효과/, /가치가/, /가격/, /시세/,
  /매우 특별/, /품질이 뛰어/, /고유한 디자인/, /유용할 것/, /느껴진다/, /뛰어난다/,
  /세련된/, /돋보인다/, /는다\.$/,
];
const safeDescriptionEnding = /(남아 있다|보인다|확인된다|이어진다|드러난다)\.$/;
const categoryTerms = {
  CER: /유약|굽|몸체|손잡이|도자/, CLK: /문자판|바늘|태엽|케이스|시계|크로노미터/,
  PNT: /화폭|안료|액자|그림|캔버스/, BOK: /종이|표지|제본|책등|잉크|지도|문서/,
  MET: /금속|표면|이음새|녹|은제|황동/, JEW: /보석|세팅|체인|받침|장식|펜던트|티아라|팔찌/,
};

const normalizedClauses = (value) => String(value).split(/[.!?]/).map((part) => part.trim().replace(/\s+/g, ' ')).filter((part) => part.length >= 10);

export function qualityErrors(request, output) {
  if (request.mode !== 'daily-content' || !Array.isArray(output.lots)) return [];
  const errors = [];
  const clauses = new Map();
  output.lots.forEach((lot, index) => {
    const description = String(lot.description || '').trim();
    const expectedName = request.lots[index]?.baseName;
    const category = request.lots[index]?.category;
    if (lot.displayName !== expectedName) errors.push(`lot ${index + 1} displayName must exactly copy baseName`);
    if (description.length > 70) errors.push(`lot ${index + 1} description exceeds 70 chars`);
    if (!safeDescriptionEnding.test(description)) errors.push(`lot ${index + 1} description has unsafe ending`);
    if (categoryTerms[category] && !categoryTerms[category].test(description)) errors.push(`lot ${index + 1} description does not match category ${category}`);
    if (normalizedClauses(description).length !== 1) errors.push(`lot ${index + 1} description must be one sentence`);
    for (const pattern of bannedDescription) if (pattern.test(description)) errors.push(`lot ${index + 1} banned phrase ${pattern.source}`);
    for (const clause of normalizedClauses(description.replace(expectedName || '', ''))) clauses.set(clause, (clauses.get(clause) || 0) + 1);
    for (const [field, limit] of [['displayName', 20], ['rumor', 45], ['setHint', 25], ['npcReaction', 45]]) {
      if (!String(lot[field] || '').trim()) errors.push(`lot ${index + 1} missing ${field}`);
      if (String(lot[field] || '').length > limit) errors.push(`lot ${index + 1} ${field} exceeds ${limit} chars`);
    }
  });
  for (const [clause, count] of clauses) if (count > 2) errors.push(`repeated clause (${count}): ${clause}`);
  return [...new Set(errors)];
}

export function validateOutput(request, output) {
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
  const errors = qualityErrors(request, output);
  if (errors.length) throw new Error(`copy quality: ${errors.join('; ')}`);
}

async function preserve(request, attempt, result) {
  if (process.env.GENERATION_LOG === 'off') return;
  await mkdir(reportRoot, { recursive: true });
  const safeSeed = String(request.runSeed || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  await writeFile(path.join(reportRoot, `${safeSeed}-${request.mode}-d${request.day || 0}-attempt-${attempt}.json`), JSON.stringify(result, null, 2));
}

async function generate(request) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    let output;
    try {
      const retryFeedback = attempt > 1 ? `\nRETRY_ERRORS:\n${lastError.message}` : '';
      const prompt = `${contract}${retryFeedback}\nINPUT:\n${JSON.stringify(request)}`;
      const response = await fetch(ollamaEndpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, think: false, format: outputSchema(request), options: { temperature: attempt === 1 ? 0.3 : 0.1 } }),
      });
      if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
      const raw = await response.json();
      output = JSON.parse(raw.response);
      validateOutput(request, output);
      await preserve(request, attempt, { valid: true, model, latencyMs: Date.now() - startedAt, request, output });
      return output;
    } catch (error) {
      lastError = error;
      await preserve(request, attempt, { valid: false, model, latencyMs: Date.now() - startedAt, request, output, error: error.message });
    }
  }
  throw lastError;
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type' };
export function startGenerationServer() {
  return createServer(async (request, response) => {
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startGenerationServer();
