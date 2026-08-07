# AWS 라우터에 로컬 생성 구조를 옮기는 방법

`Runtime/aws/generation-router.mjs` 와 `Runtime/generation-server.js` 는 같은 계약을
쓰지만 **생성 전략이 다르다.** 로컬 쪽이 훨씬 강하다. 이 문서는 그 차이가 무엇이고
왜 그렇게 만들었는지, 라우터에 어떻게 옮기는지를 적는다.

## 왜 이 문서가 있나

2026-08-07 실측이다. 같은 `qwen3:14b` 로,

- **한 번에 통째로 생성** → 두 번 모두 탈락. premise 부터 세트 제목까지 모든 텍스트
  필드가 `기본` 한 단어로 나왔다. 규칙을 어긴 게 아니라 스키마만 채우고 내용 생성을
  포기했다
- **세트 단위로 나눠 생성** → 통과. blueprint 51.1초, 일자 생성 19.3초

모델을 바꾼 게 아니다. **요청을 쪼갠 것만 다르다.** 그래서 "모델이 계약을 못 지킨다"는
진단은 틀렸고, "한 번에 다 만들라고 하면 무너진다"가 맞다.

라우터는 지금 전자다.

## 현재 차이

| | `generation-server.js` (로컬) | `generation-router.mjs` (AWS) |
|---|---|---|
| run-blueprint | 프레임 1회 + **세트마다 1회** (총 13회) | **1회** |
| daily-content | 1회 + **실패한 LOT만 복구** | **1회** |
| 세트 실패 시 | 그 세트만 재시도, 그래도 실패하면 그 세트만 fallback | 전체 실패 → 다음 공급자 → 전체 fallback |
| LOT 실패 시 | `dailyRepairIndices` 가 고른 LOT만 재생성 | 없음 |
| 중복 방지 | 이미 만든 `incidentTitle` 목록을 프롬프트에 넣어 회피 | 없음 |

일자 생성은 첫 시도가 서로 같다. **차이는 복구 단계의 유무다.**

라우터에는 blueprint 에 groq 가 아예 안 붙는 점도 있다 —
`request.mode === 'daily-content' && env.GROQ_API_KEY` 조건이라 blueprint 는 OpenAI
계열만 쓴다.

## 옮겨야 할 것 세 가지

### 1. blueprint 를 프레임과 세트로 쪼갠다

`generateBlueprint()` 가 하는 일이다.

- **프레임 먼저** — `premise` 와 12일 `marketArc` 만 만든다. 스키마는
  `blueprintFrameSchema`, 입력에서 `sets` 를 빼고 보낸다. 실패하면 2회까지 재시도하고,
  그래도 안 되면 결정론적 프레임으로 채운다. 프레임이 없다고 전체를 버리지 않는다
- **세트는 하나씩** — 세트마다 `setIncidentSchema(inputSet)` 로 1건씩 만든다. 입력도
  그 세트 하나만 보낸다. 검증은 `setIncidentErrors(inputSet, output, accepted)` 로 그
  자리에서 한다
- **실패는 그 세트에 가둔다** — 2회 재시도 후에도 안 되면 `fallbackSetIncident` 로
  그 세트만 대체하고 다음으로 넘어간다. 12개 중 1개가 나빠도 나머지 11개는 살린다

라우터에서는 세트 수만큼 공급자 호출이 늘어난다. 지금 공급자 타임아웃이 7~9초이니
세트당 그 예산으로 잡으면 blueprint 총 시간이 Lambda 실행 한도를 넘을 수 있다.
**세트를 병렬로 부르거나, blueprint 를 여러 요청으로 나누는 설계가 필요하다.** 순차로
12번 부르는 것을 그대로 옮기면 안 된다.

### 2. 이미 쓴 헤드라인을 프롬프트에 넣는다

세트를 따로 만들면 서로 비슷한 사건이 나온다. 로컬은 지금까지 만든
`incidentTitle` 배열을 프롬프트에 실어 `Do not reuse these headlines` 로 회피한다.
`setIncidentErrors` 의 `incident title repeats another set` / `incident copy repeats
another set` 검사와 짝이다. 쪼개면 이 장치가 반드시 따라와야 한다.

### 3. 일자 생성에 선택적 복구를 붙인다

`dailyRepairIndices(request, output)` 가 이미 export 되어 있다. 이 함수는 오류
메시지에서 `lot N` 을 뽑아 **고쳐야 할 LOT 인덱스만** 돌려준다. LOT ID 불일치나 전역
중복처럼 부분 수정으로 못 고치는 경우에는 전체 인덱스를 돌려준다.

복구 호출은 `dailyLotSchema(lot)` 로 **LOT 하나만** 만들고 그 자리를 교체한 뒤 전체를
다시 `validateOutput` 한다. 실측에서 8개 중 6개가 이 경로로 살아났다.

## 옮길 때 조심할 것

**검증기를 복제하지 마라.** `validateInput` / `validateOutput` / `outputSchema` /
`qualityErrors` / `setIncidentErrors` / `dailyRepairIndices` 는 전부
`generation-server.js` 가 export 한다. 라우터는 이미 앞의 셋을 import 하고 있다.
나머지도 같은 방식으로 가져다 쓴다. 복제하면 갈라진다 — 실제로 갈라져서
`tools/run-local-generation-experiment.mjs` 가 계약에 없는 필드 7개를 요구하고 있었고,
저장소 밖 검증기 하나는 감정 제거 뒤에도 `appraisalCopy` 를 요구해 옳은 결과를 계속
떨어뜨렸다.

**복구 프롬프트로 형식을 강제하려 하지 마라.** "마침표는 하나" 같은 지시를 문장으로
넣어봤지만 이전과 같은 비율로 어겼다(8건 중 1건). 형식은 검증기가 잡는다.
`qualityErrors` 의 `description must end with a single period` 가 그 예다.

**타임아웃은 엔드포인트와 한 벌이다.** `data/api-config.json` 의 현재 값
(blueprint 120초 / 일자 60초)은 로컬 qwen3:14b 실측 기준이다. 엔드포인트를 AWS 로
바꾸면 이 값도 함께 내려야 한다.

## 옮긴 뒤 실측 (2026-08-07)

실제 공급자에 붙여 쟀다. `node tools/measure-generation-router.mjs`.

| | 일자 쪼개기 전 | 쪼갠 뒤 |
|---|---|---|
| `run-blueprint` | 25.2초 · gpt-4o-mini · 생성 | 16.3초 · gpt-4o-mini · 생성 |
| `daily-content` 단건 | 16.2초 · **static · fallback** | 23.9초 · luna · **생성** |
| 동시 3일 | 15.4초 · 3/3 생성 | 26.2초 · 3/3 생성 |

**일자 쪼개기가 목적을 달성했다.** 8 LOT 을 한 번에 요구하던 때는 groq(7초)와
gpt-4o-mini(7초)를 모두 태우고 static 으로 떨어졌다. 프레임 + LOT 웨이브로
쪼개니 생성된다.

읽을 때 주의할 것 셋.

- **blueprint 가 빨라진 것은 코드 변경 때문이 아니다.** 그 경로는 건드리지
  않았다. 25.2 → 16.3초는 실행 간 편차다. 편차가 9초나 되므로 단발 측정으로
  성능을 판단하면 안 된다. 같은 설정으로 서너 번 돌려야 의미가 있다
- **동시 3일이 15.4 → 26.2초로 늘었다.** 일자당 호출이 1건에서 9건(프레임 1 +
  LOT 8)으로 늘어난 대가다. **API Gateway 통합 타임아웃 29초까지 2.8초밖에 안
  남는다.** 배포하면 여기가 실패 지점이 된다
- **호출 수가 늘어 비용과 rate limit 위험이 커졌다.** 동시 3일이면 27건이다

## 해결 — groq 는 키가 틀렸다 (2026-08-07)

**`invalid_request_error: 401 Invalid API Key`.** 8 LOT 전부, 프레임까지, 매번
같은 사유다. 타임아웃도 rate limit 도 계약 문제도 아니었다.

`GROQ_API_KEY` 는 설정되어 있었다. **설정 여부와 유효 여부는 다르다.** 측정
도구의 `GROQ_API_KEY: 설정됨` 은 값이 있다는 뜻일 뿐이고, groq 는 그 값을
거부했다. 만료·오타·다른 서비스 키를 넣은 경우가 후보다. groq 키는 `gsk_` 로
시작한다.

**세워뒀던 타임아웃 가설은 틀렸다.** 7초짜리 둘이 떨어지고 9초짜리만 살아남은
것은 우연이었다. groq 는 401 로 즉시 떨어졌고 시간과 무관했다.

키를 고치기 전에는 라우터가 사실상 2단 구성(gpt-4o-mini → gpt-5.6-luna)으로
돈다. 1순위가 없는 상태의 실측을 groq 성능으로 읽으면 안 된다.

### 키를 바꾼 뒤 첫 실측 — groq 는 빠르지만 8 LOT 중 2개만 만든다

키를 새로 발급하니 groq 가 **처음으로** 1순위에서 잡혔다.

| | 지연 | 출처 | 실제 생성 |
|---|---|---|---|
| `run-blueprint` | 14.6초 | gpt-4o-mini | sets 11/12 (set-01 대체) |
| `daily-content` | 4.5초 | **groq:gpt-oss-120b** | **lots 2/8 · 프레임도 대체** |

**4.5초는 6/8 을 포기한 대가다.** 6 LOT 과 프레임이 429 로 죽고 그 자리를
`deterministicFallback` 텍스트가 메웠다.

```
tokens: 429 Rate limit reached for model `openai/gpt-oss-120b` in organization ...
```

조직 단위 **TPM(분당 토큰) 한도**다. 요청 수가 아니라 토큰량이 문제다.

**쪼개기의 숨은 비용이 여기서 드러난다.** 출력은 작아졌지만 입력은 호출마다
계약서 전체 + 스키마를 다시 싣는다. 일자 1건이 최대 17회 호출(프레임 1 +
LOT 8 × 2회)이고 그 17번 모두 계약서를 보낸다. 한 번에 만들던 때의 9배 가까운
입력 토큰이다. 지연을 사고 토큰을 지불한 것이다.

### 모델을 바꿔도 안 된다 — 그래서 groq 를 뺐다 (2026-08-07 결정)

`qwen/qwen3.6-27b` 로 바꿔 다시 쟀다. groq 에 있는 유일한 Qwen 이고
`gpt-oss-120b` 보다 작다.

```
tokens: 429 Rate limit reached for model `qwen/qwen3.6-27b` in organization ...
```

**같은 조직 한도다.** 오히려 더 나빴다 — 120B 는 8개 중 2개라도 만들었는데
27B 는 8개 전부 죽었다. 한도가 모델별로 잡히더라도 이 구조의 토큰 유입을
어느 모델도 감당하지 못한다. **모델 교체로 우회되는 문제가 아니다.**

그래서 groq 를 일자 생성 공급자 목록에서 뺐다. 켜져 있는 동안 groq 가 한 일은
요청마다 죽은 호출 17건을 만드는 것뿐이었다.

**`GROQ_API_KEY` 만으로는 붙지 않는다. `GROQ_DAILY_ENABLED=true` 가 함께
필요하다.** 요금제를 올리거나 `DAILY_WAVE` 를 낮춰 다시 붙일 수 있도록 경로는
남겼다. 코드를 지우지 않은 것은 이것이 설계 결정이 아니라 용량 제약이기
때문이다 — 조건이 바뀌면 되돌릴 수 있어야 한다.

되붙이기 전에 확인할 것: 일자 1건이 최대 17회 호출이고 그 전부가 계약서
전문을 싣는다. 동시 3일이면 51회다. TPM 을 넘기지 않으려면 요금제와
`DAILY_WAVE` 를 함께 봐야 한다.

### 남은 공급자의 상태 (2026-08-07)

| 공급자 | blueprint | daily |
|---|---|---|
| groq (모델 무관) | 애초에 안 붙음 | **뺐다 · 조직 TPM** |
| `gpt-4o-mini` | 10/12 · 27.7초 | **계약 실패 · 복구도 실패** |
| `gpt-5.6-luna` | — | **8/8 · 23.1초** |

일자 생성은 사실상 `gpt-5.6-luna` 단독이다. `gpt-4o-mini` 는 두 번 연속으로
`description has unsafe ending` / `does not match category` 를 냈고,
`dailyRepairIndices` 가 lot 1·2·3 을 골라 복구한 뒤에도 통과하지 못했다.

**그래서 일자 생성만 순서를 뒤집었다.** 실패가 확실한 공급자를 매번 먼저 태울
이유가 없다.

| 모드 | 순서 |
|---|---|
| `daily-content` | (groq — 꺼짐) → **`gpt-5.6-luna`** → `gpt-4o-mini` |
| `run-blueprint` | **`gpt-4o-mini`** → `gpt-5.6-luna` |

**blueprint 는 건드리지 않았다.** `gpt-4o-mini` 가 네 번 다 성공했고 luna 로는
이 경로를 재본 적이 없다. 근거가 없는 곳까지 바꾸면 다음에 문제가 생겼을 때
원인이 둘로 늘어난다.

환경변수 이름(`SECONDARY_MODEL` / `FALLBACK_MODEL`)은 그대로 뒀다. 배포된
설정을 깨지 않기 위해서다. **이름이 곧 순위가 아니다** — 측정 도구 머리말이
모드별 순서를 함께 찍는다.

blueprint 는 `gpt-4o-mini` 가 12.7 / 14.6 / 27.7 / 34.5초로 편차가 20초 넘는다.
29초를 넘는 실행이 실제로 나왔다.

### 재시도해도 소용없는 실패는 그 자리에서 접는다

401 · 403 · 429 는 초 단위로 다시 불러도 같은 답이다. 그런데 라우터는 LOT 마다
재시도를 붙여 계속 두드리고 있었다. 키가 잘못됐을 때 일자 1건에 죽은 호출이
**17건**(프레임 1 + LOT 8 × 2회) 나간 것이 그래서다.

이제 웨이브에서 이 셋 중 하나가 나오면 **그 공급자를 이번 요청에서 접고** 다음
공급자로 넘어간다. 17건 → 최대 5건(프레임 1 + 첫 웨이브 4)이다.

접는 쪽을 고른 이유가 하나 더 있다. 계속 두드려서 나오는 결과물은 **대부분이
대체 문구인데 헤더에는 그 공급자 이름이 찍힌 응답**이다. 실측에서 groq 가 정확히
그것을 만들었다(8 중 2만 생성). 그럴 바에는 다음 공급자에게 기회를 주는 편이
낫다.

**타임아웃과 계약 검증 실패는 손절 대상이 아니다.** 그것들은 다시 만들면 될 수
있고, 실제로 부분 복구가 살려내는 경우가 많다. `isTerminal()` 이 상태 코드로만
판단한다.

### 부분 대체는 모든 검사를 통과한다 — 이게 더 위험하다

위 응답은 **200 이고, 계약 검증을 통과하고, 헤더에 `groq:openai/gpt-oss-120b`
가 찍힌다.** 내용의 75%가 대체 문구인데도 그렇다.

- 라우터의 전멸 방지 장치는 `fellBack === request.lots.length` 일 때만 던진다.
  6/8 은 통과한다
- `validateOutput` 은 대체 문구도 통과시킨다. 계약을 지키도록 만든 텍스트다
- 측정 도구는 응답 **전체**가 `deterministicFallback` 과 같을 때만 fallback 으로
  셌다. 부분 대체는 '실제 생성' 으로 보고했다

셋이 겹쳐서 "groq 로 4.5초에 생성됨" 이라는 잘못된 결론이 나왔다. 측정 도구는
이제 항목 단위로 세고 `⚠ 부분 대체` 를 찍으며 종료 코드를 1로 만든다. **라우터
쪽은 아직 그대로다** — 배포하면 헤더만 보고 판단할 수 없다는 뜻이다. 임계값을
두고 일정 비율 이상 대체되면 다음 공급자로 넘기는 선택지가 있다.

### 그 옆에서 나온 진짜 미결 — gpt-4o-mini 가 계약을 못 지킨다

같은 측정에서 2순위도 떨어졌다.

```
openai:gpt-4o-mini · generation_candidate_failed ·
  copy quality: lot 4 description has unsafe ending; lot 4 description does not match
```

LOT 8건은 개별로 다 생성됐다(`lot_fallback` 기록이 없다). 묶어서 `validateOutput`
할 때 lot 4 가 걸렸고, `dailyRepairIndices` 복구를 거치고도 통과하지 못했다.
`description` 은 계약이 정한 다섯 어미 중 하나로 끝나야 하는데 그것을 어겼다.

복구 단계는 로그를 하나도 남기지 않아 **복구가 손을 댔는지, 대체로 메웠는지,
고치고도 또 틀렸는지 구분되지 않았다.** `generation_daily_repair` 와
`generation_daily_repair_fallback` 을 넣어 메웠다. 다음 측정에서 이 세 경우가
갈린다.

문서 앞쪽 경고와 짝이다 — **복구 프롬프트로 형식을 강제하려 하지 마라.** 이미
`RETRY_ERRORS` 로 사유를 넣어 다시 부르고 있는데도 같은 어미를 또 틀린다.
`response_format` 이나 모델 교체가 다음 후보다.

### 사유를 보이게 만든 과정

라우터는 실패할 때마다 `generation_candidate_failed` 로 사유를 남기는데,
측정 도구가 `logger.warn` 을 빈 함수로 막아 삼키고 있었다. 지금은 모아서
단계마다 요약한다(c87a075).

**그런데 c87a075 의 요약은 사유를 못 찍고 있었다.** 라우터의 `cleanError()` 는
`{ name, message }` 객체를 남기는데 요약이 그것을 `String()` 으로 이어붙여
전부 `[object Object]` 로 나왔다. 즉 이 명령을 그대로 돌려도 groq 가 왜
떨어지는지 알 수 없었다. 세 가지를 함께 고쳤다.

- 요약이 `{ name, message }` 를 `name: message` 로 푼다
- 일자 생성 로그에 `model` 을 함께 남긴다. openai 공급자가 둘(gpt-4o-mini,
  gpt-5.6-luna)이라 `provider` 이름만으로는 어느 쪽이 떨어졌는지 구분되지 않아
  두 공급자의 실패가 한 줄로 합쳐지고 있었다
- LOT 첫 시도 실패를 `generation_daily_lot_retry` 로 남긴다. 재시도가 성공하면
  기존 경로에서는 첫 실패가 어디에도 안 남아, 공급자가 매번 한 번씩 태우고
  있어도 기록에 보이지 않았다
- 복구 단계에 `generation_daily_repair`(복구 전 사유와 고칠 자리)와
  `generation_daily_repair_fallback`(복구 호출마저 실패) 을 남긴다

측정은 이렇게 돌린다.

```
node tools/measure-generation-router.mjs --single
```

시드를 따로 주려면 플래그 뒤에 붙인다 — `--single my-seed`. 예전에는
`process.argv[2]` 를 그대로 시드로 써서 `--single` 만 주면 시드가 문자열
`'--single'` 이 되고 LOT ID 까지 `--single-d1-l1` 로 나왔다. 지금은 플래그를
건너뛴다.

사유별로 대응이 다르다.

| 사유 | 대응 |
|---|---|
| AbortError / timeout | 웨이브 크기 조정, groq 타임아웃 상향 |
| generation API 429 | 동시성 낮추기, 날짜 간 간격 |
| JSON 파싱 실패 | 프롬프트나 response_format |
| 계약 검증 오류 | 모델 능력 또는 계약 문구 |

지연을 줄여야 하면 `DAILY_WAVE`(현재 4)를 8 로 올려 웨이브를 1회로 만드는
선택지가 있다. 대신 웨이브 간 "이미 쓴 설명" 전달이 사라져 중복 위험이 커진다
— 중복은 `dailyRepairIndices` 가 전체 복구로 잡는다.

## 쪼개면 여덟 설명이 서로 닮는다 (2026-08-07)

실제 게임에서 확인된 것이다. 하루치 여덟 설명이 **모두 `보인다.` 로 끝나고 서로
다른 특징을 말하지 않았다.** 길이도 어미도 카테고리 어휘도 규칙대로였다.
넘치지도 않았다. 다양성만 없었다.

**계약서를 모드별로 나눈 것 때문이 아니다.** 다양성 규칙은 DAY 절에 그대로
있다. 원인은 쪼개기 자체다.

```js
const used = lots.map(({ description }) => description).filter(Boolean);  // 끝난 웨이브 것만
const candidates = await Promise.all(wave.map((lot) => provider.call({ ... })));  // 4개 동시
```

- 1~4번 LOT — `used` 가 비어 있다. **넷이 서로를 전혀 모른 채 동시에 만들어진다**
- 5~8번 LOT — 앞 넷은 피하지만 **자기들끼리는 또 모른다**

그리고 계약서의 이 줄이

> Vary the observed feature across all eight items

**LOT 하나짜리 호출에는 실행 불가능한 지시다.** 모델은 여덟을 보지 못한다.
각자 가장 무난한 답으로 수렴한다.

검증기도 못 잡는다. `validateOutput` 은 **완전히 같은 문장**만, `qualityErrors`
는 같은 어절이 **3회 이상** 반복될 때만 거른다. 여덟이 전부 같은 어미로 끝나면서
조금씩 다르면 통과한다.

**로컬은 이 문제가 없다.** `generation-server.js` 는 하루치를 한 번에 만들어
모델이 여덟을 다 본다. 이것도 라우터와 로컬의 차이다.

### 고친 방법 — 자리마다 볼 곳을 정해 준다

`lotWritingHint(index)` 가 LOT 번호로 **볼 곳**과 **맺을 어미**를 돌려가며
배정한다. 호출을 늘리지도, 순차로 돌리지도 않는다. 프롬프트 한 문장이 늘 뿐이다.

```
1번 LOT: Focus this description on visible material. End the description with "남아 있다.".
2번 LOT: Focus this description on engraving. End the description with "보인다.".
...
6번 LOT: Focus this description on wear. End the description with "남아 있다.".
```

**목록을 새로 적지 않았다.** 볼 곳 여섯 개는 계약서의 `Describe only ...` 문장에서,
어미 다섯 개는 검증기의 `safeDescriptionEnding` 정규식에서 끌어온다. 새로 적으면
갈라진다.

끌어오기에는 대가가 있다 — **계약서 문장이나 정규식이 바뀌면 조용히 빈 힌트가
된다.** 그래서 테스트가 여섯 가지·다섯 가지가 나오는지, 값이 잘리지 않았는지
확인한다. 실제로 처음 구현에서 `, or wear` 를 쉼표로만 끊어 `or wear` 가 남았고
개수만 세는 테스트는 그것을 통과시켰다.

### 실측 — 갈라진다 (2026-08-07)

실행 중인 라우터에 게임과 같은 모양의 일자 요청을 보내 쟀다.

| 시드 | 출처 | 지연 | 서로 다른 어미 |
|---|---|---|---|
| variety-check-1 | luna | 26.7초 | 4가지 |
| variety-a | gpt-4o-mini | 43.8초 | 5가지 |
| variety-b | **static** | 48.6초 | — |
| variety-c | gpt-4o-mini | 37.0초 | 4가지 |

**고치기 전에는 여덟이 전부 한 가지였다.** 보는 곳도 재료·각인·변색·수리·소장
표식·마모로 실제로 갈렸다.

### 어미 배정은 넣었다가 뺐다

처음에는 볼 곳과 함께 **맺을 어미도** 자리마다 배정했다. 한 판만 보고 괜찮다고
판단했는데, 표본을 넷으로 늘리니 문장이 휘었다.

```
케이스에 복원된 부분이 보여 이어진다.      ← 어미를 맞추려고 억지로 이어붙였다
안료가 사라지지 않고 생생하게 남아 있다.   ← 관찰이 아니라 상태 평가다
```

로그에도 나타났다. `copy quality: lot N description has unsafe ending` 이 여러
판에서 나왔다 — 모델이 지시받은 어미를 쓰려다 문장을 망가뜨리고 검증기에 걸린
것이다.

**볼 곳만 남겼다.** 어미는 지시하지 않아도 따라서 갈라지고, "다섯 중 하나"라는
규칙은 계약서가 이미 말한다. 그 이상을 지시하지 않는다.

교훈은 방법보다 절차 쪽이다 — **한 판으로 품질을 판단하면 안 된다.** 첫 표본만
보고 "손볼 필요 없다"고 적었다가 넷째 판에서 뒤집혔다.

### 이 측정에서 함께 드러난 공급자 문제

어미와 무관하며 아직 해결하지 않았다.

- **`gpt-5.6-luna` 가 LOT 호출에서 자주 타임아웃된다.** 타임아웃 9초는 추론
  모델에 빠듯하다. `generation_daily_lot_retry · TimeoutError` 가 판마다 1~5회
- **`LOT IDs mismatch` 가 luna 에서 반복된다.** OpenAI 쪽은 `json_object` 라
  스키마가 강제되지 않아 모델이 다른 `lotId` 를 돌려줄 수 있다. 이때
  `dailyRepairIndices` 는 전체 복구를 지시하므로 여덟 개를 다시 만들고, 그러고도
  실패하면 공급자가 통째로 떨어진다. **지연이 40초를 넘는 판의 주범이다**
- **두 판이 `static` 으로 떨어졌다.** 여덟 개가 전부 대체 문구다

`json_schema` 로 바꿔 스키마를 강제하면 `LOT IDs mismatch` 는 사라질 수 있다.
확인하지 않았다.

## 한 판에 얼마가 나가나 — 그리고 30% 를 줄인 방법

라우터가 실제로 만드는 프롬프트를 그대로 조립해 셌다. 추정이 아니다.

`RUN_DAYS = 12` 이고 날짜를 넘길 때마다 `ensure` 가 2일 앞까지 채우므로 **한
판에 12일 전부 생성된다.** 1일차만 만들고 마는 것이 아니다.

| 종류 | 횟수 | 줄이기 전 | 줄인 뒤 |
|---|---|---|---|
| blueprint frame | 1 | 3,539자 | 2,415자 |
| blueprint set | 12 | 3,584자 | 2,460자 |
| daily frame | 12 | 2,607자 | 1,712자 |
| daily lot | **96** | 3,008자 | 2,113자 |
| **합계** | **121회** | **366,599자** | **255,327자** |

**입력 30.4% 감소.** 재시도 0 기준이고, 재시도와 폴백은 이 값을 곱한다.

### 무엇이 문제였나

계약서가 전체 입력의 **74%** 였다. 2,238자짜리 계약서가 121번 실렸다. 429 를
낸 것과 같은 원인이다 — 쪼개기가 출력은 줄였지만 계약서를 121번 복사했다.

그중 상당량이 쓸 일 없는 규칙이었다. **LOT 하나를 만드는 호출이 세트 사건 규칙
695자를** 매번 날랐고, blueprint 호출은 일자 길이·어미·카테고리 어휘 1,111자를
날랐다.

### 어떻게 나눴나

계약서에 `@ALL` · `@RUN` · `@DAY` 표식을 넣고 `contractFor(mode)` 가 공통 절 +
해당 모드 절만 돌려준다.

```
공통    227자   JSON·한글 규칙, ID·어조
RUN     887자   RUN 스키마, 세트 사건 규칙        → 합 1,114자
DAY   1,116자   DAY 스키마, 길이·어미·카테고리 어휘 → 합 1,343자
```

**복제가 아니다.** 파일은 하나이고 절을 고를 뿐이라 갈라질 여지가 없다 —
`AGENTS.md` 가 금지한 것은 계약을 두 곳에 두는 것이다. 로컬 서버와 라우터가
같은 `contractFor()` 를 쓴다.

표식이 없는 계약서를 만나면 전부 `ALL` 로 들어가 예전과 같이 동작한다.

**표식 오타는 조용히 규칙을 지운다.** 어느 절에도 안 실린 줄이 생기면 모델은
규칙이 사라진 줄 모르고 답하고 검증기만 뒤늦게 떨어뜨린다. 그래서 모든 줄이
적어도 한 모드에 실리는지 테스트가 확인한다.

### 비용을 계산할 때 함께 볼 것

- 토큰으로는 대략 **8만**(3자/토큰 가정, 한글·JSON 섞여 6만~10만 범위)
- **`gpt-5.6-luna` 는 추론 모델이다.** 일자 호출 108건이 여기로 간다.
  추론 토큰은 보이지 않지만 출력으로 과금된다
- 실비는 공급자 대시보드가 정본이다. 여기 숫자는 호출량이지 금액이 아니다

## 배포본과 로컬을 비교한다 (2026-08-07)

배포된 Lambda 는 **쪼개기 이전 코드**다. 살아 있는 대조군이라 재보았다.

```
https://8tjqzce89j.execute-api.us-east-1.amazonaws.com/generate
```

**인증이 없다.** 키 없이 그냥 부르면 생성이 된다. 덕분에 키를 가진 사람이 아니어도
측정할 수 있지만, **URL 을 아는 사람은 누구나 이 계정의 공급자 예산을 쓸 수 있다.**
그리고 그 URL 은 `api-config.json` 을 통해 독립 실행본 HTML 에 박힌다. 배포 전에
정리해야 한다.

### 8판 실측

| | 배포본 (한 번에) | 로컬 (쪼갬) |
|---|---|---|
| 표본 | 8판 | 4판 |
| **static 낙하** | **4/8 (50%)** | **1/4 (25%)** |
| 성공 시 지연 | 7.0 · 14.0 · 14.8 · 21.9초 | 26.7 · 37.0 · 43.8초 |
| 서로 다른 어미 | **매번 5가지** | 4~5가지 |
| 서로 다른 첫머리 | **매번 8/8** | — |

**한 번에 만드는 쪽이 빠르고 문구도 낫다.** 모델이 여덟을 다 보면서 쓰니 다양성이
공짜로 나온다. 쪼갠 쪽이 `lotWritingHint` 로 겨우 따라잡은 수준을 그냥 낸다.

**대신 절반이 static 이다.** 한 번에 만들면 그 호출 하나가 실패했을 때 하루치가
통째로 사라진다. 쪼개기가 막으려던 것이 정확히 이것이고, 실제로 로컬 쪽 낙하율이
절반이다.

### 읽을 때 주의할 것

두 쪽은 **코드가 여러 군데 다르다.** 쪼개기만 다른 것이 아니다 — 공급자 순서,
계약서 절 분리, LOT 힌트, groq 게이트가 전부 배포본에는 없다. 그래서 위 표는
"쪼개기의 효과"가 아니라 **"두 시점의 차이"** 다.

표본도 8판과 4판이라 낙하율 50% 대 25% 를 단정하면 안 된다.

### CloudWatch 가 사유를 다 알려준다 (2026-08-07)

배포된 함수는 `nhn-generation-api` (us-east-1, nodejs22.x, 512MB).
로그 그룹은 `/aws/lambda/nhn-generation-api` 다.

```bash
aws logs filter-log-events --region us-east-1 \
  --log-group-name "/aws/lambda/nhn-generation-api" --start-time <ms> \
  --query "events[].message" --output text
```

**`lambda:GetFunctionConfiguration` 은 환경변수 값까지 돌려준다 — 거기 API 키가
들어 있다.** 이름만 볼 때는 `--query "Environment.Variables | keys(@)"` 로 고른다.

#### 한도와 상한

| | 값 | 출처 |
|---|---|---|
| Lambda 타임아웃 | 60초 | 함수 설정 |
| **API Gateway 통합 타임아웃** | **30초** | HTTP API 통합 |
| 최대 사용 메모리 | 112MB / 512MB | REPORT 줄 |
| **groq 무료 TPM** | **8,000 토큰/분** | 429 본문 |
| 하루치 한 건의 토큰 | **4,251~5,948** | 429 본문 |

**groq 는 요청 한 건이 분당 예산을 거의 다 쓴다.** 코드로 우회할 수 있는 문제가
아니다. `GenerationBuffer` 가 3일치를 동시에 부르는 것만으로 확정적으로 넘는다.
요금제를 올리지 않는 한 쓸 수 없다.

#### static 4판의 실제 사유

`aws-3` · `aws-4` · `aws-6` · `aws-7` 모두 같은 모양이었다.

```
groq          429 TPM          (0.06~0.4초)
gpt-4o-mini   TimeoutError     (7.0초 — 타임아웃 7초)
gpt-5.6-luna  TimeoutError     (9초)
→ static
```

#### 그런데 luna 는 하루치를 6.8초에 해냈다

```
generation_succeeded { provider: 'openai', model: 'gpt-5.6-luna', latencyMs: 6795 }
```

**쪼개기의 전제가 흔들린다.** "하루치를 한 번에 요구하면 공급자 타임아웃 7~9초
안에 못 들어온다"고 판단해 쪼갰는데, luna 는 들어온다 — 다만 **9초가 빠듯해서
어떤 판은 되고 어떤 판은 안 된다.** 8판 중 4판이 그 경계에서 떨어졌다.

쪼개기는 이 문제를 "요청을 작게 만들어" 풀었다. 그 대가가 호출 9~17건, 지연
26~44초, groq TPM 초과, 그리고 여덟 설명이 서로 닮는 것이었다.

**더 싼 답이 있다. 타임아웃을 올리는 것이다.** Lambda 는 60초, 게이트웨이는
30초까지 준다. 지금 일자 생성에 9초만 주고 있다.

### 그래서 되돌렸다 (2026-08-07)

로컬 `generation-server.js` 가 이미 쓰던 전략으로 라우터를 맞췄다 —
**하루치를 한 번에 만들고, 실패한 LOT 만 골라 다시 만든다**(`dailyRepairIndices`).

| | 쪼갤 때 | 되돌린 뒤 |
|---|---|---|
| 일자 호출 수 | 9~17건 | **1건** (+ 복구한 LOT 수) |
| `daily-content` 타임아웃 | luna 9초 · mini 7초 | **luna 20초 · mini 8초** |
| 복구 호출 타임아웃 | 본 호출과 같음 | **6초** (`REPAIR_TIMEOUT_MS`) |

타임아웃 예산은 **API Gateway 통합 타임아웃 30초**에서 나눴다.

```
본 호출 luna 20초 + 복구 6초        = 26초
luna 20초 실패 + mini 8초           = 28초
```

`blueprint` 는 건드리지 않았다. 조각이 작고 13번 부르므로 지금 값이 맞다.
12세트를 한 번에 요구하면 무너진다는 실측은 이 문서 앞쪽에 있다.

`lotWritingHint` 는 지웠다. 쪼갠 호출끼리 서로를 못 봐서 문구가 닮던 것을
보완하는 장치였는데, 한 번에 만들면 모델이 여덟을 다 보므로 필요가 없다 —
배포본 실측에서 매 판 어미 5가지, 서로 다른 첫머리 8/8 이 나왔다.

**아직 이 구성으로 실측하지 않았다.** 배포 후 8판을 같은 방식으로 재서 위 표
옆에 붙일 것.

## 게임에 붙여 돌리는 법

`tools/serve-generation-router.mjs` 가 라우터 핸들러를 로컬 HTTP 로 세운다.
`generation-server.js` 와 **같은 자리**(`127.0.0.1:8787/generate`)라
`data/api-config.json` 을 고칠 필요가 없다. 대신 둘 중 하나만 띄운다.

```
# 8787 을 쓰고 있으면 먼저 로컬 생성 서버를 내린다
cd Runtime
$env:LIVE_GENERATION_ENABLED="true"; $env:OPENAI_API_KEY="키"
npm run start:router

# 다른 터미널에서 (4173 은 team-loop 이 쓴다)
$env:PORT="4199"; npm start
# http://localhost:4199/Runtime/index.html
```

서버가 요청마다 한 줄씩 찍는다. 어느 공급자가 왜 떨어졌는지도 접어서 나온다.

```
run-blueprint  200 · 14.6초 · openai:gpt-4o-mini
day 1          200 · 23.1초 · openai:gpt-5.6-luna
     8회  openai:gpt-4o-mini · generation_daily_lot_retry · copy quality: ...
```

**측정 도구로는 안 보이는 것이 여기서 보인다.** 2026-08-07 배선 확인에서
`run-blueprint` → `day 1` 뒤에 허브로 들어가자마자 `day 2` · `day 3` 이
따라 나갔다. `GenerationBuffer.ensure` 의 선행 생성이다. 즉 **새 게임 한 번에
일자 요청이 3건 더 붙는다** — rate limit 을 볼 때 이것까지 세어야 한다.

키 없이 띄우면 전부 `static` 으로 답한다. 그것만으로도 게임의 요청이
`validateInput` 을 통과하는지는 확인된다.

## 옮긴 뒤 확인하는 법

라우터는 응답 헤더에 출처를 찍는다.

```
x-generation-source: openai:gpt-4o-mini   실제 생성
x-generation-source: static               deterministicFallback
```

`static` 이면 생성이 아니라 대체 문구다. 2026-08-07 기준 배포된 Lambda 는 응답 본문이
로컬 `deterministicFallback` 과 바이트 단위로 동일했다 —
`env.LIVE_GENERATION_ENABLED !== 'true'` 라 공급자 목록이 비어 있었다. 공급자를 켜기
전에는 속도를 측정해도 의미가 없다.

로컬과 비교하려면 같은 request 로 양쪽을 부르고 `x-generation-source` 와 지연을 함께
본다. 로컬 기준선은 blueprint 51~70초, 일자 생성 16~29초다.
