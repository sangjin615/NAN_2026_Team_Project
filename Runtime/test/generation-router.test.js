import assert from 'node:assert/strict';
import test from 'node:test';
import { createHandler, deterministicFallback } from '../aws/generation-router.mjs';
import { validateOutput } from '../generation-server.js';

const dailyRequest = {
  schemaVersion: '1.0', mode: 'daily-content', runSeed: 'router-test', day: 1,
  lots: ['CER', 'CLK', 'PNT', 'BOK', 'MET', 'JEW', 'CER', 'BOK'].map((category, index) => ({
    lotId: `lot-${index + 1}`, baseName: `시험 물품 ${index + 1}`, category, grade: 'COMMON', setId: `set-${index + 1}`,
  })),
};

const blueprintRequest = {
  schemaVersion: '1.0', mode: 'run-blueprint', runSeed: 'router-blueprint',
  marketSignals: Array.from({ length: 12 }, (_, index) => ({ day: index + 1, leadingCategory: 'CER', direction: '상승' })),
  sets: Array.from({ length: 12 }, (_, index) => ({
    setId: `set-${index + 1}`,
    members: [{ baseName: `물품 ${index + 1}A` }, { baseName: `물품 ${index + 1}B` }],
  })),
};

const event = (request) => ({ body: JSON.stringify(request), requestContext: { http: { method: 'POST' } } });
const jsonResponse = (payload, status = 200) => ({ ok: status < 400, status, statusText: '', json: async () => payload });
const openAiPayload = (output) => ({ output_text: JSON.stringify(output) });
const groqPayload = (output) => ({ choices: [{ message: { content: JSON.stringify(output) } }] });
const dailyFallback = deterministicFallback(dailyRequest);
// 일자 생성도 프레임 1회 + LOT 단위로 쪼개진다. 공급자를 흉내낼 때 어느 조각을
// 물었는지 보고 그 조각만 돌려줘야 한다.
const dailyPartFromBody = (body) => {
  const input = body.input || body.messages?.[1]?.content || '';
  if (input.includes('Generate only the day headline')) {
    const { lots, ...frame } = dailyFallback;
    return frame;
  }
  const index = dailyRequest.lots.findIndex(({ lotId }) => input.includes(`"lotId":"${lotId}"`));
  return dailyFallback.lots[index] ?? dailyFallback.lots[0];
};
const blueprintFallback = deterministicFallback(blueprintRequest);
const blueprintPartFromBody = (body) => {
  const input = body.input || body.messages?.[1]?.content || '';
  if (input.includes('Generate only the run premise')) {
    const { sets, ...frame } = blueprintFallback;
    return frame;
  }
  const setId = blueprintRequest.sets.find(({ setId }) => input.includes(`\"setId\":\"${setId}\"`))?.setId;
  return blueprintFallback.sets.find((set) => set.setId === setId);
};

test('deterministic fallback satisfies daily and blueprint contracts', () => {
  for (const request of [dailyRequest, blueprintRequest]) validateOutput(request, deterministicFallback(request));
});

test('uses Groq first and stops after a valid result', async () => {
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    return jsonResponse(groqPayload(dailyPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-generation-source'], 'groq:openai/gpt-oss-120b');
  // 프레임 1회 + LOT 8회. 하나라도 다른 모델이 섞이면 폴스루가 일어난 것이다.
  assert.equal(models.length, 9);
  assert.ok(models.every((model) => model === 'openai/gpt-oss-120b'));
});

test('falls through Groq to gpt-4o-mini, then stops', async () => {
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    if (url.includes('groq.com')) return jsonResponse({ error: { message: 'rate limited' } }, 429);
    return jsonResponse(openAiPayload(dailyPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-4o-mini');
  // groq 는 조각마다 429 를 받아 전부 떨어지고, 그제서야 다음 공급자로 넘어간다.
  assert.deepEqual([...new Set(models)], ['openai/gpt-oss-120b', 'gpt-4o-mini']);
  assert.equal(models.at(-1), 'gpt-4o-mini');
});

test('uses Luna after two invalid candidates', async () => {
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    if (body.model !== 'gpt-5.6-luna') {
      return url.includes('groq.com') ? jsonResponse(groqPayload({ bad: true })) : jsonResponse(openAiPayload({ bad: true }));
    }
    return jsonResponse(openAiPayload(dailyPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-5.6-luna');
  assert.deepEqual([...new Set(models)], ['openai/gpt-oss-120b', 'gpt-4o-mini', 'gpt-5.6-luna']);
});

test('a lot that keeps failing falls back alone and the rest of the day survives', async () => {
  // 예전에는 하루치를 한 번에 만들다 타임아웃이 나면 output 이 없어 복구 경로도
  // 못 탔다. 이제 실패는 그 LOT 하나에 갇힌다.
  const badLotId = dailyRequest.lots[3].lotId;
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    const input = body.input || body.messages?.[1]?.content || '';
    if (input.includes(`"lotId":"${badLotId}"`)) throw new Error('timeout');
    return jsonResponse(openAiPayload(dailyPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-4o-mini');
  const output = JSON.parse(response.body);
  validateOutput(dailyRequest, output);
  assert.equal(output.lots.length, 8);
  assert.deepEqual(output.lots[3], dailyFallback.lots[3]);
});

test('returns validated static content when every provider fails', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-generation-source'], 'static');
  validateOutput(dailyRequest, JSON.parse(response.body));
});

test('rejects malformed requests without contacting a provider', async () => {
  let called = false;
  const response = await createHandler({ env: { GROQ_API_KEY: 'test' }, fetchImpl: async () => { called = true; }, logger: {} })({ body: '{}' });
  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});

test('keeps live providers disabled until explicitly enabled', async () => {
  let called = false;
  const response = await createHandler({ env: { GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl: async () => { called = true; }, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'static');
  assert.equal(called, false);
});

test('skips Groq for the blueprint that exceeds its free TPM budget', async () => {
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    return jsonResponse(openAiPayload(blueprintPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(blueprintRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-4o-mini');
  assert.equal(models.length, 13);
  assert.ok(models.every((model) => model === 'gpt-4o-mini'));
});

test('generates blueprint sets in bounded parallel waves and carries accepted headlines forward', async () => {
  let active = 0; let maxActive = 0;
  const prompts = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); prompts.push(body.input); active += 1; maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return jsonResponse(openAiPayload(blueprintPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(blueprintRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-4o-mini');
  assert.equal(maxActive, 5); // frame + four sets
  assert.match(prompts.find((prompt) => prompt.includes('INPUT SET') && prompt.includes('set-5')), /1번 창고에서 발견된 운송 장부/);
  validateOutput(blueprintRequest, JSON.parse(response.body));
});

test('repairs only the lots that break a whole-day rule', async () => {
  // LOT 단위로 만들면 개별 검증은 통과하는데 묶어놓고 보면 설명이 겹치는 경우가
  // 생긴다. 그때 dailyRepairIndices 가 고칠 자리만 고른다.

  const requestedRepairs = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    const input = body.input || body.messages?.[1]?.content || '';
    if (input.includes('Generate exactly one corrected LOT')) {
      const index = dailyRequest.lots.findIndex(({ lotId }) => input.includes(`"lotId":"${lotId}"`));
      requestedRepairs.push(index);
      return jsonResponse(groqPayload(dailyFallback.lots[index]));
    }
    // 5번 LOT 만 rumor 가 상한 45자를 넘는다. lot 5 로 특정되는 국소 오류다.
    // (중복 설명은 설계상 전체 복구 대상이라 부분 복구 검증에 쓸 수 없다.)
    if (input.includes(`"lotId":"${dailyRequest.lots[4].lotId}"`)) {
      return jsonResponse(groqPayload({ ...dailyFallback.lots[4], rumor: '소'.repeat(60) }));
    }
    return jsonResponse(groqPayload(dailyPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'groq:openai/gpt-oss-120b');
  assert.ok(requestedRepairs.length > 0 && requestedRepairs.length < dailyRequest.lots.length, JSON.stringify(requestedRepairs));
  validateOutput(dailyRequest, JSON.parse(response.body));
});
