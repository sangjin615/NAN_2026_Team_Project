// 의뢰 보상을 기대값이 같아지게 매긴다. 고정 순서로 고르면 전역 꼴찌가 구조적으로 죽기 때문이다.
//   보상 = (목표기대값 + 수수료) / 달성률
// 그러면 어느 것을 골라도 손해가 아니고, 고르는 이유가 "숫자가 크다" 가 아니라 "오늘 판에 맞는다" 가 된다.
'use strict';
const fs = require('fs');
const path = require('path');
const BP = path.join(__dirname, '..', 'data', 'balance.json');
const b = JSON.parse(fs.readFileSync(BP, 'utf8'));
const TARGET = Number(process.argv[2] || 1000);
const APPLY = process.argv.includes('--apply');
const IDS = ['designated', 'multi', 'bargain', 'restraint', 'block'];
const NAME = { designated: '지정', multi: '다중', bargain: '차익', restraint: '절제', block: '견제' };

console.log('\n== 기대값을 ' + TARGET.toLocaleString() + ' 으로 맞춘다 ==\n');
console.log('  ' + '의뢰'.padEnd(7) + '달성률'.padEnd(9) + '수수료'.padEnd(8)
  + '보상(지금)'.padEnd(12) + '보상(새로)'.padEnd(12) + '기대값(지금)'.padEnd(14) + '기대값(새로)');
console.log('  ' + '-'.repeat(74));
const next = {};
for (const id of IDS) {
  const q = b.quests[id];
  const rate = q.completionRate, fee = q.fee;
  next[id] = Math.round((TARGET + fee) / rate / 50) * 50;
  console.log('  ' + NAME[id].padEnd(6) + (rate * 100).toFixed(1).padEnd(9) + String(fee).padEnd(8)
    + String(q.reward).padEnd(12) + String(next[id]).padEnd(12)
    + String(Math.round(q.reward * rate - fee)).padEnd(14) + Math.round(next[id] * rate - fee));
}
if (!APPLY) { console.log('\n  (적용하려면 --apply)\n'); process.exit(0); }
for (const id of IDS) {
  b.quests[id].previousReward2 = b.quests[id].reward;
  b.quests[id].reward = next[id];
}
b.quests.formula = '보상 = (목표 기대값 ' + TARGET + ' + 수수료) / 달성률. 다섯의 기대값을 같게 맞춘다';
b.quests.formulaWhy = ('옛 산식(2,000 x 난이도비)은 수수료를 안 봤다. 그래서 수수료가 제일 비싼 견제가 '
  + '기대값 꼴찌였고, 3종 제시 x 2건 수주에서는 전역 꼴찌가 구조적으로 절대 안 뽑힌다 - 900판 0회였다. '
  + '기대값을 맞추면 고르는 이유가 숫자가 아니라 오늘 판에 맞는지가 된다');
b.quests.formulaAt = '2026-07-31';
fs.writeFileSync(BP, JSON.stringify(b, null, 2) + '\n', 'utf8');
console.log('\n  적용했다. 옛 값은 previousReward2 로 남겼다\n');
