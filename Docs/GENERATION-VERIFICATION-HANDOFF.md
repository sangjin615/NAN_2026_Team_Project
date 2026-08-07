# 생성 검수 인수인계 — 2026-08-07

검수 과정에서 내린 판단이 지금까지 Team Loop 데이터베이스에만 남아 있었다.
`.team-loop/actual-run-data/` 와 `.team-loop-worktrees/` 는 `.gitignore` 대상이라
저장소에는 흔적이 없다. 서버가 갈리거나 데이터가 초기화되면 판단의 근거가 통째로
사라진다. 실제로 2026-08-07 에 Team Loop 서버가 둘로 갈려 있던 것이 드러나면서
에이전트 간 메시지 다섯 건이 서로 안 보이는 상태가 됐다.

그래서 저장소에 남긴다.

## 검수는 아직 통과하지 못했다

Team Loop 작업 `tsk_0d80c8815ab8a0ea245b`(Unknown Auction generation
skill-harness validation)의 검증 결과다.

| 검사 | 결과 |
|---|---|
| `npm test` | 42/42 통과 |
| `git diff --check` | 통과 |
| run-blueprint 내용 검사 | **실패** — `["runSeed"]` |
| daily-content 내용 검사 | **실패** — `["lots:exact"]` |

코드 문제가 아니다. **fixture 의 request 와 output 이 서로 다른 seed 다.**

| | request | output |
|---|---|---|
| runSeed | `newspaper-grounded-14b-20260806` | `team-loop-local-001` |
| lotId | `newspaper-grounded-…-d1-l1..l8` | `team-loop-local-001-d1-l1..l8` |

git 이 원인을 확인해 준다. request 는 `53c829d`, `98752d6` 에서 두 번 갱신됐고
output 은 최초 커밋 `8df0f1a` 이후 **한 번도 바뀌지 않았다.**

## 왜 어긋났나 — 승격 단계가 없다

`Runtime/tools/run-local-generation-experiment.mjs` 가 원인이다.

- 13행이 `prepare` 를 호출해 `run-start-request.json` / `day-1-request.json` 을
  **제자리에서 덮어쓴다**
- 62행은 출력을 `run-start-output-latest.json` / `day-1-output-latest.json` 으로
  쓴다
- 검증이 읽는 정식 파일은 `run-start-output.json` / `day-1-output.json` 이다

`-latest` 를 정식 파일로 올리는 단계가 없다. 실험을 돌릴 때마다 request 만
전진하고 output 은 그 자리에 멈춘다. 짝이 깨지는 것이 정상 동작이 되어 있었다.

**통과한 request/output 쌍만 명시적인 승격 명령으로 정식 파일에 반영해야 한다.**

이건 `AGENTS.md` 의 "검증 로직을 다른 파일에 복제하지 않는다" 와 같은 뿌리다.
이 도구는 스키마도 복제했고 파일 수명주기도 따로 갔다.

## 실패를 모델 탓으로 읽지 말 것

현재 seed 로 output 재생성을 시도했고 두 번 다 탈락했다.

```
qwen3:14b · seed newspaper-grounded-14b-20260806
1차(temp 0.3): sets[0..11].incident:needs-two-member-names        12/12
2차(temp 0.1): 위 + sets[0..11].newspaperLead:copied-summary      12/12
```

**그러나 이것은 모델의 한계가 아니다.** 같은 `qwen3:14b` 가
`codex/api-integration` 의 조합 — 강화된 Runtime 계약 + 제한된 JSON Schema +
실패한 세트/LOT 만 선택적으로 재생성 + 저온도 1회 복구 — 에서는 11/11 통과한다.

차이는 경로다. 위 실험 도구는 전체 blueprint 를 한 번에 재생성하고 선택적
복구가 없으며, 계약도 저장소가 아니라 사용자 홈
(`~/.codex/skills/generate-auction-content/assets/compact-contract.txt`)에서
읽는다. 저장소의 정본은 `Runtime/contracts/compact-generation-contract.txt` 다.

`Runtime/reports/generation-audit.json` 의 기존 실패 코퍼스
(`incident must name at least two set members` 14회/24회)도 이 구형 경로가 남긴
기록이다. **새 진단의 근거로 인용하면 안 된다.**

## 저장소 계약서로 바꾸자 출력이 붕괴했다 (2026-08-07 실측)

실험 도구를 고친 뒤(`51a786e`) 같은 seed 로 다시 돌렸다. 결과가 **더 나빠졌다.**

```
qwen3:14b · seed newspaper-grounded-14b-20260806 · 2회 모두 탈락
attempt 1 (temp 0.3, 25.5초) 실패 세트 12/12
attempt 2 (temp 0.1, 28.7초) 실패 세트 12/12
  incident must name at least two set members   12회
  incident fields must be distinct              12회
```

그런데 실패의 성격이 다르다. 산출물을 열어 보면 **모든 텍스트 필드가 `기본`
한 단어다.** `incidentTitle` 뿐 아니라 `premise`, `marketArc[].headline`,
`marketArc[].mood`, 세트의 `title` · `sharedSecret` · `revealHint` 까지 전부
`기본` 이다. 12개 세트 전부 그렇다. 규칙을 못 지킨 것이 아니라 스키마만 채우고
내용 생성을 포기한 것이다.

직전 실행(사용자 홈의 스킬 계약을 쓰던 때)에는 실제 한국어 문장이 나왔고
`needs-two-member-names` 로 떨어졌다. 계약서 출처를 저장소로 바꾸자 문장 자체가
사라졌다.

**검증기 차이는 아니다.** `setIncidentErrors` 는 `codex/vsl-runtime-core` 와
`codex/api-integration` 이 완전히 동일하다(diff 없음).

남은 변수는 두 가지다.

- `Runtime/contracts/compact-generation-contract.txt` 의 본문. 홈 스킬 계약보다
  길고 조밀한 한 덩어리라 지시가 묻혔을 수 있다
- 선택적 복구의 부재. 이 경로는 여전히 blueprint 전체를 한 번에 만든다

계약서는 `generation-server.js` 와 짝을 이루는 운영 계약이고
`codex/api-integration` 에서 강화 중이다. 런타임 코어에서 임의로 손대면 그
작업과 충돌하므로 건드리지 않았다.

산출물은
`Runtime/reports/local-model-experiment/run-start-output-latest.newspaper-grounded-14b-20260806.attempt-1/2.json`
에 남겼다.

**결론: 런타임 코어의 계약서로는 whole-blueprint 일괄 생성이 붕괴한다.**
fixture 재생성은 강화된 계약과 선택적 복구가 들어온 뒤에 다시 시도한다.
승격 가드(`npm run experiment:promote`)는 그때 그대로 쓰인다.

## 감정 제거가 아직 닿지 않은 곳

`AGENTS.md` 는 감정(appraisal)을 제거된 기능으로 못박았다. 런타임 코드와 VSL
템플릿에서는 정리됐지만 검증·문서 쪽에 남아 있다.

- **`check-auction-content.mjs`** — daily-content 에서 `appraisalCopy.intro` /
  `success` / `warning` 을 여전히 필수로 요구한다(`appraisal:complete`).
  이 파일은 저장소 밖(`team-loop-lite-ai-learning/tools/verification/`)에 있는
  세 번째 검증 사본이다
- **`run-local-generation-experiment.mjs` 34행** — 출력 스키마가 `appraisalCopy`
  를 요구한다
- **`Docs/RUNTIME-PREPARATION-HANDOFF.md`** — "물품별/선택 감정과 판매, 정보
  구매"를 준비된 기능으로 적어두고 있다. `AGENTS.md` 와 정면으로 어긋난다

## Team Loop 쪽에서 바꾼 것 — git 에 안 남는다

합격 기준에서 감정을 뺐다. 감정 기능이 없으니 충족될 수 없는 죽은 조항이었다.

- `tsk_20fdcf0d32ffed1428fa` — `감정·경매·결산 표시 문구가 완성된다`
  → `경매·결산 표시 문구가 완성된다`
- `tsk_0d80c8815ab8a0ea245b` — `Appraisal` 제거. 겸해서 쉼표마다 쪼개져 10개
  항목이 되어 있던 배열을 3개 문장으로 복원했다
  (`"bot"`, `"and relic IDs."`, `"voice"`, `"lore"` 가 각각 독립 합격 기준이었다)

그 밖에 두 작업 사이 승계 링크를 양방향으로 채우고 상태를 `IN_PROGRESS` 로
바꿨다. MCP 에 상태 전이 도구가 없어 `tasks.json` 을 직접 수정했으므로
`TASK_STARTED` 감사 이벤트는 없다. 백업은
`.team-loop/actual-run-data/tasks.json.bak-20260807` 다.

## 다음 방향

1. 기존 정상 output 은 참고 fixture 로 유지한다
2. 현재 seed 의 request 를 기준으로 유지한다
3. **`codex/api-integration` 의 강화된 계약과 선택적 복구 방식을 Runtime
   브랜치에 반영한다** — 나머지의 선행 조건이다
4. 로컬 Ollama 와 Groq 양쪽에 동일 validator 를 적용한다
5. 통과한 request/output 만 명시적인 승격 명령으로 정식 파일에 반영한다

계약·Schema·복구 로직은 저장소 내부에 둔다. 사용자 홈의 스킬 계약을 운영
계약으로 직접 쓰면 다른 PC 나 제출 환경에서 재현되지 않는다. 스킬은 저장소
구현을 호출만 한다.

## 아직 정하지 않은 것

- **`blueprintTimeoutMs` 상향 여부.** 현재 15000ms 인데 기존 기록 94건 중 1건이
  이를 넘는다(최대 19636ms). 중앙값은 2584ms 라 여유로워 보이지만 꼬리가 길다
- **`tsk_0d80c8815ab8a0ea245b` 에 네 번째 합격 기준을 넣을지.**
  `가격·실제가치·보상·배수는 생성 결과에 포함되지 않는다` 가 한국어 작업에는
  있고 영어 작업에는 없다. 쪼개진 배열 어디에도 대응 조각이 없어 임의로 추가하지
  않았다. Runtime 테스트
  (`generation API sends only narrative identifiers…`)가 이미 이 경계를 검사한다

## fixture 가 현재 밸런스와 어긋난다

같은 seed 로 `prepare` 를 다시 돌리면 `day-1-request.json` 이 16줄 바뀐다.
lotId 는 동일하고 **가격만** 다르다(`basePrice 12000→6000`,
`trueValue 16200→8100`). request 가 커밋된 뒤 `balance.json` 기저가가 조정됐다는
뜻이다. 이번 검증 실패와는 무관하지만 별도로 정리해야 한다.

## Team Loop 서버가 둘이다

이 검수 작업은 **실험 서버에만 있다.** 메인에서는 보이지 않는다.

| | 포트 | 데이터 |
|---|---|---|
| 메인 | 4173 | `team-loop-lite-ai-learning/data` |
| 실험 | 4182 | `NAN_2026_Team_Project/.team-loop/actual-run-data` |

실험 서버 기동은 `team-loop-lite-ai-learning` 에서:

```bash
TEAM_LOOP_EXPERIMENT_WORKSPACE="C:\NHN Project\NAN_2026_Team_Project" \
TEAM_LOOP_EXPERIMENT_PORT=4182 \
DATA_DIR="C:\NHN Project\NAN_2026_Team_Project\.team-loop\actual-run-data" \
node tools/experiments/start-workspace-server.mjs
```

계정도 갈려 있다. 실험 서버에는 AuctionAdmin·AuctionReviewer·최재혁 만 있고
`Codex` 계정은 메인에만 있다. 코덱스가 이 검수 작업을 직접 다루려면 실험 서버에
계정과 전용 `TEAM_LOOP_CLI_HOME` 이 필요하다.

에이전트가 서로의 메시지를 못 보면 계정이나 로그인을 의심하기 전에 **양쪽이 같은
서버를 보고 있는지부터 확인한다.**
