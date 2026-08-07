import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.GENERATION_PORT || 8787);
const ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434/api/generate';
const model = process.env.OLLAMA_MODEL || 'qwen3:14b';
// Lambda 번들에는 contracts/ 가 함께 들어가지 않는다. build:lambda 가 esbuild
// define 으로 계약서를 박아 넣고, 로컬 실행에서는 평소대로 파일을 읽는다.
const contract = typeof __BUNDLED_GENERATION_CONTRACT__ === 'string'
  ? __BUNDLED_GENERATION_CONTRACT__
  : await readFile(path.join(runtimeRoot, 'contracts', 'compact-generation-contract.txt'), 'utf8');
export const generationContract = contract;

// 계약서를 모드별 절로 나눈다. 쪼개서 만들기 시작하면서 계약서가 호출마다
// 다시 실린다 — 한 판 121회 호출의 입력 36만 자 중 27만 자(74%)가 계약서다.
// 그런데 LOT 하나를 만드는 호출이 세트 사건 규칙 695자를, blueprint 호출이
// 일자 길이·어미 규칙 1,111자를 쓸 일 없이 싣고 있었다. 필요한 절만 보내면
// 한 판에 약 11만 자, 전체의 30%가 줄어든다.
//
// **복제가 아니다.** 파일은 하나이고 여기서 절을 고를 뿐이라 갈라질 여지가 없다.
// 표식이 없는 계약서를 만나면 전부 ALL 로 들어가 예전과 같이 동작한다.
const contractSections = (() => {
  const sections = { ALL: [], RUN: [], DAY: [] };
  let current = 'ALL';
  for (const line of contract.split(/\r?\n/)) {
    const marker = line.match(/^@(ALL|RUN|DAY)\s*$/);
    if (marker) { current = marker[1]; continue; }
    if (line.trim()) sections[current].push(line);
  }
  return sections;
})();

export function contractFor(mode) {
  const specific = mode === 'run-blueprint' ? contractSections.RUN : contractSections.DAY;
  return [...contractSections.ALL, ...specific].join('\n');
}
const reportRoot = path.join(runtimeRoot, 'reports', 'live-generation');

const text = { type: 'string', minLength: 1 };
const boundedText = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const fixedObject = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const dailyLotSchema = ({ lotId }) => fixedObject({ lotId: { const: lotId }, displayName: boundedText(20), description: boundedText(70), rumor: boundedText(45), setHint: boundedText(25), npcReaction: boundedText(45) });

export function outputSchema(request) {
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
    lots: dailyLotsSchema(request),
  });
}

// LOT 정의를 여덟 번 반복하지 않는다.
//
// 예전에는 `prefixItems: request.lots.map(dailyLotSchema)` 였다. 자리마다 온전한
// 객체 정의가 들어가는데 서로 다른 것은 `lotId` 의 const 한 줄뿐이라, 길이 상한
// 다섯 개가 여덟 번 똑같이 실렸다. 스키마 하나가 3,997자였고 그 중 약 3,600자가
// 이 반복이었다. 계약서(1,343자)의 세 배다.
//
// 지금은 모양을 하나만 두고 `lotId` 를 여덟 개의 enum 으로 좁힌다. 약 500자다.
// 한 판(12일)로 치면 스키마만 48,000자에서 6,000자로 내려간다.
//
// **자리 고정을 잃는 대신 값 집합은 지킨다.** 예전 스키마는 "1번째 자리는
// lot-1" 까지 못박았고 지금은 "여덟 중 하나" 까지만 말한다. 순서는 `INPUT` 의
// lots 배열이 그대로 알려주고, 어긋나면 `validateOutput` 의 LOT ID 검사가 잡는다.
// 스키마는 어차피 강제되는 것이 아니라 프롬프트에 실리는 안내문이라 —
// json_object 모드다 — 검증을 스키마에 기대고 있지 않았다.
//
// `$ref`/`$defs` 로 줄이는 방법도 있었지만 쓰지 않았다. 모델은 평평한 스키마를
// 더 잘 따르고, 간접 참조는 준수율을 떨어뜨릴 수 있다. 토큰을 아끼려다 static
// 낙하가 늘면 손해다.
const dailyLotsSchema = (request) => ({
  type: 'array',
  minItems: request.lots.length,
  maxItems: request.lots.length,
  items: fixedObject({
    lotId: { enum: request.lots.map(({ lotId }) => lotId) },
    displayName: boundedText(20), description: boundedText(70),
    rumor: boundedText(45), setHint: boundedText(25), npcReaction: boundedText(45),
  }),
});

export const blueprintFrameSchema = (request) => fixedObject({
  schemaVersion: { const: '1.0' }, runSeed: { const: request.runSeed }, premise: text,
  marketArc: { type: 'array', minItems: 12, maxItems: 12, items: fixedObject({ day: { type: 'integer' }, headline: text, mood: text }) },
});

export const setIncidentSchema = ({ setId }) => fixedObject({
  setId: { const: setId }, title: text, sharedSecret: text, revealHint: text,
  incidentTitle: text, incidentSummary: text, newspaperLead: text,
});

// 일자 생성을 LOT 단위로 쪼갤 때 쓰는 머리 부분. blueprint 의 프레임과 같은 역할이다.
export const dailyFrameSchema = (request) => fixedObject({
  schemaVersion: { const: '1.0' }, day: { const: request.day }, marketHeadline: text,
});

export function validateInput(request) {
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

// 복구 프롬프트는 로컬 서버와 라우터가 **같은 것**을 써야 한다. 2026-08-07 실측에서
// 라우터에만 이 지시가 빠져 있었고, 그 결과 복구가 같은 `unsafe ending` 을 반복해
// 하루치가 static 으로 떨어졌다 — 8판 중 3판이 그 경로였다.
//
// 어미 목록은 `safeDescriptionEnding` 에서 끌어온다. 문장에 새로 적으면 검증기와
// 갈라진다. 길이 상한을 계약서(70자·25자)보다 좁게(45자·18자) 부르는 것은 의도된
// 여유다 — 복구는 이미 한 번 어긴 뒤라 넉넉히 잡는다.
const descriptionEndings = safeDescriptionEnding.source.match(/\(([^)]+)\)/)?.[1].split('|') ?? [];
export const dailyRepairInstruction = (lotNumber) => `Generate exactly one corrected LOT record for lot ${lotNumber}. The description must be one complete sentence of 45 Korean characters or fewer and end exactly with one of: ${descriptionEndings.map((ending) => `${ending}.`).join(', ')} Keep setHint at 18 Korean characters or fewer.`;

// 여기 있던 `lotWritingHint` 는 지웠다. LOT 을 하나씩 만들 때 여덟이 서로를 못
// 봐서 문구가 닮던 것을 보완하는 장치였는데, 2026-08-07 에 라우터가 하루치를 한
// 번에 만드는 방식으로 돌아가면서 필요가 없어졌다. 모델이 여덟을 다 보면
// 계약서의 "관찰 특징을 서로 다르게" 가 그대로 작동한다 — 배포본 실측에서 매 판
// 어미 5가지, 서로 다른 첫머리 8/8 이 나왔다. 경위는
// `Docs/GENERATION-ROUTER-PARITY.md` 에 있다.
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
    // normalizedClauses 는 10자 미만 조각을 버린다. 그래서 "...있다. 확인된다."
    // 처럼 요구된 어미를 완결된 문장 뒤에 덧붙인 형태가 한 문장으로 세어져
    // 통과했다. 실제로 이 문구가 경매장 카탈로그에 그대로 나갔다. 마침표는
    // 마지막 하나뿐이어야 한다.
    if ((description.match(/\./g) || []).length > 1) errors.push(`lot ${index + 1} description must end with a single period`);
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

export function dailyRepairIndices(request, output) {
  const all = request.lots.map((_, index) => index);
  if (!Array.isArray(output?.lots) || output.lots.length !== request.lots.length) return all;
  if (JSON.stringify(output.lots.map(({ lotId }) => lotId)) !== JSON.stringify(request.lots.map(({ lotId }) => lotId))) return all;
  if (new Set(output.lots.map(({ description }) => description)).size !== output.lots.length) return all;
  const errors = qualityErrors(request, output);
  if (errors.some((error) => error.startsWith('repeated clause'))) return all;
  return [...new Set(errors.flatMap((error) => {
    const match = error.match(/^lot (\d+) /);
    return match ? [Number(match[1]) - 1] : [];
  }))];
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
  const itemId = result.setId || result.lotId;
  const setSuffix = itemId ? `-${String(itemId).replace(/[^a-zA-Z0-9_-]/g, '_')}` : '';
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

export function fallbackSetIncident(inputSet, index) {
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
      frame = await callModel({ request, schema: blueprintFrameSchema(request), attempt, prompt: `${contractFor(request.mode)}${feedback}\nGenerate only the run premise and 12-day marketArc.\nINPUT:\n${JSON.stringify({ ...request, sets: undefined })}` });
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
        output = await callModel({ request, schema: setIncidentSchema(inputSet), attempt, prompt: `${contractFor(request.mode)}${feedback}\nGenerate exactly one set record. The incident must name at least two input baseName values. Do not reuse these headlines: ${JSON.stringify(usedTitles)}.\nINPUT SET:\n${JSON.stringify(inputSet)}` });
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

// 실험 도구도 이 경로를 그대로 쓴다. blueprint 는 세트 단위로, 일자 생성은
// 실패한 LOT 만 골라 다시 만든다. 도구가 자기 방식으로 한 번에 생성하면
// 운영과 다른 것을 측정하게 된다.
export async function generate(request) {
  if (request.mode === 'run-blueprint') return generateBlueprint(request);
  const startedAt = Date.now();
  let output; let firstError;
  try {
    output = await callModel({ request, schema: outputSchema(request), prompt: `${contractFor(request.mode)}\nINPUT:\n${JSON.stringify(request)}`, attempt: 1 });
    validateOutput(request, output);
    await preserve(request, 1, { valid: true, stage: 'full', model, latencyMs: Date.now() - startedAt, request, output });
    return output;
  } catch (error) {
    firstError = error;
    await preserve(request, 1, { valid: false, stage: 'full', model, latencyMs: Date.now() - startedAt, request, output, error: error.message });
  }

  const repairIndices = dailyRepairIndices(request, output);
  if (!output?.lots || repairIndices.length === 0) throw firstError;
  for (const index of repairIndices) {
    const lot = request.lots[index]; const repairStartedAt = Date.now(); let repaired;
    try {
      const prompt = `${contractFor(request.mode)}\nRETRY_ERRORS:\n${firstError.message}\n${dailyRepairInstruction(index + 1)}\nINPUT LOT:\n${JSON.stringify(lot)}`;
      repaired = await callModel({ request, schema: dailyLotSchema(lot), prompt, attempt: 2 });
      output.lots[index] = repaired;
      await preserve(request, 2, { valid: true, stage: 'repair', lotId: lot.lotId, model, latencyMs: Date.now() - repairStartedAt, request: lot, output: repaired });
    } catch (error) {
      await preserve(request, 2, { valid: false, stage: 'repair', lotId: lot.lotId, model, latencyMs: Date.now() - repairStartedAt, request: lot, output: repaired, error: error.message });
      throw error;
    }
  }
  validateOutput(request, output);
  await preserve(request, 2, { valid: true, stage: 'merged-repair', model, latencyMs: Date.now() - startedAt, request, output });
  return output;
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
