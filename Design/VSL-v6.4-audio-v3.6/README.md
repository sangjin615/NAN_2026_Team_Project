# 미지의 경매장 V6.4 — 사운드 통합 HTML/Web

## Audio v3.4 — 도시 BGM 무게 보강·감정 SFX 완화

BGM 2 도시 계열은 원곡의 더 차분한 후반 구간을 사용하고 재생감을 약 3.5% 느리고 낮게 조정했다. 밝은 플럭·퍼커션 대역과 넓은 트랜지언트를 줄여 타이틀·결산·업무 거점 곡과 비슷한 성숙한 실내악 밀도로 맞췄다. 감정 개시·결과·도구 교체 SFX는 고역 에너지와 파일 피크를 낮추고 계약 게인을 각각 2dB 내렸다. 자세한 수치는 `sound/REVISION-v3.4.md`에 기록했다.

## Audio v3.3 — 승인 BGM 기준 SFX 전면 수정

사용자가 통과시킨 BGM 7곡/런타임 33파일은 그대로 보존하고, SFX 99개와 앰비언스 11개를 전부 다시 렌더링했다. 일반 큐의 밝은 황동 핑·유리음·성공 벨·상행 음형을 제거하고 마른 목재, 펠트 기계, 눌린 황동, 종이와 연필 중심으로 통일했다. 일반 경매는 승인된 `I Knew a Guy`의 저밀도 재즈를 가리지 않도록 플레이어 목재 패들과 봇 종이 카드를 분리했다. 상세 기준과 감사 결과는 `sound/SFX-REDESIGN-v3.3.md`와 `sound/SFX-MIX-AUDIT-v3.3.json`에 있다.

V6 통합기획서를 우선 기준으로 VSL 계약, 씬별 사운드 참조, 실행형 HTML/Web 런타임, 교체 가능한 프로토타입 WAV를 한 패키지로 정리했다.

BGM v3.2는 7개 선정 음원을 **타이틀·도시·업무 거점·술집·일반 경매·유물 경매·결산/결과** 장면군에 배치했다. 일반 경매의 콘트라베이스 중심 저밀도 누아르 재즈는 유지하고, 업무 거점은 애절한 스트링 대신 피치카토·목관 중심, 유물 경매는 밝고 절제된 궁정 왈츠로 교체했다.

Audio v3.3은 BGM 33슬롯을 그대로 보존하면서 SFX 99개와 앰비언스 11개를 승인 BGM 기준으로 전면 수정했다. `sound/sound.json`을 단일 기준으로 삼아 `flow.json`, VSL 내장 매핑, `sound-runtime.js`, 실제 런타임을 한 번에 동기화하며 버전 쿼리로 이전 오디오 캐시도 차단한다.

## 현재 범위

- 씬 15개 · UI 상태 18개 · 행동 71개
- 행동 SFX 매핑 71/71
- 사운드 큐 110개(SFX 99 · 앰비언스 11)
- BGM 작곡 단위 21곡 · 런타임 슬롯 33개
- 대사/보이스오버 없음 · 군중 웅성임과 장소 앰비언스만 사용

## 실행

1. 압축을 푼다.
2. `index.html`을 Chrome/Edge로 연다.
3. 브라우저 자동재생 정책 때문에 첫 클릭 또는 키 입력 후 사운드가 시작된다.
4. 설정에서 마스터/BGM/SFX 음량을 각각 조절한다.

## VSL 사운드 편집

1. `VSL_사운드편집기_실행.html`을 Chrome/Edge로 연다.
2. `프로젝트 ZIP 열기`로 이 패키지 ZIP을 불러온다.
3. `사운드 보관함`의 재생 버튼으로 내장 기본음을 바로 확인한다. 별도 폴더 연결은 필요 없다.
4. 교체 후보를 비교할 때만 `오디오 폴더 연결`을 누른다. 큐 ID와 파일명이 같으면 자동 배정된다.
5. `배정표 내보내기`로 교체 내역을 저장한다.

VSL은 `tools/` 아래의 오디오 상대 경로를 사용하므로, HTML만 따로 복사하지 말고 압축을 푼 프로젝트 폴더 구조를 유지해야 한다.
VSL의 프로젝트 ZIP 불러오기는 파일이 ZIP 루트에 있는 형식과 최상위 폴더가 한 겹 있는 형식을 모두 지원하며, 두 경우 모두 씬·팝업 목업과 UI 에셋을 복원한다.

로컬 서버 실행이 필요하면 이 폴더에서 다음 명령을 사용할 수 있다.

```powershell
python -m http.server 8765 --bind 127.0.0.1
```

## 사운드 에셋 주의

`assets/runtime/audio/bgm/`은 v3.2 승인곡 편집본, `sfx/`와 `ambience/`는 v3.3 톤앤매너 재편집본이다. 공개 배포 전에는 반드시 `sound/SOUND-CREDITS-v3.2.md`의 표시 의무와 타이틀곡 권리 확인 항목을 검토한다.

## 주요 파일

- `index.html` — V6.4 실행형 HTML/Web
- `flow.json` — 씬·UI·행동·데이터·사운드 참조 통합 계약
- `sound/sound.json` — 사운드 단일 기준
- `assets/runtime/audio/audio-manager.js` — 재생·볼륨·크로스페이드·레이어 런타임
- `assets/runtime/audio/sound-runtime.js` — 브라우저 로딩용 사운드 설정
- `assets/runtime/audio/prototype-manifest.json` — 프로토타입 파일 목록
- `sound/SOUND-BIBLE.md` — 톤 앤 매너와 믹스 원칙
- `sound/BGM-SPEC.md` — 21곡/33슬롯 확장형 BGM 명세와 생성 프롬프트
- `sound/ART-AUDIO-DIRECTION-v3.0.md` — 제공 아트 기반 BGM·SFX 전면 재설계 기준
- `sound/SOUND-CREDITS-v3.2.md` — 선정 BGM 출처·라이선스·필수 표시문
- `sound/source-bgm/` — 7개 원본 및 36초 루프 마스터
- `sound/SFX-CUESHEET.md` — 효과음 큐시트
- `docs/미지의경매장_V6.4_사운드디자인_통합사양서.docx` — v2.0 제작·구현 참고본. BGM v2.1 방향은 `sound/BGM-SPEC.md`와 `sound/sound.json`을 우선한다.
- `tools/visual_spec_lite_v5_3_sound.html` — ZIP/flow를 불러 편집하는 VSL 도구
- `VSL_사운드편집기_실행.html` — 위 VSL 도구를 여는 시작 파일

`references/`와 일부 balance 연구 파일은 원본 v6.3 ZIP에서 보존한 이력 자료다. 규칙·구현의 현재 기준은 `flow.json`, `sound/sound.json`, `index.html`, `docs/`이다.

## V6 정합성 반영

- 세트 계약을 수락·기한 없는 족보 판매로 교체
- 정보 채널을 수요 동향·출품 목록·경쟁자 예산으로 정리
- 유물 정보 구매/표시 제거
- 담보 대출을 상회 3단계·처분가 45%·2일 만기·상환 x1.90으로 정리
- 유물 경매를 12일 경제 밖 3라운드 공개 호가로 유지

## 검증

```powershell
python verify-contracts.py .
Push-Location sound
python verify-sound.py --flow ..\flow.json --check-files --audio-root ..\assets\runtime\audio
Pop-Location
```

최종 검사 결과:

- VSL 계약: 위반 0
- 사운드 계약: 오류 0 · 주의 0 · 행동 71/71
- JavaScript 구문: PASS
- 브라우저 스모크: 타이틀→도시→술집→경매, 도시곡 연속, 경매곡/군중 전환, 3개 볼륨 버스, 리소스 오류 0
