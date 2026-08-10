# V5 씬·핀 색인

- 씬: 15개
- UI 상태: 8개
- 전역 행동: 48개
- 핀·영역: 122개

## 타이틀 (`scene-title`)
- 근거: V5 §2·§3·§5·§16 + 앱 셸
- 구현 상태: implemented
- 행동: act-start-new-run, act-open-continue, act-enter-museum, act-exit-game, act-open-settings
- 기능·핀:
  - 새 여정 — action / implemented
  - 이어하기 — nav / implemented
  - 유물 전시관 — action / implemented
  - 게임 종료 — action / implemented
  - 설정 — modal / implemented
  - 실패·안내 표시 자리 — data / implemented

## 이어하기 (`scene-continue`)
- 근거: 앱 셸 + V5 여정 상태
- 구현 상태: implemented
- 행동: act-load-save, act-delete-save, act-open-settings
- 기능·핀:
  - 저장 슬롯 목록 — data / implemented
  - 이어하기 — action / implemented
  - 삭제 — action / implemented
  - 타이틀로 돌아가기 — nav / implemented
  - 설정 — modal / implemented
  - 실패·안내 표시 자리 — data / implemented

## 여정 생성 (`scene-loading`)
- 근거: V5 §3 불변 3·4, §5, §7·§8·§9
- 구현 상태: implemented
- 행동: act-complete-loading
- 기능·핀:
  - 생성 진행 상태 — data / implemented
  - 생성 완료 — action / implemented
  - 실패·안내 표시 자리 — data / implemented

## 도시 페이즈 (`scene-city`)
- 근거: V5 §5.3, §13
- 구현 상태: implemented
- 행동: act-enter-office, act-enter-tavern, act-enter-exchange, act-enter-guild, act-enter-merchant, act-enter-auction, act-enter-museum, act-save-game, act-open-settings
- 기능·핀:
  - [공통] 여정 상태 표시 — data / implemented
  - 오늘 시장 사건 — data / implemented
  - 의뢰소 — action / implemented
  - 술집 — action / implemented
  - 경매장 — action / implemented
  - 거래소 — action / implemented
  - 조합 — action / implemented
  - 상회 — action / implemented
  - 유물 전시관 — action / implemented
  - 오늘 준비 상태 — data / implemented
  - 실패·안내 표시 자리 — data / implemented

## 의뢰소 (`scene-office`)
- 근거: V5 §9.1, §10, §13, §17.5
- 구현 상태: implemented
- 행동: act-switch-office-tab, act-accept-quest, act-appraise-lot, act-return-city, act-save-game, act-open-settings
- 기능·핀:
  - [공통] 여정 상태 표시 — data / implemented
  - 의뢰·감정 탭 — action / implemented
  - 의뢰 목록 — data / implemented
  - 의뢰 수주 — action / implemented
  - 감정 상품 목록 — data / implemented
  - 감정 구매 — action / implemented
  - 도시로 — action / implemented
  - 실패·안내 표시 자리 — data / implemented

## 술집 (`scene-tavern`)
- 근거: V5 §8.3, §9, §17.4
- 구현 상태: implemented
- 기능·핀:
  - [공통] 여정 상태 표시 — data / implemented
  - 정보 상품 4채널 — data / implemented
  - 수요 동향 구매 — action / implemented
  - 출품 목록 구매 — action / implemented
  - 경쟁자 정보 구매 — action / implemented
  - 확보한 정보·숙적 소문 — data / implemented
  - 도시로 — action / implemented
  - 실패·안내 표시 자리 — data / implemented

## 거래소 (`scene-exchange`)
- 근거: V5 §5.4, §7.3, §11
- 구현 상태: implemented
- 기능·핀:
  - [공통] 여정 상태 표시 — data / implemented
  - 거래소 탭 — action / implemented
  - 판매 가능 보유품 — data / implemented
  - 즉시 처분 — action / implemented
  - 족보 판매 제시·진행 — data / implemented
  - 족보 판매 실행 — action / implemented
  - 세트 판매 — action / implemented
  - 계열 시세판 — data / partial
  - 12일차 정산 종료 — action / implemented
  - 도시로 — action / implemented
  - 실패·안내 표시 자리 — data / implemented

## 조합 (`scene-guild`)
- 근거: V5 §12
- 구현 상태: implemented
- 행동: act-take-loan, act-repay-loan, act-process-loan-due, act-return-city, act-save-game, act-open-settings
- 기능·핀:
  - [공통] 여정 상태 표시 — data / implemented
  - 대출 상태·상시 노출값 — data / implemented
  - 담보 선택 목록 — data / implemented
  - 대출 실행 — action / implemented
  - 대출 상환 — action / implemented
  - 조합 거래 제한 상태 — data / implemented
  - 도시로 — action / implemented
  - 실패·안내 표시 자리 — data / implemented

## 상회 (`scene-merchant`)
- 근거: V5 §5.2, §14, §17.6
- 구현 상태: implemented
- 행동: act-upgrade-shop, act-return-city, act-save-game, act-open-settings
- 기능·핀:
  - [공통] 여정 상태 표시 — data / implemented
  - 승급 조건·비용 — data / implemented
  - 즉시 승급 — action / implemented
  - 자동 성장 브랜치 — data / implemented
  - 보유품 관리 — data / implemented
  - 도시로 — action / implemented
  - 실패·안내 표시 자리 — data / implemented

## 경매 세션 (`scene-auction`)
- 근거: V5 §4, §8
- 구현 상태: implemented
- 행동: act-place-bid, act-pass-lot, act-run-bot-turn, act-finalize-lot, act-next-lot, act-save-game, act-open-settings
- 기능·핀:
  - [공통] 여정 상태 표시 — data / implemented
  - 현재 출품 정보 — data / implemented
  - 현재 호가·최소 인상 — data / implemented
  - 입찰 — action / implemented
  - 물러나기 — action / implemented
  - 경쟁자 3인 — data / implemented
  - 입찰 기록 — data / implemented
  - 구매한 출품 목록 — data / implemented
  - 의뢰 진행 트래커 — data / spec-only
  - 출품 결과 팝업 — modal / implemented
  - 실패·안내 표시 자리 — data / implemented

## 하루 결산 (`scene-summary`)
- 근거: V5 §5.3, §5.4, §10
- 구현 상태: implemented
- 행동: act-next-day, act-open-day12-settlement, act-save-game, act-open-settings
- 기능·핀:
  - [공통] 여정 상태 표시 — data / implemented
  - 오늘 낙찰 목록 — data / implemented
  - 오늘 수입·지출·순이익 — data / implemented
  - 계열 지수 변화 — data / implemented
  - 의뢰 판정 — data / implemented
  - 마감 잔여 경고 — data / implemented
  - 다음 날 — action / implemented
  - 12일차 정산 — action / implemented
  - 실패·안내 표시 자리 — data / implemented

## 12일 여정 판정 (`scene-ending`)
- 근거: V5 §5.4, §15.1
- 구현 상태: implemented
- 행동: act-check-final-qualification, act-start-relic-auction, act-save-game, act-open-settings
- 기능·핀:
  - [공통] 여정 상태 표시 — data / implemented
  - 상회 단계·최종 자금 — data / implemented
  - 유물 경매 입장 — action / implemented
  - 자격 미달 결과 — action / implemented
  - 실패·안내 표시 자리 — data / implemented

## 유물 경매 (`scene-final`)
- 근거: V5 §9.3, §15
- 구현 상태: implemented
- 행동: act-place-relic-bid, act-pass-relic, act-run-tycoon-turn, act-next-relic-round, act-finish-relic-auction, act-save-game, act-open-settings
- 기능·핀:
  - [공통] 여정 상태 표시 — data / implemented
  - 현재 유물·티어 — data / implemented
  - 현재 호가 — data / implemented
  - 유물 입찰 — action / implemented
  - 물러나기 — action / implemented
  - 거물 3인 — data / implemented
  - 유물 입찰 기록 — data / implemented
  - 실패·안내 표시 자리 — data / implemented

## 여정 결과 (`scene-result`)
- 근거: V5 §3 불변 10, §5.6·§5.7, §15.4
- 구현 상태: implemented
- 행동: act-enter-museum, act-start-next-journey, act-start-new-run
- 기능·핀:
  - 여정 결과·실패 원인 — data / implemented
  - 최종 상태 — data / implemented
  - 3여정 캠페인 — data / spec-only
  - 타이틀 — nav / implemented
  - 전시관 — action / implemented
  - 다음 여정 — action / partial
  - 실패·안내 표시 자리 — data / implemented

## 유물 전시관 (`scene-museum`)
- 근거: V5 §13, §16
- 구현 상태: implemented
- 행동: act-return-city
- 기능·핀:
  - 유물 전시 목록 — data / implemented
  - 메타·캠페인 상태 — data / partial
  - 돌아가기 — action / implemented
  - 실패·안내 표시 자리 — data / implemented
