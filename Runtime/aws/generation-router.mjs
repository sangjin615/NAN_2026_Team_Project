import {
  blueprintFrameSchema,
  dailyFrameSchema,
  dailyLotSchema,
  dailyRepairIndices,
  dailyRepairInstruction,
  fallbackSetIncident,
  // 계약서 전문이 아니라 모드에 필요한 절만 싣는다. LOT 하나짜리 호출이 세트
  // 사건 규칙까지 나르던 것을 없앤다 — 한 판 입력의 30%다.
  contractFor,
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

// 프리플라이트 응답에만 붙는 헤더다.
//
// 본 요청이 `content-type: application/json` 이라 단순 요청이 아니고, 브라우저가
// OPTIONS 를 먼저 보낸다. 그 응답에 allow-headers 가 없으면 본 요청을 막는다.
//
// 2026-08-07 실측으로 알아낸 것: 게이트웨이에 CORS 를 설정해두면 게이트웨이가
// OPTIONS 를 가로채고 람다가 붙인 CORS 헤더까지 덮어쓴다. 그런데 게이트웨이의
// AllowOrigins 는 리터럴 `null` 을 형식 오류로 거부한다(BadRequestException).
// file:// 에서 연 페이지는 Origin: null 을 보내므로 게이트웨이 CORS 로는 독립
// 실행본을 지원할 방법이 없다.
//
// 그래서 게이트웨이 CORS 를 걷어내고 여기서 직접 붙인다. `*` 는 null 오리진에도
// 유효하다 — 자격 증명을 안 쓰기 때문이다. 대신 OPTIONS /generate 라우트가
// 있어야 이 분기가 실행된다.
const preflightHeaders = {
  ...jsonHeaders,
  'access-control-allow-methods': 'POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
  // 매 호출마다 왕복을 더하지 않도록 캐시한다. 한 판에 HTTP 13건이 나간다.
  'access-control-max-age': '600',
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

// 게이트웨이 통합 타임아웃이 30초다. 하루치 본 호출과 복구 호출이 순차로 붙으므로
// 둘의 합이 그 안에 들어와야 한다. 본 호출 20초 + 복구 6초 = 26초.
const REPAIR_TIMEOUT_MS = 6000;

async function callGroq({ request, schema = outputSchema(request), prompt = `INPUT:\n${JSON.stringify(request)}`, temperature = 0.2, timeoutMs }, provider, fetchImpl) {
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
  }, timeoutMs ?? provider.timeoutMs, fetchImpl);
  return parseJsonText(payload?.choices?.[0]?.message?.content);
}

async function callOpenAI({ request, schema = outputSchema(request), prompt = `INPUT:\n${JSON.stringify(request)}`, timeoutMs }, provider, fetchImpl) {
  const body = {
    model: provider.model,
    instructions: contractFor(request.mode),
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
  }, timeoutMs ?? provider.timeoutMs, fetchImpl);
  return parseJsonText(responseOutputText(payload));
}

// static 으로 떨어졌을 때 나오는 문구를 실제 생성물에서 걷어 둔 은행이다.
//
// 예전에는 카테고리당 문장이 하나였다. 하루가 8 LOT 인데 카테고리는 6종이라
// **매일 최소 두 쌍이 글자 그대로 같은 문장**을 썼고, 앞뒤에 품목 이름과 번호만
// 갈아끼운 모양이라 대놓고 템플릿으로 보였다. 낙하율은 16판에 1판이지만 걸린
// 사람에게는 그 화면이 이 게임이다.
//
// 은행은 `reports/live-generation` 에 쌓인 지난 생성물에서 걷었다. 새로 지어낸
// 것이 아니라 이미 계약을 통과한 문장들이다. 걸러낸 것 셋 — 계약 위반(길이·어미·
// 금지 상투구), **특정 품목 이름이 박힌 문장**(다른 물품에 붙으면 틀린 설명이
// 된다. 카탈로그 60종 이름으로 걸렀다), 어미만 다른 중복.
//
// **완벽하지는 않다.** 같은 카테고리 안에서 돌려쓰므로 도자기 설명이 다른
// 도자기에 붙는다. 문양 같은 세부가 실제 물품과 어긋날 수 있다. 다만 지금 것은
// 100% 티가 나고 이것은 가끔 어긋날 뿐이다.
import fallbackCopy from '../data/fallback-copy.json' with { type: 'json' };

// 같은 요청이면 같은 결과여야 한다(측정 도구가 이 함수와 대조해 대체 여부를
// 가린다). 그래서 무작위가 아니라 키 해시로 고른다. FNV-1a.
const hashKey = (text) => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

// 하루 안에서 같은 문장이 두 번 나오지 않게 한다. 겹치면 고르던 자리에서
// 앞으로 밀어 빈 것을 찾는다. 은행이 모자라면 결국 겹치지만 그때도 계약은
// 지킨다 — 검증기가 보는 것은 길이와 어미다.
const pickFromBank = (list, key, used) => {
  if (!Array.isArray(list) || !list.length) return null;
  const start = hashKey(key) % list.length;
  for (let step = 0; step < list.length; step += 1) {
    const value = list[(start + step) % list.length];
    if (!used.has(value)) { used.add(value); return value; }
  }
  return list[start];
};

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
  // 문구는 지난 실제 생성물에서 걷은 은행에서 고른다. 은행이 비어 있으면 아래
  // `categoryCopy` 틀로 떨어진다 — 데이터가 없거나 깨져도 계약은 지킨다.
  const used = { description: new Set(), rumor: new Set(), setHint: new Set(), npcReaction: new Set() };
  // 설명은 2단이다. 다른 품목 이름이 없는 것을 먼저 쓰고, 다 떨어지면 예비로
  // 내려간다. 하루에 같은 카테고리가 최대 5개인데 깨끗한 것이 6개 이상이라
  // 예비까지 가는 일은 사실상 없다.
  const bankFor = (lot, field, key) => {
    const slot = fallbackCopy[lot.category];
    return pickFromBank(slot?.[field], key, used[field])
      || (field === 'description' ? pickFromBank(slot?.descriptionSpare, key, used[field]) : null);
  };

  return {
    schemaVersion: '1.0',
    day: request.day,
    marketHeadline: `${request.day}일차 경매 물품 기록`,
    lots: request.lots.map((lot, index) => {
      const key = `${request.runSeed}:${request.day}:${lot.lotId}`;
      return {
        lotId: lot.lotId,
        displayName: lot.baseName,
        description: bankFor(lot, 'description', key)
          || `${lot.baseName}의 ${index + 1}번째 ${categoryCopy[lot.category] || '표면 기록이 또렷하게 남아 있다'}.`,
        rumor: bankFor(lot, 'rumor', key) || `${index + 1}번 보관 장부에 같은 이름이 적혔다`,
        setHint: bankFor(lot, 'setHint', key) || `${index + 1}번 보관 표식`,
        npcReaction: bankFor(lot, 'npcReaction', key) || `기록원이 ${index + 1}번 항목을 다시 살핀다`,
      };
    }),
  };
}

// 타임아웃은 모드마다 다르다. 예산은 API Gateway 통합 타임아웃 30초다.
//
// **일자 생성** — 하루치를 한 번에 만든다. 배포본 로그에서 luna 가 6.8초에
// 해냈지만 9초 상한 때문에 8판 중 4판이 경계에서 떨어졌다. 1순위 luna 에 20초를
// 주고 2순위 mini 에 8초를 준다. 둘 다 실패해도 28초로 게이트웨이 안이다.
// mini 는 하루치를 7초 안에 못 냈으므로 사실상 마지막 시도다.
//
// **blueprint** — 프레임과 세트로 쪼개 부른다. 조각이 작아 지금 값이 맞고,
// 13번 부르므로 상한을 키우면 총 시간이 게이트웨이를 넘는다. 건드리지 않는다.
const dailyMode = (request) => request.mode === 'daily-content';
const mini = (env, request) => env.OPENAI_API_KEY && { name: 'openai', model: env.SECONDARY_MODEL || 'gpt-4o-mini', apiKey: env.OPENAI_API_KEY, timeoutMs: dailyMode(request) ? 8000 : 7000, call: callOpenAI };
const luna = (env, request) => env.OPENAI_API_KEY && { name: 'openai', model: env.FALLBACK_MODEL || 'gpt-5.6-luna', apiKey: env.OPENAI_API_KEY, timeoutMs: dailyMode(request) ? 20000 : 9000, call: callOpenAI };

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
    ...(dailyMode(request) ? [luna(env, request), mini(env, request)] : [mini(env, request), luna(env, request)]),
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
  // 세트 12개를 몇 개씩 묶어 부를지. 웨이브마다 가장 느린 호출을 기다리므로
  // 웨이브 수가 곧 지연이다.
  //
  // 2026-08-07 배포 실측: 4개씩 3웨이브면 14.6~30.6초였고 8판 중 1판이 API
  // Gateway 통합 타임아웃 30초를 넘겨 **503** 을 받았다. static 보다 나쁘다 —
  // 응답 자체가 끊겨 클라이언트가 오류를 받는다.
  //
  // 6으로 올려 2웨이브로 만든다. 12(=1웨이브)로 하지 않는 이유는 웨이브 사이에
  // 넘기는 `usedTitles` 때문이다. 그것이 사라지면 세트끼리 서로를 못 보게 되고,
  // 일자 생성을 쪼갰을 때 겪은 "문구가 서로 닮는" 문제가 여기서 재현된다.
  const waveSize = 6;
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

// 일자 생성은 **하루치를 한 번에** 만든다. 로컬 `generation-server.js` 와 같은
// 전략이다.
//
// 한때 LOT 단위로 쪼갰다. "8 LOT 을 한 번에 요구하면 공급자 타임아웃(7~9초) 안에
// 못 들어온다"는 판단이었는데, 2026-08-07 에 배포본의 CloudWatch 로그를 읽고
// 그 전제가 틀렸음이 드러났다.
//
//   generation_succeeded { provider: 'openai', model: 'gpt-5.6-luna', latencyMs: 6795 }
//
// **들어온다.** 다만 9초가 빠듯해서 8판 중 4판이 그 경계에서 떨어졌을 뿐이다.
// 게이트웨이가 30초를 주는데 9초만 쓰고 있었다. 타임아웃을 올리는 것이 쪼개기보다
// 싸다 — 쪼개면 호출이 9~17건으로 늘어 groq TPM(8,000/분)을 확정적으로 넘기고,
// 지연이 26~44초가 되며, 여덟 설명이 서로 못 보게 되어 문구가 닮는다.
//
// 실패는 여전히 그 LOT 에 가둔다. dailyRepairIndices 가 고칠 자리를 골라준다.
async function generateDaily(request, provider, fetchImpl, logger) {
  const fallbackLots = deterministicFallback(request).lots;
  const output = await provider.call({ request, schema: outputSchema(request) }, provider, fetchImpl);
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
        // LOT 하나짜리 복구는 짧다. 본 호출에 20초를 줬으므로 여기에도 같은 예산을
        // 주면 둘이 합쳐 게이트웨이 30초를 넘는다. 복구에는 따로 상한을 둔다.
        timeoutMs: REPAIR_TIMEOUT_MS,
        // 로컬 서버와 같은 지시를 쓴다. 라우터에만 어미 목록이 빠져 있어서 복구가
        // 같은 unsafe ending 을 반복했다.
        prompt: `RETRY_ERRORS:\n${error.message}\n${dailyRepairInstruction(index + 1)}\nINPUT LOT:\n${JSON.stringify(request.lots[index])}`,
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

// 엔드포인트에는 인증이 없다. 붙일 수가 없다 — 배포본은 서버 없이 도는 HTML 한
// 장이고, `assertPublicGenerationConfig` 가 `api-config.json` 에 비밀을 넣는 것을
// 빌드 단계에서 막는다. 파일을 나눠 주는 순간 그 안의 토큰은 공개된다.
//
// 그래서 막는 대신 가둔다. 누구나 부를 수 있다는 사실은 그대로 두고, 최악의
// 지출에 천장을 씌운다.
//
// 단위를 HTTP 요청으로 잡은 이유: 한 판은 HTTP 13건(blueprint 1 + 일자 12)이지만
// 라우터가 프레임과 조각으로 펼치므로 공급자 호출은 121건이다. 요청 하나가 9배로
// 불어난다. 그래서 아래 숫자는 작아 보여도 작지 않다.
//
//   perIp 40 / 10분   한 판이 13건이니 10분에 3판. 사람이 낼 수 있는 양이 아니다
//   daily 500         약 38판. 공급자 호출로는 4,600건
//
// **이 천장은 컨테이너마다 따로 센다.** 람다가 동시에 여러 개 뜨면 실제 총량은
// 이 값의 배수다. 지출의 진짜 하한선은 코드가 아니라 예약 동시성과 공급자
// 대시보드의 예산 상한이다. 여기 있는 것은 순진한 남용을 끊는 1차 방어다.
const THROTTLE_DEFAULTS = { windowMs: 600_000, perIp: 40, daily: 500 };

function createThrottle(env) {
  const windowMs = Number(env.GENERATION_RATE_WINDOW_MS ?? THROTTLE_DEFAULTS.windowMs);
  const perIp = Number(env.GENERATION_RATE_PER_IP ?? THROTTLE_DEFAULTS.perIp);
  const daily = Number(env.GENERATION_DAILY_CEILING ?? THROTTLE_DEFAULTS.daily);
  const seen = new Map();
  let dayStartedAt = 0;
  let dayCount = 0;

  // 0 이면 끈다. 실측 도구가 길게 돌 때 이 한 줄로 비켜 갈 수 있어야 한다.
  return (ip, now) => {
    if (daily > 0) {
      if (now - dayStartedAt >= 86_400_000) { dayStartedAt = now; dayCount = 0; }
      if (dayCount >= daily) return 'daily';
    }
    if (perIp > 0) {
      // 창 밖으로 나간 기록은 여기서 버린다. 안 버리면 Map 이 컨테이너 수명만큼 자란다.
      for (const [key, times] of seen) {
        const live = times.filter((at) => now - at < windowMs);
        if (live.length) seen.set(key, live); else seen.delete(key);
      }
      const times = seen.get(ip) || [];
      if (times.length >= perIp) return 'ip';
      seen.set(ip, [...times, now]);
    }
    if (daily > 0) dayCount += 1;
    return null;
  };
}

export function createHandler({ env = process.env, fetchImpl = fetch, logger = console } = {}) {
  // 상태는 이 클로저에 산다. 람다는 컨테이너마다 handler 를 한 번 만들므로 따뜻한
  // 컨테이너 안에서는 이어지고, 테스트는 createHandler 를 부를 때마다 새로 시작한다.
  const throttle = createThrottle(env);

  return async (event) => {
    if (event?.requestContext?.http?.method === 'OPTIONS') return { statusCode: 204, headers: preflightHeaders, body: '' };
    let request;
    try {
      request = JSON.parse(event?.body || '{}');
      validateInput(request);
    } catch (error) {
      return { statusCode: 400, headers: jsonHeaders, body: JSON.stringify({ ok: false, error: 'invalid_request' }) };
    }

    // 형식이 틀린 요청은 위에서 이미 끊겼고 공급자까지 가지 않으므로 세지 않는다.
    // 여기서부터가 돈이 나가는 경로다.
    const sourceIp = event?.requestContext?.http?.sourceIp || 'unknown';
    const throttled = throttle(sourceIp, Date.now());
    if (throttled) {
      // 429 를 주지 않는다. 게임에는 검증을 통과하는 static 경로가 이미 있고,
      // 플레이어 입장에서는 생성이 밋밋해질 뿐 판이 끊기지 않는 편이 낫다.
      const output = deterministicFallback(request);
      validateOutput(request, output);
      logger.warn?.('generation_throttled', { reason: throttled, mode: request.mode, runSeed: request.runSeed });
      return { statusCode: 200, headers: { ...jsonHeaders, 'x-generation-source': `static:throttled:${throttled}` }, body: JSON.stringify(output) };
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
