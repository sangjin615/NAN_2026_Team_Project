# 무료 사운드 확보처

돈을 쓰지 않고 **상업 배포까지 가능한** 경로만 정리했다.
"무료 다운로드"와 "상업적으로 써도 됨"은 다른 얘기라, 라이선스 칸을 먼저 본다.

---

## 1. 효과음 — 여기서 다 해결된다

| 사이트 | 라이선스 | 강점 | 추천도 |
|---|---|---|---|
| **Kenney.nl** | **CC0** (출처 표기 불필요) | 게임 UI 사운드 팩. 클릭·확인·취소·에러가 세트로 있다 | ★★★ 공용 UI 16개는 여기서 |
| **Sonniss GDC Bundle** | **로열티프리 · 상업 이용 가능** | 매년 GDC에 무료 배포하는 프로 음원. 수십 GB. 포일리·금속·나무가 압도적 | ★★★ 빈티지 질감의 핵심 |
| **Freesound.org** | 소재별로 다름 — **CC0 필터 필수** | 세상에서 제일 큼. 태엽·황동·양피지 같은 특수 소재가 있다 | ★★★ 나머지 전부 |
| **Pixabay Sound Effects** | 자체 라이선스, 출처 표기 불필요 | 깔끔하고 받기 쉬움 | ★★ |
| **Mixkit** | 자체 라이선스, 표기 불필요 | 수가 적지만 품질 균일 | ★★ |
| **99Sounds** | 로열티프리 | 주제별 무료 팩 | ★★ |
| **OpenGameArt.org** | CC0 / CC-BY 혼재 | 게임용으로 정리돼 있음 | ★ |
| ~~BBC Sound Effects~~ | **개인·교육용만** | 33,000개지만 상업 배포 불가 | ✗ 쓰지 말 것 |

### Freesound 검색 요령

로그인 후 검색 결과에서 **License → Creative Commons 0** 필터를 반드시 켠다.
CC-BY도 무료지만 게임 크레딧에 기여자를 전부 적어야 해서, 110개 큐를 모으면 관리가 번거로워진다.
CC0만 쓰면 그 문제가 사라진다.

`SFX-SHOPPING-LIST.md`의 검색어를 그대로 붙여넣으면 된다.

### Sonniss 받는 법

"Sonniss GDC Game Audio Bundle" 로 검색하면 연도별 무료 배포 페이지가 나온다.
용량이 크니 필요한 카테고리(Foley, Metal, Wood, Paper)만 받아도 된다.
압축을 푼 뒤 `python import-audio.py <폴더>` 를 돌리면 어느 큐에 맞는지 제안해 준다.

---

## 2. 배경음악 21곡 / 33슬롯

| 사이트 | 라이선스 | 비고 |
|---|---|---|
| **FreePD.com** | **퍼블릭 도메인** — 표기 불필요 | 가장 마음 편하다. 오케스트라·재즈 있음 | ★★★ |
| **Incompetech** (Kevin MacLeod) | CC-BY — **표기 필수** | 양이 압도적. 장르·분위기 필터가 좋다 | ★★★ |
| **Free Music Archive** | 곡별로 다름 | CC0/CC-BY 필터 확인 | ★★ |
| **Purple Planet** | 무료 + 표기 필수 | 시네마틱 계열 | ★★ |
| **OpenGameArt** | CC0/CC-BY 혼재 | 루프용으로 만들어진 곡이 있다 | ★★ |

BGM은 21곡으로 확장됐으므로 한 공급처에 고정하기보다 곡별 출처·라이선스를 명확히 기록한다.
CC-BY 음원을 쓸 경우 **CREDITS.md를 곡 단위로 즉시 갱신**하고, 최종 후보는 톤 일관성을 우선해 선별한다.

검색 키워드는 `SFX-SHOPPING-LIST.md` 맨 아래에 있다.

---

## 3. 무료 AI 생성 — 돈 안 드는 것만

| 서비스 | 무료 조건 | 상업 이용 |
|---|---|---|
| **ElevenLabs 무료 티어** | 월 10,000 크레딧 | ✗ 출처 표기 의무 · 상업 불가 |
| **Stable Audio 무료** | Personal 티어 | ✗ 비상업만 |
| **Suno 무료** | 일일 제한 | ✗ 비상업만 |
| **Meta AudioCraft (AudioGen/MusicGen)** | **오픈소스 · 로컬 실행 무제한** | **✓ 완전히 내 것** |

무료 티어들은 전부 **비상업 조건**이라 이 프로젝트에 못 쓴다.
쓸 수 있는 건 **AudioCraft를 로컬에서 돌리는 것**뿐이다.

Hugging Face Spaces에서 브라우저로 무료 체험할 수 있고 (`facebook/MusicGen`, `facebook/AudioGen`),
GPU가 있으면 로컬 설치해서 무제한으로 돌릴 수 있다.
`sound.json`의 각 큐에 이미 영문 프롬프트가 들어 있으니 그대로 넣으면 된다.

다만 솔직히 말해, **AudioGen의 짧은 효과음 품질은 Freesound CC0 실물 녹음보다 떨어진다.**
빈티지 고물상 톤은 진짜 나무·금속 녹음이 이깁니다. AI는 못 구한 몇 개를 메우는 용도로 쓰는 게 낫다.

---

## 4. 스템 없이 레이어 구현하기 ★ 중요

무료 음원으로는 **스템을 절대 구할 수 없다.** 완성된 믹스 한 개만 받는다.
그런데 설계에는 레이어가 셋(BGM-03, BGM-04) 또는 둘(BGM-05) 들어 있다.

곡을 5개로 유지하면서 레이어 효과를 내는 방법이 있다. **런타임 필터**다.
Web Audio API의 `BiquadFilterNode` + `GainNode` 로 같은 곡을 실시간 가공한다.

| 원래 레이어 설계 | 무료 음원 대체 구현 |
|---|---|
| BGM-03 L1 (베이스만) | 로우패스 500Hz + 볼륨 −6dB — 소리가 멀어지고 저음만 남는다 |
| BGM-03 L2 | 로우패스 2kHz + 볼륨 −3dB |
| BGM-03 L3 (풀) | 필터 없음 · 볼륨 0dB |
| BGM-04 라운드 1→2→3 | 로우패스 800Hz → 3kHz → 없음, 볼륨 −6 → −3 → 0dB |
| BGM-05 실패 시 | 로우패스 700Hz + 볼륨 −8dB — 축 처진 느낌이 난다 |

호가가 오를수록 필터가 열리면서 음악이 **다가오는** 느낌이 난다.
악기가 쌓이는 것과는 다르지만, 긴장이 오른다는 정보 전달은 동일하게 된다.
파산 화면에서 곡이 먹먹해지는 것도 같은 방식으로 처리된다.

구현 비용도 낮다. 필터 하나와 게인 하나가 전부다.

```js
// 개념 코드 — 실제 구현은 오디오 매니저에서
const src = ctx.createMediaElementSource(audio);
const lp  = ctx.createBiquadFilter(); lp.type = "lowpass";
const gain = ctx.createGain();
src.connect(lp).connect(gain).connect(ctx.destination);

function setIntensity(level) {          // 0 = 멀리, 1 = 가깝게
  lp.frequency.setTargetAtTime(400 + level * 15000, ctx.currentTime, 0.6);
  gain.gain.setTargetAtTime(0.45 + level * 0.55, ctx.currentTime, 0.6);
}
```

이 방식으로 가면 `sound.json`의 레이어 정의는 **그대로 두고**, 재생 쪽에서
`layers: ["L1"]` 을 "강도 0단계"로 읽으면 된다. 나중에 돈이 생겨서 진짜 스템을
만들면 재생 코드만 바꾸면 되고 명세는 손대지 않는다.

---

## 5. 라이선스 관리

CC-BY를 하나라도 쓰면 게임 안에 크레딧 화면이 필요하다.
받을 때마다 `sound/CREDITS.md` 에 한 줄씩 적어두는 게 나중에 뒤지는 것보다 훨씬 싸다.

```
sfx-gavel        | Freesound / <작성자> | CC0     | https://...
bgm-01-title     | Incompetech / Kevin MacLeod | CC-BY | https://...
```

CC0와 Kenney·Sonniss·Pixabay·Mixkit만 쓰면 크레딧 의무가 없다.
**BGM만 CC-BY를 허용하고 효과음은 CC0로 통일**하는 것을 권한다. 크레딧이 5줄로 끝난다.
