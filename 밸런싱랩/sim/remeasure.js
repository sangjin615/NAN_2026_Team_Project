// balance.json 에 맞춘 시뮬로 6.x 를 다시 잰다. 기록된 수치와 하나씩 대조한다.
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./v6-sim.js');
const b = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'balance.json'), 'utf8'));

const SEEDS = Number(process.argv[2] || 900);
const BASE = 900000;

function run(opts) {
  const r = [];
  for (let i = 0; i < SEEDS; i += 1) r.push(S.runCampaign(BASE + i * 7, opts));
  return r;
}
function stat(r) {
  const fin = r.map((x) => x.final);
  const s = [...fin].sort((a, z) => a - z);
  const surv = fin.filter((x) => x > 0).sort((a, z) => a - z);
  return {
    reach: fin.filter((x) => x >= 100000).length / r.length * 100,
    deadlineFail: r.filter((x) => x.deadlineFail).length / r.length * 100,
    ruin: r.filter((x) => x.ruined).length / r.length * 100,
    median: s[Math.floor(s.length / 2)],
    survMedian: surv.length ? surv[Math.floor(surv.length / 2)] : 0,
    setsPerRun: r.reduce((a, x) => a + x.setsDone, 0) / r.length,
    questsPerRun: r.reduce((a, x) => a + x.questsDone, 0) / r.length,
    loansPerRun: r.reduce((a, x) => a + x.loanTaken, 0) / r.length,
    seizure: r.filter((x) => x.loanSeized).length / Math.max(1, r.filter((x) => x.loanTaken).length) * 100,
    interest: r.reduce((a, x) => a + x.loanInterest, 0) / r.length,
    qTry: r.reduce((a, x) => { for (const k in x.qTry) a[k] = (a[k] || 0) + x.qTry[k]; return a; }, {}),
    qOk: r.reduce((a, x) => { for (const k in x.qOk) a[k] = (a[k] || 0) + x.qOk[k]; return a; }, {}),
  };
}
const f1 = (x) => x.toFixed(1);
const n0 = (x) => Math.round(x).toLocaleString();

console.log('\n== balance.json 에 맞춘 시뮬 · 씨앗 ' + SEEDS + ' ==\n');
const base = stat(run({}));
console.log('  도달 ' + f1(base.reach) + '%  마감실패 ' + f1(base.deadlineFail) + '%  파산 ' + f1(base.ruin)
  + '%  중앙값 ' + n0(base.median) + '  생존중앙값 ' + n0(base.survMedian));
console.log('  족보 ' + base.setsPerRun.toFixed(2) + '건/여정 · 의뢰 ' + base.questsPerRun.toFixed(2) + '건/여정');

console.log('\n== 기록된 수치와 대조 ==\n');
const BAND = { reach: [45, 60], deadlineFail: [0, 38], survMedian: [0, 250000] };
const rows = [
  ['balance.measuredAt', b.measuredAt.reach, base.reach, '도달 %'],
  ['balance.measuredAt', b.measuredAt.deadlineFail, base.deadlineFail, '마감실패 %'],
  ['balance.measuredAt', b.measuredAt.ruin, base.ruin, '파산 %'],
  ['balance.measuredAt', b.measuredAt.survivorMedian, base.survMedian, '생존 중앙값'],
  ['sets.measured', b.sets.measured.setsPerRun, base.setsPerRun, '족보/여정'],
  ['loan.measured', b.loan.measured.loansPerRun, base.loansPerRun, '대출/여정'],
  ['loan.measured', b.loan.measured.seizureRate * 100, base.seizure, '압류 %'],
  ['loan.measured', b.loan.measured.interestPerRun, base.interest, '이자/여정'],
];
console.log('  %s', '기록처'.padEnd(20) + '무엇'.padEnd(14) + '기록'.padEnd(12) + '다시 잰 값'.padEnd(12) + '차이');
console.log('  ' + '-'.repeat(72));
for (const [src, was, now, what] of rows) {
  const d = now - was;
  const big = Math.abs(d) > Math.max(2, Math.abs(was) * 0.15);
  console.log('  ' + (big ? '★' : ' ') + ' ' + src.padEnd(20) + what.padEnd(14)
    + String(was < 1000 ? f1(was) : n0(was)).padEnd(12)
    + String(now < 1000 ? f1(now) : n0(now)).padEnd(12)
    + (d >= 0 ? '+' : '') + (Math.abs(d) < 1000 ? f1(d) : n0(d)));
}

console.log('\n== 의뢰 달성률 (보상 산식의 입력) ==\n');
console.log('  %s', '의뢰'.padEnd(12) + '기록 달성률'.padEnd(14) + '다시 잰 값'.padEnd(14) + '기록 보상'.padEnd(12) + '재산정 보상');
console.log('  ' + '-'.repeat(66));
const NAMES = { designated: '지정', multi: '다중', bargain: '차익', restraint: '절제', block: '견제' };
const now = {};
for (const q of Object.keys(NAMES)) {
  const t = base.qTry[q] || 0, o = base.qOk[q] || 0;
  now[q] = t ? o / t : 0;
}
const easiest = Math.max(...Object.values(now));
for (const q of Object.keys(NAMES)) {
  const ratio = now[q] ? easiest / now[q] : 0;
  const reward = Math.round(2000 * ratio / 50) * 50;
  console.log('  ' + NAMES[q].padEnd(12) + f1(b.quests[q].completionRate * 100).padEnd(14)
    + f1(now[q] * 100).padEnd(14) + String(b.quests[q].reward).padEnd(12) + reward);
}

console.log('\n== 밴드 판정 ==\n');
let fail = 0;
for (const [k, [lo, hi]] of Object.entries(BAND)) {
  const v = base[k];
  const ok = v >= lo && v <= hi;
  if (!ok) fail += 1;
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + '  ' + k.padEnd(14) + (v < 1000 ? f1(v) : n0(v))
    + '   밴드 ' + lo + ' ~ ' + (hi >= 1000 ? n0(hi) : hi));
}
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' · 밴드 위반 ' + fail + '\n');
process.exit(fail === 0 ? 0 : 1);
