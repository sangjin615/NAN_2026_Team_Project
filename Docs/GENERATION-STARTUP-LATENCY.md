# 새 게임 첫 진입이 왜 오래 걸리나 — 그리고 무엇을 하기로 했나

착수 전 상태로 남긴다. 2026-08-07 기준이며 `src/app.js` 를 아직 고치지 않았다.

## 측정된 임계 경로

`newRun(seed)` 가 순차로 두 번 기다린다. `src/app.js` 의 `prepareRun` 과 첫
`ensure` 다.

```js
state.generationBlueprint = await generation.prepareRun({ ... });        // 15~35초
await generation.ensure({ currentDay: 1, schedule, sets, aheadDays: 0 }); // 23초
```

합쳐서 **38~58초**다(AWS 라우터 경로 실측 기준. 로컬 qwen3:14b 면 훨씬 길다).
`schedule` 과 `sets` 생성은 로컬 계산이라 무시할 수 있다.

2·3일차는 이미 `renderHub()` 뒤에서 백그라운드로 돈다. **문제는 이 첫 두 건뿐이다.**

## 날짜를 넘길 때도 멈춘다 — 그리고 여기가 더 나쁘다

`nextDay()` 가 `src/app.js` 에서 이렇게 기다린다.

```js
nextDayButton.disabled = true;
...
await generation.ensure({ currentDay: state.day, schedule: state.schedule, sets: state.sets });
```

`aheadDays` 기본값이 2 이므로 N 일차로 넘어가면 **N·N+1·N+2** 를 요구한다.
N 과 N+1 은 이미 있으니 **N+2 한 건을 새로 만들고 그것을 기다린다.**

`newRun` 이 띄워둔 백그라운드 생성은 2·3일차까지만 채운다(`app.js` 의
`ensure(...).then(save)`). 그 뒤로는 뒤에서 채우는 것이 없다. 따라서
**2일차부터 10일차까지 거의 매번 날짜 전환이 일자 생성 1건만큼 멈춘다.**
실측으로 16~29초다.

**그동안 화면에 나오는 것은 비활성화된 버튼 하나뿐이다.** 로딩창도 진행
표시도 없다. 첫 진입 38~58초보다 이쪽이 더 자주 일어난다.

### 두 가지 길 — 로딩창보다 먼저 볼 것이 있다

**(가) 날짜 전환에 로딩창을 넣는다.** 기다림을 설명한다. 다만 기다림 자체는
그대로다.

**(나) 기다리지 않게 한다.** `newRun` 이 이미 쓰는 방식이 있다 — 들어갈 날만
기다리고 앞당김은 뒤로 돌린다.

```js
await generation.ensure({ currentDay: state.day, schedule, sets, aheadDays: 0 });
renderHub();
generation.ensure({ currentDay: state.day, schedule, sets }).then(save);
```

버퍼가 따뜻하면 N 일차는 이미 있으므로 첫 줄이 즉시 끝나고 전환이 **즉시**
된다. N+1·N+2 는 플레이하는 동안 채워진다.

**(나) 를 먼저 검토할 것.** 로딩창으로 덮으면 없앨 수 있었던 기다림이 영구히
남는다. 다만 버퍼가 못 따라간 경우(연속으로 빨리 넘기거나 공급자가 느릴 때)에는
여전히 기다리므로, **(나) 뒤에도 (가) 가 필요하다.** 순서가 중요하다.

아직 둘 다 하지 않았다. 2026-08-07 시점의 판단만 적어 둔다.

## 하기로 한 것 — 저장 슬롯 화면에서 미리 만든다

타이틀 화면이 아니라 **저장 슬롯 화면**에서 시작한다. 이미 "새 게임"을 누른
뒤라 의도가 확실하고, 시드 입력칸이 그 화면에 있다.

- 슬롯 화면에 들어올 때 시드를 미리 뽑고, 그 시드로 `prepareRun` 을 시작한다
- 플레이어가 슬롯을 고르고 시드를 확인하는 시간이 그대로 벌이가 된다
- 시작할 때 `#seed` 가 비어 있으면 미리 만든 것을 쓰고, 직접 입력했으면 버리고
  다시 만든다
- 슬롯 화면에서 뒤로 나가면 그때만 낭비다

### 왜 타이틀이 아닌가

시드가 없기 때문이다. `src/app.js` 에서 시드는 시작 버튼을 누르는 순간
`#seed` 값 또는 `randomRunSeed()` 로 정해진다. 타이틀에서 미리 만들려면 시드를
먼저 뽑아둬야 하고, 플레이어가 이어하기를 누르면 통째로 버려진다.

버리는 양이 작지 않다. **blueprint 1건이 공급자 호출 13회, day1 이 9회다.**
타이틀만 열고 나가면 22회가 날아간다. 돈과 rate limit 을 함께 쓴다 — 2026-08-07
에 groq 가 조직 TPM 429 로 떨어진 그 예산이다.

## 기각한 대안 — blueprint 와 day1 병렬화

23초가 사라지므로 가장 매력적으로 보인다. 그리고 **기술적으로 가능하다.**
`generation-api-provider.js` 의 `generateDay` 가 blueprint 를 전부 `||` 로
감싸고 있어 없어도 돌아간다.

```js
premise: blueprint?.premise || '',
market: blueprint?.marketArc?.[day - 1] || null,
sets: (blueprint?.sets || sets).filter(...),
```

**그래서 안 한다.** 그렇게 하면 1일차 물품 설명이 그 판의 전제도 세트 사건도
모르는 채로 만들어진다. blueprint 를 먼저 만드는 이유가 그 공유 맥락인데
1일차만 그것을 잃는다. 속도를 위해 게임의 첫인상을 깎는 거래다.

되살릴 조건: 1일차 품질 저하가 실제로 눈에 띄지 않는다고 확인되면 그때 다시
검토한다. 확인 없이 넣지 않는다.

## 착수 조건

`src/app.js` 는 `Docs/PARALLEL-SESSION-NOTES.md` 가 **양쪽이 함께 만지는
파일**로 지목한 곳이다. 이 문서를 쓰는 시점에 다른 실행자가 `app.js`,
`runtime-fixes.css`, `runtime.test.js` 에 커밋하지 않은 수정을 들고 있었다.

**그쪽이 커밋한 뒤 최신 tip 에서 시작한다.** 겹치는 지점은 `newRun` 과 저장
슬롯 화면 렌더(`renderSaveSlots`)다.

`renderSaveSlots` 를 건드리면 `adapter.refreshBindings()` 규칙에 걸린다 —
`AGENTS.md` 를 볼 것. `npm run audit` 이 잡는다.

## 로딩창 최소 표시 시간

`newRun` 끝에 바닥값이 있다. 생성이 즉시 끝나도 그만큼은 로딩창을 보여준다.

```js
const remainingMs = 2000 - (performance.now() - loadingStartedAt);
```

**900ms 였던 것을 2026-08-07 에 2초로 올렸다.** static 응답으로 돌려보니
로딩창이 한순간 떴다 사라져서 준비가 된 것이 아니라 무언가 잘못된 것처럼
보였다.

이 값은 선행 생성이 들어간 뒤 **곧 전체 대기 시간이 된다.** 미리 만들어두면
`newRun` 이 기다릴 것이 없어지므로 남는 것은 이 바닥값뿐이다. 즉 목표 상태의
체감은 "2초 로딩" 이다.

## 참고

로딩 화면에는 이미 `#skip-generation`(기다리지 않고 시작) 이 있다. 최악의 대기는
이미 중단 가능하다. 이 작업은 그 버튼을 누를 이유를 줄이는 것이지 없던 탈출구를
만드는 것이 아니다.

**날짜 전환에는 그 탈출구조차 없다.** 위의 "날짜를 넘길 때도 멈춘다" 를 볼 것.
