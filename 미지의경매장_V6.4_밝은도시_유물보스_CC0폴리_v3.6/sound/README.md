# 미지의 경매장 V6.4 — 승인 BGM 기준 사운드 프로그램 v3.4

v3.4는 가장 오래 듣는 도시 BGM 계열을 더 무겁고 성숙하게 재편집하고, 감정 관련 SFX 3개를 완화한 표적 수정본이다. 변경 내역은 `REVISION-v3.4.md`를 기준으로 한다.

v3.3은 승인된 BGM 7곡은 바꾸지 않고 SFX 99개와 앰비언스 11개를 전면 재편집한 버전이다. 실행 파일과 VSL은 동일한 `sound.json`을 사용하며, 실제 BGM 덕킹까지 런타임에 연결했다. 변경 근거는 `SFX-REDESIGN-v3.3.md`, 측정 결과는 `SFX-MIX-AUDIT-v3.3.json`을 기준으로 한다.

구현 계약 패키지 v6.3에 얹는 추가 층. `flow.json`을 수정하지 않고 ID 참조로만 결착한다.

## 전체 흐름

```
1. SFX-SHOPPING-LIST.md 의 검색어로 무료 사이트에서 찾는다
2. 받은 파일을 한 폴더에 모은다
3. VSL(v5.3) 사운드 보관함에서 폴더 연결 → 큐마다 미리듣기하며 배정
4. 배정표 내보내기 → sound-binding.json
5. python import-audio.py <폴더> --rename   (파일을 큐 ID로 정리)
```

현재 BGM 33슬롯은 사용자가 통과시킨 7개 음원의 레벨 매칭 루프이며 그대로 보존된다. SFX 99개와 앰비언스 11개는 승인 BGM의 밀도와 재질에 맞춘 v3.3 재편집본이다. 공개 배포 전 `SOUND-CREDITS-v3.2.md`의 크레딧과 타이틀곡 권리 확인 항목을 검토한다.

## 파일

| 파일 | 역할 |
|---|---|
| `sound.json` | **단일 기준.** 큐 110개 · BGM 21곡 · 믹스 · 공개 상태 기반 변주 · 매핑 |
| `SFX-SHOPPING-LIST.md` | **검색어 목록** — 무료 사이트에서 찾을 때 이걸 본다 (자동 생성) |
| `FREE-SOURCES.md` | 무료 확보처 · 라이선스 · **스템 없이 레이어 구현하기** |
| `SOUND-BIBLE.md` | 톤앤매너 · 믹스 규칙 · 검수 체크리스트 |
| `BGM-SPEC.md` | BGM 21곡/33슬롯 사양과 곡별 AI·작곡 프롬프트 |
| `ART-AUDIO-DIRECTION-v3.0.md` | 제공된 UI 목업에서 도출한 장면별 음악·효과음 재질 기준 |
| `SOUND-CREDITS-v3.2.md` | 선정곡 출처·라이선스·필수 크레딧 |
| `source-bgm/` | 7개 원본과 `processed-masters/`의 36초 루프 마스터 |
| `SFX-CUESHEET.md` | 큐시트 — 어느 행동에 어느 큐가 걸리는지 (자동 생성) |
| `patch-vsl.py` | **VSL에 사운드 층을 심는다** |
| `import-audio.py` | 폴더 스캔 → 큐 자동 배정 · 파일명 정리 |
| `verify-sound.py` | `flow.json` 정합성 검사 |
| `build-cuesheet.py` / `build-shopping-list.py` | 문서 자동 생성 |
| ~~`generate-sfx.py`~~ / ~~`inject-prompts.py`~~ | API 경로. 지금은 안 쓴다. 프롬프트는 로컬 AudioCraft용으로 남겨둠 |

## VSL 사운드 층

```bash
python patch-vsl.py <원본 VSL.html>
```

원본을 건드리지 않고 `..._sound.html` 을 새로 만든다. 추가되는 것:

- **씬 인스펙터** — 배경음악 / 앰비언스 지정, 명세 권장값 «적용» 버튼, ▶ 미리듣기
- **핀·영역 편집기** — 효과음 큐 지정, `actionRef` 기반 권장 큐 안내, ▶ 미리듣기
- **사운드 보관함** (툴바) — 로컬 폴더 연결, 큐 110개 + BGM 슬롯 33개에 파일 배정, 배정률 표시
- **배정표 내보내기** — `sound-binding.json`

파일명이 큐 ID와 같으면 (`sfx-gavel.wav`) 폴더 연결 시 **자동 배정**된다.
BGM 레이어는 `bgm-03-auction__L1.wav` 형태.

지정한 값은 `node.sound` / `annotation.soundCue` 로 들어가며, VSL 내보내기에 자동 포함된다.

## 파일 정리

```bash
python import-audio.py <오디오폴더>
```

스캔해서 정확 일치·키워드 제안·미매칭을 보여준다. 확정되면:

```bash
python import-audio.py <오디오폴더> --rename
```

`assets/runtime/audio/{sfx,bgm,ambience}/` 로 큐 ID 이름을 붙여 복사한다.
이름이 애매한 파일은 `mapping.txt` 에 `큐ID = 파일명` 으로 적고 `--map mapping.txt`.

## 갱신 절차

`sound.json`을 고친 뒤:

```bash
python build-cuesheet.py; python build-shopping-list.py; python verify-sound.py
```

`verify-sound.py`가 오류 0을 반환해야 한다. `flow.json`이 갱신될 때마다 다시 돌린다.

## 수량

- BGM 21곡 (슬롯 33개)
- 사운드 큐 110개 (SFX 99 · 앰비언스 루프 11)
- 행동 커버리지 67/67 (V6 폐기 5건 제외)
- 씬 15/15 · UI 상태 17/18 (폐기 1건 제외)

## 현재 상태

- `index.html` 오디오 매니저와 3개 볼륨 버스 연결 완료
- VSL에서 33개 BGM 슬롯과 110개 SFX/앰비언스 큐 재생·교체 가능
- BGM 21곡/33슬롯과 SFX·앰비언스 110큐는 아트 방향으로 전면 재렌더링된 프로토타입
- 일반 경매 재즈 3곡/9레이어는 재즈 정체성을 유지하면서 편성·공간감·레이어 역할을 발전시킴
- 최종 출시용 마스터 제작과 라이선스 확정은 별도 단계
