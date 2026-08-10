# 로컬 모델 API 템플릿 실증 — 2026-08-04

## 결론

현재 2단계 생성 템플릿은 Ollama 로컬 모델로 실제 생성·검증할 수 있다. 자연어 계약만 사용하면 모델이 고정 ID를 축약하거나 누락했지만, 엔진 입력으로 동적 JSON Schema를 구성해 출력 형식을 강제하자 런 청사진과 일일 8 LOT 생성이 모두 첫 시도에 통과했다.

## 성공 실행

| 항목 | 결과 |
|---|---:|
| 모델 | `qwen2.5-coder:14b` |
| 시드 | `api-template-schema-20260804` |
| 런 청사진 | 1차 통과 |
| 런 청사진 지연 | 35,502 ms |
| 시장 서사 | 12일 |
| 세트 | 12개, 입력 ID·순서 일치 |
| 일일 콘텐츠 | 1차 통과 |
| 일일 콘텐츠 지연 | 24,586 ms |
| LOT | 8개, 입력 ID·순서 일치 |
| 설명 중복 | 0개 |
| 금지된 게임 수치 생성 | 없음 |

런 시작 1회와 하루분 8 LOT을 순차 생성한 총 로컬 추론 시간은 약 60.1초다. 실제 게임에서는 런 시작 시 청사진을 한 번 생성하고, 현재 일차와 다음 2일을 버퍼링하면 플레이를 막지 않고 사용할 수 있다.

## 실패에서 확인한 사항

1. `qwen3:14b` 사고 모드를 끄지 않으면 Ollama `response`가 비어 검증에 실패했다.
2. 사고 모드를 끈 뒤에도 자연어 계약만 사용한 `qwen3:14b`와 `qwen2.5-coder:14b`는 12개 세트 ID를 3개로 축약하거나 `set-01`을 `set-1`로 바꿨다.
3. JSON Schema의 `const`와 고정 배열 길이로 엔진 소유 ID를 잠그자 같은 `qwen2.5-coder:14b`가 첫 시도에 통과했다.

따라서 API 연결에서도 프롬프트만 보내는 방식보다 구조화 출력 스키마를 함께 보내는 방식을 사용해야 한다.

## 재현 명령

```powershell
node Runtime/tools/run-local-generation-experiment.mjs qwen2.5-coder:14b api-template-schema-20260804
```

하네스는 각 시도 결과를 보존하고 검증 실패 시 온도 `0.1`로 한 번 재시도한다. 두 번 실패하면 종료 코드 `1`을 반환해 런타임이 로컬 fallback을 선택할 수 있게 한다.

## 산출물

- `Runtime/reports/local-model-experiment/run-start-output-latest.json`
- `Runtime/reports/local-model-experiment/day-1-output-latest.json`
- 시드별 `attempt-*.json` — 성공 및 실패 증거
- `Runtime/tools/run-local-generation-experiment.mjs` — 재현 가능한 Ollama CLI 하네스

