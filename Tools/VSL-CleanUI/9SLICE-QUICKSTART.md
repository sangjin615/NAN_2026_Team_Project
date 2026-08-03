# VSL 레이아웃·9-Slice 작업 순서

1. `VSL_레이아웃_9SLICE_실행.html`을 연다.
2. 프로젝트 ZIP을 불러온다.
3. 프로젝트 캔버스와 각 씬 캔버스를 `1600 × 900`으로 맞춘다.
4. 씬의 UI 배치 탭에서 최신 `ui_1600x900_v2` 목업을 연결한다.
5. 목업을 기준으로 버튼·패널·목록 영역을 지정한다.
6. UI 에셋 보관함에서 `shared/ui-skin/`의 PNG를 추가한다.
7. 가변 패널·카드 에셋에 `9-Slice`를 켜고 상·우·하·좌 픽셀을 입력한다.
8. 배치 검사를 실행하고 폴더형 프로젝트 ZIP을 저장한다.

## 권장 9-Slice 시작값

| 에셋 | 상 | 우 | 하 | 좌 | 방식 |
|---|---:|---:|---:|---:|---|
| `panel-dark.png` | 48 | 48 | 48 | 48 | stretch |
| `panel-parchment.png` | 48 | 48 | 48 | 48 | stretch |
| `status-card.png` | 40 | 40 | 40 | 40 | stretch |
| `popup-frame.png` | 44 | 44 | 44 | 44 | stretch |
| `item-card.png` | 36 | 36 | 36 | 36 | stretch |

버튼은 원본 비율을 유지해 배치하는 것을 우선하며, 매우 넓은 버튼에만 9-Slice를 사용한다.

## ZIP 출력

- `flow.json`: 씬과 행동 흐름
- `layout.json`: 1600×900 좌표·크기·에셋 참조와 9-Slice 메타데이터
- `ui-nine-slice.json`: 9-Slice가 활성화된 에셋만 모은 런타임용 매니페스트
- 씬·팝업 목업 및 UI 이미지 에셋

이 ZIP을 Runtime 작업자에게 전달하면 `layout.json`의 백분율 좌표와 `ui-nine-slice.json`을 그대로 UI 배치에 사용할 수 있다.
