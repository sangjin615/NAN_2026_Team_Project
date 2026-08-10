# 구현 계약 수정 보고서 v6.3

## 변경

- 씬 내부 `실패·안내 표시 자리` 15개 제거
- 전역 재사용 팝업 `popup-global-failure` 추가
- 실패 팝업 열기·닫기 행동 2개 추가
- `toast-global`을 성공·정보 전용으로 분리
- 파산·마감 미달·빈손 등 여정 종료 실패는 기존 결과 상태 유지
- 각 씬에 `failureFeedbackRef: popup-global-failure` 기록
- 구현 계약에 `failureFeedback` 정책 추가

## 표시 책임

| 상황 | 표시 |
|---|---|
| 자금 부족·잠금·보관칸 부족·저장 오류 | `popup-global-failure` |
| 저장 완료·획득 완료·일반 정보 | `toast-global` |
| 파산·마감 미달·유물 경매 빈손 | 여정 결과 상태 |

## 검사

- 씬 실패 패널 잔존: 0
- 미등록 행동 참조: 0
- ZIP 무결성: 통과
