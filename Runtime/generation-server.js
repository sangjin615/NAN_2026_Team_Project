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
const boundedText = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
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
    lots: { type: 'array', prefixItems: request.lots.map(({ lotId }) => fixedObject({ lotId: { const: lotId }, displayName: boundedText(20), description: boundedText(70), rumor: boundedText(45), setHint: boundedText(25), npcReaction: boundedText(45) })), minItems: request.lots.length, maxItems: request.lots.length },
  });
}

const blueprintFrameSchema = (request) => fixedObject({
  schemaVersion: { const: '1.0' }, runSeed: { const: request.runSeed }, premise: text,
  marketArc: { type: 'array', minItems: 12, maxItems: 12, items: fixedObject({ day: { type: 'integer' }, headline: text, mood: text }) },
});

const setIncidentSchema = ({ setId }) => fixedObject({
  setId: { const: setId }, title: text, sharedSecret: text, revealHint: text,
  incidentTitle: text, incidentSummary: text, newspaperLead: text,
});

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
  /할 수 있/, /해 ?준다/, /번역/, /새로운 세계/, /(?:^|\s)힘[을이]?\s/, /효과/, /가치가/, /가격/, /시세/,
  /매우 특별/, /품질이 뛰어/, /고유한 디자인/, /유용할 것/, /느껴진다/, /뛰어난다/,
  /세련된/, /돋보인다/, /는다\.$/,
];
const safeDescriptionEnding = /(남아 있다|보인다|확인된다|이어진다|드러난다)\.$/;
const categoryTerms = {
  CER: /유약|굽|몸체|손잡이|뚜껑|항아리|도자/, CLK: /문자판|바늘|태엽|케이스|시계|크로노미터|유리돔|골격/,
  PNT: /화폭|안료|액자|그림|캔버스/, BOK: /종이|표지|제본|책등|잉크|지도|문서/,
  MET: /금속|표면|이음새|녹|은제|황동/, JEW: /보석|진주|세팅|체인|받침|장식|펜던트|티아라|팔찌|목걸이/,
};

const normalizedClauses = (value) => String(value).split(/[.!?]/).map((part) => part.trim().replace(/\s+/g, ' ')).filter((part) => part.length >= 10);
const incidentBanned = /마법|마력|주술|유령|귀신|예언|예지|초자연|가격|시세|가치|낙찰|보상|확률/;
const hasKorean = (value) => /[가-힣]/.test(String(value));

export function setIncidentErrors(inputSet, output, accepted = []) {
  const errors = [];
  const fields = ['title', 'sharedSecret', 'revealHint', 'incidentTitle', 'incidentSummary', 'newspaperLead'];
  if (output?.setId !== inputSet.setId) errors.push('setId mismatch');
  for (const field of fields) {
    if (!String(output?.[field] || '').trim()) errors.push(`missing ${field}`);
    else if (!hasKorean(output[field])) errors.push(`${field} must be Korean`);
  }
  const incidentCopy = `${output?.incidentSummary || ''} ${output?.newspaperLead || ''}`;
  const linkedNames = (inputSet.members || []).filter(({ baseName }) => baseName && incidentCopy.includes(baseName));
  if (new Set(linkedNames.map(({ baseName }) => baseName)).size < Math.min(2, inputSet.members?.length || 0)) errors.push('incident must name at least two set members');
  if (incidentBanned.test(`${output?.incidentTitle || ''} ${incidentCopy}`)) errors.push('incident contains magic, prediction, or price language');
  if (output?.incidentTitle === output?.incidentSummary || output?.incidentSummary === output?.newspaperLead) errors.push('incident fields must be distinct');
  const signature = normalizedClauses(incidentCopy).join('|');
  if (accepted.some((item) => item.incidentTitle === output?.incidentTitle)) errors.push('incident title repeats another set');
  if (signature && accepted.some((item) => normalizedClauses(`${item.incidentSummary} ${item.newspaperLead}`).join('|') === signature)) errors.push('incident copy repeats another set');
  return [...new Set(errors)];
}

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
    const accepted = [];
    output.sets.forEach((set, index) => {
      const errors = setIncidentErrors(request.sets[index], set, accepted);
      if (errors.length) throw new Error(`set ${request.sets[index].setId}: ${errors.join('; ')}`);
      accepted.push(set);
    });
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
  const setSuffix = result.setId ? `-${String(result.setId).replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
  await writeFile(path.join(reportRoot, `${safeSeed}-${request.mode}${setSuffix}-d${request.day || 0}-attempt-${attempt}.json`), JSON.stringify(result, null, 2));
}

async function callModel({ request, schema, prompt, attempt }) {
  const response = await fetch(ollamaEndpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt, stream: false, think: false, format: schema, options: { temperature: attempt === 1 ? 0.3 : 0.1 } }),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const raw = await response.json();
  return JSON.parse(raw.response);
}

function fallbackSetIncident(inputSet, index) {
  const [first, second = first] = (inputSet.members || []).map(({ baseName }) => baseName);
  const places = ['항구 보관소', '북문 세관 창고', '옛 조합 기록실', '강변 운송소'];
  const actors = ['창고 관리인', '세관 서기', '운송 조합원', '도시 기록관'];
  const place = places[index % places.length]; const actor = actors[index % actors.length];
  return {
    setId: inputSet.setId,
    title: `${place}의 인계 기록`,
    sharedSecret: `${first}와 ${second}에 같은 인계 번호가 남아 있다.`,
    revealHint: '같은 인계 번호와 보관소 표식',
    incidentTitle: `${place} 제${index + 1}호 누락 장부 발견`,
    incidentSummary: `${actor}이 ${place}에서 ${first}와 ${second}를 함께 적은 누락 장부를 발견했다.`,
    newspaperLead: `${place} 정리 중 발견된 장부에서 ${first}와 ${second}의 공동 인계 기록이 확인됐다. 도시 기록국은 두 물품의 이전 보관 경위를 조사하고 있다.`,
  };
}

async function generateBlueprint(request) {
  let frame; let frameError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    try {
      const feedback = attempt === 2 ? `\nRETRY_ERRORS:\n${frameError.message}` : '';
      frame = await callModel({ request, schema: blueprintFrameSchema(request), attempt, prompt: `${contract}${feedback}\nGenerate only the run premise and 12-day marketArc.\nINPUT:\n${JSON.stringify({ ...request, sets: undefined })}` });
      if (frame.runSeed !== request.runSeed || frame.marketArc?.length !== 12) throw new Error('run blueprint frame shape mismatch');
      await preserve(request, attempt, { valid: true, stage: 'frame', model, latencyMs: Date.now() - startedAt, request, output: frame });
      break;
    } catch (error) {
      frameError = error;
      await preserve(request, attempt, { valid: false, stage: 'frame', model, latencyMs: Date.now() - startedAt, request, output: frame, error: error.message });
    }
  }
  if (!frame) frame = { schemaVersion: '1.0', runSeed: request.runSeed, premise: '도시 경매소에 모인 물품들의 인계 기록을 추적한다.', marketArc: request.marketSignals.map(({ day, leadingCategory, direction }) => ({ day, headline: `${leadingCategory} 거래 기록`, mood: direction })) };

  const generatedSets = [];
  for (let index = 0; index < request.sets.length; index += 1) {
    const inputSet = request.sets[index]; let output; let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const startedAt = Date.now();
      try {
        const feedback = attempt === 2 ? `\nRETRY_ERRORS:\n${lastError.message}` : '';
        const usedTitles = generatedSets.map(({ incidentTitle }) => incidentTitle);
        output = await callModel({ request, schema: setIncidentSchema(inputSet), attempt, prompt: `${contract}${feedback}\nGenerate exactly one set record. The incident must name at least two input baseName values. Do not reuse these headlines: ${JSON.stringify(usedTitles)}.\nINPUT SET:\n${JSON.stringify(inputSet)}` });
        const errors = setIncidentErrors(inputSet, output, generatedSets);
        if (errors.length) throw new Error(errors.join('; '));
        await preserve(request, attempt, { valid: true, stage: 'set', setId: inputSet.setId, model, latencyMs: Date.now() - startedAt, request: inputSet, output });
        break;
      } catch (error) {
        lastError = error;
        await preserve(request, attempt, { valid: false, stage: 'set', setId: inputSet.setId, model, latencyMs: Date.now() - startedAt, request: inputSet, output, error: error.message });
        output = null;
      }
    }
    generatedSets.push(output || fallbackSetIncident(inputSet, index));
  }
  const merged = { ...frame, schemaVersion: '1.0', runSeed: request.runSeed, sets: generatedSets };
  validateOutput(request, merged);
  return merged;
}

async function generate(request) {
  if (request.mode === 'run-blueprint') return generateBlueprint(request);
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    let output;
    try {
      const retryFeedback = attempt > 1 ? `\nRETRY_ERRORS:\n${lastError.message}` : '';
      const prompt = `${contract}${retryFeedback}\nINPUT:\n${JSON.stringify(request)}`;
      output = await callModel({ request, schema: outputSchema(request), prompt, attempt });
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
