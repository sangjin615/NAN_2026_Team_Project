# 세션이 갈릴 때 알아야 할 것

여러 실행자가 같은 저장소를 동시에 만진다. 브랜치가 갈려 있어 서로의 변경을 바로
볼 수 없고, Team Loop 인박스도 지금은 서버가 갈려 닿지 않는다. 그래서 조율에 필요한
것을 여기 둔다.

아래 **함정**은 시간이 지나도 유효하다. **현재 작업 분담**과 **상태 사실**은
2026-08-07 기준이며 낡을 수 있으니 git 으로 다시 확인한다.

## 함정

문서에 없거나 잊기 쉬운 것들이다. 전부 이 저장소에서 실제로 겪었다.

**`npm start` 는 4173 을 쓰는데 team-loop 서버가 그 포트를 점유하고 있다.**
`PORT=4199 node dev-server.js` 처럼 다른 포트로 띄운다.

**dev-server 의 루트는 저장소 루트다.** URL 이 `/Runtime/index.html` 이지
`/index.html` 이 아니다. 404 가 나면 이것부터 의심한다.

**런 시드는 새 게임마다 무작위로 뽑힌다.** 버그를 재현하려면 저장 슬롯 화면의 시드
입력칸에 고정값을 직접 넣어야 한다. 비워두면 매번 다른 판이 나와 재현되지 않는다.

**`npm run audit` 은 `Runtime/reports/generation-audit.json` 의 타임스탬프를 고친다.**
커밋 전에 `git checkout --` 으로 되돌리지 않으면 diff 에 섞인다.

**`src/` · `data/` · `index.html` · `styles.css` 중 하나라도 고쳤으면
`npm run build:standalone`.** 안 하면 서버 없이 실행하는 사람이 옛 빌드를 본다.

**미추적 파일은 전부 사용자 것이다. `git add -A` 를 쓰지 않는다.** 디렉터리를 통째로
스테이징하면 실험 산출물이 함께 들어간다. 실제로 그렇게 14개가 잘못 커밋됐다가
되돌린 적이 있다. 고친 파일만 명시적으로 적는다.

**VSL 셀렉터는 조용히 빗나간다.** `querySelectorAll` 이 0개를 돌려줘도 오류가 없다.
`innerHTML` 로 다시 그리는 목록은 그린 뒤 `adapter.refreshBindings()` 를 부른다.
둘 다 `npm run audit` 이 잡는다. 자세한 것은 `AGENTS.md`.

**검증 로직을 복제하지 않는다.** 계약 검증은 `Runtime/generation-server.js` 가
export 한다. 복제하면 갈라진다 — 실제로 갈라져서 실험 도구가 계약에 없는 필드
7개를 요구했고, 저장소 밖 검증기 하나는 감정 제거 뒤에도 `appraisalCopy` 를 요구해
옳은 결과를 계속 떨어뜨렸다.

**Team Loop 인박스로 다른 실행자에게 말을 걸지 않는다.** 서버가 4173(메인)과
4182(실험)로 갈려 있어 계정과 메시지가 서로 보이지 않는다. 조율은 저장소 문서와
커밋 메시지로 한다. 지금은 그것이 유일하게 확실한 통로다.

## 현재 작업 분담 (2026-08-07)

API 연결 담당이 아래를 잡고 있다. 런타임 버그 수정 세션은 피한다.

```
Runtime/data/api-config.json
Runtime/generation-server.js
Runtime/aws/generation-router.mjs
Runtime/src/generation-api-provider.js, generation-buffer.js
Runtime/tools/ 의 generation 관련, promote-generation-fixture.mjs
Runtime/reports/local-model-experiment/     fixture. request 와 output 의 seed 가 짝이다
Docs/GENERATION-*.md
```

**`Runtime/src/app.js` 와 `Runtime/index.html` 은 양쪽이 함께 만진다.** 시드
무작위화와 로딩 취소 버튼(`#skip-generation`)이 최근 들어갔다. 게임 로직 수정과
겹치므로 최신 tip 에서 시작한다.

## 상태 사실 (2026-08-07)

- `codex/vsl-runtime-core` 가 통합 브랜치다. `codex/api-integration` 은 완전히
  포함됐고, `codex/aws-generation-router` 는 `cb0fa5f` 에서 갈라져 낡았다
- 기준선: `cd Runtime && npm test` 55/55, `npm run audit` 오류 0
- `api-config.json` 이 `enabled: true` 다. 생성 서버 없이 게임을 켜면 즉시
  fallback 으로 간다. 막히지 않고 빠르다
- 로컬 생성을 쓰려면 `npm run start:generation` 이 필요하고 ollama 에 qwen3:14b 가
  있어야 한다. blueprint 는 51~70초, 일자 생성은 16~29초 걸린다
- 저장 슬롯은 `localStorage` 의
  `unknown-auction:vsl-runtime:save:v2:slot:N:current|backup`

## 알려진 오탐

`npm run audit` 의 `새 게임 최악 대기가 180초다 · 로딩 화면에 취소 수단이 없다`
경고는 **더 이상 맞지 않다.** 취소 버튼(`#skip-generation`)이 들어갔고 브라우저에서
동작을 확인했다. audit 의 탐지 조건이 그 버튼을 못 알아보는 것이다. 이 경고를 보고
"아직 취소 수단이 없다"고 판단하지 않는다.
