import {
  blueprintFrameSchema,
  dailyFrameSchema,
  dailyLotSchema,
  dailyRepairIndices,
  // LOT 하나짜리 호출은 나머지 일곱을 못 본다. 자리마다 볼 곳과 어미를 정해 준다.
  lotWritingHint,
  fallbackSetIncident,
  // 계약서 전문이 아니라 모드에 필요한 절만 싣는다. LOT 하나짜리 호출이 세트
  // 사건 규칙까지 나르던 것을 없앤다 — 한 판 입력의 30%다.
  contractFor,
  outputSchema,
  setIncidentErrors,
  setIncidentSchema,
  strictSchema,
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
    // 상태 코드를 실어 보낸다. 재시도해도 소용없는 실패인지 여기서만 알 수 있다.
    error.status = response.status;
    throw error;
  }
  return payload;
}

// 이 공급자에게 이번 요청으로는 더 물어볼 것이 없는 실패다.
//
//   401 · 403  자격 증명이 거부됐다. 같은 키로 다시 불러도 같은 답이다
//   429        한도에 걸렸다. 초 단위로 다시 부르면 토큰만 더 쓴다
//
// 2026-08-07 실측 근거. 키가 잘못됐을 때 일자 1건에 죽은 호출이 17건 나갔고,
// groq 가 429 를 뱉는 동안에도 LOT 마다 재시도가 붙어 8 LOT 중 6개를 잃고도
// 계속 두드렸다. 그렇게 만든 응답은 대부분이 대체 문구인데 헤더에는 그 공급자
// 이름이 찍힌다. 그럴 바에는 이 공급자를 접고 다음으로 넘어가는 편이 낫다.
const isTerminal = (error) => error?.status === 401 || error?.status === 403 || error?.status === 429;

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
        { role: 'system', content: contractFor(request.mode) },
        { role: 'user', content: `OUTPUT_SCHEMA:\n${JSON.stringify(schema)}\n${prompt}` },
      ],
    }),
  }, provider.timeoutMs, fetchImpl);
  return parseJsonText(payload?.choices?.[0]?.message?.content);
}

async function callOpenAI({ request, schema = outputSchema(request), prompt = `INPUT:\n${JSON.stringify(request)}` }, provider, fetchImpl) {
  // 스키마를 강제한다. json_object 는 "JSON 이기만 하면" 통과라 모델이 다른
  // lotId 를 돌려줘도 막지 못했다 — 실측에서 LOT IDs mismatch 가 반복됐다.
  // 바꿀 수 없는 스키마면 strictSchema 가 null 을 주고 예전 경로로 돈다.
  //
  // OUTPUT_SCHEMA 는 프롬프트에 그대로 남긴다. strict 가 버리는 길이 상한이
  // 거기 실려 있고, 모델에게는 여전히 필요한 정보다.
  const strict = strictSchema(schema);
  const body = {
    model: provider.model,
    instructions: contractFor(request.mode),
    input: `Return valid JSON only.\nOUTPUT_SCHEMA:\n${JSON.stringify(schema)}\n${prompt}`,
    max_output_tokens: 12000,
    text: strict
      ? { format: { type: 'json_schema', name: 'generation_output', schema: strict, strict: true } }
      : { format: { type: 'json_object' } },
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

const mini = (env) => env.OPENAI_API_KEY && { name: 'openai', model: env.SECONDARY_MODEL || 'gpt-4o-mini', apiKey: env.OPENAI_API_KEY, timeoutMs: 7000, call: callOpenAI };
const luna = (env) => env.OPENAI_API_KEY && { name: 'openai', model: env.FALLBACK_MODEL || 'gpt-5.6-luna', apiKey: env.OPENAI_API_KEY, timeoutMs: 9000, call: callOpenAI };

function providersFromEnv(env, request) {
  if (env.LIVE_GENERATION_ENABLED !== 'true') return [];
  return [
    // groq 는 기본적으로 빠진다. 2026-08-07 실측에서 `gpt-oss-120b` 와
    // `qwen3.6-27b` 가 **같은 조직 TPM 한도**에 걸렸다(429). 모델을 바꿔서
    // 우회되는 문제가 아니다 — 쪼갠 요청이 호출마다 계약서 전문을 다시 실어
    // 입력 토큰이 불어나는 구조가 원인이다. 일자 1건에 최대 17회 호출이다.
    //
    // 켜져 있던 동안 실제로 나온 것: 8 LOT 중 6개가 429 로 죽고 그 자리를 대체
    // 문구가 메웠는데, 응답은 200 이고 계약 검증을 통과하고 헤더에는 groq 가
    // 찍혔다. 빠른 것이 아니라 대부분을 포기한 것이었다.
    //
    // 요금제를 올리거나 DAILY_WAVE 를 낮춰 다시 붙일 수 있도록 경로는 남긴다.
    // GROQ_API_KEY 만으로는 붙지 않는다. GROQ_DAILY_ENABLED=true 가 함께 필요하다.
    env.GROQ_DAILY_ENABLED === 'true' && request.mode === 'daily-content' && env.GROQ_API_KEY && { name: 'groq', model: env.PRIMARY_MODEL || 'openai/gpt-oss-120b', apiKey: env.GROQ_API_KEY, timeoutMs: 7000, call: callGroq },
    // 순서가 모드마다 다르다. 2026-08-07 실측이 근거다.
    //
    // 일자 생성에서 gpt-4o-mini 는 두 번 연속 계약을 어겼다. description 이
    // 계약이 정한 다섯 어미를 벗어나고 category 어휘와도 어긋났으며,
    // dailyRepairIndices 가 자리를 골라 복구한 뒤에도 통과하지 못했다. 그동안
    // gpt-5.6-luna 는 8/8 을 냈다. 실패가 확실한 쪽을 먼저 태울 이유가 없다.
    //
    // blueprint 는 반대다. gpt-4o-mini 가 네 번 다 성공했고 luna 로는 이 경로를
    // 재본 적이 없다. 근거가 없으므로 blueprint 순서는 건드리지 않는다.
    //
    // 환경변수 이름(SECONDARY/FALLBACK)은 그대로 둔다. 배포된 설정을 깨지 않기
    // 위해서다. 이름이 곧 순위가 아니라는 점만 여기서 기억한다.
    ...(request.mode === 'daily-content' ? [luna(env), mini(env)] : [mini(env), luna(env)]),
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
        // 자격 증명이나 한도 문제면 두 번째 시도도 같은 답이다.
        if (isTerminal(error)) break;
      }
    }
    logger.warn?.('generation_blueprint_frame_fallback', { provider: provider.name, model: provider.model, error: cleanError(lastError) });
    return fallbackFrame(request);
  })();

  const accepted = [];
  const generatedSets = [];
  let fellBack = 0;
  let lastSetError;
  const waveSize = 4;
  for (let start = 0; start < request.sets.length; start += waveSize) {
    const wave = request.sets.slice(start, start + waveSize);
    const usedTitles = accepted.map(({ incidentTitle }) => incidentTitle);
    const candidates = await Promise.all(wave.map((inputSet) => provider.call({
      request,
      schema: setIncidentSchema(inputSet),
      prompt: `Generate exactly one set record. The incident must name at least two input baseName values. Do not reuse these headlines: ${JSON.stringify(usedTitles)}.\nINPUT SET:\n${JSON.stringify(inputSet)}`,
    }, provider, fetchImpl).catch((error) => ({ __error: error }))));

    // 한 조각이라도 손절 대상이면 이 공급자는 이번 요청에서 끝이다. 남은 세트를
    // 계속 물으면 같은 실패를 반복하고, 통과시키면 대부분이 대체 문구인 응답에
    // 이 공급자 이름이 찍힌다.
    const terminal = candidates.find((candidate) => isTerminal(candidate?.__error));
    if (terminal) {
      logger.warn?.('generation_provider_abandoned', { provider: provider.name, model: provider.model, error: cleanError(terminal.__error) });
      throw terminal.__error;
    }

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
        lastSetError = new Error(errors.join('; '));
        fellBack += 1;
      }
      accepted.push(output);
      generatedSets.push(output);
    }
  }

  // 세트가 전부 실패했으면 이 공급자는 죽은 것이다. fallback 으로 메워 통과시키면
  // 다음 공급자를 시도할 기회가 사라지고 헤더에는 생성한 적 없는 이름이 찍힌다.
  if (fellBack === request.sets.length) throw lastSetError ?? new Error('every set failed');

  const frame = await framePromise;
  const output = { ...frame, schemaVersion: '1.0', runSeed: request.runSeed, sets: generatedSets };
  validateOutput(request, output);
  return output;
}

// 일자 생성도 LOT 단위로 쪼갠다. 8 LOT 을 한 번에 요구하면 공급자 타임아웃(7~9초)
// 안에 못 들어온다. 2026-08-07 실측에서 단건 daily 가 groq·gpt-4o-mini 를 모두
// 태우고 static 으로 떨어졌고, 3순위 gpt-5.6-luna 만 간신히 통과했다. 반면 같은
// 모델이 blueprint 는 세트 단위로 쪼개니 통과했다. 요청 하나를 작게 만드는 것이
// 답이다.
//
// 타임아웃으로 죽으면 output 이 없어 복구 경로도 못 탄다는 문제도 함께 사라진다.
// 실패한 LOT 만 그 자리에서 다시 만들고, 그래도 안 되면 그 LOT 만 fallback 으로
// 대체해 나머지를 살린다.
const DAILY_WAVE = 4;

async function generateDaily(request, provider, fetchImpl, logger) {
  const framePromise = (async () => {
    try {
      const frame = await provider.call({
        request,
        schema: dailyFrameSchema(request),
        prompt: `Generate only the day headline.\nINPUT:\n${JSON.stringify({ ...request, lots: undefined })}`,
      }, provider, fetchImpl);
      if (frame.day !== request.day) throw new Error('daily frame shape mismatch');
      return frame;
    } catch (error) {
      logger?.warn?.('generation_daily_frame_fallback', { provider: provider.name, model: provider.model, error: cleanError(error) });
      const { lots, ...frame } = deterministicFallback(request);
      return frame;
    }
  })();

  const fallbackLots = deterministicFallback(request).lots;
  const lots = [];
  // 개별 LOT 실패는 그 자리에 가두지만, 전부 실패했다면 이 공급자가 죽은 것이다.
  // 그때는 fallback 으로 메워 통과시키면 안 된다. 그렇게 하면 다음 공급자를 시도할
  // 기회가 사라지고, 응답 헤더에는 생성한 적 없는 공급자 이름이 찍힌다.
  let fellBack = 0;
  let lastError;
  for (let start = 0; start < request.lots.length; start += DAILY_WAVE) {
    const wave = request.lots.slice(start, start + DAILY_WAVE);
    // 이미 채택한 설명을 넘겨 중복을 피한다. validateOutput 이 8개 설명의 중복을
    // 막고 qualityErrors 가 반복 어절을 세므로, 쪼개서 만들면 이 장치가 필요하다.
    const used = lots.map(({ description }) => description).filter(Boolean);
    const candidates = await Promise.all(wave.map((lot, offset) => provider.call({
      request,
      schema: dailyLotSchema(lot),
      prompt: `Generate exactly one LOT record for lot ${start + offset + 1}. ${lotWritingHint(start + offset)} Do not reuse these descriptions: ${JSON.stringify(used)}.\nINPUT LOT:\n${JSON.stringify(lot)}`,
    }, provider, fetchImpl).catch((error) => ({ __error: error }))));

    // 세트 쪽과 같은 규칙이다. 429 를 받고도 LOT 마다 재시도를 붙이던 것이
    // 실측에서 죽은 호출 17건을 만들었다.
    const terminal = candidates.find((candidate) => isTerminal(candidate?.__error));
    if (terminal) {
      logger?.warn?.('generation_provider_abandoned', { provider: provider.name, model: provider.model, error: cleanError(terminal.__error) });
      throw terminal.__error;
    }

    for (let offset = 0; offset < wave.length; offset += 1) {
      const index = start + offset;
      let lot = candidates[offset];
      if (lot?.__error) {
        // 첫 시도 사유를 여기서 남긴다. 재시도가 성공하면 아래 catch 가 돌지 않아
        // 이 사유가 어디에도 남지 않는다 — 공급자가 매번 한 번씩 태우고 있어도
        // 기록에는 보이지 않는다.
        logger?.warn?.('generation_daily_lot_retry', { provider: provider.name, model: provider.model, lotId: wave[offset].lotId, error: cleanError(lot.__error) });
        try {
          lot = await provider.call({
            request,
            schema: dailyLotSchema(wave[offset]),
            temperature: 0.1,
            prompt: `RETRY_ERRORS:\n${lot.__error.message}\nGenerate exactly one corrected LOT record for lot ${index + 1}.\nINPUT LOT:\n${JSON.stringify(wave[offset])}`,
          }, provider, fetchImpl);
        } catch (error) {
          // model 을 함께 남긴다. openai 공급자가 둘(gpt-4o-mini, gpt-5.6-luna)이라
          // 이름만으로는 어느 쪽이 떨어졌는지 구분되지 않는다.
          logger?.warn?.('generation_daily_lot_fallback', { provider: provider.name, model: provider.model, lotId: wave[offset].lotId, error: cleanError(error) });
          lot = fallbackLots[index];
          lastError = error;
          fellBack += 1;
        }
      }
      lots.push(lot);
    }
  }

  if (fellBack === request.lots.length) throw lastError ?? new Error('every lot failed');

  const output = { ...(await framePromise), schemaVersion: '1.0', day: request.day, lots };
  try {
    validateOutput(request, output);
    return output;
  } catch (error) {
    // 여기까지 왔으면 개별 LOT 이 아니라 묶어놓고 보이는 문제다. 중복 설명이나
    // 반복 어절처럼 전역 규칙에 걸린 경우다. dailyRepairIndices 가 고칠 자리를
    // 골라준다.
    const repairIndices = dailyRepairIndices(request, output);
    // 복구 전 사유를 남긴다. 복구가 실패하면 아래 validateOutput 이 다시 던지는데,
    // 그 두 번째 오류만 candidate_failed 로 보여서 원래 무엇이 문제였는지,
    // 복구가 손을 댔는지조차 구분되지 않았다.
    logger?.warn?.('generation_daily_repair', { provider: provider.name, model: provider.model, indices: repairIndices, error: cleanError(error) });
    if (repairIndices.length === 0) throw error;
    const repairs = await Promise.all(repairIndices.map(async (index) => ({
      index,
      repaired: await provider.call({
        request,
        schema: dailyLotSchema(request.lots[index]),
        temperature: 0.1,
        prompt: `RETRY_ERRORS:\n${error.message}\nGenerate exactly one corrected LOT record for lot ${index + 1}.\nINPUT LOT:\n${JSON.stringify(request.lots[index])}`,
      }, provider, fetchImpl).catch((repairError) => {
        logger?.warn?.('generation_daily_repair_fallback', { provider: provider.name, model: provider.model, lotId: request.lots[index].lotId, error: cleanError(repairError) });
        return fallbackLots[index];
      }),
    })));
    for (const { index, repaired } of repairs) output.lots[index] = repaired;
    validateOutput(request, output);
    return output;
  }
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
          : await generateDaily(request, provider, fetchImpl, logger);
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
