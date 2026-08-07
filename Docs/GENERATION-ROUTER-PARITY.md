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
