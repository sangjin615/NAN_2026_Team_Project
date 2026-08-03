# Team Loop 로컬 2단계 생성 실험

실험일: 2026-08-02  
모델: Ollama `qwen3:14b`  
시드: `team-loop-local-001`

## 생성 구조

### 1단계 — 런 시작 1회

입력: 12일 시세 경로, 96 LOT의 세트 관계, 계열 목록  
출력: 런 전제, 12일 시장 서사, 12개 세트의 제목·비밀·단서

### 2단계 — 날짜마다 1회

입력: 1단계 골격, 해당 날짜 시세, 그날의 8 LOT, 이전 플레이 사건  
출력: 시장 헤드라인과 8개 품목의 표시 이름·설명·풍문·세트 단서·NPC 반응

숫자와 승패는 생성 모델이 다루지 않고 게임 엔진이 유지한다.

## 결과

| 단계 | 시간 | 계약 결과 |
|---|---:|---|
| 런 시작 골격 | 28.274초 | 통과 |
| 일일 생성 최초 시도 | 23.797초 | 실패 |
| 일일 생성 강화 프롬프트 | 19.511초 | 통과 |

최초 일일 생성은 8개 중 한 `lotId`의 문자열을 변형했다. 설명 품질과 무관하게 엔진 데이터에 결합할 수 없으므로 올바르게 실패 처리했다. 정확한 LOT ID 목록을 별도로 강조하고 자동 교정 1회를 추가한 뒤 통과했다.

## 확인된 장점

- 외부 API 없이 실제 한국어 콘텐츠 생성 가능
- 런 전체 연속성과 일일 플레이 반응을 분리 가능
- JSON 계약 실패를 Team Loop 하네스로 차단 가능
- 실패 사례를 그대로 보존해 프롬프트 개선 근거로 사용 가능

## 확인된 위험

- 로컬 모델도 식별자를 변형할 수 있다.
- 약 20~28초가 필요하므로 경매 직전 동기 생성에는 부적합하다.
- 세트 단서의 문학적 품질은 자동 스키마 검사만으로 평가할 수 없다.
- 첫 3일을 선행 생성하거나 백그라운드 생성해야 한다.

## 권장 운용

1. 새 런 생성 화면에서 런 골격을 1회 생성한다.
2. 골격 생성과 동시에 1~3일차를 생성한다.
3. 플레이어가 1일차를 진행하는 동안 4일차를 생성한다.
4. 이후 매일 현재 날짜보다 2일 앞까지 유지한다.
5. 첫 응답 실패 시 낮은 temperature로 1회 자동 교정한다.
6. 두 번째 실패 시 로컬 템플릿을 사용하고 플레이를 계속한다.

## 산출물

- `Runtime/reports/local-model-experiment/run-start-request.json`
- `Runtime/reports/local-model-experiment/run-start-output.json`
- `Runtime/reports/local-model-experiment/day-1-request.json`
- `Runtime/reports/local-model-experiment/day-1-output-first-pass-invalid.json`
- `Runtime/reports/local-model-experiment/day-1-output.json`
- `Runtime/contracts/team-loop-local-generation-harness.json`

스킬/하네스 축약 비교는 `Docs/SKILL-HARNESS-BENCHMARK.md`에 별도로 기록한다.
