import {
  blueprintFrameSchema,
  dailyLotSchema,
  dailyRepairIndices,
  fallbackSetIncident,
  generationContract as contract,
  outputSchema,
  setIncidentErrors,
  setIncidentSchema,
  validateInput,
  validateOutput,
} from '../generation-server.js';
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

async function callGroq({ request, schema = outputSchema(request), prompt = `INPUT:\n${JSON.stringify(request)}`, temperature = 0.2 }, provider, fetchImpl) {
  const payload = await fetchJson('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${provider.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: provider.model,
      temperature,
      max_completion_tokens: 4000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: contract },
        { role: 'user', content: `OUTPUT_SCHEMA:\n${JSON.stringify(schema)}\n${prompt}` },
      ],
    }),
  }, provider.timeoutMs, fetchImpl);
  return parseJsonText(payload?.choices?.[0]?.message?.content);
}

async function callOpenAI({ request, schema = outputSchema(request), prompt = `INPUT:\n${JSON.stringify(request)}` }, provider, fetchImpl) {
  const body = {
    model: provider.model,
    instructions: contract,
    input: `Return valid JSON only.\nOUTPUT_SCHEMA:\n${JSON.stringify(schema)}\n${prompt}`,
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

function providersFromEnv(env, request) {
  if (env.LIVE_GENERATION_ENABLED !== 'true') return [];
  return [
    request.mode === 'daily-content' && env.GROQ_API_KEY && { name: 'groq', model: env.PRIMARY_MODEL || 'openai/gpt-oss-120b', apiKey: env.GROQ_API_KEY, timeoutMs: 7000, call: callGroq },
    env.OPENAI_API_KEY && { name: 'openai', model: env.SECONDARY_MODEL || 'gpt-4o-mini', apiKey: env.OPENAI_API_KEY, timeoutMs: 7000, call: callOpenAI },
    env.OPENAI_API_KEY && { name: 'openai', model: env.FALLBACK_MODEL || 'gpt-5.6-luna', apiKey: env.OPENAI_API_KEY, timeoutMs: 9000, call: callOpenAI },
  ].filter(Boolean);
}

const fallbackFrame = (request) => {
  const fallback = deterministicFallback(request);
  return { schemaVersion: fallback.schemaVersion, runSeed: fallback.runSeed, premise: fallback.premise, marketArc: fallback.marketArc };
};

async function generateBlueprint(request, provider, fetchImpl, logger) {
  const framePromise = (async () => {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const frame = await provider.call({
          request,
          schema: blueprintFrameSchema(request),
          temperature: attempt === 1 ? 0.2 : 0.1,
          prompt: `${lastError ? `RETRY_ERRORS:\n${lastError.message}\n` : ''}Generate only the run premise and 12-day marketArc.\nINPUT:\n${JSON.stringify({ ...request, sets: undefined })}`,
        }, provider, fetchImpl);
        if (frame.runSeed !== request.runSeed || frame.marketArc?.length !== 12) throw new Error('run blueprint frame shape mismatch');
        return frame;
      } catch (error) {
        lastError = error;
      }
    }
    logger.warn?.('generation_blueprint_frame_fallback', { provider: provider.name, model: provider.model, error: cleanError(lastError) });
    return fallbackFrame(request);
  })();

  const accepted = [];
  const generatedSets = [];
  const waveSize = 4;
  for (let start = 0; start < request.sets.length; start += waveSize) {
    const wave = request.sets.slice(start, start + waveSize);
    const usedTitles = accepted.map(({ incidentTitle }) => incidentTitle);
    const candidates = await Promise.all(wave.map((inputSet) => provider.call({
      request,
      schema: setIncidentSchema(inputSet),
      prompt: `Generate exactly one set record. The incident must name at least two input baseName values. Do not reuse these headlines: ${JSON.stringify(usedTitles)}.\nINPUT SET:\n${JSON.stringify(inputSet)}`,
    }, provider, fetchImpl).catch((error) => ({ __error: error }))));

    for (let offset = 0; offset < wave.length; offset += 1) {
      const index = start + offset;
      const inputSet = wave[offset];
      let output = candidates[offset];
      let errors = output?.__error ? [output.__error.message] : setIncidentErrors(inputSet, output, accepted);
      if (errors.length) {
        const retryTitles = accepted.map(({ incidentTitle }) => incidentTitle);
        try {
          output = await provider.call({
            request,
            schema: setIncidentSchema(inputSet),
            temperature: 0.1,
            prompt: `RETRY_ERRORS:\n${errors.join('; ')}\nGenerate exactly one corrected set record. The incident must name at least two input baseName values. Do not reuse these headlines: ${JSON.stringify(retryTitles)}.\nINPUT SET:\n${JSON.stringify(inputSet)}`,
          }, provider, fetchImpl);
          errors = setIncidentErrors(inputSet, output, accepted);
        } catch (error) {
          errors = [error.message];
        }
      }
      if (errors.length) {
        logger.warn?.('generation_blueprint_set_fallback', { provider: provider.name, model: provider.model, setId: inputSet.setId, errors });
        output = fallbackSetIncident(inputSet, index);
      }
      accepted.push(output);
      generatedSets.push(output);
    }
  }

  const frame = await framePromise;
  const output = { ...frame, schemaVersion: '1.0', runSeed: request.runSeed, sets: generatedSets };
  validateOutput(request, output);
  return output;
}

async function generateDaily(request, provider, fetchImpl) {
  let output;
  let firstError;
  try {
    output = await provider.call({ request }, provider, fetchImpl);
    validateOutput(request, output);
    return output;
  } catch (error) {
    firstError = error;
  }

  const repairIndices = dailyRepairIndices(request, output);
  if (!output?.lots || repairIndices.length === 0) throw firstError;
  const repairs = await Promise.all(repairIndices.map(async (index) => {
    const lot = request.lots[index];
    const repaired = await provider.call({
      request,
      schema: dailyLotSchema(lot),
      temperature: 0.1,
      prompt: `RETRY_ERRORS:\n${firstError.message}\nGenerate exactly one corrected LOT record for lot ${index + 1}.\nINPUT LOT:\n${JSON.stringify(lot)}`,
    }, provider, fetchImpl);
    return { index, repaired };
  }));
  for (const { index, repaired } of repairs) output.lots[index] = repaired;
  validateOutput(request, output);
  return output;
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

    for (const provider of providersFromEnv(env, request)) {
      const startedAt = Date.now();
      try {
        const output = request.mode === 'run-blueprint'
          ? await generateBlueprint(request, provider, fetchImpl, logger)
          : await generateDaily(request, provider, fetchImpl);
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
