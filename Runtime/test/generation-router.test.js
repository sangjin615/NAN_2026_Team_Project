import assert from 'node:assert/strict';
import test from 'node:test';
import { createHandler, deterministicFallback } from '../aws/generation-router.mjs';
import { contractFor, generationContract, validateOutput } from '../generation-server.js';

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
// 일자 생성은 하루치를 한 번에 만든다. 복구만 LOT 하나짜리 호출이므로, 공급자를
// 흉내낼 때 어느 쪽을 물었는지 보고 그에 맞는 모양을 돌려줘야 한다.
const dailyPartFromBody = (body) => {
  const input = body.input || body.messages?.[1]?.content || '';
  if (input.includes('INPUT LOT')) {
    const index = dailyRequest.lots.findIndex(({ lotId }) => input.includes(`"lotId":"${lotId}"`));
    return dailyFallback.lots[index] ?? dailyFallback.lots[0];
  }
  return dailyFallback;
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

test('the mode contract keeps every rule and drops the other mode', () => {
  const run = contractFor('run-blueprint');
  const day = contractFor('daily-content');
  // 표식(@ALL·@RUN·@DAY)을 잘못 적으면 그 절이 어느 쪽에도 안 실린다. 모델은
  // 규칙이 사라진 줄 모르고 답하고, 검증기만 뒤늦게 떨어뜨린다. 여기서 잡는다.
  const rules = generationContract.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('@'));
  assert.ok(rules.length >= 8, `계약서 줄이 ${rules.length}개다. 파일이 비었나`);
  for (const rule of rules) {
    assert.ok(run.includes(rule) || day.includes(rule), `어느 모드에도 안 실린 줄: ${rule.slice(0, 40)}`);
  }
  assert.ok(run.includes('RUN: {'), 'blueprint 에 RUN 스키마가 있어야 한다');
  assert.ok(day.includes('DAY: {'), 'daily 에 DAY 스키마가 있어야 한다');
  // 줄이는 것이 목적이다. 서로의 규칙을 나르지 않는다.
  assert.ok(!run.includes('Daily limits per item'), 'blueprint 가 일자 길이 규칙을 나르고 있다');
  assert.ok(!day.includes('Each input set includes members'), 'daily 가 세트 사건 규칙을 나르고 있다');
  assert.ok(day.length < generationContract.length, 'daily 절이 전문보다 짧아야 한다');
});

test('a day is asked for in one call, not eight', async () => {
  // 쪼개면 여덟 호출이 서로를 못 봐서 문구가 닮고, 호출 수가 늘어 groq TPM 을
  // 넘기며, 지연이 게이트웨이 30초를 넘는다. 2026-08-07 배포본 로그에서 luna 가
  // 하루치를 6.8초에 해낸 것을 보고 되돌렸다.
  const bodies = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    bodies.push(body);
    return jsonResponse(openAiPayload(dailyPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-5.6-luna');
  assert.equal(bodies.length, 1, `호출이 ${bodies.length}건이다. 하루치는 한 번에 만든다`);
  assert.ok(!bodies[0].input.includes('INPUT LOT'), 'LOT 하나짜리 프롬프트가 나갔다');
  validateOutput(dailyRequest, JSON.parse(response.body));
});

test('the router sends only the mode section as instructions', async () => {
  const sent = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body.instructions);
    return jsonResponse(openAiPayload(dailyPartFromBody(body)));
  };
  await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.ok(sent.length > 0);
  for (const instructions of sent) {
    assert.ok(instructions.includes('DAY: {'), '일자 호출인데 DAY 스키마가 없다');
    assert.ok(!instructions.includes('Each input set includes members'), '일자 호출이 세트 사건 규칙을 나르고 있다');
  }
});

test('deterministic fallback satisfies daily and blueprint contracts', () => {
  for (const request of [dailyRequest, blueprintRequest]) validateOutput(request, deterministicFallback(request));
});

test('uses Groq first and stops after a valid result', async () => {
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    return jsonResponse(groqPayload(dailyPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_DAILY_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-generation-source'], 'groq:openai/gpt-oss-120b');
  // 하루치를 한 번에 만든다. 한 건을 넘으면 쪼개기가 되살아난 것이다.
  assert.equal(models.length, 1);
  assert.ok(models.every((model) => model === 'openai/gpt-oss-120b'));
});

test('falls through Groq to Luna, not to gpt-4o-mini', async () => {
  // 일자 생성 순서는 groq → luna → gpt-4o-mini 다. 2026-08-07 실측에서
  // gpt-4o-mini 가 두 번 연속 계약을 어겼고 복구를 거치고도 실패했다.
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    if (url.includes('groq.com')) return jsonResponse({ error: { message: 'rate limited' } }, 429);
    return jsonResponse(openAiPayload(dailyPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_DAILY_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-5.6-luna');
  // groq 는 조각마다 429 를 받아 전부 떨어지고, 그제서야 다음 공급자로 넘어간다.
  assert.deepEqual([...new Set(models)], ['openai/gpt-oss-120b', 'gpt-5.6-luna']);
  assert.ok(!models.includes('gpt-4o-mini'), 'luna 가 성공했으면 gpt-4o-mini 는 불리지 않는다');
});

for (const [label, status] of [['rate limits', 429], ['rejected credentials', 401]]) {
  test(`abandons a provider on ${label} instead of retrying every lot`, async () => {
    // 재시도해도 같은 답이 오는 실패다. 예전에는 LOT 마다 두 번씩 두드려
    // 일자 1건에 죽은 호출이 17건 나갔다. 이제 첫 웨이브에서 접는다.
    const groqCalls = [];
    const fetchImpl = async (url, options) => {
      const body = JSON.parse(options.body);
      if (url.includes('groq.com')) {
        groqCalls.push(body.model);
        return jsonResponse({ error: { message: 'limit', type: 'tokens' } }, status);
      }
      return jsonResponse(openAiPayload(dailyPartFromBody(body)));
    };
    const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_DAILY_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
    assert.equal(response.headers['x-generation-source'], 'openai:gpt-5.6-luna');
    // 하루치 한 건이면 끝이다. 재시도를 붙이지 않는다.
    assert.equal(groqCalls.length, 1, `groq 호출이 ${groqCalls.length}건이다`);
    validateOutput(dailyRequest, JSON.parse(response.body));
  });
}

test('a day that times out falls through to the next provider', async () => {
  // 손절(401·403·429)은 그 공급자를 접지만, 타임아웃은 다음 공급자에게 기회를
  // 준다. 하루치를 한 번에 만들면서 이 구분이 더 중요해졌다 — 실패 하나가 곧
  // 하루치 전부이기 때문이다.
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    if (body.model === 'gpt-5.6-luna') {
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      throw error;
    }
    return jsonResponse(openAiPayload(dailyPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-4o-mini');
  assert.deepEqual(models, ['gpt-5.6-luna', 'gpt-4o-mini']);
  validateOutput(dailyRequest, JSON.parse(response.body));
});


test('uses gpt-4o-mini as the last resort for a day', async () => {
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    if (body.model !== 'gpt-4o-mini') {
      return url.includes('groq.com') ? jsonResponse(groqPayload({ bad: true })) : jsonResponse(openAiPayload({ bad: true }));
    }
    return jsonResponse(openAiPayload(dailyPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_DAILY_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-4o-mini');
  assert.deepEqual([...new Set(models)], ['openai/gpt-oss-120b', 'gpt-5.6-luna', 'gpt-4o-mini']);
});

test('keeps gpt-4o-mini first for the blueprint it actually passes', async () => {
  // 순서 교체는 일자 생성에만 적용한다. blueprint 는 gpt-4o-mini 가 네 번 다
  // 성공했고 luna 로는 재본 적이 없다. 근거 없이 바꾸지 않는다.
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    return jsonResponse(openAiPayload(blueprintPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(blueprintRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-4o-mini');
  assert.ok(!models.includes('gpt-5.6-luna'), 'blueprint 1순위는 gpt-4o-mini 다');
});

test('a lot that keeps failing falls back alone and the rest of the day survives', async () => {
  // 하루치를 한 번에 만들어도 실패는 그 LOT 하나에 가둔다. 여기서는 복구 호출까지
  // 실패시켜 최악을 본다 — 그 자리만 대체 문구가 되고 나머지 일곱은 살아야 한다.
  const badIndex = 3;
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    const input = body.input || body.messages?.[1]?.content || '';
    if (input.includes('INPUT LOT')) throw new Error('timeout');
    const day = JSON.parse(JSON.stringify(dailyFallback));
    day.lots[badIndex] = { ...day.lots[badIndex], description: '표면이 곱다' };
    return jsonResponse(openAiPayload(day));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-5.6-luna');
  const output = JSON.parse(response.body);
  validateOutput(dailyRequest, output);
  assert.equal(output.lots.length, 8);
  assert.deepEqual(output.lots[badIndex], dailyFallback.lots[badIndex]);
  // 나머지는 모델이 만든 것 그대로다. 전체를 대체 문구로 덮지 않는다.
  assert.deepEqual(output.lots[0], dailyFallback.lots[0]);
});

test('returns validated static content when every provider fails', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_DAILY_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
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

test('leaves Groq out of daily generation unless it is explicitly enabled', async () => {
  // 키가 있어도 붙지 않는다. 2026-08-07 실측에서 gpt-oss-120b 와 qwen3.6-27b 가
  // 같은 조직 TPM 한도에 걸렸고, 8 LOT 중 6개가 대체 문구로 채워진 응답에 groq
  // 헤더가 찍혔다. 요금제나 웨이브 크기를 손보기 전에는 켜지 않는다.
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    return jsonResponse(openAiPayload(dailyPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-5.6-luna');
  assert.ok(!models.some((model) => model.includes('gpt-oss')), JSON.stringify([...new Set(models)]));
});

test('skips Groq for the blueprint that exceeds its free TPM budget', async () => {
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    return jsonResponse(openAiPayload(blueprintPartFromBody(body)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_DAILY_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(blueprintRequest));
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
  assert.equal(maxActive, 7); // 프레임 1 + 세트 6. 웨이브를 6으로 올렸다
  // 두 번째 웨이브(set-7 부터)는 첫 웨이브가 만든 헤드라인을 받아 중복을 피한다.
  // 이것이 사라지면 세트끼리 서로를 못 보게 되므로 웨이브를 12로 올리지 않았다.
  assert.match(prompts.find((prompt) => prompt.includes('INPUT SET') && prompt.includes('set-7')), /1번 창고에서 발견된 운송 장부/);
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
    // 하루치를 한 번에 돌려주되 5번 LOT 만 rumor 가 상한 45자를 넘게 만든다.
    // lot 5 로 특정되는 국소 오류다. (중복 설명은 설계상 전체 복구 대상이라
    // 부분 복구 검증에 쓸 수 없다.)
    const day = JSON.parse(JSON.stringify(dailyFallback));
    day.lots[4] = { ...day.lots[4], rumor: '소'.repeat(60) };
    return jsonResponse(groqPayload(day));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_DAILY_ENABLED: 'true', GROQ_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'groq:openai/gpt-oss-120b');
  assert.ok(requestedRepairs.length > 0 && requestedRepairs.length < dailyRequest.lots.length, JSON.stringify(requestedRepairs));
  validateOutput(dailyRequest, JSON.parse(response.body));
});

// --- 상한 ---
//
// 엔드포인트는 열려 있다. 인증을 붙일 수 없어서(배포본이 비밀을 못 든다) 대신
// 최악의 지출을 가둔다. 아래 시험이 지키는 것은 두 가지다 — 상한을 넘기면 공급자
// 호출이 실제로 멈추는가, 그리고 그때 게임이 계속 도는가.

const eventFrom = (request, sourceIp) => ({ body: JSON.stringify(request), requestContext: { http: { method: 'POST', sourceIp } } });
const liveEnv = { LIVE_GENERATION_ENABLED: 'true', OPENAI_API_KEY: 'test' };

test('한 IP 가 상한을 넘기면 공급자를 부르지 않고 static 으로 내려간다', async () => {
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    return jsonResponse(openAiPayload(dailyPartFromBody(JSON.parse(options.body))));
  };
  const handler = createHandler({ env: { ...liveEnv, GENERATION_RATE_PER_IP: '2' }, fetchImpl, logger: {} });

  assert.equal((await handler(eventFrom(dailyRequest, '1.1.1.1'))).headers['x-generation-source'], 'openai:gpt-5.6-luna');
  assert.equal((await handler(eventFrom(dailyRequest, '1.1.1.1'))).headers['x-generation-source'], 'openai:gpt-5.6-luna');
  const spent = calls;

  const throttled = await handler(eventFrom(dailyRequest, '1.1.1.1'));
  assert.equal(throttled.statusCode, 200);
  assert.equal(throttled.headers['x-generation-source'], 'static:throttled:ip');
  assert.equal(calls, spent, '상한을 넘긴 요청이 공급자까지 갔다');
  // 막는 것이 목적이 아니라 가두는 것이 목적이다. 판은 계속 돌아야 한다.
  validateOutput(dailyRequest, JSON.parse(throttled.body));
});

test('상한은 IP 마다 따로 센다', async () => {
  const fetchImpl = async (url, options) => jsonResponse(openAiPayload(dailyPartFromBody(JSON.parse(options.body))));
  const handler = createHandler({ env: { ...liveEnv, GENERATION_RATE_PER_IP: '1' }, fetchImpl, logger: {} });

  await handler(eventFrom(dailyRequest, '1.1.1.1'));
  assert.equal((await handler(eventFrom(dailyRequest, '1.1.1.1'))).headers['x-generation-source'], 'static:throttled:ip');
  assert.equal((await handler(eventFrom(dailyRequest, '2.2.2.2'))).headers['x-generation-source'], 'openai:gpt-5.6-luna');
});

test('일일 천장은 IP 를 바꿔도 넘지 못한다', async () => {
  // IP 는 얼마든지 바꿀 수 있다. 지출을 가두는 것은 이쪽이다.
  const fetchImpl = async (url, options) => jsonResponse(openAiPayload(dailyPartFromBody(JSON.parse(options.body))));
  const handler = createHandler({ env: { ...liveEnv, GENERATION_DAILY_CEILING: '2' }, fetchImpl, logger: {} });

  await handler(eventFrom(dailyRequest, '1.1.1.1'));
  await handler(eventFrom(dailyRequest, '2.2.2.2'));
  const throttled = await handler(eventFrom(dailyRequest, '3.3.3.3'));
  assert.equal(throttled.headers['x-generation-source'], 'static:throttled:daily');
  validateOutput(dailyRequest, JSON.parse(throttled.body));
});

test('0 이면 상한을 끈다 — 실측 도구가 길게 돌 수 있어야 한다', async () => {
  const fetchImpl = async (url, options) => jsonResponse(openAiPayload(dailyPartFromBody(JSON.parse(options.body))));
  const handler = createHandler({ env: { ...liveEnv, GENERATION_RATE_PER_IP: '0', GENERATION_DAILY_CEILING: '0' }, fetchImpl, logger: {} });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await handler(eventFrom(dailyRequest, '1.1.1.1'))).headers['x-generation-source'], 'openai:gpt-5.6-luna');
  }
});

test('형식이 틀린 요청은 할당량을 쓰지 않는다', async () => {
  // 400 은 공급자까지 가지 않으므로 돈이 나가지 않는다. 이것으로 남의 할당량을
  // 밀어낼 수 있으면 상한 자체가 공격 수단이 된다.
  const fetchImpl = async (url, options) => jsonResponse(openAiPayload(dailyPartFromBody(JSON.parse(options.body))));
  const handler = createHandler({ env: { ...liveEnv, GENERATION_RATE_PER_IP: '1' }, fetchImpl, logger: {} });

  assert.equal((await handler({ body: '{}', requestContext: { http: { method: 'POST', sourceIp: '1.1.1.1' } } })).statusCode, 400);
  assert.equal((await handler(eventFrom(dailyRequest, '1.1.1.1'))).headers['x-generation-source'], 'openai:gpt-5.6-luna');
});
