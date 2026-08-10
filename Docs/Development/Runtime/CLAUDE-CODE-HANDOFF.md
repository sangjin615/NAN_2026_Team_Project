# Claude Code 작업 인계

## 현재 구조

- 이 저장소(`unknown-auction`)는 **미지의 경매장 게임 결과물만** 관리합니다.
- Team Loop 본체는 별도 저장소 `C:/NHN Project/team-loop-lite-ai-learning`에 있습니다.
- 이번 프로젝트의 작업 계획은 Team Loop의 `codex/auction-task-board` 브랜치와 `project-packs/unknown-auction.json`에 보관됩니다.

## 기준 구현과 참고 자료

- 현재 공식 구현: `public/`, `src/`, `test/`
- 공식 검증: `npm run check`
- 서버 실행: `npm start` → `http://localhost:4180`
- 단일 HTML 생성: `npm run build:standalone`
- 비교용 과거 구현: `prototypes/`
- 제품 기준 문서: `docs/00-product-spec.md`

`prototypes/`는 비교·참고 자료입니다. 프로토타입 변경을 공식 구현에 반영하려면 제품 명세와 현재 `public/`, `src/`, `test/`를 기준으로 별도 작업 범위를 잡아야 합니다.

## 방금 편입한 Claude MVP 변경

`prototypes/claude-mvp/`에는 다음 변경이 들어 있습니다.

- 수동 세트 태그를 게임 종료 전까지 수정 가능하게 변경
- 보유 목록에서 모든 참가자 아이템의 세트 태그 표시·수정 지원
- 기획서 버전 1.2와 변경 이력 반영
- 생성된 프로토타입 HTML과 DOCX 갱신
- 프로토타입 스크립트를 CommonJS로 실행하기 위한 로컬 `package.json` 추가

## 작업 원칙

1. 시작 전에 `git status`와 Team Loop 작업 보드에서 담당 범위를 확인합니다.
2. 게임 파일만 수정하고 Team Loop 본체 코드는 이 저장소에서 다루지 않습니다.
3. 공식 구현 변경에는 관찰 가능한 완료 조건과 `test/` 회귀 테스트를 함께 둡니다.
4. 완료 전 `npm run check`와 필요한 프로토타입 전용 테스트를 실제 실행합니다.
5. 프로토타입에서 발견한 유용한 규칙은 검증 후 공식 구현으로 옮기며, 단순 복사로 현재 구조를 덮어쓰지 않습니다.
