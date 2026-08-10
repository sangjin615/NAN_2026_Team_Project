# 데이터 계약을 채웠다 — v1.5 툴 출력형

원본 팩을 그대로 두고 **계약 부분만 채운 사본**이다. 원본 zip은 안 건드렸다.
`verify-contracts.py`가 계약이 실제로 닫혔는지 exit code로 판정한다. **위반 0.**

```bash
python verify-contracts.py .
```

---

## 1. 채우기 전에 비어 있던 것

| | 상태 |
| --- | --- |
| `contracts` 등록소 | **통째로 없었다** (`actions`·`dataPaths`만 따로 있었다) |
| 데이터 경로 75개의 타입 | **0개** |
| 데이터 경로 75개의 소유 시스템 | **0개** |
| 데이터 경로 75개의 주석 | **0개** |
| 행동 48개의 읽기·쓰기 참조 | **0개** |
| 핀·영역 122개의 `dataRefs` | **52개 비어 있었다** |

**행동에 읽기·쓰기가 없으면 계약이 그림이다.** `preconditions`와 `successResults`가 산문으로 있었지만
기계가 대조할 수 있는 참조가 없었다.

## 2. 채운 것

```
시스템     15    "누가 이 값을 쓰는가" 로 갈랐다. 씬 묶음이 아니다
타입       15    Lot · Bot · Tycoon · Appraisal · InventoryItem · Quest ·
                SetContract · Loan · Relic · MarketEvent · SaveSlot ·
                BidLogEntry · AuctionResult · Ending · Settings
데이터      75    전부 타입 · 소유 시스템 · 출처(engine|derived|user) · 주석
행동        48    전부 readRefs · writeRefs
핀         39    비어 있던 dataRefs 를 채웠다 (나머지 13개는 아래 참조)
```

### 시스템을 가른 기준

씬이 아니라 **값의 주인**으로 갈랐다. 예를 들어 `player.cash`는 도시·경매·거래소·조합에서 다 쓰이지만
주인은 `sys-inventory` 하나다. 주인이 둘이면 누가 고쳐야 하는지 알 수 없다.

### 주석에 남긴 것

값을 다시 적지 않고 **왜 그런지**를 적었다.

```
run.day                  1~12. 감정 정밀도·봇 자금·물가가 전부 이 값에서 파생된다
auction.currentBid       낙찰가는 플레이어가 쓴 값이 아니라 이 값이다
auction.bidLog           패찰 사유를 사람이 알 수 있게 하는 유일한 자리다
player.inventory         locked 인 것은 담보라 못 판다
run.startCash            절제 의뢰의 기준이라 여정 내내 불변이어야 한다
competitor.bennettRumor  소문이 없으면 갑자기 낙찰이 안 되는 이유를 알 수 없다
shop.deadlineRequiredStage  4일차 전 2단계 · 7일차 전 3단계 · 10일차 전 4단계
```

## 3. 6절과 갈리는 자리 — **덮지 않고 표시만 했다**

v1.5가 이미 정한 값이 있어서 **그쪽을 그대로 뒀다.** 주석에 양쪽을 같이 적었다.

| 경로 | v1.5 결정 | 6절 | 어떻게 했나 |
| --- | --- | --- | --- |
| `loan.principal` | 처분가의 **70%** | 60% | v1.5 값 유지, 주석에 병기 |
| `loan.repay` | 원금 × **1.10** | ×1.45 | v1.5 값 유지, 주석에 병기 |
| `shop.upgradeCost` | 시험값 | **미결**(6.6) | "곡선 미결"이라고 적었다 |

**기준 변경은 내가 할 일이 아니라서 표시만 했다.** 어느 쪽으로 갈지는 결정 사항이다.

## 4. 채우면서 나온 구멍 둘

**하나 — 고아 경로.** `shop.displayName`을 아무 행동도 읽지도 쓰지도 않았다.
`act-start-new-run`과 `act-upgrade-shop`의 쓰기에 넣었다.

**둘 — 아무도 안 쓰는 경로 12개.** 선언만 되고 쓰는 주체가 없었다.

```
market.history · relicAuction.wins · run.totalDays · run.ending.reason
campaign.highTierWins · shop.deadlineRequiredStage · loan.collateralDisposalValue
auction.minimumRaise ...
```

쓰는 행동을 찾아 넣어 **12개 → 3개**로 줄었다. 남은 셋은 정당하다.

| 남은 것 | 왜 괜찮나 |
| --- | --- |
| `shop.upgradeCost` | `shop.stage`에서 파생. 저장되는 값이 아니다 |
| `tutorial.step` · `ui.lastMessage` | 표시 계층. 판정에 안 들어간다 |

## 5. 검사가 재는 것

```
1. 빈 곳이 남았는가
   - 모든 경로에 타입 · 소유 시스템이 있다
   - 모든 행동에 읽기 · 쓰기가 있다
   - 핀의 데이터 참조가 그 행동이 읽는 것과 같다

2. 가리키는 것이 실제로 있는가 (fail-closed)
   - 행동의 읽기 · 쓰기가 전부 선언된 경로다
   - 핀의 데이터 · 행동 참조가 전부 존재한다
   - 소유 시스템이 전부 등록된 시스템이다
   - 이동 대상 씬이 전부 존재한다

3. 아무도 안 쓰는 것이 있는가

4. 계약 등록소가 툴 형식에 맞는가 (다섯 갈래 · 개수 일치 · id 존재)

5. 음성 시험 — 없는 경로 / 없는 시스템을 넣으면 잡히는가
```

**검사를 한 번 고쳤다.** 처음엔 *"행동을 가진 핀은 데이터 참조를 갖는다"* 로 썼는데,
`나가기`·`돌아가기`·`탭 전환`처럼 **아무 상태도 안 읽는 행동**까지 데이터를 요구해서 잘못 걸렸다.
*"핀의 데이터 참조가 그 행동이 읽는 것과 같다"* 로 바꿨다 — **완화가 아니라 더 강한 규칙이다.**

## 6. 참고 — 타입 10개가 "안 쓰이는 것"으로 나온다

`Appraisal` · `Loan` · `Quest` 같은 것들이다. **구멍이 아니다.**
`Map<lotId, Appraisal>`처럼 **다른 타입의 필드 안에서 쓰인다** — 검사가 `typeRef` 정확일치만 보기 때문이다.
지금은 참고 출력으로만 낸다.

## 7. 바뀐 파일

```
flow.json               contracts 등록소 추가 · dataPaths 채움 · actions 채움 · 핀 dataRefs 채움
contracts.json          Visual Spec Lite 가 읽는 등록소 (신규)
spec/data-paths.json    타입 · 소유 · 출처 · 주석 추가
spec/actions.json       readRefs · writeRefs 추가
fill-contracts.py       채우기 스크립트 — 표에 없는 경로·행동이 있으면 실패로 보고한다
verify-contracts.py     계약이 닫혔는지 재는 검사
```

나머지는 원본 그대로다.
