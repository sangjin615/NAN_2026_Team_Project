# 미지의 경매장

경매에서 물품을 낙찰받고, 의뢰와 거래를 통해 자산을 키운 뒤 최종 유물 경매에
도전하는 브라우저 기반 게임 프로젝트다.

## 플레이

- 공개 빌드: https://sangjin615.github.io/NAN_2026_Team_Project/
- 로컬 독립 실행본: `Runtime/미지의_경매장_서버없이_실행.html`

독립 실행본은 Chrome 또는 Edge에서 열 수 있다. 브라우저의 자동 재생 정책에 따라
첫 클릭 이후 사운드가 시작될 수 있다.

## 개발 환경에서 실행

Node.js가 설치된 환경에서 다음 명령을 실행한다.

```bash
cd Runtime
npm install
npm start
```

브라우저에서 `http://localhost:4173/`에 접속한다.

생성 서버를 로컬에서 별도로 실행하려면 다음 명령을 사용한다.

```bash
cd Runtime
npm run start:generation
```

## 저장소 구조

| 경로 | 용도 |
| --- | --- |
| `Runtime/` | 실제 게임 본체, 테스트, 생성 API, 독립 실행 빌드 |
| `Assets/` | 제작·편집용 이미지 원본과 경매품·유물 카탈로그 |
| `Design/` | 화면 목업과 VSL·사운드 통합 디자인 프로젝트 |
| `Tools/` | VSL 편집기와 밸런스 분석 도구 |
| `Docs/` | 기획, 개발, 검증, 제출 관련 문서 |
| `Archive/` | 과거 프로토타입과 배포 ZIP 보관 |
| `최종 산출물/` | 제출용 링크, PDF, 영상과 역할 기술서 수집 위치 |
| `.team-loop/` | Team Loop 프로젝트와 검증 프로필 설정 |

`Runtime/assets/`는 게임이 직접 사용하는 배포용 파일이고, 루트 `Assets/`는
제작 원본이다. 원본을 수정한 뒤 필요한 결과만 런타임의 대응 위치에 반영한다.

## 검증과 빌드

게임 코드를 변경한 뒤 다음 검사를 실행한다.

```bash
cd Runtime
npm test
npm run audit
```

`Runtime/src/`, `Runtime/styles.css`, `Runtime/runtime-fixes.css`,
`Runtime/index.html`, `Runtime/data/`를 변경했다면 독립 실행본도 다시 만든다.

```bash
cd Runtime
npm run build:standalone
```

생성 API 연결을 실제로 호출해 검사하려면 다음 명령을 사용한다.

```bash
cd Runtime
npm run audit:generation:live
```

이 명령은 외부 API를 호출하므로 네트워크와 현재 API 설정이 필요하다.

## 주요 문서

- 공동 작업 규칙: `AGENTS.md`
- 문서 구조 안내: `Docs/README.md`
- 병렬 작업 주의사항: `Docs/PARALLEL-SESSION-NOTES.md`
- 생성 검증 인계: `Docs/GENERATION-VERIFICATION-HANDOFF.md`
- 생성 라우터 정합성: `Docs/GENERATION-ROUTER-PARITY.md`
- 배포 안내: `Docs/Deployment/PAGES-DEPLOY-GUIDE.md`

기능이나 계약을 변경하기 전에는 관련 인계 문서와 `AGENTS.md`를 먼저 확인한다.

## 제출 자료

제출용 자료는 `최종 산출물/`에 번호순으로 모은다.

1. 플레이 가능한 빌드 및 전체 소스 링크
2. 30~60초 플레이 영상
3. 게임 소개 및 설명 PDF
4. AI 활용 기술 PDF
5. 팀원 역할 기술서

원본 문서는 `Docs/Submission/`에서 관리하고, 제출이 확정된 파일만
`최종 산출물/`에 복사한다.
