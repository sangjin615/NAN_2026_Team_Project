# 미지의 경매장 V5 — 씬별 UI 및 팝업 목록

업로드된 `이미지 (2).zip`의 목업은 **배치와 스타일 참고용**으로 사용하고, V5와 충돌하는 항목은 제거하거나 교체했다.

## 공통 원칙

- 목업은 실제 배경 레이어로 사용하지 않는다.
- 순수 배경이 제공된 씬만 `runtime/backgrounds`에 연결한다.
- 팝업·오버레이·탭·실패 상태는 별도 씬이 아니라 부모 씬의 UI 상태로 관리한다.
- 상단 공통 정보는 `일차 / 자금 / 상회 단계 / 보관칸 또는 대출·마감 상태 / 설정`이다.
- **명성**, **출품 명세**, **점핑 비드**, **자동 예상 가치**, **추천 입찰가**, **손익분기선**은 표시하지 않는다.

### 우선순위

| 등급 | 의미 |
|---|---|
| A | 플레이 가능한 V5에 필수 |
| B | 완성도와 피드백을 위해 필요 |
| C | 기획 미결 또는 선택 사항 |

## 타이틀 (`scene-title`)

- 참고 목업: `assets/reference/scene-mockups/title.png`
- 순수 배경: `assets/runtime/backgrounds/title.png`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 게임 타이틀 로고 | display | 에셋 있음 |
| A | 새 여정 버튼 | button | 구현됨 |
| A | 이어하기 버튼 | button | 구현됨 |
| A | 유물 전시관 버튼 | button | 구현됨 |
| B | 게임 종료 버튼 | button | 구현됨 |
| A | 설정 버튼 | button | 구현됨 |

**연결 팝업·상태**

- `modal-settings` / `modal-confirm`

**목업에서 V5 기준으로 고칠 것**

- 목업 구조를 그대로 사용해도 V5와 충돌하지 않는다.
- 새 여정 버튼이 기존 슬롯을 덮어쓰는 경우 공통 확인 팝업을 사용한다.

## 이어하기 (`scene-continue`)

- 참고 목업: `assets/reference/scene-mockups/continue.png`
- 순수 배경: `assets/runtime/backgrounds/continue.png`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 화면 제목 | display | 에셋 있음 |
| A | 저장 슬롯 3개 | list | 구현됨 |
| A | 선택 슬롯 강조 | state | 부분 구현 |
| A | 이어하기 버튼 | button | 구현됨 |
| A | 저장 삭제 버튼 | button | 구현됨 |
| A | 타이틀 복귀 버튼 | button | 구현됨 |
| B | 설정 버튼 | button | 구현됨 |
| B | 선택 안내 문구 | notice | 구현됨 |

**연결 팝업·상태**

- `modal-confirm` / `modal-settings`

**목업에서 V5 기준으로 고칠 것**

- 저장 슬롯에는 명성 대신 일차·자금·상회 단계·마지막 저장을 표시한다.
- 빈 슬롯은 새 여정 생성 진입점으로 사용할 수 있으나 이어하기 버튼과는 구분한다.

## 여정 생성 (`scene-loading`)

- 참고 목업: `assets/reference/scene-mockups/loading.png`
- 순수 배경: `assets/runtime/backgrounds/loading.png`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 생성 상태 제목 | display | 에셋 있음 |
| A | 진행률 막대와 숫자 | progress | 구현됨 |
| A | 생성 단계 체크 목록 | list | 구현됨 |
| B | 게임 팁 영역 | notice | 부분 구현 |
| A | 폴백 적용 안내 | notice | 부분 구현 |
| B | 다시 시도 버튼 | button | 명세만 있음 |

**연결 팝업·상태**

- `modal-confirm` / `toast-global`

**목업에서 V5 기준으로 고칠 것**

- 생성 모델이 실패해도 고정 엔진과 사전 생성 폴백으로 완주 가능해야 한다.
- 로딩 문구에서 수치 판정을 AI가 한다고 표현하지 않는다.

## 도시 페이즈 (`scene-city`)

- 참고 목업: `assets/reference/scene-mockups/city.png`
- 순수 배경: `없음 — CSS 또는 신규 제작 필요`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 일차·자금·상회 단계·대출/마감 상태 | global-status | 구현됨 |
| A | 의뢰소 거점 버튼 | location-button | 구현됨 |
| A | 술집 거점 버튼 | location-button | 구현됨 |
| A | 경매장 거점 버튼 | location-button | 구현됨 |
| A | 거래소 거점 버튼 | location-button | 구현됨 |
| A | 조합 거점 버튼 | location-button | 구현됨 |
| A | 상회 거점 버튼 | location-button | 구현됨 |
| A | 유물 전시관 거점 버튼 | location-button | 구현됨 |
| A | 거점 잠금·해금·오늘 이용 가능 상태 | state-badge | 구현됨 |
| B | 거점 상태 범례 | legend | 명세만 있음 |
| A | 설정 버튼 | button | 구현됨 |

**연결 팝업·상태**

- `tutorial-first-day` / `modal-settings` / `toast-global`

**목업에서 V5 기준으로 고칠 것**

- 목업의 명성 영역은 삭제한다.
- 상단 남는 영역은 대출 만기 또는 다음 승급 마감 경고로 사용한다.
- 도시 목업은 참고 이미지 전용이며 순수 배경이 없어 런타임 배경으로 사용하지 않는다.

## 의뢰소 (`scene-office`)

- 참고 목업: `assets/reference/scene-mockups/office.png`
- 순수 배경: `없음 — CSS 또는 신규 제작 필요`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 일차·자금·상회 단계 | global-status | 구현됨 |
| A | 의뢰/감정 탭 | tabs | 구현됨 |
| A | 오늘의 의뢰 제시 목록 | list | 구현됨 |
| A | 의뢰 조건·수주비·보상·현재 진행 | detail-panel | 부분 구현 |
| A | 의뢰 수주 버튼 | button | 구현됨 |
| A | 감정 대상 목록 | list | 구현됨 |
| A | 약식/정밀 가격·정밀도·대상 정보 | detail-panel | 구현됨 |
| A | 감정 구매 버튼 | button | 구현됨 |
| A | 도시 복귀 버튼 | button | 구현됨 |

**연결 팝업·상태**

- `popup-appraisal-result` / `toast-global` / `modal-settings`

**목업에서 V5 기준으로 고칠 것**

- 의뢰소 전용 목업이 추가되었다. 순수 배경은 없으므로 참고 이미지로만 사용한다.
- 감정소가 아니라 V5 용어인 의뢰소를 사용한다.
- 의뢰는 납품 목록이 아니라 이번 경매의 규칙 변형으로 설명한다.

## 술집 (`scene-tavern`)

- 참고 목업: `assets/reference/scene-mockups/tavern.png`
- 순수 배경: `assets/runtime/backgrounds/tavern.png`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 일차·자금·상회 단계 | global-status | 구현됨 |
| B | 정보상/NPC 목록 | list | 부분 구현 |
| A | 선택 정보의 범위·가격·구매 상태 | detail-panel | 구현됨 |
| A | 정보 구매 버튼 | button | 구현됨 |
| A | 오늘 확보한 정보 | summary-panel | 구현됨 |
| A | 숙적 베넷 성장 소문 | notice | 부분 구현 |
| A | 도시 복귀 버튼 | button | 구현됨 |

**연결 팝업·상태**

- `popup-information-result` / `toast-global` / `modal-settings`

**목업에서 V5 기준으로 고칠 것**

- 목업의 명성 표시를 삭제한다.
- 출품 명세 채널을 삭제하고 유물 정보 채널로 교체한다.
- NPC 1명당 하루 1회 제한을 적용하지 않는다. 비용과 하루 구매 한도만 사용한다.
- 수요 동향는 사건 방향만 확정하고 진폭은 공개하지 않는다.

## 거래소 (`scene-exchange`)

- 참고 목업: `assets/reference/scene-mockups/exchange.png`
- 순수 배경: `assets/runtime/backgrounds/exchange.png`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 일차·자금·상회 단계 | global-status | 구현됨 |
| A | 즉시 처분/족보 판매/시세판 탭 | tabs | 구현됨 |
| A | 판매 가능 보유품 그리드 | inventory-grid | 구현됨 |
| A | 선택품 취득가·당일 처분가 | detail-panel | 구현됨 |
| A | 즉시 처분 버튼 | button | 구현됨 |
| A | 오늘의 족보 판매 제시 | card-list | 구현됨 |
| A | 진행 중 계약·기한·조건 | list | 구현됨 |
| A | 6계열 과거 시세 그래프 | chart | 부분 구현 |
| B | 구매한 수요 동향 밴드 | chart-overlay | 명세만 있음 |
| A | 12일차 정산 종료 버튼 | button | 구현됨 |
| A | 도시 복귀 버튼 | button | 구현됨 |

**연결 팝업·상태**

- `modal-confirm` / `popup-hanbo-result` / `state-exchange-settlement` / `toast-global`

**목업에서 V5 기준으로 고칠 것**

- 목업의 명성 표시를 삭제한다.
- 등급별 평균 시세 표를 6계열 과거 지수 그래프로 교체한다.
- 현재 적정가·추천가·손익분기선은 표시하지 않는다.
- 세트 예약이 아니라 족보 판매 용어를 사용하고 별도 탭으로 둔다.

## 조합 (`scene-guild`)

- 참고 목업: `assets/reference/scene-mockups/guild.png`
- 순수 배경: `assets/runtime/backgrounds/guild.png`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 일차·자금·상회 단계·대출 만기 | global-status | 구현됨 |
| A | 활성 대출 원금·상환액·만기·담보 | status-panel | 구현됨 |
| A | 담보 가능 보유품 목록 | list | 구현됨 |
| A | 선택 담보와 처분가 | detail-panel | 구현됨 |
| A | 처분가 45%·상환 x1.90·2일 만기 | terms-panel | 구현됨 |
| A | 대출 실행 버튼 | button | 구현됨 |
| A | 대출 상환 버튼 | button | 구현됨 |
| A | 조합 거래 제한 상태 | state | 구현됨 |
| A | 도시 복귀 버튼 | button | 구현됨 |

**연결 팝업·상태**

- `modal-confirm` / `popup-loan-overdue` / `toast-global`

**목업에서 V5 기준으로 고칠 것**

- 채권이라는 용어를 담보 대출로 교체한다.
- 청산가치는 처분가로 교체한다.
- 동시 대출은 1건이며 현재 HTML 기준 담보는 1점을 선택한다.
- 명성 표시를 삭제한다.

## 상회 (`scene-merchant`)

- 참고 목업: `assets/reference/scene-mockups/merchant.png`
- 순수 배경: `assets/runtime/backgrounds/merchant.png`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 일차·자금·상회 단계·마감 | global-status | 구현됨 |
| A | 현재/다음 상회 단계 | display | 구현됨 |
| A | 누적 의뢰 조건·승급비·마감 일차 | requirements | 구현됨 |
| A | 즉시 승급 버튼 | button | 구현됨 |
| A | 정보·거래·보관·연줄 자동 성장 효과 | effect-grid | 구현됨 |
| A | 보유품·담보 잠금·보관칸 | inventory-grid | 구현됨 |
| A | 도시 복귀 버튼 | button | 구현됨 |

**연결 팝업·상태**

- `modal-confirm` / `popup-upgrade-result` / `toast-global`

**목업에서 V5 기준으로 고칠 것**

- 목업의 명성 점수·감정 전문 지식·총자산 조건을 삭제한다.
- 승급 조건은 V5의 누적 의뢰 조건과 승급비로 교체한다.
- 4개 성장 브랜치는 선택형 카드가 아니라 상회 단계에서 자동 파생되는 효과로 표시한다.
- 보관칸은 4/5/6/7을 사용한다.

## 경매 세션 (`scene-auction`)

- 참고 목업: `assets/reference/scene-mockups/auction.png`
- 순수 배경: `assets/runtime/backgrounds/auction.png`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 일차·자금·상회 단계·보관칸 | global-status | 구현됨 |
| A | 현재 출품 순번 1/8 | progress | 구현됨 |
| A | 현재 호가·최소 인상폭 | display | 구현됨 |
| A | 계열·등급·기준가·감정 범위 | item-card | 구현됨 |
| A | 플레이어+경쟁자 3인 상태 | participant-list | 구현됨 |
| A | 공개 호가 기록 | log | 구현됨 |
| B | 구매한 출품 목록 | info-panel | 구현됨 |
| A | 경매 중 의뢰 진행 트래커 | tracker | 명세만 있음 |
| A | 직접 호가 입력 | input | 구현됨 |
| A | 입찰 버튼 | button | 구현됨 |
| A | 물러나기 버튼 | button | 구현됨 |
| A | 보관칸 부족 경고 | notice | 구현됨 |
| C | 출품 제한 시간 | timer | 기획 미결 |

**연결 팝업·상태**

- `popup-lot-result` / `toast-global` / `modal-settings`

**목업에서 V5 기준으로 고칠 것**

- 목업의 명성 표시를 삭제한다.
- 자동 예상 가치 표시는 숨은 값을 자동 평가하므로 삭제한다.
- 점핑 비드는 V5에서 기각됐으므로 삭제한다.
- +100/+500/+1,000/+5,000 버튼은 필수 기능이 아니다. 직접 입력과 최소 인상 검증을 원본으로 둔다.
- PASS 표시는 물러나기로 변경한다.

## 하루 결산 (`scene-summary`)

- 참고 목업: `assets/reference/scene-mockups/summary.png`
- 순수 배경: `assets/runtime/backgrounds/summary.png`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 일차·자금·상회 단계 | global-status | 구현됨 |
| A | 8출품 낙찰/유찰 결과 | result-list | 구현됨 |
| A | 획득 물품 목록 | item-list | 구현됨 |
| A | 입찰·수수료·판매·정보·의뢰·순손익 | ledger | 부분 구현 |
| A | 의뢰 성공·실패·보상 | result-list | 구현됨 |
| A | 6계열 시세 변화 | chart | 부분 구현 |
| A | 다음 승급 마감 경고 | warning | 구현됨 |
| A | 다음 날/12일차 정산 버튼 | button | 구현됨 |

**연결 팝업·상태**

- `modal-settings` / `toast-global`

**목업에서 V5 기준으로 고칠 것**

- 명성 변화 영역을 삭제하고 의뢰 결과와 승급 마감 상태로 교체한다.
- 점핑 비드 사용액을 별도 지출로 표시하지 않는다.
- 계열별 시세는 등급 평균가가 아니라 계열 지수 변화로 표시한다.

## 12일 여정 판정 (`scene-ending`)

- 참고 목업: `assets/reference/scene-mockups/qualification.png`
- 순수 배경: `assets/runtime/backgrounds/ending.png`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 12일 여정 종료 제목 | display | 에셋 있음 |
| A | 최종 상회 단계 | display | 구현됨 |
| A | 정산 후 자금 | display | 구현됨 |
| A | 유물 경매 자격 결과 | result-panel | 구현됨 |
| A | 유물 경매 입장 버튼 | button | 구현됨 |
| A | 여정 결과로 진행 버튼 | button | 구현됨 |

**연결 팝업·상태**

- `modal-confirm` / `toast-global`

**목업에서 V5 기준으로 고칠 것**

- 중상회 엔딩 등 운영 방식별 엔딩을 삭제한다.
- 명성·순자산 엔딩 판정을 삭제한다.
- 상회 4단계 자격과 유물 경매 진입 여부만 판정한다.

## 유물 경매 (`scene-final`)

- 참고 목업: `assets/reference/scene-mockups/final-auction.png`
- 순수 배경: `없음 — CSS 또는 신규 제작 필요`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 일차·자금·상회 단계 | global-status | 구현됨 |
| A | 하급/중급/상급 3라운드 진행 | progress | 구현됨 |
| A | 현재 유물 이름·티어·영구 효과 | relic-card | 구현됨 |
| A | 현재 호가·최소 인상폭 | display | 구현됨 |
| A | 거물 3인 상태 | participant-list | 구현됨 |
| A | 구매한 자금·의중·배분 정보 | info-panel | 구현됨 |
| A | 유물 공개 호가 기록 | log | 구현됨 |
| A | 직접 호가 입력 | input | 구현됨 |
| A | 입찰 버튼 | button | 구현됨 |
| A | 물러나기 버튼 | button | 구현됨 |

**연결 팝업·상태**

- `popup-relic-round-result` / `toast-global` / `modal-settings`

**목업에서 V5 기준으로 고칠 것**

- 목업의 명성 표시를 삭제한다.
- 예상 가치 범위를 자동으로 표시하지 않는다.
- 점핑 비드는 사용하지 않는다.
- 1회 최종 경매 표시를 하급·중급·상급 3라운드 진행 표시로 변경한다.
- 거물 자금은 플레이어 자금과 독립된 절대 데이터다.

## 여정 결과 (`scene-result`)

- 참고 목업: `assets/reference/scene-mockups/result.png`
- 순수 배경: `없음 — CSS 또는 신규 제작 필요`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| A | 성공/마감/파산/빈손 결과 | result-panel | 구현됨 |
| A | 최종 상회 단계 | display | 구현됨 |
| A | 최종 자금·증감 | display | 구현됨 |
| A | 획득 영구 유물 | relic-card | 구현됨 |
| A | 주요 판단 복기 타임라인 | timeline | 부분 구현 |
| A | 실패 원인과 판정 근거 | notice | 구현됨 |
| A | 유물 전시관 버튼 | button | 구현됨 |
| A | 타이틀 복귀 버튼 | button | 구현됨 |
| B | 다음 여정 버튼 | button | 부분 구현 |
| B | 3여정 캠페인 진행 | progress | 명세만 있음 |

**연결 팝업·상태**

- `popup-campaign-complete` / `toast-global`

**목업에서 V5 기준으로 고칠 것**

- 운영 방식별 다중 엔딩 문구를 사용하지 않는다.
- 성공·실패·완전한 결말의 단순 구조를 사용한다.
- 복기 타임라인에는 구매 정보, 과지불, 포기한 출품의 결과를 포함한다.
- 순수 결과 배경이 제공되지 않아 목업은 참고 전용이다.

## 유물 전시관 (`scene-museum`)

- 참고 목업: `assets/reference/scene-mockups/museum.png`
- 순수 배경: `없음 — CSS 또는 신규 제작 필요`

| 우선 | UI | 유형 | 상태 |
|---|---|---|---|
| B | 영구 유물 수·이월 자금·캠페인 상태 | global-status | 부분 구현 |
| A | 유물 9종 전시 그리드 | relic-grid | 구현됨 |
| A | 미획득 유물 잠금 상태 | state | 구현됨 |
| A | 선택 유물 상세 | detail-panel | 부분 구현 |
| A | 영구 효과와 적용 시점 | effect-panel | 부분 구현 |
| A | 타이틀/도시 복귀 버튼 | button | 구현됨 |

**연결 팝업·상태**

- `popup-relic-detail` / `toast-global`

**목업에서 V5 기준으로 고칠 것**

- 명성·상회 단계 헤더가 필요하지 않은 메타 화면에서는 영구 유물 수와 캠페인 상태로 교체한다.
- 순수 배경이 제공되지 않아 목업은 참고 전용이다.

# 팝업·오버레이·씬 상태

| 우선 | ID | 이름 | 유형 | 상태 | 목업 |
|---|---|---|---|---|---|
| A | `modal-settings` | 설정 | global-modal | 부분 구현 | `assets/reference/popup-mockups/settings.png` |
| A | `modal-confirm` | 공통 확인 | global-modal | 구현됨 | `assets/reference/popup-mockups/confirm.png` |
| B | `tutorial-first-day` | 첫 여정 튜토리얼 | overlay | 부분 구현 | `assets/reference/popup-mockups/tutorial.png` |
| A | `popup-lot-result` | 출품 결과 | blocking-popup | 구현됨 | `assets/reference/popup-mockups/lot-result.png` |
| A | `popup-appraisal-result` | 감정 결과 | information-popup | 명세만 있음 | `없음` |
| A | `popup-information-result` | 정보 획득 결과 | information-popup | 명세만 있음 | `없음` |
| B | `popup-hanbo-result` | 족보 판매 완료 | result-popup | 명세만 있음 | `없음` |
| A | `popup-loan-overdue` | 대출 만기·담보 압류 | blocking-popup | 명세만 있음 | `없음` |
| A | `popup-upgrade-result` | 상회 승급 결과 | result-popup | 명세만 있음 | `없음` |
| A | `popup-relic-round-result` | 유물 라운드 결과 | blocking-popup | 명세만 있음 | `없음` |
| A | `popup-relic-detail` | 유물 상세 | detail-popup | 명세만 있음 | `없음` |
| B | `popup-campaign-complete` | 완전한 결말 | ending-popup | 명세만 있음 | `없음` |
| A | `toast-global` | 전역 토스트 | toast | 구현됨 | `없음` |
| A | `state-exchange-settlement` | 12일차 거래소 정산 상태 | scene-state | 구현됨 | `없음` |
| A | `state-result-bankruptcy` | 파산 결과 상태 | scene-state | 구현됨 | `assets/reference/scene-mockups/bankruptcy.png` |

## 팝업별 필수 UI

### 설정 (`modal-settings`)

- 사용 씬: `*`
- 필요 UI: 닫기 / 마스터/BGM/SFX 음량 / 전체 화면/창 모드 / 해상도 / 텍스트 속도 / 기본값 복원 / 적용
- 비고: 현재 HTML의 고대비·글자 크기·QA·튜토리얼 설정과 목업 항목이 다르다. 실제 지원 기능만 노출해야 한다.

### 공통 확인 (`modal-confirm`)

- 사용 씬: `scene-title`, `scene-continue`, `scene-exchange`, `scene-guild`, `scene-merchant`, `scene-ending`
- 필요 UI: 제목 / 경고 아이콘 / 행동 설명 / 비용/결과 요약 / 취소 / 확인
- 비고: 저장 삭제·새 여정 덮어쓰기·고액 판매·대출·승급·유물 경매 입장처럼 되돌리기 어려운 행동에 재사용한다.

### 첫 여정 튜토리얼 (`tutorial-first-day`)

- 사용 씬: `scene-city`
- 필요 UI: 단계 수 / 설명 / 예시 이미지 / 이전 / 다음 / 닫기 / 다시 보지 않기
- 비고: V5 용어와 거점 7종에 맞춰 감정소→의뢰소, 중개인 조합→조합으로 교체한다.

### 출품 결과 (`popup-lot-result`)

- 사용 씬: `scene-auction`
- 필요 UI: 출품 번호 / 출품 카드 / 낙찰/유찰 상태 / 낙찰자 / 낙찰가 / 수수료 / 총 지출 / 다음 출품
- 비고: LOT은 화면에서 출품으로 변경한다. 자동 시간 경과보다 확인 버튼으로 다음 출품 진행이 명확하다.

### 감정 결과 (`popup-appraisal-result`)

- 사용 씬: `scene-office`
- 필요 UI: 대상 출품 / 감정 종류 / 품질 범위 / 감정비 / 확인
- 비고: 실가치·추천 입찰가는 표시하지 않는다.

### 정보 획득 결과 (`popup-information-result`)

- 사용 씬: `scene-tavern`
- 필요 UI: 정보 채널 / 구매 가격 / 획득 내용 / 유효 기간 / 확인

### 족보 판매 완료 (`popup-hanbo-result`)

- 사용 씬: `scene-exchange`
- 필요 UI: 계약명 / 판매한 보유품 / 기본 처분가 / 계약 배수 / 상회 보너스 / 최종 수령액
- 비고: 단순 판매 완료는 토스트로 처리하고, 세트 판매만 결과 팝업으로 강조한다.

### 대출 만기·담보 압류 (`popup-loan-overdue`)

- 사용 씬: `scene-city`, `scene-guild`, `scene-summary`
- 필요 UI: 미상환 금액 / 압류 담보 / 조합 거래 제한 / 확인
- 비고: 다음 날 개시 시 자동 판정하며 닫기 전 원인을 확인하게 한다.

### 상회 승급 결과 (`popup-upgrade-result`)

- 사용 씬: `scene-merchant`
- 필요 UI: 새 상회 단계 / 보관칸 변화 / 새 거점 해금 / 정보/거래/보관/연줄 효과 변화 / 확인
- 비고: 별도 브랜치 선택 화면은 만들지 않는다.

### 유물 라운드 결과 (`popup-relic-round-result`)

- 사용 씬: `scene-final`
- 필요 UI: 유물 티어 / 유물 / 낙찰자 / 낙찰가 / 남은 자금 / 다음 라운드
- 비고: 하급·중급·상급 라운드 사이의 결과와 자금 소모를 명확히 보여준다.

### 유물 상세 (`popup-relic-detail`)

- 사용 씬: `scene-museum`
- 필요 UI: 유물 이름 / 티어 / 이미지 / 영구 효과 / 적용 시점 / 획득 여정 / 닫기
- 비고: 유물의 수치 효과는 고정 템플릿 데이터에서 읽는다.

### 완전한 결말 (`popup-campaign-complete`)

- 사용 씬: `scene-result`
- 필요 UI: 3여정 성공 기록 / 상급 유물 3개 / 완전한 결말 문구 / 전시관 / 타이틀
- 비고: 3여정 모두 상급 유물을 낙찰한 경우에만 표시한다.

### 행동 실패 안내 (`popup-global-failure`)

- 사용 씬: `*`
- 필요 UI: 안내 제목 / 실패 원인 / 확인 버튼
- 비고: 자금 부족·잠금·보관칸 부족·저장 오류처럼 여정을 종료하지 않는 실패에 사용한다. 씬 내부 상시 패널로 배치하지 않는다.

### 전역 토스트 (`toast-global`)

- 사용 씬: `*`
- 필요 UI: 성공/정보 아이콘 / 한 줄 설명 / 자동 닫힘
- 비고: 저장 완료·획득 완료·일반 정보처럼 실패가 아닌 일시 안내에 사용한다.

### 12일차 거래소 정산 상태 (`state-exchange-settlement`)

- 사용 씬: `scene-exchange`
- 필요 UI: 정산 상태 배지 / 당일 낙찰품 판매 가능 표시 / 정산 종료 버튼
- 비고: 팝업이 아니라 거래소 씬의 상태 변형이다.

### 파산 결과 상태 (`state-result-bankruptcy`)

- 사용 씬: `scene-result`
- 필요 UI: 파산 제목 / 최종 일차 / 최종 자금 / 상회 단계 / 대출 상태 / 파산 원인 / 결과 저장 / 타이틀
- 비고: 별도 독립 씬보다 여정 결과 씬의 실패 상태로 관리한다.

## 새로 필요한 아트

### 순수 배경

- 도시 페이즈
- 의뢰소
- 유물 경매
- 유물 전시관
- 여정 결과

### 팝업 목업 또는 독립 UI 프레임

- 감정 결과
- 정보 획득 결과
- 족보 판매 완료
- 대출 만기·담보 압류
- 상회 승급 결과
- 유물 라운드 결과
- 유물 상세
- 완전한 결말

### 기존 목업에서 분리할 공통 UI

- 상단 상태 칩: 일차 / 자금 / 상회 단계 / 보관칸·마감·대출
- 설정 버튼
- 탭 버튼
- 목록 카드와 선택 상태
- 잠금·이용 가능·오늘 경매 가능 배지
- 기본 버튼: 확인 / 취소 / 도시로 / 다음 / 물러나기 / 입찰
- 공통 팝업 프레임
- 행동 실패 전역 팝업
- 성공·정보 토스트
