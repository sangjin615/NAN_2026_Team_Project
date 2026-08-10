# 작업 규칙

이 저장소에서 사람과 AI 실행자가 함께 일한다. 브랜치가 갈려 있어 서로의 변경을
바로 볼 수 없으므로, 매번 알릴 필요가 없는 상시 규칙을 여기에 둔다.

다른 실행자와 동시에 작업하면 `Docs/PARALLEL-SESSION-NOTES.md` 를 먼저 읽는다.
포트 충돌, 시드 무작위화 때문에 버그 재현이 안 되는 문제, 커밋에 남의 파일이 섞이는
경로 같은 함정과 현재 작업 분담이 거기 있다.

게임 본체는 `Runtime/` 이다. 나머지 최상위 폴더는 기획서와 리소스다.

생성·검증을 건드리기 전에 `Docs/GENERATION-VERIFICATION-HANDOFF.md` 를 읽는다.
현재 미결인 검수 상태와 그 판단이 거기 있다. 검수 판단은 Team Loop 데이터베이스에
남는데 `.team-loop/` 는 `.gitignore` 대상이라 저장소에 흔적이 없다. 그래서 기능
제거나 계약 변경 같은 판단은 이 저장소 문서에도 남긴다.

`Runtime/aws/generation-router.mjs` 는 생성 전략이 `generation-server.js` 와 다르다.
로컬은 blueprint 를 세트 단위로 나눠 만들고 일자 생성은 실패한 LOT 만 복구하는데,
라우터는 둘 다 한 번에 만든다. 한 번에 만들면 같은 모델도 무너진다 —
`Docs/GENERATION-ROUTER-PARITY.md` 에 실측과 옮기는 방법을 적어 뒀다.

게임 본체는 `Runtime/` 이다. 나머지 최상위 폴더는 기획서와 리소스다.

## 무엇이든 고친 뒤에 돌릴 것

```bash
cd Runtime
npm test              # 40건. 실패하면 고치기 전에는 커밋하지 않는다
npm run audit         # 연결 지점 점검. API 없이도 항상 돈다
```

`src/`, `styles.css`, `runtime-fixes.css`, `index.html`, `data/` 중 하나라도
건드렸으면 독립 실행본을 다시 만든다. 이걸 빼먹으면 서버 없이 실행하는 사람이
옛 빌드를 보게 된다.

```bash
npm run build:standalone
```

## VSL 템플릿 — 조용히 깨지는 곳

`Runtime/contracts/vsl-map.template.json` 이 런타임 DOM 과 VSL 편집기를 잇는다.
`VslRuntimeAdapter.applyContractMetadata()` 가 셀렉터로 요소를 찾아 `data-vsl-*`
를 붙이는데, **셀렉터가 빗나가도 `querySelectorAll` 이 조용히 0개를 돌려준다.**
런타임에 오류도 경고도 없다. 실제로 바인딩 6건이 오래 죽어 있었다.

지켜야 할 것 두 가지다.

**`vslActionId` · `vslSceneId` · `vslDataPath` 는 편집기 쪽과의 계약이다.**
런타임 마크업이 바뀌면 `selector` 만 고친다. ID 를 바꾸면 편집기가 끊긴다.

**목록을 `innerHTML` 로 다시 그리는 화면은 그린 뒤 `adapter.refreshBindings()`
를 부른다.** `applyContractMetadata()` 는 `showScene()` 안에서 도는데, 렌더
함수는 그 뒤에 DOM 을 갈아끼운다. 붙여둔 속성이 사라진다. 지금 해당하는 곳은
저장 슬롯(`renderSaveSlots`)과 의뢰소(`renderQuestOffice`)다. 새로 목록 화면을
만들면 여기에 추가된다.

`npm run audit` 이 두 경우를 다 잡는다.

## balance.json

코드가 읽는 키가 없으면 런타임에서 조용히 `undefined` 가 된다. 반대로 아무도
읽지 않는 키는 잔재다. `npm run audit` 이 양방향으로 대조한다.

최상위 키 상당수는 설계 기록과 실측값이라 코드가 읽지 않는 것이 정상이다.
지우기 전에 정말 아무도 안 쓰는지 확인한다.

`shop.derivedFromStage` 에 적힌 항목은 0~4단계에 대응하는 5칸 배열이어야 한다.

## 제거된 기능 — 되살리지 말 것

**감정(appraisal)** 과 **정보 구매** 는 설계에서 빠졌다. 관련 함수·설정·문구를
정리했으므로 다시 넣지 않는다.

- 물품의 실제 가치(`trueValue`)는 계속 감춘다. 화면에는 매입가만 보인다
- 술집 정보는 무료이고 상회 단계로만 공개 범위가 넓어진다

유물 `감정사의 확대경`은 2026-07-30 에 효과가 재정의되어 감정과 무관하다.
이름만 남은 것이니 건드리지 않는다.

## 생성 API 계약

계약의 근거는 두 곳뿐이다.

- `Runtime/contracts/compact-generation-contract.txt` — 모델에게 주는 계약서
- `Runtime/generation-server.js` — 스키마와 품질 검증기

**검증 로직을 다른 파일에 복제하지 않는다.** 복제하면 갈라진다.
`tools/run-local-generation-experiment.mjs` 가 스키마를 복제해 두었다가 실제로
갈라졌다(`castVoices`, `appraisalCopy` 등 현재 계약에 없는 필드가 남아 있다).
검증이 필요하면 `generation-server.js` 에서 `qualityErrors` 를 import 한다.
`tools/audit-generation.mjs` 가 그렇게 하고 있다.

문구 길이 상한은 계약서와 서버가 같은 값을 써야 하고, 화면이 그만큼 보여줄 수
있어야 한다. 경매 카드 설명문은 배경 아트에 그려진 카드 안에 들어가야 해서
넓힐 수 없다. `npm run audit` 이 세 값을 대조한다.

## 배경 아트 위에 얹는 UI

씬 배경은 `background: ... / 100% 100%` 로 늘려 깔린다. 요소를 % 로 얹기
때문에 좌표가 배경 이미지와 선형 대응한다. **패널 크기나 줄 수를 바꾸기 전에
배경 아트에서 그려진 경계를 확인한다.** 카드 밖으로 나가면 테이블 위에 글씨가
떠 있게 된다.

## API 연결 시 확인

```bash
npm run audit:generation          # 연결 전. 설정과 fallback, 기존 기록을 본다
npm run audit:generation:live     # 연결 후. 실제로 호출해 측정한다
```

기준선은 `Runtime/reports/generation-audit.json` 에 남는다.

연결 전에 정해야 할 것이 남아 있었다. **연결은 끝났다 (2026-08-08 확인).**
`api-config.json` 이 `enabled: true` 로 배포된 AWS 라우터
(`https://8tjqzce89j.execute-api.us-east-1.amazonaws.com/generate`)를 가리킨다.
아래 목록은 그래서 "정할 것" 이 아니라 **무엇이 해소되고 무엇이 남았는지의
기록**이다.

- ~~`timeoutMs` 하나를 블루프린트와 일자 생성이 같이 쓴다. 실측은 블루프린트
  중앙 2.9초, 일자 생성 중앙 15.3초로 5배 차이다. 지금 값 15초면 일자 생성
  다수가 타임아웃되어 fallback 으로 떨어진다~~ **해소됐다 (2026-08-08 정정).**
  `generation-api-provider.js:15` 의 `timeoutFor(mode)` 가 모드로 고른다 —
  `run-blueprint` 은 `blueprintTimeoutMs`, `daily-content` 는 `dayTimeoutMs`,
  **둘 다 없을 때만** `timeoutMs` 로 떨어진다. `api-config.json` 의 현재 값은
  블루프린트 120초 · 일자 60초이고, `timeoutMs` 15초는 그 폴백 자리로만 남았다.
  위의 "중앙 2.9초 / 15.3초" 는 로컬 ollama 실측이라 지금 붙어 있는 AWS
  라우터에는 그대로 적용되지 않는다 — 라우터 쪽 예산(게이트웨이 통합 타임아웃
  30초에서 나눈 luna 20초 · mini 8초 · 복구 6초)은
  `Docs/GENERATION-ROUTER-PARITY.md` 에 따로 있다
- ~~`GenerationApiProvider.request()` 는 헤더가 `content-type` 뿐이라 인증
  토큰을 실을 자리가 없다~~ **틀렸다 (2026-08-07 정정).** `requestHeaders` 를
  펼쳐 넣는다. 자리는 있다 — 문제는 그 자리에 넣을 것이 없다는 쪽이다
  (2026-08-08 재확인: `generation-api-provider.js:29`)
- `api-config.json` 은 `build:standalone` 이 독립 실행본에 그대로 박는다.
  **키를 여기 넣으면 배포본에 노출된다.** `assertPublicGenerationConfig` 가
  빌드 단계에서 막는다. 그래서 **배포본은 어떤 비밀도 들 수 없다** — 런타임에
  `window.__NAN_GENERATION_API_CONFIG__` 로 주입하는 로컬·사내 경로만 남는다.
  라우터 인증을 포기하고 상한으로 간 이유가 이것이다
  (`Docs/GENERATION-ROUTER-PARITY.md` 의 "남은 결정" 1번).
  2026-08-08 재확인 — `generation-api-config.js:1` 의 `SENSITIVE_CONFIG_KEYS`
  가 `requestHeaders` 까지 막고 있어 여전히 유효하다
- ~~`GenerationBuffer.ensure()` 가 3일치를 동시에 호출한다.~~ **지금은 2일치다
  (2026-08-08 정정).** 결론(동시 요청 제한 확인 필요)은 유효하고 수만 틀렸다.
  `app.js` 가 호출을 둘로 쪼갰다 — 들어갈 날 하나는 `aheadDays: 0` 으로 기다리고
  (`app.js:265`, `app.js:836`), 선행 생성은 기본 `aheadDays`(2)로 뒤에서 돈다
  (`app.js:274`, `app.js:840`). 뒤쪽 호출의 범위는 3일이지만 첫날이 이미
  `readyDays` 에 있어 실제로 나가는 것은 **2건**이다. 새 게임 한 번이면
  blueprint 1 + day 1 + (day 2 · day 3 동시) 이다
연결 전에 정해야 할 것이 남아 있다.

- `timeoutMs` 하나를 블루프린트와 일자 생성이 같이 쓴다. 실측은 블루프린트
  중앙 2.9초, 일자 생성 중앙 15.3초로 5배 차이다. 지금 값 15초면 일자 생성
  다수가 타임아웃되어 fallback 으로 떨어진다
- `GenerationApiProvider.request()` 는 헤더가 `content-type` 뿐이라 인증
  토큰을 실을 자리가 없다. 외부 서비스를 붙이려면 필요하다
- `api-config.json` 은 `build:standalone` 이 독립 실행본에 그대로 박는다.
  **키를 여기 넣으면 배포본에 노출된다**
- `GenerationBuffer.ensure()` 가 3일치를 동시에 호출한다. 동시 요청 제한이
  있는 서비스라면 확인이 필요하다

## 커밋

- 고친 파일만 명시적으로 스테이징한다. `git add -A` 를 쓰지 않는다
- 미추적 파일은 사용자 것이다. 건드리지 않는다
- 브랜치가 갈려 있으니 커밋 메시지에 무엇을 왜 바꿨는지 남긴다. 지금은 이것이
  다른 실행자에게 닿는 가장 확실한 통로다
