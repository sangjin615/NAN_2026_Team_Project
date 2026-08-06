# 로컬 생성 모델·템플릿·하네스 벤치마크

측정일: 2026-08-07
환경: NVIDIA GeForce RTX 5070 Ti 16GB, Ollama, 외부 유료 API 호출 없음

## 목적

- 모델 크기 문제와 템플릿·하네스 문제를 분리한다.
- 게임 수치는 엔진이 소유하고 모델은 한국어 서사만 생성한다.
- `run-blueprint`는 런 시작에 한 번, `daily-content`는 하루 8 LOT 단위로 평가한다.
- 1차 생성은 temperature 0.3, 실패 시 temperature 0.1로 한 번만 복구한 뒤 fallback한다.
- 스킬 validator와 Runtime production validator를 구분한다.

## 원인 분리 방법

1. 모델별 capability probe로 JSON Schema, ID 순서 복사, 한국어 출력을 확인한다.
2. 원본 스킬 템플릿과 Runtime 스키마의 사전 호환성을 검사한다.
3. 같은 모델에 호환 스킬 템플릿과 Runtime 강화 템플릿을 적용한다.
4. 같은 템플릿에 JSON Schema와 JSON-only 하네스를 적용한다.
5. 스킬 validator 통과 후에도 Runtime 품질 validator를 별도로 적용한다.
6. 전체 재시도와 실패 LOT 선택 복구를 비교한다.

## 사전 진단

- qwen3 4B, 8B, 14B와 qwen3.5 9B는 모두 capability probe를 통과했다.
- 원본 `generate-auction-content` 스킬 템플릿은 현재 Runtime 응답 스키마에 없는 `questCopy`, `appraisalCopy`, `auctionCopy`, `settlementCopy` 등을 요구한다.
- 따라서 원본 스킬 템플릿 + Runtime 스키마 조합은 모델 실행 전에 `template-harness-incompatible`로 판정해야 한다.
- 비교용 `compact-generation-skill-compatible.txt`는 출력 필드만 Runtime과 맞추고 추가 품질 지시는 넣지 않았다.

## 일차 콘텐츠 1차 선별

각 조합 1회, 최대 2회 생성 기준이다. 모든 구조화 출력 모델은 JSON 형식은 만들었지만, 전체 8 LOT 재생성 방식에서는 production 품질 검증을 통과하지 못했다.

| 모델 | 크기 | 호환 스킬+Schema | Runtime+Schema | Runtime+JSON-only |
|---|---:|---:|---:|---:|
| qwen3:4b | 2.5GB | 0/1 | 0/1 | 0/1 |
| qwen3:8b | 5.2GB | 0/1 | 0/1 | 0/1 |
| qwen3.5:9b | 6.6GB | 0/1 | 0/1 | 0/1 |
| qwen3:14b | 9.3GB | 0/1 | 0/1 | 0/1 |

실패 원인은 동일하지 않았다.

- JSON-only는 shape mismatch, 잘린 JSON, ID 불일치가 증가했다. production에는 정확한 JSON Schema가 필요하다.
- 4B/8B는 길이, 종결형, 카테고리 어휘를 광범위하게 위반했다. 모델 성능 영향이 크다.
- 14B는 두 번째 시도에서 1~2개 LOT만 남는 경우가 많았다. 전체 8개 재생성 방식이 비효율적이었다.
- 스킬 validator는 qwen3.5 9B의 구조적으로 올바른 출력들을 통과시켰지만 Runtime validator는 재질·종결형·길이 오류를 잡았다. 스킬 validator만으로 production 품질을 판정하면 안 된다.

## validator 오탐 교정

qwen3 14B의 `진주 표면에 미세한 긁힘 자국이 드러난다.`가 다음 두 이유로 탈락했다.

- JEW 어휘에 `진주`와 `목걸이`가 없었다.
- 금지어 `힘` 정규식이 `긁힘 자국`의 접미부를 잡았다.

JEW 허용 어휘를 실제 카탈로그에 맞추고 `힘`을 독립 단어로만 검사하도록 수정했다. 품질 기준을 낮춘 것이 아니라 자연스러운 정상 문장에 대한 오탐을 제거한 변경이다.

## 일차 콘텐츠 선택 복구 반복 실험

Runtime 강화 템플릿 + 정확한 JSON Schema로 8 LOT를 생성하고, 실패한 LOT만 temperature 0.1로 한 번 재생성했다.

| 모델 | 반복 | production 통과 | 평균 복구 LOT | 평균 지연 | 평균 생성 토큰 |
|---|---:|---:|---:|---:|---:|
| qwen3.5:9b | 3 | 0/3 | 5.67 | 22.3초 | 1,848 |
| qwen3:14b (초기 day1) | 3 | 3/3 | 0.33 | 18.2초 | 1,149 |

초기 다일자 확장에서는 day2 재생성 문장이 JSON Schema의 최대 길이 경계에서 `세련된 장식`으로 잘려 1건이 fallback했다. 이는 카테고리 지식 부족이 아니라 repair 프롬프트가 스키마의 70자 상한만 믿고 더 짧은 완결 목표를 주지 않은 하네스 문제였다. repair 설명문을 45자 이하, 한 문장, 허용 종결형으로 명시한 최종 하네스 결과는 다음과 같다.

| 입력 | 반복 | production 통과 | fallback | 평균 복구 LOT | 평균 지연 | 평균 생성 토큰 |
|---|---:|---:|---:|---:|---:|---:|
| day1 | 3 | 3/3 | 0 | 1.33 | 19.2초 | 1,400 |
| day2 | 5 | 5/5 | 0 | 1.00 | 18.3초 | 1,343 |
| day3 | 3 | 3/3 | 0 | 3.00 | 20.5초 | 1,499 |
| 합계/가중 평균 | 11 | 11/11 | 0 | 1.64 | 19.2초 | 1,401 |

day3 한 회는 중복 설명 검출 때문에 8 LOT 전체를 복구했다. 따라서 정상적인 필드·카테고리 오류는 선택 복구하되, 출력 전체에 걸친 중복 오류는 전 LOT를 한 번 복구하는 비용 꼬리가 남는다.

일차 콘텐츠의 현재 권고 조합은 **qwen3:14b + Runtime 강화 템플릿 + 길이 제한이 포함된 JSON Schema + 실패 LOT 선택 복구**다. 14B가 더 큰 모델이지만 재생성량이 작아 9B보다 실제 평균 지연과 생성 토큰이 모두 낮았다.

## 런 블루프린트 setwise 반복 실험

프레임을 한 번 생성하고 12개 세트 사건을 각각 분리 생성했다. 세트별 첫 실패만 temperature 0.1로 재시도하고 두 번째 실패는 로컬 세트 템플릿으로 fallback했다.

| 모델 | 런 | 첫 시도 통과 | 재시도 포함 모델 통과 | fallback | 평균 지연 |
|---|---:|---:|---:|---:|---:|
| qwen3.5:9b | 3 | 30/36 | 34/36 | 2/36 | 37.1초 |
| qwen3:14b | 3 | 27/36 | 34/36 | 2/36 | 56.6초 |

블루프린트의 현재 권고 조합은 **qwen3.5:9b + Runtime 강화 템플릿 + frame/setwise Schema 하네스**다. 최종 모델 성공률은 14B와 같고 평균 지연은 약 34% 낮았다.

## 현재 권고 라우팅

| 생성 단계 | 모델 | 템플릿 | 하네스 | 실패 처리 |
|---|---|---|---|---|
| run-blueprint | qwen3.5:9b | Runtime 강화 compact contract | frame 1회 + setwise 12회, 정확한 Schema | 세트별 저온 1회 후 로컬 세트 fallback |
| daily-content | qwen3:14b | Runtime 강화 compact contract | 8 LOT Schema 생성 + 실패 LOT 선택 복구 | 실패 LOT 저온 1회 후 해당 LOT fallback |

단일 모델만 운영해야 한다면 qwen3:14b가 안전하다. 단계별 모델 라우팅이 가능하면 위 조합이 더 빠르고 안정적이다.

## API 연결 전 남은 검증

- 서로 다른 seed와 2~3개 일차 입력으로 일차 콘텐츠 반복 범위를 넓힌다.
- 선택 LOT 복구를 `generation-server.js` production 경로에 적용하고 Runtime API 통합 테스트를 추가한다.
- 블루프린트와 일차 콘텐츠에 각각 독립 timeout과 provenance를 기록한다.
- 로컬에서 최종 템플릿을 고정한 뒤 유료 API 후보 1~2개만 소량 교차 검증한다.
- 유료 API 비교는 스키마 통과율, production 통과율, 재시도율, 입력·출력 토큰, 실제 비용을 같은 보고서 형식으로 기록한다.

## 재현 명령

```powershell
$env:BENCHMARK_MODELS='qwen3:4b,qwen3:8b,qwen3:14b'
$env:BENCHMARK_PROFILES='skill-incompatible-schema,skill-compatible-schema,runtime-schema,runtime-json'
$env:BENCHMARK_TRIALS='1'
node Runtime/tools/benchmark-generation-matrix.mjs

$env:BENCHMARK_MODELS='qwen3.5:9b,qwen3:14b'
$env:BENCHMARK_TRIALS='3'
node Runtime/tools/benchmark-daily-repair-harness.mjs

$env:OLLAMA_MODEL='qwen3.5:9b'
node Runtime/tools/run-setwise-blueprint-experiment.mjs blueprint-repeat
```

원시 산출물은 `Runtime/reports/model-benchmark/`와 `Runtime/reports/live-generation/`에 보존된다.
