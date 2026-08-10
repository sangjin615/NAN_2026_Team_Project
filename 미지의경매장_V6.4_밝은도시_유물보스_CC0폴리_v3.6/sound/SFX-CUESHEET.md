# SFX 큐시트

`sound.json` -> `sfx[]` 의 사람이 읽는 판본.
**이 파일은 손으로 고치지 않는다.** `sound.json`을 고치고 `python build-cuesheet.py`로 다시 뽑는다.

총 **110개** 큐 · 강조 18개 · 루프 11개

★ = 강조 큐. −14 LUFS, 덕킹 대상이거나 멜로디가 허용된 예외.


## 공용 UI 팔레트 (22)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-ui-hover` | 호버 | 금빛 테두리에 작은 황동 포인터가 닿는 아주 얕은 소리 | 0.07s | -20dB | 모든 활성 버튼 첫 호버. 120ms 재트리거 방지 |
| `sfx-ui-click` | 기본 클릭 | 두꺼운 목재 버튼이 눌리고 작은 황동 접점이 붙는 소리 | 0.13s | -15dB | `act-open-continue`, `act-check-final-qualification` |
| `sfx-ui-back` | 되돌아가기 | 목재 메뉴 패가 레일을 따라 짧게 뒤로 미끄러짐 | 0.18s | -16dB | `act-exit-game`, `act-return-city`, `act-return-title-from-bankruptcy` 외 1건 |
| `sfx-ui-tab` | 탭 전환 | 목재 서랍 레일이 짧게 미끄러짐 | 0.20s | -13dB | `panel-office-appraisal` 열림, `panel-exchange-market` 열림 |
| `sfx-ui-disabled` | 잠금·불가 | 작은 목재 걸쇠가 잠긴 홈에 둥글게 걸림 | 0.12s | -17dB | 핀이 비활성 상태일 때의 클릭. 보관칸 초과로 입찰 봉쇄된 경우 포함. |
| `sfx-popup-open` | 팝업 열림 | 유리 진열장 뚜껑이 들리며 새는 공기 | 0.40s | -13dB | `act-open-settings`, `act-request-delete-save`, `act-open-first-day` 외 4건 |
| `sfx-popup-close` | 팝업 닫힘 | 유리 뚜껑이 덮이며 나는 낮은 접촉음 | 0.30s | -14dB | `act-close-settings`, `act-close-appraisal-result`, `act-close-information-result` 외 15건 |
| `sfx-modal-confirm` | 확인 | 밀랍 봉인에 도장이 찍힘 | 0.35s | -11dB | `act-apply-settings`, `act-complete-first-day-tutorial`, `tutorial-first-day` 닫힘 |
| `sfx-modal-cancel` | 취소 | 종이 한 장이 접힘 | 0.25s | -14dB | `act-close-confirm`, `act-skip-first-day-tutorial`, `modal-confirm` 닫힘 |
| `sfx-toast` | 안내 토스트 | 작은 황동 종 1회, 짧은 감쇠 | 0.50s | -13dB | `act-show-toast`, `toast-global` 열림 |
| `sfx-failure` | 행동 실패 | 톱니가 걸려 기어가 헛도는 소리 | 0.45s | -11dB | `act-show-failure-popup`, `popup-global-failure` 열림 |
| `sfx-coin-gain` | 자금 획득 | 동전 여러 개가 쏟아짐 | 0.60s | -12dB | player.cash가 증가하는 모든 행동 |
| `sfx-coin-spend` | 자금 지출 | 동전을 밀어 건넴 | 0.40s | -13dB | player.cash가 감소하는 모든 행동 |
| `sfx-scene-in` | 씬 진입 | 큰 목재 문이 열리고 공간의 낮은 공기가 짧게 바뀜 | 0.58s | -15dB | `act-enter-auction`, `act-start-relic-auction` |
| `sfx-save` | 저장 | 장부를 덮고 걸쇠를 잠금 | 0.70s | -12dB | `act-save-game` |
| `sfx-settings-tick` | 설정 조작 | 다이얼 노치 한 칸 | 0.06s | -18dB | 설정 창의 슬라이더·다이얼 조작 중 연속 |
| `sfx-ui-toggle-on` | 토글 켜짐 | 작은 황동 접점이 맞물림 | 0.14s | -14dB | 미정 |
| `sfx-ui-toggle-off` | 토글 꺼짐 | 황동 접점이 풀리며 낮게 돌아옴 | 0.15s | -15dB | 미정 |
| `sfx-ui-focus` | 입력 포커스 | 연필이 장부 위에 놓임 | 0.12s | -17dB | 미정 |
| `sfx-ui-number-step` | 숫자 증감 | 소형 계수기 한 칸 이동 | 0.09s | -16dB | 미정 |
| `sfx-page-turn` | 페이지 넘김 | 두꺼운 장부 한 장 넘김 | 0.34s | -15dB | `act-switch-office-tab`, `act-switch-exchange-tab` |
| `sfx-tooltip-open` | 도움말 펼침 | 작은 종이 탭이 빠져나옴 | 0.18s | -18dB | 미정 |

## 진입·저장 (5)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-title-logo` ★ | 타이틀 로고 | 샹들리에 아래 시계 장치가 세 칸 맞물리고 낮은 황동 종이 울림 | 1.35s | -12dB | scene-title 진입 시 로고 등장 연출 |
| `sfx-new-run` | 새 여정 | 목재 간판 걸쇠가 열리고 따뜻한 황동 3음이 짧게 상승 | 0.82s | -11dB | `act-start-new-run` |
| `sfx-slot-select` | 슬롯 선택 | 카드 인덱스를 손끝으로 톡 침 | 0.20s | -14dB | scene-continue 슬롯 목록에서 슬롯 선택 |
| `sfx-slot-delete` | 슬롯 삭제 | 종이가 찢어짐 | 0.60s | -11dB | `act-delete-save` |
| `sfx-load-complete` | 불러오기 완료 | 장부가 펼쳐지고 걸쇠가 풀림 | 0.90s | -12dB | `act-load-save` |

## 여정 생성 (2)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `amb-loading-gears` | 여정 생성 앰비언스 | 태엽 장치가 도는 루프 | 8.00s loop | -18dB | scene-loading 체류 중 상시 루프 |
| `sfx-loading-done` | 생성 완료 | 태엽이 멎고 종이 한 번 | 1.00s | -11dB | `act-complete-loading` |

## 도시·거점 (10)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-venue-enter` | 거점 진입 | 도시 건물의 둥근 목재 문고리와 짧은 문 열림 | 0.42s | -15dB | `act-enter-office`, `act-enter-tavern`, `act-enter-exchange` 외 3건 |
| `sfx-day-advance` ★ | 날짜 전환 | 태엽을 한 번 감는 소리. 12일 구조의 기본 박자. | 1.60s | -10dB | `act-next-day` |
| `amb-deadline-tick` | 마감 임박 초침 | 초침이 도는 루프. 아주 얕게만 깐다. | 4.00s loop | -24dB | 마감 일차(4·7·10일차) 개시 전날부터 도시 페이즈 상시 루프 |
| `sfx-market-event` | 오늘 시장 사건 | 게시판에 종이가 붙는 소리 | 0.70s | -13dB | scene-city 「오늘 시장 사건」 표시 시 |
| `amb-city-harbor` | 도시 항구 공기 | 먼 항구·바람·수레가 섞인 낮은 도시 루프 | 18.00s loop | -27dB | 미정 |
| `sfx-city-map-open` | 도시 지도 펼침 | 큰 양피지 지도를 테이블에 펼침 | 0.55s | -13dB | 미정 |
| `sfx-city-location-lock` | 잠긴 거점 | 문 손잡이가 잠긴 채 짧게 걸림 | 0.22s | -15dB | 미정 |
| `sfx-market-rise` | 시세 상승 표시 | 시세판 핀이 위 칸으로 이동 | 0.28s | -14dB | scene-city에서 공개된 오늘 시장 사건이 상승일 때 |
| `sfx-market-fall` | 시세 하락 표시 | 시세판 핀이 아래 칸으로 이동 | 0.30s | -14dB | scene-city에서 공개된 오늘 시장 사건이 하락일 때 |
| `sfx-deadline-warning` | 마감 임박 | 낮은 벽시계 종 한 번과 태엽 장력 | 1.00s | -11dB | 공개된 마감 전날 도시 진입 시 1회 |

## 의뢰소 (8)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-quest-accept` | 의뢰 수주 | 도장이 찍히고 종이가 넘어감 | 0.60s | -11dB | 미정 |
| `sfx-appraise-start` | 감정 개시 | 돋보기 렌즈를 유리에 대고 문지름 | 1.00s | -12dB | `act-appraise-lot` |
| `sfx-appraise-reveal` | 감정 결과 | 렌즈를 내려놓고 짧은 숨. 결과의 좋고 나쁨을 소리로 구분하지 않는다. | 0.80s | -12dB | `act-reveal-appraisal`, `popup-appraisal-result` 열림 |
| `amb-office-paper` | 의뢰소 실내 | 종이·깃펜·작은 벽시계의 실내 루프 | 16.00s loop | -29dB | 미정 |
| `sfx-quest-select` | 의뢰 선택 | 의뢰 카드가 목재 레일에 꽂힘 | 0.24s | -14dB | `act-accept-quest` |
| `sfx-quest-success` ★ | 의뢰 성공 | 밀랍 봉인과 작은 황동 체결 | 0.58s | -10dB | 미정 |
| `sfx-quest-fail` | 의뢰 실패 | 봉인이 깨지고 종이가 접힘 | 0.48s | -12dB | 미정 |
| `sfx-appraise-tool` | 감정 도구 교체 | 렌즈와 황동 캘리퍼를 내려놓음 | 0.36s | -15dB | 미정 |

## 술집 (5)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-info-buy` | 정보 구매 | 동전을 건네고 낮게 속삭이는 질감 | 0.80s | -12dB | `act-buy-market-forecast`, `act-buy-competitor-info`, `act-buy-lot-catalog` |
| `sfx-info-reveal` | 정보 펼침 | 접힌 종이를 펼침 | 0.50s | -13dB | `act-open-information-result`, `popup-information-result` 열림 |
| `amb-tavern-hearth` | 술집 화로 | 벽난로·잔·알아들을 수 없는 낮은 웅성거림 | 18.00s loop | -27dB | 미정 |
| `sfx-rumor-select` | 정보상 선택 | 가죽 의자를 당기고 동전 한 닢을 놓음 | 0.42s | -15dB | 미정 |
| `sfx-rumor-card` | 정보 카드 확인 | 접힌 쪽지가 손가락 사이에서 열림 | 0.30s | -16dB | 미정 |

## 거래소 (8)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-sell` | 즉시 처분 | 주판알을 튕기고 동전을 쓸어담음 | 0.90s | -11dB | 미정 |
| `sfx-hanbo-complete` ★ | 족보 성립 | 유리 조각 여러 점이 제자리에 맞물리고 상승하는 3음. 이 게임에서 가장 중요한 효과음. | 1.40s | -8dB | `act-form-hanbo`, `popup-hanbo-result` 열림 |
| `sfx-settlement-open` | 정산 창 | 무거운 장부가 탁자에 놓임 | 1.00s | -11dB | `act-finish-settlement`, `act-open-day12-settlement`, `state-exchange-settlement` 열림 |
| `amb-exchange-floor` | 거래소 장부실 | 펜·주판·저울이 드문드문 들리는 루프 | 18.00s loop | -29dB | 미정 |
| `sfx-exchange-item-select` | 판매품 선택 | 목재 거래 토큰이 칸에 놓임 | 0.16s | -15dB | 미정 |
| `sfx-sale-confirm` | 판매 확정 | 주판 알이 이동하고 동전이 안착 | 0.55s | -10dB | `act-sell-immediate` |
| `sfx-hanbo-piece-fit` | 족보 조각 결합 | 여러 목재·황동 조각 중 하나가 홈에 맞음 | 0.22s | -13dB | 미정 |
| `sfx-market-graph-draw` | 시세선 그리기 | 펜이 그래프 선을 길게 긋고 핀을 꽂음 | 0.70s | -15dB | 미정 |

## 조합 (7)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-loan-take` | 대출 실행 | 금고 문이 열리고 무거운 체인이 풀림 | 1.30s | -10dB | 미정 |
| `sfx-loan-repay` | 대출 상환 | 체인이 걷히고 걸쇠가 열림 | 1.00s | -11dB | `act-repay-loan` |
| `sfx-loan-overdue` ★ | 연체·담보 압류 | 낮은 종 한 번과 자물쇠가 채워지는 소리 | 1.50s | -9dB | `act-process-loan-due`, `popup-loan-overdue` 열림 |
| `amb-guild-vault` | 조합 금고실 | 돌방 공기·체인·멀리서 잠금장치가 움직이는 루프 | 20.00s loop | -30dB | 미정 |
| `sfx-collateral-select` | 담보 선택 | 물건표에 무거운 황동 클립을 채움 | 0.32s | -13dB | 미정 |
| `sfx-loan-seal` ★ | 대출 계약 체결 | 금고 레버·체인·밀랍 봉인이 순서대로 체결 | 1.15s | -8dB | `act-take-loan` |
| `sfx-loan-warning` | 대출 만기 경고 | 낮은 금고 종과 자물쇠 장력 | 0.85s | -11dB | 미정 |

## 상회 (5)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-upgrade` ★ | 상회 승급 | 황동 명판이 벽에 부착되고 상승 아르페지오 | 2.00s | -9dB | `act-upgrade-shop`, `popup-upgrade-result` 열림 |
| `amb-merchant-workshop` | 상회 작업실 | 목재 작업대와 저속 톱니의 루프 | 18.00s loop | -28dB | 미정 |
| `sfx-inventory-pick` | 보유품 집기 | 펠트 위 물건을 들어 올림 | 0.20s | -16dB | 미정 |
| `sfx-capacity-full` | 보관칸 가득 참 | 서랍이 걸려 더 닫히지 않음 | 0.32s | -13dB | 미정 |
| `sfx-upgrade-ready` | 승급 가능 | 세 개의 작은 기어가 차례로 맞물림 | 0.72s | -11dB | 미정 |

## 경매 세션 (14)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-bid-place` | 내 입찰 | 팻말을 들어올리고 목재가 톡 | 0.35s | -10dB | `act-place-bid` |
| `sfx-bid-bot` | 봇 입찰 | 같은 계열이지만 더 둔하고 멀리서 나는 톤 | 0.35s | -14dB | `act-run-bot-turn` |
| `sfx-outbid` | 상회당함 | 짧은 긴장 스팅. 콘트라베이스 반음 상행 2음. | 0.50s | -12dB | act-run-bot-turn 결과로 내가 최고 호가를 잃었을 때 |
| `sfx-pass` | 물러나기 | 의자가 삐걱이고 팻말을 내려놓음 | 0.60s | -13dB | `act-pass-lot` |
| `sfx-gavel` ★ | 낙찰 망치 | 나무 망치 3타. 마지막 타에 실내 잔향. | 1.60s | -7dB | `act-finalize-lot`, `popup-lot-result` 열림 |
| `sfx-lot-next` | 다음 출품 | 덮개천이 걷히고 받침대가 돌아감 | 0.50s | -13dB | `act-next-lot`, `popup-lot-result` 닫힘 |
| `amb-auction-crowd` | 경매장 군중 | 낮게 웅성거리는 실내 군중. 말소리는 알아들을 수 없어야 한다. | 12.00s loop | -22dB | scene-auction 체류 중 상시 루프 |
| `sfx-bid-increment` | 입찰 증액 버튼 | 입찰 계수기 한 칸 증가 | 0.10s | -15dB | 미정 |
| `sfx-bid-direct-input` | 직접 입찰 입력 | 기계식 숫자 다이얼이 빠르게 정렬 | 0.28s | -14dB | 미정 |
| `sfx-auction-countdown` | 경매 마감 초읽기 | 나무 시계의 얕은 초침 1회 | 0.12s | -17dB | 화면에 표시된 경매 타이머 마지막 3초 |
| `sfx-lot-win` ★ | 플레이어 낙찰 | 입찰패가 받침에 놓이고 작은 황동 태그 체결 | 0.75s | -9dB | popup-lot-result가 플레이어 낙찰을 공개한 뒤 |
| `sfx-lot-lose` | 경쟁자 낙찰 | 먼 입찰패와 장부 기입 | 0.55s | -14dB | popup-lot-result가 경쟁자 낙찰 또는 유찰을 공개한 뒤 |
| `sfx-bot-pass` | 경쟁자 패스 | 먼 의자와 입찰패가 조용히 내려감 | 0.45s | -17dB | 미정 |
| `sfx-bid-jump` | 큰 폭의 호가 상승 | 무거운 계수기가 여러 칸 빠르게 이동 | 0.38s | -12dB | 미정 |

## 하루 결산 (7)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-summary-open` | 결산 장부 펼침 | 두꺼운 장부가 펼쳐짐 | 0.90s | -12dB | scene-summary 진입 시 |
| `sfx-ledger-line` | 항목 기입 | 펜이 한 줄을 긋는 짧은 소리. 항목 수만큼 연속 재생. | 0.15s | -16dB | 결산 항목이 한 줄씩 나타날 때마다 |
| `sfx-profit` | 흑자 마감 | 동전이 저울 한쪽으로 기울며 안착 | 1.00s | -11dB | scene-summary 진입 시 오늘 순이익 ≥ 0 |
| `sfx-loss` | 적자 마감 | 저울이 반대로 기울고 낮게 삐걱임 | 1.00s | -11dB | scene-summary 진입 시 오늘 순이익 < 0 |
| `sfx-summary-quest-success` | 결산 의뢰 성공 | 장부 초록 탭과 밀랍 도장 | 0.52s | -11dB | 결산 의뢰 성공 행이 나타날 때 |
| `sfx-summary-quest-fail` | 결산 의뢰 실패 | 장부 붉은 탭과 부러진 봉인 | 0.52s | -12dB | 결산 의뢰 실패 행이 나타날 때 |
| `sfx-deadline-cleared` ★ | 마감 통과 | 큰 기어가 다음 홈에 안전하게 걸림 | 0.82s | -9dB | 결산에서 공개된 승급 마감을 통과했을 때 |

## 유물 경매 (9)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-relic-reveal` ★ | 유물 공개 | 덮개천이 벗겨지고 낮은 울림이 퍼짐 | 1.80s | -8dB | 미정 |
| `sfx-relic-bid` | 유물 입찰 | 일반 입찰보다 무겁고 잔향이 김 | 0.50s | -9dB | `act-place-relic-bid` |
| `sfx-relic-gavel` ★ | 유물 낙찰 망치 | 망치 3타. 홀 잔향이 길게 남는다. | 2.40s | -6dB | `act-finish-relic-auction`, `popup-relic-round-result` 열림 |
| `sfx-relic-acquire` ★ | 유물 획득 | 봉인이 채워지고 워드리스 합창이 낮게 한 번 | 2.60s | -7dB | act-finish-relic-auction 결과가 낙찰일 때 |
| `amb-relic-hall` | 유물 경매 홀 | 큰 홀의 공기와 옷감·의자 움직임 | 20.00s loop | -29dB | 미정 |
| `sfx-relic-round-intro` ★ | 유물 라운드 개시 | 커튼 고리와 낮은 홀 종 | 1.15s | -8dB | `act-next-relic-round` |
| `sfx-tycoon-bid` | 거물 입찰 | 먼 대형 입찰패와 넓은 홀 잔향 | 0.68s | -11dB | `act-run-tycoon-turn` |
| `sfx-relic-pass` | 유물 경매 패스 | 두꺼운 장갑과 무거운 입찰패가 내려감 | 0.62s | -13dB | `act-pass-relic` |
| `sfx-relic-lost` | 유물 낙찰 실패 | 금속 봉인이 다른 쪽에서 닫히는 먼 울림 | 1.00s | -11dB | 유물 라운드 결과가 경쟁자 낙찰로 공개된 뒤 |

## 여정 결과 (4)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-result-success` ★ | 여정 성공 | 태엽이 끝까지 감기고 종이 세 번 | 2.40s | -8dB | scene-result 진입 시 여정 성공 |
| `sfx-result-bankruptcy` ★ | 파산 | 태엽이 풀리다 멈춘다. 마지막에 스프링이 늘어지는 소리. | 2.80s | -7dB | `act-open-result-bankruptcy`, `state-result-bankruptcy` 열림 |
| `sfx-campaign-complete` ★ | 완전한 결말 | 여러 태엽이 동시에 맞물려 돌기 시작함 | 3.20s | -6dB | `act-open-campaign-complete`, `popup-campaign-complete` 열림 |
| `sfx-next-journey` | 다음 여정 | 태엽 열쇠를 다시 꽂아 반 바퀴 감음 | 0.72s | -10dB | `act-start-next-journey` |

## 전시관 (4)

| 큐 ID | 이름 | 소리 | 길이 | 게인 | 트리거 |
|---|---|---|---|---|---|
| `sfx-museum-inspect` | 유물 살펴보기 | 유리 진열장에 손이 닿음 | 0.60s | -14dB | `act-open-relic-detail`, `popup-relic-detail` 열림 |
| `amb-museum-room` | 유물 전시관 공기 | 유리 진열장과 조용한 목재 전시실 | 22.00s loop | -31dB | 미정 |
| `sfx-museum-unlock` ★ | 전시관 해금 | 유리문 잠금과 조명이 차례로 켜짐 | 1.25s | -8dB | `act-open-museum-from-campaign` |
| `sfx-relic-display-set` | 유물 전시 | 펠트 받침에 유물을 놓고 유리문을 닫음 | 0.95s | -11dB | 새 영구 유물이 전시관에 처음 표시될 때 |


## 큐를 만들지 않는 행동 (V6 폐기·보류)

| 행동 | 근거 |
|---|---|

## 행동이 없어 큐만 정의해 둔 것

| 제안 행동 ID | 큐 | 근거 |
|---|---|---|
