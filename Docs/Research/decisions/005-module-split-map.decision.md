# 설계 결정 — 엔진 모듈 분리 지도 (B03~B13 스프린트 실행 계획)

- 상태: 결정 대기 (리뷰 승인 시 확정)
- 배경: 기준선 `public/auction/engine/engine.js`(약 850줄 모놀리스)를 보드 B03~B13이 요구하는 모듈로 분리한다. 이 문서가 있으면 각 태스크는 고민 없이 기계적으로 실행된다.
- 결정자: 최재혁 / 결정일: 2026-07-20

## 1. 함수 → 목표 모듈 매핑

| 현재 engine.js | 목표 모듈 | 보드 태스크 |
|---|---|---|
| VERSIONS, RULES, 게임 상태 형태(createGame, getItem, getSetOf) | `engine/schema.js` | B03 |
| validatePack (구조·사실·밸런스 검증) | `engine/validation.js` | B03 |
| hashString, mulberry32, makeRng, rInt/rPick/rShuffle, randomSeedString | `engine/rng.js` | B04 |
| generateGamePack (팩 생성: 가치·순서·경매장·봇 구성·추정치) | `engine/generator.js` | B04 |
| startAuction, legalMinBid, currentActorId, advanceTurn, removeActive, applyInsufficiencyChecks, actBid, actPass, checkAuctionEnd, finishAuction | `engine/auction.js` | B05 |
| clueGroupOverlap, computeBotPlan, botStep | `engine/bots.js` | B06 |
| (ui.js에서 추출) 타이머 잔여시간·일시정지 순수 계산 | `engine/timer.js` + `ui/pause.js` | B07 |
| peekNextAuction, 유찰 분기·reauctionQueue 처리 | `engine/reauction.js` | B08 |
| computeScores, progressLabel | `engine/scoring.js` | B09 |
| (ui.js에서 추출) 완료 기록 저장 규칙 / 히스토리 렌더 | `engine/history.js` + `ui/history.js` | B10 |
| createGamePack(재시도·폴백), FALLBACK_SEED / 오류 화면 | `engine/fallback.js` + `ui/error.js` | B11 |
| Engine 전역 export 조립 | `engine/engine.js`(얇은 조립 파일로 잔존) | 각 태스크 공통 |

콘텐츠 데이터(CONTENT_PACKS·DOSSIERS·HOUSE_PRESETS)는 이미 `content/packs.js`로 분리 완료(B01R).

## 2. 의존 방향 (역방향 참조 금지)

`rng ← schema ← generator·validation ← fallback` / `auction ← schema·rng` / `bots ← auction·schema` / `reauction ← auction` / `scoring ← schema` / `timer·history`는 독립. UI는 엔진을 참조하되 엔진은 UI를 모른다. 브라우저 로드 순서(build.py): content → rng → schema → validation → generator → fallback → auction → bots → reauction → scoring → timer → engine(조립) → ui.

## 3. 실행 전략 판정

- 문제: B03~B09의 allowedPaths는 각자 새 모듈 파일만 허용하고, 분리에 반드시 필요한 공통 파일(`engine/engine.js` 축소, `build/build.py` 로드 목록)이 빠져 있다. B01과 같은 유형의 경로 설계 누락.
- **전략 A (태스크별 점진 분리)**: 태스크마다 공통 경로를 추가해 재발행. 공통 파일이 겹쳐 스코프 락으로 완전 직렬화되고, 재발행 7회 필요. — 기각.
- **전략 B (일괄 물리 분리 + 태스크별 보강) — 채택**: `[OPS3] 엔진 물리 분리 일괄` 태스크 1건으로 위 매핑대로 파일만 이동(동작 불변, 회귀·스모크로 보증). 이후 B03~B13은 재발행 없이 각 모듈 내부의 규칙 검증·경계 보강·단위 테스트 추가 태스크로 수행한다. 원 태스크의 완료 조건은 그대로 유효하며, 경로도 각 모듈 파일과 일치한다.
- 랜딩 순서: OPS3 → (병렬 가능) B03·B04·B09 → B05 → B06·B07·B08 → B10·B11 → B12·B13.

## 4. 스프린트 묶음 제안

세션 1: OPS3(물리 분리) + B02(UTF-8 빌드 — build.py 정비와 시너지). 세션 2: B03+B04. 세션 3: B05+B06. 세션 4: B07+B08+B09. 세션 5: B10+B11. 세션 6: B12+B13. 각 태스크는 개별 claim→verify→리뷰 요청, 리뷰는 GD_JM이 하루 1~2회 일괄 승인.

## 5. 주의사항

- 모든 분리 커밋 후 `python public/auction/build/build.py` 재실행으로 index.html 갱신, 회귀·스모크 그린 유지.
- Node 호환: 각 모듈은 브라우저 전역+CJS require 겸용 패턴(content/packs.js 방식)을 따른다.
- 재검토 조건: OPS3에서 모듈 간 순환 참조가 발견되면 매핑을 이 문서에서 먼저 수정한다.
