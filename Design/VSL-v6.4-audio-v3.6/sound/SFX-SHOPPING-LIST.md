# SFX 무료 에셋 쇼핑 리스트

`sound.json` + `import-audio.py`의 검색어에서 자동 생성. 손으로 고치지 않는다.

## 쓰는 법

1. 아래 검색어로 사이트에서 찾는다 (라이선스는 `FREE-SOURCES.md` 참조)
2. 받은 파일을 **큐 ID로 이름을 바꿔** 한 폴더에 모은다 — 예: `sfx-gavel.wav`
3. VSL의 **사운드 보관함 → 오디오 폴더 연결** 을 누르면 전부 자동 배정된다

이름 바꾸기가 번거로우면 받은 파일 그대로 두고 `python import-audio.py <폴더>` 를 돌린다.
파일명에 검색어가 남아 있으면 어느 큐인지 제안해 준다.

★ = 강조 큐. 이 12개는 시간을 더 써서 좋은 걸 고를 값어치가 있다.

---

## 공용 UI 팔레트 (22)

> 추천: Kenney UI Audio (CC0) → 없으면 Freesound CC0

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-ui-hover` | 금빛 테두리에 작은 황동 포인터가 닿는 아주 얕은 소리 | 0.07s | `hover` · `dust` · `brush` · `soft` |
| `sfx-ui-click` | 두꺼운 목재 버튼이 눌리고 작은 황동 접점이 붙는 소리 | 0.13s | `click` · `switch` · `toggle` · `brass` |
| `sfx-ui-back` | 목재 메뉴 패가 레일을 따라 짧게 뒤로 미끄러짐 | 0.18s | `knock` · `wood` · `back` · `tap` |
| `sfx-ui-tab` | 목재 서랍 레일이 짧게 미끄러짐 | 0.20s | `drawer` · `slide` · `tab` |
| `sfx-ui-disabled` | 작은 목재 걸쇠가 잠긴 홈에 둥글게 걸림 | 0.12s | `locked` · `denied` · `blocked` · `latch` |
| `sfx-popup-open` | 유리 진열장 뚜껑이 들리며 새는 공기 | 0.40s | `open` · `glass` · `lid` · `cabinet` |
| `sfx-popup-close` | 유리 뚜껑이 덮이며 나는 낮은 접촉음 | 0.30s | `close` · `glass` · `lid` |
| `sfx-modal-confirm` | 밀랍 봉인에 도장이 찍힘 | 0.35s | `stamp` · `seal` · `wax` · `confirm` |
| `sfx-modal-cancel` | 종이 한 장이 접힘 | 0.25s | `paper` · `fold` · `cancel` |
| `sfx-toast` | 작은 황동 종 1회, 짧은 감쇠 | 0.50s | `bell` · `ding` · `chime` · `small` |
| `sfx-failure` | 톱니가 걸려 기어가 헛도는 소리 | 0.45s | `error` · `gear` · `grind` · `fail` · `clunk` |
| `sfx-coin-gain` | 동전 여러 개가 쏟아짐 | 0.60s | `coin` · `gold` · `spill` · `money` |
| `sfx-coin-spend` | 동전을 밀어 건넴 | 0.40s | `coin` · `pay` · `slide` |
| `sfx-scene-in` | 큰 목재 문이 열리고 공간의 낮은 공기가 짧게 바뀜 | 0.58s | `door` · `open` · `room` · `whoosh` |
| `sfx-save` | 장부를 덮고 걸쇠를 잠금 | 0.70s | `book` · `close` · `clasp` · `latch` |
| `sfx-settings-tick` | 다이얼 노치 한 칸 | 0.06s | `dial` · `notch` · `tick` · `detent` |
| `sfx-ui-toggle-on` | 작은 황동 접점이 맞물림 | 0.14s | `ui` · `toggle` · `on` |
| `sfx-ui-toggle-off` | 황동 접점이 풀리며 낮게 돌아옴 | 0.15s | `ui` · `toggle` · `off` |
| `sfx-ui-focus` | 연필이 장부 위에 놓임 | 0.12s | `ui` · `focus` |
| `sfx-ui-number-step` | 소형 계수기 한 칸 이동 | 0.09s | `ui` · `number` · `step` |
| `sfx-page-turn` | 두꺼운 장부 한 장 넘김 | 0.34s | `page` · `turn` |
| `sfx-tooltip-open` | 작은 종이 탭이 빠져나옴 | 0.18s | `tooltip` · `open` |

## 진입·저장 (5)

> 추천: Sonniss GDC · Freesound CC0

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-title-logo` ★ | 샹들리에 아래 시계 장치가 세 칸 맞물리고 낮은 황동 종이 울림 | 1.35s | `wind` · `clockwork` · `spring` · `bell` |
| `sfx-new-run` | 목재 간판 걸쇠가 열리고 따뜻한 황동 3음이 짧게 상승 | 0.82s | `match` · `strike` · `lamp` · `ignite` · `fire` |
| `sfx-slot-select` | 카드 인덱스를 손끝으로 톡 침 | 0.20s | `card` · `tap` · `select` |
| `sfx-slot-delete` | 종이가 찢어짐 | 0.60s | `paper` · `tear` · `rip` |
| `sfx-load-complete` | 장부가 펼쳐지고 걸쇠가 풀림 | 0.90s | `book` · `open` · `unlock` |

## 여정 생성 (2)

> 추천: Freesound CC0 (loop 태그)

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `amb-loading-gears` | 태엽 장치가 도는 루프 | 8.00s loop | `clockwork` · `gears` · `machine` · `loop` |
| `sfx-loading-done` | 태엽이 멎고 종이 한 번 | 1.00s | `stop` · `bell` · `complete` |

## 도시·거점 (10)

> 추천: Sonniss GDC · Freesound CC0

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-venue-enter` | 도시 건물의 둥근 목재 문고리와 짧은 문 열림 | 0.42s | `door` · `creak` · `shop` · `open` |
| `sfx-day-advance` ★ | 태엽을 한 번 감는 소리. 12일 구조의 기본 박자. | 1.60s | `wind` · `clock` · `key` · `ratchet` · `spring` |
| `amb-deadline-tick` | 초침이 도는 루프. 아주 얕게만 깐다. | 4.00s loop | `clock` · `tick` · `second` · `loop` |
| `sfx-market-event` | 게시판에 종이가 붙는 소리 | 0.70s | `paper` · `pin` · `board` · `notice` |
| `amb-city-harbor` | 먼 항구·바람·수레가 섞인 낮은 도시 루프 | 18.00s loop | `city` · `harbor` |
| `sfx-city-map-open` | 큰 양피지 지도를 테이블에 펼침 | 0.55s | `city` · `map` · `open` |
| `sfx-city-location-lock` | 문 손잡이가 잠긴 채 짧게 걸림 | 0.22s | `city` · `location` · `lock` |
| `sfx-market-rise` | 시세판 핀이 위 칸으로 이동 | 0.28s | `market` · `rise` |
| `sfx-market-fall` | 시세판 핀이 아래 칸으로 이동 | 0.30s | `market` · `fall` |
| `sfx-deadline-warning` | 낮은 벽시계 종 한 번과 태엽 장력 | 1.00s | `deadline` · `warning` |

## 의뢰소 (8)

> 추천: Freesound CC0

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-quest-accept` | 도장이 찍히고 종이가 넘어감 | 0.60s | `stamp` · `paper` · `page` |
| `sfx-appraise-start` | 돋보기 렌즈를 유리에 대고 문지름 | 1.00s | `glass` · `rub` · `lens` · `magnify` |
| `sfx-appraise-reveal` | 렌즈를 내려놓고 짧은 숨. 결과의 좋고 나쁨을 소리로 구분하지 않는다. | 0.80s | `set` · `down` · `desk` · `wood` |
| `amb-office-paper` | 종이·깃펜·작은 벽시계의 실내 루프 | 16.00s loop | `office` · `paper` |
| `sfx-quest-select` | 의뢰 카드가 목재 레일에 꽂힘 | 0.24s | `quest` · `select` |
| `sfx-quest-success` ★ | 밀랍 봉인과 작은 황동 체결 | 0.58s | `quest` · `success` |
| `sfx-quest-fail` | 봉인이 깨지고 종이가 접힘 | 0.48s | `quest` · `fail` |
| `sfx-appraise-tool` | 렌즈와 황동 캘리퍼를 내려놓음 | 0.36s | `appraise` · `tool` |

## 술집 (5)

> 추천: Freesound CC0

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-info-buy` | 동전을 건네고 낮게 속삭이는 질감 | 0.80s | `coin` · `whisper` · `table` |
| `sfx-info-reveal` | 접힌 종이를 펼침 | 0.50s | `paper` · `unfold` · `open` |
| `amb-tavern-hearth` | 벽난로·잔·알아들을 수 없는 낮은 웅성거림 | 18.00s loop | `tavern` · `hearth` |
| `sfx-rumor-select` | 가죽 의자를 당기고 동전 한 닢을 놓음 | 0.42s | `rumor` · `select` |
| `sfx-rumor-card` | 접힌 쪽지가 손가락 사이에서 열림 | 0.30s | `rumor` · `card` |

## 거래소 (8)

> 추천: Freesound CC0 · Kenney (chime)

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-sell` | 주판알을 튕기고 동전을 쓸어담음 | 0.90s | `abacus` · `coin` · `sweep` · `cash` |
| `sfx-hanbo-complete` ★ | 유리 조각 여러 점이 제자리에 맞물리고 상승하는 3음. 이 게임에서 가장 중요한 효과음. | 1.40s | `chime` · `success` · `complete` · `lock` · `glass` |
| `sfx-settlement-open` | 무거운 장부가 탁자에 놓임 | 1.00s | `book` · `heavy` · `table` · `thud` |
| `amb-exchange-floor` | 펜·주판·저울이 드문드문 들리는 루프 | 18.00s loop | `exchange` · `floor` |
| `sfx-exchange-item-select` | 목재 거래 토큰이 칸에 놓임 | 0.16s | `exchange` · `item` · `select` |
| `sfx-sale-confirm` | 주판 알이 이동하고 동전이 안착 | 0.55s | `sale` · `confirm` |
| `sfx-hanbo-piece-fit` | 여러 목재·황동 조각 중 하나가 홈에 맞음 | 0.22s | `hanbo` · `piece` · `fit` |
| `sfx-market-graph-draw` | 펜이 그래프 선을 길게 긋고 핀을 꽂음 | 0.70s | `market` · `graph` · `draw` |

## 조합 (7)

> 추천: Sonniss GDC (metal/vault)

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-loan-take` | 금고 문이 열리고 무거운 체인이 풀림 | 1.30s | `safe` · `vault` · `chain` · `metal` |
| `sfx-loan-repay` | 체인이 걷히고 걸쇠가 열림 | 1.00s | `chain` · `unlock` · `latch` |
| `sfx-loan-overdue` ★ | 낮은 종 한 번과 자물쇠가 채워지는 소리 | 1.50s | `bell` · `low` · `padlock` · `lock` |
| `amb-guild-vault` | 돌방 공기·체인·멀리서 잠금장치가 움직이는 루프 | 20.00s loop | `guild` · `vault` |
| `sfx-collateral-select` | 물건표에 무거운 황동 클립을 채움 | 0.32s | `collateral` · `select` |
| `sfx-loan-seal` ★ | 금고 레버·체인·밀랍 봉인이 순서대로 체결 | 1.15s | `loan` · `seal` |
| `sfx-loan-warning` | 낮은 금고 종과 자물쇠 장력 | 0.85s | `loan` · `warning` |

## 상회 (5)

> 추천: Kenney (chime) · Freesound CC0

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-upgrade` ★ | 황동 명판이 벽에 부착되고 상승 아르페지오 | 2.00s | `upgrade` · `chime` · `rise` · `plate` · `metal` |
| `amb-merchant-workshop` | 목재 작업대와 저속 톱니의 루프 | 18.00s loop | `merchant` · `workshop` |
| `sfx-inventory-pick` | 펠트 위 물건을 들어 올림 | 0.20s | `inventory` · `pick` |
| `sfx-capacity-full` | 서랍이 걸려 더 닫히지 않음 | 0.32s | `capacity` · `full` |
| `sfx-upgrade-ready` | 세 개의 작은 기어가 차례로 맞물림 | 0.72s | `upgrade` · `ready` |

## 경매 세션 (14)

> 추천: Sonniss GDC · Freesound CC0

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-bid-place` | 팻말을 들어올리고 목재가 톡 | 0.35s | `wood` · `tap` · `paddle` · `knock` |
| `sfx-bid-bot` | 같은 계열이지만 더 둔하고 멀리서 나는 톤 | 0.35s | `wood` · `tap` · `distant` · `muffled` |
| `sfx-outbid` | 짧은 긴장 스팅. 콘트라베이스 반음 상행 2음. | 0.50s | `tense` · `bass` · `sting` · `low` |
| `sfx-pass` | 의자가 삐걱이고 팻말을 내려놓음 | 0.60s | `chair` · `creak` · `sigh` · `wood` |
| `sfx-gavel` ★ | 나무 망치 3타. 마지막 타에 실내 잔향. | 1.60s | `gavel` · `hammer` · `auction` · `judge` · `wood` |
| `sfx-lot-next` | 덮개천이 걷히고 받침대가 돌아감 | 0.50s | `cloth` · `reveal` · `turn` · `fabric` |
| `amb-auction-crowd` | 낮게 웅성거리는 실내 군중. 말소리는 알아들을 수 없어야 한다. | 12.00s loop | `crowd` · `murmur` · `ambience` · `room` · `loop` |
| `sfx-bid-increment` | 입찰 계수기 한 칸 증가 | 0.10s | `bid` · `increment` |
| `sfx-bid-direct-input` | 기계식 숫자 다이얼이 빠르게 정렬 | 0.28s | `bid` · `direct` · `input` |
| `sfx-auction-countdown` | 나무 시계의 얕은 초침 1회 | 0.12s | `auction` · `countdown` |
| `sfx-lot-win` ★ | 입찰패가 받침에 놓이고 작은 황동 태그 체결 | 0.75s | `lot` · `win` |
| `sfx-lot-lose` | 먼 입찰패와 장부 기입 | 0.55s | `lot` · `lose` |
| `sfx-bot-pass` | 먼 의자와 입찰패가 조용히 내려감 | 0.45s | `bot` · `pass` |
| `sfx-bid-jump` | 무거운 계수기가 여러 칸 빠르게 이동 | 0.38s | `bid` · `jump` |

## 하루 결산 (7)

> 추천: Freesound CC0

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-summary-open` | 두꺼운 장부가 펼쳐짐 | 0.90s | `book` · `open` · `page` |
| `sfx-ledger-line` | 펜이 한 줄을 긋는 짧은 소리. 항목 수만큼 연속 재생. | 0.15s | `pen` · `write` · `scratch` · `short` |
| `sfx-profit` | 동전이 저울 한쪽으로 기울며 안착 | 1.00s | `scale` · `coin` · `positive` · `ring` |
| `sfx-loss` | 저울이 반대로 기울고 낮게 삐걱임 | 1.00s | `creak` · `negative` · `low` · `scale` |
| `sfx-summary-quest-success` | 장부 초록 탭과 밀랍 도장 | 0.52s | `summary` · `quest` · `success` |
| `sfx-summary-quest-fail` | 장부 붉은 탭과 부러진 봉인 | 0.52s | `summary` · `quest` · `fail` |
| `sfx-deadline-cleared` ★ | 큰 기어가 다음 홈에 안전하게 걸림 | 0.82s | `deadline` · `cleared` |

## 유물 경매 (9)

> 추천: Sonniss GDC · Pixabay (orchestral hit)

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-relic-reveal` ★ | 덮개천이 벗겨지고 낮은 울림이 퍼짐 | 1.80s | `cloth` · `reveal` · `hum` · `deep` · `resonant` |
| `sfx-relic-bid` | 일반 입찰보다 무겁고 잔향이 김 | 0.50s | `wood` · `hall` · `reverb` · `heavy` |
| `sfx-relic-gavel` ★ | 망치 3타. 홀 잔향이 길게 남는다. | 2.40s | `gavel` · `hall` · `reverb` · `hammer` · `big` |
| `sfx-relic-acquire` ★ | 봉인이 채워지고 워드리스 합창이 낮게 한 번 | 2.60s | `choir` · `seal` · `epic` · `swell` |
| `amb-relic-hall` | 큰 홀의 공기와 옷감·의자 움직임 | 20.00s loop | `relic` · `hall` |
| `sfx-relic-round-intro` ★ | 커튼 고리와 낮은 홀 종 | 1.15s | `relic` · `round` · `intro` |
| `sfx-tycoon-bid` | 먼 대형 입찰패와 넓은 홀 잔향 | 0.68s | `tycoon` · `bid` |
| `sfx-relic-pass` | 두꺼운 장갑과 무거운 입찰패가 내려감 | 0.62s | `relic` · `pass` |
| `sfx-relic-lost` | 금속 봉인이 다른 쪽에서 닫히는 먼 울림 | 1.00s | `relic` · `lost` |

## 여정 결과 (4)

> 추천: Sonniss GDC · Pixabay

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-result-success` ★ | 태엽이 끝까지 감기고 종이 세 번 | 2.40s | `bell` · `success` · `fanfare` · `wind` |
| `sfx-result-bankruptcy` ★ | 태엽이 풀리다 멈춘다. 마지막에 스프링이 늘어지는 소리. | 2.80s | `unwind` · `spring` · `slow` · `stop` · `fail` |
| `sfx-campaign-complete` ★ | 여러 태엽이 동시에 맞물려 돌기 시작함 | 3.20s | `gears` · `engage` · `epic` · `clockwork` |
| `sfx-next-journey` | 태엽 열쇠를 다시 꽂아 반 바퀴 감음 | 0.72s | `next` · `journey` |

## 전시관 (4)

> 추천: Freesound CC0

| 큐 ID | 원하는 소리 | 길이 | 검색어 |
|---|---|---|---|
| `sfx-museum-inspect` | 유리 진열장에 손이 닿음 | 0.60s | `glass` · `touch` · `case` |
| `amb-museum-room` | 유리 진열장과 조용한 목재 전시실 | 22.00s loop | `museum` · `room` |
| `sfx-museum-unlock` ★ | 유리문 잠금과 조명이 차례로 켜짐 | 1.25s | `museum` · `unlock` |
| `sfx-relic-display-set` | 펠트 받침에 유물을 놓고 유리문을 닫음 | 0.95s | `relic` · `display` · `set` |

---

## 배경음악 21곡

| 슬롯 | 성격 | 검색어 |
|---|---|---|
| `bgm-01-title__loop` | 따뜻한 항구 상회의 첫인상. 밝고 품위 있지만 영웅적이지 않은 상인 모험의 주제 | Art-led music for a warm illustrated European port merchant game. 따뜻한 항구 상회의 첫인상. 밝고 품위 있지만 영웅적이지 않은 상인 모험의 주제 |
| `bgm-02-city__loop` | 푸른 하늘과 붉은 지붕이 보이는 항구 도시. 일과 이동을 가볍게 밀어 주는 저밀 | Art-led music for a warm illustrated European port merchant game. 푸른 하늘과 붉은 지붕이 보이는 항구 도시. 일과 이동을 가볍게 밀어 주는 저밀 |
| `bgm-03-auction__L1` · `bgm-03-auction__L2` · `bgm-03-auction__L3` | 일반 경매의 절제된 살롱 누아르. 베이스가 주도하고 관악은 짧게만 개입한다. | Art-led music for a warm illustrated European port merchant game. 일반 경매의 절제된 살롱 누아르. 베이스가 주도하고 관악은 짧게만 개입한다. T |
| `bgm-04-relic__L1` · `bgm-04-relic__L2` · `bgm-04-relic__L3` | 금빛 특별 경매의 격식과 긴장. 일반 경매 재즈의 어휘를 귀족적 챔버 왈츠로 확 | Art-led music for a warm illustrated European port merchant game. 금빛 특별 경매의 격식과 긴장. 일반 경매 재즈의 어휘를 귀족적 챔버 왈츠로 확 |
| `bgm-05-settlement__L1` · `bgm-05-settlement__L2` | 하루의 성패를 차분히 복기하는 장부 음악. 축하보다 정리와 다음 선택에 집중한다 | Art-led music for a warm illustrated European port merchant game. 하루의 성패를 차분히 복기하는 장부 음악. 축하보다 정리와 다음 선택에 집중한다 |
| `bgm-06-archive__loop` | 저장된 여정을 다시 펼치는 따뜻한 기억. 향수는 있으나 쓸쓸하지 않다. | Art-led music for a warm illustrated European port merchant game. 저장된 여정을 다시 펼치는 따뜻한 기억. 향수는 있으나 쓸쓸하지 않다. Temp |
| `bgm-07-loading-workshop__loop` | 지도와 상점이 차례로 배치되는 짧은 작업곡. 무거운 공장 대신 정돈된 수공업의  | Art-led music for a warm illustrated European port merchant game. 지도와 상점이 차례로 배치되는 짧은 작업곡. 무거운 공장 대신 정돈된 수공업의  |
| `bgm-08-city-growth__loop` | 성장한 상회의 활기. 타이틀 모티프를 더 풍성하게 변주하되 멜로디 밀도는 낮게  | Art-led music for a warm illustrated European port merchant game. 성장한 상회의 활기. 타이틀 모티프를 더 풍성하게 변주하되 멜로디 밀도는 낮게  |
| `bgm-09-city-deadline__loop` | 마감이 가까운 도시. 희망을 잃지 않은 채 시계의 압박만 조용히 더한다. | Art-led music for a warm illustrated European port merchant game. 마감이 가까운 도시. 희망을 잃지 않은 채 시계의 압박만 조용히 더한다. Tem |
| `bgm-10-office-appraisal__loop` | 밝고 정갈한 의뢰소. 학구적이고 친절하며 미스터리보다 관찰과 판단을 강조한다. | Art-led music for a warm illustrated European port merchant game. 밝고 정갈한 의뢰소. 학구적이고 친절하며 미스터리보다 관찰과 판단을 강조한다.  |
| `bgm-11-tavern-whispers__loop` | 술집의 정보 거래. 경매 재즈와 겹치지 않는 저밀도 포크 누아르로 은밀함을 만든 | Art-led music for a warm illustrated European port merchant game. 술집의 정보 거래. 경매 재즈와 겹치지 않는 저밀도 포크 누아르로 은밀함을 만든 |
| `bgm-12-exchange-ledger__loop` | 거래소의 빠르고 명료한 상업 리듬. 카지노처럼 반짝이지 않고 일하는 손의 속도를 | Art-led music for a warm illustrated European port merchant game. 거래소의 빠르고 명료한 상업 리듬. 카지노처럼 반짝이지 않고 일하는 손의 속도를 |
| `bgm-13-guild-vault__loop` | 중개인 조합의 계약과 담보. 위협적 악당 음악이 아니라 무게 있고 정중한 실내악 | Art-led music for a warm illustrated European port merchant game. 중개인 조합의 계약과 담보. 위협적 악당 음악이 아니라 무게 있고 정중한 실내악 |
| `bgm-14-merchant-workshop__loop` | 진열장과 설비가 확장되는 만족감. 작업실의 규칙성과 성장의 온기를 함께 담는다. | Art-led music for a warm illustrated European port merchant game. 진열장과 설비가 확장되는 만족감. 작업실의 규칙성과 성장의 온기를 함께 담는다. |
| `bgm-15-auction-noir__L1` · `bgm-15-auction-noir__L2` · `bgm-15-auction-noir__L3` | 중반 경매. 베이스 보행을 조금 늘리고 색소폰은 드문 문장 끝에만 낮게 대답한다 | Art-led music for a warm illustrated European port merchant game. 중반 경매. 베이스 보행을 조금 늘리고 색소폰은 드문 문장 끝에만 낮게 대답한다 |
| `bgm-16-auction-pressure__L1` · `bgm-16-auction-pressure__L2` · `bgm-16-auction-pressure__L3` | 후반 경매. 같은 살롱 재즈의 밀도를 유지하면서 호가 압박과 마감감만 높인다. | Art-led music for a warm illustrated European port merchant game. 후반 경매. 같은 살롱 재즈의 밀도를 유지하면서 호가 압박과 마감감만 높인다.  |
| `bgm-17-settlement-loss__L1` · `bgm-17-settlement-loss__L2` | 적자 결산. 실패를 조롱하지 않고 숫자를 다시 살피게 하는 절제된 변주. | Art-led music for a warm illustrated European port merchant game. 적자 결산. 실패를 조롱하지 않고 숫자를 다시 살피게 하는 절제된 변주. Tem |
| `bgm-18-ending-verdict__loop` | 엔딩 판정 직전의 정적과 기대. 결과를 미리 말하지 않는 열린 화성. | Art-led music for a warm illustrated European port merchant game. 엔딩 판정 직전의 정적과 기대. 결과를 미리 말하지 않는 열린 화성. Tempo |
| `bgm-19-result-success__loop` | 성공 결과. 타이틀 주제를 따뜻하게 회수하되 승리 팡파르로 과장하지 않는다. | Art-led music for a warm illustrated European port merchant game. 성공 결과. 타이틀 주제를 따뜻하게 회수하되 승리 팡파르로 과장하지 않는다. T |
| `bgm-20-result-bankruptcy__loop` | 파산 결과. 공포나 희극 없이 존엄한 마침표와 다시 시작할 여백을 남긴다. | Art-led music for a warm illustrated European port merchant game. 파산 결과. 공포나 희극 없이 존엄한 마침표와 다시 시작할 여백을 남긴다. Te |
| `bgm-21-museum-memory__loop` | 유물 전시관. 획득한 물건이 모험의 기억으로 남는 맑고 조용한 실내악. | Art-led music for a warm illustrated European port merchant game. 유물 전시관. 획득한 물건이 모험의 기억으로 남는 맑고 조용한 실내악. Temp |

**레이어 곡 주의** — 무료 음원으로는 스템을 구할 수 없다. `FREE-SOURCES.md`의 「스템 없이 레이어 구현하기」를 먼저 읽을 것.

