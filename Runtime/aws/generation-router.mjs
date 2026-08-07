import { generationContract as contract, outputSchema, validateInput, validateOutput } from '../generation-server.js';
const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
};

const cleanError = (error) => ({
  name: String(error?.name || 'Error'),
  message: String(error?.message || error || 'unknown error').slice(0, 300),
});

function parseJsonText(value) {
  const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(text);
}

function responseOutputText(payload) {
  if (payload?.output_text) return payload.output_text;
  for (const item of payload?.output || []) {
    for (const part of item?.content || []) if (part?.text) return part.text;
  }
  throw new Error('OpenAI response did not contain output text');
}

async function fetchJson(url, options, timeoutMs, fetchImpl) {
  const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${response.status} ${payload?.error?.message || response.statusText || 'provider error'}`);
    error.name = payload?.error?.type || 'ProviderError';
    throw error;
  }
  return payload;
}

async function callGroq(request, provider, fetchImpl) {
  const payload = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${provider.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.2,
      max_completion_tokens: 12000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: contract },
        { role: 'user', content: `OUTPUT_SCHEMA:\n${JSON.stringify(outputSchema(request))}\nINPUT:\n${JSON.stringify(request)}` },
      ],
    }),
  }, provider.timeoutMs, fetchImpl);
  return parseJsonText(payload?.choices?.[0]?.message?.content);
}

async function callOpenAI(request, provider, fetchImpl) {
  const body = {
    model: provider.model,
    instructions: contract,
    input: `OUTPUT_SCHEMA:\n${JSON.stringify(outputSchema(request))}\nINPUT:\n${JSON.stringify(request)}`,
    max_output_tokens: 12000,
    text: { format: { type: 'json_object' } },
    store: false,
  };
  if (provider.model.startsWith('gpt-5.6-')) body.reasoning = { effort: 'low' };
  const payload = await fetchJson('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${provider.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, provider.timeoutMs, fetchImpl);
  return parseJsonText(responseOutputText(payload));
}

const categoryCopy = {
  CER: '표면의 유약 자국이 은은하게 남아 있다',
  CLK: '가장자리의 시계 문자 문양이 길게 이어진다',
  PNT: '캔버스의 안료 층이 선명하게 남아 있다',
  BOK: '종이 표지의 잉크 기록이 또렷하게 남아 있다',
  MET: '금속 표면의 망치 자국이 고르게 남아 있다',
  JEW: '보석 세팅의 세공 흔적이 정교하게 남아 있다',
};

export function deterministicFallback(request) {
  if (request.mode === 'run-blueprint') {
    return {
      schemaVersion: '1.0',
      runSeed: request.runSeed,
      premise: '도시 경매장에 모인 물품들의 연결 기록을 추적한다.',
      marketArc: request.marketSignals.map(({ day, leadingCategory, direction }, index) => ({
        day,
        headline: `${index + 1}일차 ${leadingCategory} 거래 기록`,
        mood: `${direction} 흐름이 관찰된다`,
      })),
      sets: request.sets.map((set, index) => {
        const [first = '첫 번째 물품', second = first] = (set.members || []).map(({ baseName }) => baseName);
        return {
          setId: set.setId,
          title: `${index + 1}번 보관함의 연결 기록`,
          sharedSecret: `${first}과 ${second}에 같은 보관 표식이 남아 있다.`,
          revealHint: `${index + 1}번 보관 표식을 확인한다`,
          incidentTitle: `${index + 1}번 창고에서 발견된 운송 장부`,
          incidentSummary: `기록원이 ${first}과 ${second}를 함께 적은 운송 장부를 발견했다.`,
          newspaperLead: `조합은 ${first}과 ${second}의 공동 보관 경위를 조사하고 있다.`,
        };
      }),
    };
  }
  return {
    schemaVersion: '1.0',
    day: request.day,
    marketHeadline: `${request.day}일차 경매 물품 기록`,
    lots: request.lots.map((lot, index) => ({
      lotId: lot.lotId,
      displayName: lot.baseName,
      description: `${lot.baseName}의 ${index + 1}번째 ${categoryCopy[lot.category] || '표면 기록이 또렷하게 남아 있다'}.`,
      rumor: `${index + 1}번 보관 장부에 같은 이름이 적혔다`,
      setHint: `${index + 1}번 보관 표식`,
      npcReaction: `기록원이 ${index + 1}번 항목을 다시 살핀다`,
    })),
  };
}

function providersFromEnv(env) {
  if (env.LIVE_GENERATION_ENABLED !== 'true') return [];
  return [
    env.GROQ_API_KEY && { name: 'groq', model: env.PRIMARY_MODEL || 'openai/gpt-oss-120b', apiKey: env.GROQ_API_KEY, timeoutMs: 7000, call: callGroq },
    env.OPENAI_API_KEY && { name: 'openai', model: env.SECONDARY_MODEL || 'gpt-4o-mini', apiKey: env.OPENAI_API_KEY, timeoutMs: 7000, call: callOpenAI },
    env.OPENAI_API_KEY && { name: 'openai', model: env.FALLBACK_MODEL || 'gpt-5.6-luna', apiKey: env.OPENAI_API_KEY, timeoutMs: 9000, call: callOpenAI },
  ].filter(Boolean);
}

export function createHandler({ env = process.env, fetchImpl = fetch, logger = console } = {}) {
  return async (event) => {
    if (event?.requestContext?.http?.method === 'OPTIONS') return { statusCode: 204, headers: jsonHeaders, body: '' };
    let request;
    try {
      request = JSON.parse(event?.body || '{}');
      validateInput(request);
    } catch (error) {
      return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'invalid_request' }) };
    }

    for (const provider of providersFromEnv(env)) {
      const startedAt = Date.now();
      try {
        const output = await provider.call(request, provider, fetchImpl);
        validateOutput(request, output);
        logger.info?.('generation_succeeded', { provider: provider.name, model: provider.model, latencyMs: Date.now() - startedAt });
        return { statusCode: 200, headers: { ...jsonHeaders, 'x-generation-source': `${provider.name}:${provider.model}` }, body: JSON.stringify(output) };
      } catch (error) {
        logger.warn?.('generation_candidate_failed', { provider: provider.name, model: provider.model, latencyMs: Date.now() - startedAt, error: cleanError(error) });
      }
    }

    const output = deterministicFallback(request);
    validateOutput(request, output);
    logger.warn?.('generation_static_fallback', { mode: request.mode, runSeed: request.runSeed, day: request.day });
    return { statusCode: 200, headers: { ...jsonHeaders, 'x-generation-source': 'static' }, body: JSON.stringify(output) };
  };
}

export const handler = createHandler();
