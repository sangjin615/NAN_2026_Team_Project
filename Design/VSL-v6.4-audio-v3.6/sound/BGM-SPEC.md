# 확장형 BGM 프로그램

`sound.json`의 사람이 읽는 판본입니다. 이 파일은 직접 고치지 않고 `sound.json`과 이 생성기를 수정합니다.

## 핵심 원칙

- 경매의 저밀도 재즈만 유지하고, 나머지는 값의 간극·자금 배분·12일 마감·영구 유물을 표현하는 장부 실내악으로 통일한다. 숨은 값은 절대 음악으로 누설하지 않는다.
- 선택 입력: scene · 공개된 일차 · 공개된 현재 호가/시작가 비율 · 공개된 LOT 순서 · 공개된 유물 라운드 · 이미 공개된 결산 결과
- 금지 입력: 숨은 품질 · 경쟁자 상한 · 미공개 유물 가치 · 미공개 시세 결과
- 연속성: 타이틀의 4음 장부 모티프를 도시·결산·결과·전시관에서 변형한다. 같은 씬의 변주는 진입 시 고정하며 입찰 도중에는 곡을 교체하지 않고 레이어만 페이드한다.

## 씬별 선택

| 씬 | 기본 곡 | 공개 상태 변주 |
|---|---|---|
| `scene-title` | `bgm-01-title` | — |
| `scene-continue` | `bgm-06-archive` | — |
| `scene-loading` | `bgm-07-loading-workshop` | — |
| `scene-city` | `bgm-02-city` | `bgm-02-city` ← {"dayMax": 3}<br>`bgm-08-city-growth` ← {"dayMin": 4, "dayMax": 8}<br>`bgm-09-city-deadline` ← {"dayMin": 9} |
| `scene-office` | `bgm-10-office-appraisal` | — |
| `scene-tavern` | `bgm-11-tavern-whispers` | — |
| `scene-exchange` | `bgm-12-exchange-ledger` | — |
| `scene-guild` | `bgm-13-guild-vault` | — |
| `scene-merchant` | `bgm-14-merchant-workshop` | — |
| `scene-auction` | `bgm-03-auction` | `bgm-03-auction` ← {"dayMax": 4}<br>`bgm-15-auction-noir` ← {"dayMin": 5, "dayMax": 8}<br>`bgm-16-auction-pressure` ← {"dayMin": 9} |
| `scene-summary` | `bgm-05-settlement` | `bgm-17-settlement-loss` ← {"net": "negative"} |
| `scene-ending` | `bgm-18-ending-verdict` | — |
| `scene-final` | `bgm-04-relic` | — |
| `scene-result` | `bgm-19-result-success` | `bgm-20-result-bankruptcy` ← {"endingNot": "relic"} |
| `scene-museum` | `bgm-21-museum-memory` | — |

## 전체 곡

총 **21곡**, 납품 슬롯 **33개**.

| ID | 곡명 | BPM/조성 | 역할 | 슬롯 |
|---|---|---|---|---|
| `bgm-01-title` | 황금빛 창문 너머 | 84 / F major | 따뜻한 항구 상회의 첫인상. 밝고 품위 있지만 영웅적이지 않은 상인 모험의 주제. | `bgm-01-title__intro` · `bgm-01-title__loop` |
| `bgm-02-city` | 첫 장사의 아침 | 92 / F major | 푸른 하늘과 붉은 지붕이 보이는 항구 도시. 일과 이동을 가볍게 밀어 주는 저밀도 실내악. | `bgm-02-city__loop` |
| `bgm-03-auction` | 첫 번째 호가 | 74 / D dorian | 일반 경매의 절제된 살롱 누아르. 베이스가 주도하고 관악은 짧게만 개입한다. | `bgm-03-auction__L1` · `bgm-03-auction__L2` · `bgm-03-auction__L3` |
| `bgm-04-relic` | 금빛 홀의 마지막 호가 | 72 / D minor to F major | 금빛 특별 경매의 격식과 긴장. 일반 경매 재즈의 어휘를 귀족적 챔버 왈츠로 확장한다. | `bgm-04-relic__intro` · `bgm-04-relic__L1` · `bgm-04-relic__L2` · `bgm-04-relic__L3` |
| `bgm-05-settlement` | 장부에 남은 하루 | 68 / D minor with F major | 하루의 성패를 차분히 복기하는 장부 음악. 축하보다 정리와 다음 선택에 집중한다. | `bgm-05-settlement__L1` · `bgm-05-settlement__L2` |
| `bgm-06-archive` | 접어 둔 항구 지도 | 64 / Bb major | 저장된 여정을 다시 펼치는 따뜻한 기억. 향수는 있으나 쓸쓸하지 않다. | `bgm-06-archive__loop` |
| `bgm-07-loading-workshop` | 도시가 준비되는 동안 | 96 / F major | 지도와 상점이 차례로 배치되는 짧은 작업곡. 무거운 공장 대신 정돈된 수공업의 리듬. | `bgm-07-loading-workshop__loop` |
| `bgm-08-city-growth` | 분주해진 상회의 거리 | 102 / Bb major | 성장한 상회의 활기. 타이틀 모티프를 더 풍성하게 변주하되 멜로디 밀도는 낮게 유지한다. | `bgm-08-city-growth__loop` |
| `bgm-09-city-deadline` | 마감 전의 항구 | 96 / G minor with Bb major | 마감이 가까운 도시. 희망을 잃지 않은 채 시계의 압박만 조용히 더한다. | `bgm-09-city-deadline__loop` |
| `bgm-10-office-appraisal` | 햇빛 아래의 감정서 | 78 / A minor with C major | 밝고 정갈한 의뢰소. 학구적이고 친절하며 미스터리보다 관찰과 판단을 강조한다. | `bgm-10-office-appraisal__loop` |
| `bgm-11-tavern-whispers` | 호박빛 소문의 값 | 70 / E minor | 술집의 정보 거래. 경매 재즈와 겹치지 않는 저밀도 포크 누아르로 은밀함을 만든다. | `bgm-11-tavern-whispers__loop` |
| `bgm-12-exchange-ledger` | 저울과 주판의 오후 | 98 / C major with mixolydian color | 거래소의 빠르고 명료한 상업 리듬. 카지노처럼 반짝이지 않고 일하는 손의 속도를 표현한다. | `bgm-12-exchange-ledger__loop` |
| `bgm-13-guild-vault` | 도장 아래의 약속 | 62 / C minor with Eb major | 중개인 조합의 계약과 담보. 위협적 악당 음악이 아니라 무게 있고 정중한 실내악. | `bgm-13-guild-vault__loop` |
| `bgm-14-merchant-workshop` | 상회의 한 칸 | 88 / F major | 진열장과 설비가 확장되는 만족감. 작업실의 규칙성과 성장의 온기를 함께 담는다. | `bgm-14-merchant-workshop__loop` |
| `bgm-15-auction-noir` | 벨벳 위의 눈치 | 76 / E dorian | 중반 경매. 베이스 보행을 조금 늘리고 색소폰은 드문 문장 끝에만 낮게 대답한다. | `bgm-15-auction-noir__L1` · `bgm-15-auction-noir__L2` · `bgm-15-auction-noir__L3` |
| `bgm-16-auction-pressure` | 마지막 여덟 점 | 80 / C dorian | 후반 경매. 같은 살롱 재즈의 밀도를 유지하면서 호가 압박과 마감감만 높인다. | `bgm-16-auction-pressure__L1` · `bgm-16-auction-pressure__L2` · `bgm-16-auction-pressure__L3` |
| `bgm-17-settlement-loss` | 붉은 잉크가 마를 때 | 64 / C minor | 적자 결산. 실패를 조롱하지 않고 숫자를 다시 살피게 하는 절제된 변주. | `bgm-17-settlement-loss__L1` · `bgm-17-settlement-loss__L2` |
| `bgm-18-ending-verdict` | 열두 번째 장부 앞에서 | 58 / D minor | 엔딩 판정 직전의 정적과 기대. 결과를 미리 말하지 않는 열린 화성. | `bgm-18-ending-verdict__loop` |
| `bgm-19-result-success` | 다음 장부의 첫 줄 | 76 / F major add6 | 성공 결과. 타이틀 주제를 따뜻하게 회수하되 승리 팡파르로 과장하지 않는다. | `bgm-19-result-success__loop` |
| `bgm-20-result-bankruptcy` | 불이 꺼진 계산대 | 52 / D minor | 파산 결과. 공포나 희극 없이 존엄한 마침표와 다시 시작할 여백을 남긴다. | `bgm-20-result-bankruptcy__loop` |
| `bgm-21-museum-memory` | 유리장 안의 항해 | 60 / Bb major add6 | 유물 전시관. 획득한 물건이 모험의 기억으로 남는 맑고 조용한 실내악. | `bgm-21-museum-memory__loop` |

## AI/작곡 프롬프트

### 황금빛 창문 너머 · `bgm-01-title`

Art-led music for a warm illustrated European port merchant game. 따뜻한 항구 상회의 첫인상. 밝고 품위 있지만 영웅적이지 않은 상인 모험의 주제. Tempo 84 BPM, key F major. Instruments: 피치카토 현악, 클라리넷, 스피넷, 작은 프레임 드럼. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 첫 장사의 아침 · `bgm-02-city`

Art-led music for a warm illustrated European port merchant game. 푸른 하늘과 붉은 지붕이 보이는 항구 도시. 일과 이동을 가볍게 밀어 주는 저밀도 실내악. Tempo 92 BPM, key F major. Instruments: 피치카토 첼로, 바순, 스피넷, 가벼운 탬버린. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 첫 번째 호가 · `bgm-03-auction`

Art-led music for a warm illustrated European port merchant game. 일반 경매의 절제된 살롱 누아르. 베이스가 주도하고 관악은 짧게만 개입한다. Tempo 74 BPM, key D dorian. Instruments: 콘트라베이스, 브러시 스네어, 뮤트 피아노, 베이스 클라리넷. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 금빛 홀의 마지막 호가 · `bgm-04-relic`

Art-led music for a warm illustrated European port merchant game. 금빛 특별 경매의 격식과 긴장. 일반 경매 재즈의 어휘를 귀족적 챔버 왈츠로 확장한다. Tempo 72 BPM, key D minor to F major. Instruments: 콘트라베이스, 비올라, 비브라폰, 뮤트 피아노, 유리종. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 장부에 남은 하루 · `bgm-05-settlement`

Art-led music for a warm illustrated European port merchant game. 하루의 성패를 차분히 복기하는 장부 음악. 축하보다 정리와 다음 선택에 집중한다. Tempo 68 BPM, key D minor with F major. Instruments: 스피넷, 첼로, 비올라, 연필 리듬. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 접어 둔 항구 지도 · `bgm-06-archive`

Art-led music for a warm illustrated European port merchant game. 저장된 여정을 다시 펼치는 따뜻한 기억. 향수는 있으나 쓸쓸하지 않다. Tempo 64 BPM, key Bb major. Instruments: 뮤직박스, 클라리넷, 부드러운 현악. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 도시가 준비되는 동안 · `bgm-07-loading-workshop`

Art-led music for a warm illustrated European port merchant game. 지도와 상점이 차례로 배치되는 짧은 작업곡. 무거운 공장 대신 정돈된 수공업의 리듬. Tempo 96 BPM, key F major. Instruments: 스피넷, 피치카토 현악, 나무 블록, 작은 황동 기어. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 분주해진 상회의 거리 · `bgm-08-city-growth`

Art-led music for a warm illustrated European port merchant game. 성장한 상회의 활기. 타이틀 모티프를 더 풍성하게 변주하되 멜로디 밀도는 낮게 유지한다. Tempo 102 BPM, key Bb major. Instruments: 피치카토 현악, 클라리넷, 스피넷, 프레임 드럼. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 마감 전의 항구 · `bgm-09-city-deadline`

Art-led music for a warm illustrated European port merchant game. 마감이 가까운 도시. 희망을 잃지 않은 채 시계의 압박만 조용히 더한다. Tempo 96 BPM, key G minor with Bb major. Instruments: 피치카토 첼로, 바순, 스피넷, 작은 시계 펄스. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 햇빛 아래의 감정서 · `bgm-10-office-appraisal`

Art-led music for a warm illustrated European port merchant game. 밝고 정갈한 의뢰소. 학구적이고 친절하며 미스터리보다 관찰과 판단을 강조한다. Tempo 78 BPM, key A minor with C major. Instruments: 클라리넷, 플루트, 피치카토 비올라, 스피넷. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 호박빛 소문의 값 · `bgm-11-tavern-whispers`

Art-led music for a warm illustrated European port merchant game. 술집의 정보 거래. 경매 재즈와 겹치지 않는 저밀도 포크 누아르로 은밀함을 만든다. Tempo 70 BPM, key E minor. Instruments: 플럭 기타, 콘트라베이스, 베이스 클라리넷, 부드러운 하모니움. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 저울과 주판의 오후 · `bgm-12-exchange-ledger`

Art-led music for a warm illustrated European port merchant game. 거래소의 빠르고 명료한 상업 리듬. 카지노처럼 반짝이지 않고 일하는 손의 속도를 표현한다. Tempo 98 BPM, key C major with mixolydian color. Instruments: 스피넷, 피치카토 첼로, 침발롬, 나무 블록. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 도장 아래의 약속 · `bgm-13-guild-vault`

Art-led music for a warm illustrated European port merchant game. 중개인 조합의 계약과 담보. 위협적 악당 음악이 아니라 무게 있고 정중한 실내악. Tempo 62 BPM, key C minor with Eb major. Instruments: 첼로, 바순, 하모니움, 낮은 스피넷. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 상회의 한 칸 · `bgm-14-merchant-workshop`

Art-led music for a warm illustrated European port merchant game. 진열장과 설비가 확장되는 만족감. 작업실의 규칙성과 성장의 온기를 함께 담는다. Tempo 88 BPM, key F major. Instruments: 피치카토 현악, 클라리넷, 스피넷, 작은 목재 퍼커션. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 벨벳 위의 눈치 · `bgm-15-auction-noir`

Art-led music for a warm illustrated European port merchant game. 중반 경매. 베이스 보행을 조금 늘리고 색소폰은 드문 문장 끝에만 낮게 대답한다. Tempo 76 BPM, key E dorian. Instruments: 콘트라베이스, 브러시 스네어, 뮤트 피아노, 바리톤 색소폰. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 마지막 여덟 점 · `bgm-16-auction-pressure`

Art-led music for a warm illustrated European port merchant game. 후반 경매. 같은 살롱 재즈의 밀도를 유지하면서 호가 압박과 마감감만 높인다. Tempo 80 BPM, key C dorian. Instruments: 콘트라베이스, 브러시 스네어, 뮤트 피아노, 베이스 클라리넷, 약한 시계 펄스. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 붉은 잉크가 마를 때 · `bgm-17-settlement-loss`

Art-led music for a warm illustrated European port merchant game. 적자 결산. 실패를 조롱하지 않고 숫자를 다시 살피게 하는 절제된 변주. Tempo 64 BPM, key C minor. Instruments: 스피넷, 첼로, 비올라, 연필 리듬. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 열두 번째 장부 앞에서 · `bgm-18-ending-verdict`

Art-led music for a warm illustrated European port merchant game. 엔딩 판정 직전의 정적과 기대. 결과를 미리 말하지 않는 열린 화성. Tempo 58 BPM, key D minor. Instruments: 첼로, 비올라, 하모니움, 낮은 유리종. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 다음 장부의 첫 줄 · `bgm-19-result-success`

Art-led music for a warm illustrated European port merchant game. 성공 결과. 타이틀 주제를 따뜻하게 회수하되 승리 팡파르로 과장하지 않는다. Tempo 76 BPM, key F major add6. Instruments: 클라리넷, 피치카토 현악, 스피넷, 작은 종. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 불이 꺼진 계산대 · `bgm-20-result-bankruptcy`

Art-led music for a warm illustrated European port merchant game. 파산 결과. 공포나 희극 없이 존엄한 마침표와 다시 시작할 여백을 남긴다. Tempo 52 BPM, key D minor. Instruments: 첼로, 베이스 클라리넷, 하모니움, 마른 종이. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.

### 유리장 안의 항해 · `bgm-21-museum-memory`

Art-led music for a warm illustrated European port merchant game. 유물 전시관. 획득한 물건이 모험의 기억으로 남는 맑고 조용한 실내악. Tempo 60 BPM, key Bb major add6. Instruments: 글라스 하모니카, 비올라, 클라리넷, 뮤직박스. Low density, tactile acoustic timbres, restrained melody, clear midrange for UI. No vocals, EDM, modern synths, trailer percussion, pirate shanty, comedy, glossy fantasy sparkle or hidden-value telegraphing. Seamless loop.
