# 밸런스 구현 인계

## 기준

- 상태: **검증 후보**
- 구현 필수: **예**
- 단일 기준 파일: `balance/data/balance.json`
- 기준 지문: `crc32:50550179`
- 생성된 실행 규칙: `balance/greybox/rules-v6.js`
- 플레이 안내: `balance/greybox/PLAY.md`
- 밸런싱 랩 안내: `balance/lab/LAB.md`
- 적용 스크립트: `balance/apply-balance.py`

## 구현 AI가 지킬 것

1. 숫자를 HTML이나 코드에 복사해 별도 상수로 굳히지 않는다.
2. 먼저 `balance/data/balance.json`을 읽는다.
3. `balance/greybox/rules-v6.js`이 있으면 기준 파일과 일치하는지 확인한다.
4. null·비활성·삭제 채널을 임의로 복구하지 않는다.
5. 손익분기선과 추천 입찰가를 화면에 새로 표시하지 않는다.
6. 봇의 숨은 품질 지식 여부는 `bots.qualityKnowledge`를 따른다.
7. 밸런스 변경 뒤에는 적용·검사 명령을 통과시킨다.

## 명령

```bash
python balance/apply-balance.py
python balance/apply-balance.py --check
```

## 핵심 값 요약

| 경로 | 값 |
|---|---|
| `run.days` | 12 |
| `run.lotsPerDay` | 8 |
| `run.startCash` | 20000 |
| `run.growth` | 1 |
| `appraisal.rate` | 0.09 |
| `appraisal.errorByDay` | {"1-3":0.35,"4-6":0.2,"7-12":0.1} |
| `loan.limitFromDisposalValue` | 0.45 |
| `loan.repayMultiplier` | 1.9 |
| `loan.termDays` | 2 |
| `loan.minShopStage` | 3 |
| `shop.upgradeCost` | 0 / 7500 / 12000 / 17500 |
| `shop.storage` | 0 / 3 / 4 / 5 / 6 |
| `bots.nemesisInitial` | 25000 |
| `bots.growthPerDay` | 1.155 |
| `bots.bidCapRatio` | 1 |
| `bots.qualityKnowledge` | none |
| `auction.startBidRatio` | 0.5 |
| `auction.minRaiseRate` | 0.1 |
| `measuredAt.reach` | 53.6 |
| `measuredAt.deadlineFail` | 33.2 |
| `measuredAt.survivorMedian` | 213990 |
| `quests.offering` | {"mode":"random3of5","perDay":3,"acceptMax":2,"note":"하루 5종 중 3종을 무작위 제시하고 최대 2건 수주한다. 5종 전부 제시로 하면 왕실 인가장의 값어치가 0 이 된다","acceptancePolicy":"수주는 의무가 아니다. 이미 받은 것과 충돌하면 안 받는 것만으로 도달률이 11%p 오른다 - 화면이 충돌을 보여줘야 한다"} |
| `deadlines.requiredStageByDay` | {"1-3":1,"4-6":2,"7-9":3,"10-12":4} |
| `bankruptcy.condition` | cash <= 0 AND 활성 보유품 0 AND 담보 대출 불가 |

> 이 표는 찾기 쉽게 만든 요약이다. 충돌하면 반드시 단일 기준 파일의 값이 우선한다.

## 플레이테스트 기록

- 없음

## 메모

현재 업로드 자료를 v6.1 밸런스 인계 형식으로 넣은 테스트본
