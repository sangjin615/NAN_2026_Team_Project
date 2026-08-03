# HTML ↔ 생성 API 통합

## 목적

게임 HTML은 `POST /generate` 계약만 사용한다. 개발 단계에서는 로컬 Node 중계 서버가 Ollama를 호출하고, 제출 단계에서는 같은 서버 인터페이스의 모델 어댑터를 외부 AI API로 교체한다. 게임의 요청·응답 구조와 화면 반영 코드는 변경하지 않는다.

## 개발 실행

터미널 1:

```powershell
npm.cmd run start:generation --prefix Runtime
```

터미널 2:

```powershell
npm.cmd start --prefix Runtime
```

브라우저에서 `http://localhost:4173/`를 열고 새 여정을 시작한다. 기본 모델은 `qwen2.5-coder:14b`다.

환경변수:

- `GENERATION_PORT`: 생성 API 포트, 기본 `8787`
- `OLLAMA_ENDPOINT`: Ollama generate 주소
- `OLLAMA_MODEL`: 모델명
- `GENERATION_LOG=off`: 개발 생성 증거 저장 비활성화

## 실행 흐름

1. 새 여정 시작 시 런 청사진을 한 번 생성한다.
2. 현재 1일차 8 LOT을 생성하고 화면 진입 전 검증한다.
3. 2~3일차는 화면 진입 후 백그라운드에서 생성한다.
4. 생성 결과는 스케줄과 저장 슬롯에 포함된다.
5. API 연결, 형식 또는 ID 검증이 실패하면 한 번 저온 재시도한다.
6. 두 번 실패하면 게임 HTML은 결정적 로컬 fallback을 사용해 진행을 막지 않는다.

## 엔진 경계

API 요청에는 다음 값이 포함되지 않는다.

- 기준가와 실제 가치
- 품질 계수
- 확률과 보상
- 입찰 결과와 시장 계산값

API는 런 분위기, 세트 서사, 표시 이름, 설명, 소문, 세트 힌트, NPC 반응만 생성한다.

## 실제 HTML 통합 측정

2026-08-04, `qwen2.5-coder:14b`, 시드 `api-html-minimal-v3`:

| 단계 | 시도 | 요청 JSON | 지연 |
|---|---:|---:|---:|
| 런 청사진 | 1회 통과 | 1,196자 | 19,636 ms |
| 1일차 8 LOT | 1회 통과 | 1,751자 | 18,488 ms |
| 2일차 8 LOT | 1회 통과 | 1,872자 | 16,258 ms |
| 3일차 8 LOT | 1회 통과 | 1,950자 | 15,267 ms |

이전 일일 전체 컨텍스트 약 7,949자와 비교하면 1일차 실제 요청은 약 78.0% 작다. 공통 계약문까지 포함한 프롬프트 기준으로도 약 65% 감소한다.

## 외부 API 전환

1. `generation-server.js`의 Ollama 호출부를 외부 모델 SDK/HTTP 호출로 교체한다.
2. 동일한 동적 JSON Schema를 구조화 출력 옵션에 전달한다.
3. 서버 환경변수에 API 키를 저장한다.
4. `Runtime/data/api-config.json`의 `endpoint`를 배포 주소로 변경한다.

HTML과 `GenerationApiProvider`는 수정하지 않는다.

## 확인된 잔여 문제

- 로컬 모델 문구가 반복적일 수 있다.
- `품질이 뛰어난다`처럼 어색한 문장이 발생할 수 있다.
- 외형·출처 중심 제약은 추가했지만 한국어 문장 품질 후처리 또는 상위 API 모델 비교가 필요하다.
