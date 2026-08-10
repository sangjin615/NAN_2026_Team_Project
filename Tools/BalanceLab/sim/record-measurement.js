// 측정 결과와 함께 "어느 정책으로 쟀는지" 를 박는다. 이게 없어서 55.6% 를 재현 못 했다.
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./v6-sim.js');
const BP = path.join(__dirname, '..', 'data', 'balance.json');
const b = JSON.parse(fs.readFileSync(BP, 'utf8'));
const SEEDS = 900, BASE = 900000, STEP = 7;

function stat(opts) {
  const r = [];
  for (let i = 0; i < SEEDS; i += 1) r.push(S.runCampaign(BASE + i * STEP, opts));
  const fin = r.map((x) => x.final);
  const surv = fin.filter((x) => x > 0).sort((a, z) => a - z);
  const took = r.filter((x) => x.loanTaken);
  return {
    reach: Number((fin.filter((x) => x >= 100000).length / r.length * 100).toFixed(1)),
    deadlineFail: Number((r.filter((x) => x.deadlineFail).length / r.length * 100).toFixed(1)),
    ruin: Number((r.filter((x) => x.ruined).length / r.length * 100).toFixed(1)),
    survivorMedian: surv.length ? surv[Math.floor(surv.length / 2)] : 0,
    setsPerRun: Number((r.reduce((a, x) => a + x.setsDone, 0) / r.length).toFixed(2)),
    questsPerRun: Number((r.reduce((a, x) => a + x.questsDone, 0) / r.length).toFixed(2)),
    loansPerRun: Number((r.reduce((a, x) => a + x.loanTaken, 0) / r.length).toFixed(2)),
    seizureRate: took.length ? Number((r.filter((x) => x.loanSeized).length / took.length).toFixed(3)) : 0,
    interestPerRun: Math.round(r.reduce((a, x) => a + x.loanInterest, 0) / r.length),
  };
}

// 기준 정책. 여기 없는 손잡이는 시뮬 기본값이다.
const BASELINE = { };                                   // 대출도 의뢰 추격도 안 한다
const WITH_LOAN = { useLoan: true, loanTrigger: 8000 };  // 6.29 가 잰 정책

const prevBlock = (b.quests || {}).blockNeverOffered;
const base = stat(BASELINE);
const loan = stat(WITH_LOAN);

b.measurementPolicy = {
  at: '2026-07-31',
  simulator: 'sim/v6-sim.js (balance.json 을 읽는다. 상수를 직접 안 들고 있다)',
  seeds: SEEDS, seedBase: BASE, seedStep: STEP,
  baseline: {
    opts: BASELINE,
    means: '기준 정책 - 감정하고, 추정 범위 아래를 노리고, 족보가 서면 판다. 대출도 의뢰 추격도 안 한다',
    result: base,
  },
  withLoan: {
    opts: WITH_LOAN,
    means: '위에 대출만 켠다. 6.29 의 대출 수치는 이 정책에서 나온 것이다',
    result: loan,
  },
  why: '수치만 적고 정책을 안 적으면 재현이 안 된다. 2026-07-30 의 55.6% 를 재현 못 한 것이 그 이유였다',
};
b.measuredAt = Object.assign({ seeds: SEEDS, policy: 'measurementPolicy.baseline' }, base);
b.loan.measured = {
  loansPerRun: loan.loansPerRun, seizureRate: loan.seizureRate, interestPerRun: loan.interestPerRun,
  deadlineFailWithout: base.deadlineFail, deadlineFailWith: loan.deadlineFail,
  policy: 'measurementPolicy.withLoan',
};
b.sets.measured = {
  reach: base.reach, deadlineFail: base.deadlineFail, survivorMedian: base.survivorMedian,
  setsPerRun: base.setsPerRun, seeds: SEEDS, policy: 'measurementPolicy.baseline',
};
// 견제가 무작위 제시에서 한 번도 안 뽑히는 것. 값이 아니라 구조라 따로 적는다.
b.quests.blockNeverOffered = {
  at: '2026-07-31',
  finding: '무작위 3종 제시 + 최대 2건 수주 + 선호순 수락이면 견제는 한 번도 수주되지 않는다. 900판에서 0회다',
  why: '선호순(지정-다중-차익-절제-견제)에서 견제가 꼴찌라, 3종 중 견제가 껴도 나머지 둘이 먼저 두 자리를 채운다',
  measuredHow: '고정 메뉴로 강제하면 달성률 49.3% 다. 보상 3,000 은 그 값으로 매긴 것이다',
  meaning: '지금 규칙대로면 견제는 화면에 뜨기만 하고 안 팔린다. 선호순은 정책이지 규칙이 아니므로 사람이 고를 수는 있다',
  needsDecision: true,
};
// 이미 해소로 표시된 것을 다시 덮지 않는다. 매번 덮으면 고친 기록이 사라진다 - 실제로 한 번 지웠다.
if (prevBlock && prevBlock.resolvedAt) b.quests.blockNeverOffered = prevBlock;
fs.writeFileSync(BP, JSON.stringify(b, null, 2) + '\n', 'utf8');

console.log('\n== 측정 정책을 기록에 박았다 ==\n');
console.log('  기준 정책   도달 ' + base.reach + '%  마감실패 ' + base.deadlineFail + '%  파산 ' + base.ruin
  + '%  생존중앙 ' + base.survivorMedian.toLocaleString() + '  족보 ' + base.setsPerRun);
console.log('  대출 켜면   도달 ' + loan.reach + '%  마감실패 ' + loan.deadlineFail + '%'
  + '  대출 ' + loan.loansPerRun + '회  압류 ' + (loan.seizureRate * 100).toFixed(0) + '%  이자 '
  + loan.interestPerRun.toLocaleString());

// 경고는 계산해서 찍는다. 문장을 박아 두면 고쳐진 뒤에도 계속 거짓말을 한다 - 실제로 그랬다.
const BAND = { reach: [45, 60], deadlineFail: [0, 38], survivorMedian: [0, 250000] };
const outOf = (s) => Object.entries(BAND)
  .filter(([k, r]) => s[k] < r[0] || s[k] > r[1]).map(([k]) => k);
for (const pair of [['기준 정책', base], ['대출 켠 정책', loan]]) {
  const bad = outOf(pair[1]);
  console.log('  ' + (bad.length ? '★ ' + pair[0] + ' 이 밴드를 벗어난다: ' + bad.join(' · ')
    : pair[0] + ' 은 밴드 안이다'));
}
console.log('');
