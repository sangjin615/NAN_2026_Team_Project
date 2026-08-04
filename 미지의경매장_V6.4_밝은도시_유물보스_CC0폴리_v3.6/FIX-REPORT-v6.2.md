# 미지의 경매장 V5 구현 계약 정리 보고서 v6.2

## 적용한 결정

- 프로젝트 ZIP과 내보내기 툴 모두 수정 대상으로 처리
- `scaleMode: fit`, 중앙 정렬, 레터박스, 전체 캔버스 일괄 스케일 고정
- 씬별 향후 스케일 보정을 위해 `sceneTransform` 계약 추가. 현재 값은 전부 `scale: 1.0`
- 배경은 전 씬 `contain`으로 통일
- 1672×941 이미지는 원본을 수정하지 않고 `contentRect`를 기록한 뒤 씬 UI 좌표를 해당 영역으로 변환
- 도시·의뢰소·최종 경매·여정 결과·유물 전시관 목업은 임시 런타임 배경으로 유지하고 `temporaryReference: true` 표시
- 팝업·상태 행동을 실제 목적에 맞게 정리하고 불필요한 confirm/cancel/close 참조 제거
- 첫날 튜토리얼 완료 또는 건너뛰기 시 `tutorial.seen = true`
- 파산 결과 확인 시 타이틀 이동
- 완전한 결말에 전시관·타이틀 버튼 모두 제공
- 밸런스 승인 상태는 `candidate` 유지
- `data/balance.json`을 `balance/data/balance.json`과 완전히 동기화

## 비율 보정 씬

- `scene-loading`: 이미지 1672×941 → contentRect y=7.790072%, h=84.419856%
- `scene-city`: 이미지 1672×941 → contentRect y=7.790072%, h=84.419856%
- `scene-office`: 이미지 1672×941 → contentRect y=7.790072%, h=84.419856%
- `scene-tavern`: 이미지 1672×941 → contentRect y=7.790072%, h=84.419856%

## 검사 결과

- 등록 행동: **70개**
- 실제 참조 행동: **65개**
- 미등록 행동 참조: **0개**
- `data/balance.json`과 `balance/data/balance.json`: **동일**
- 전체 캔버스 스케일: **활성화**
- 배경 맞춤 충돌: **없음 (`contain` 통일)**
- ZIP 내부 파일 수: **135개**

## 참고

`sceneTransform`은 이후 씬별 확대·축소가 필요할 때 사용할 자리만 마련했으며, 현재 화면에는 추가 확대·이동을 적용하지 않았다.
