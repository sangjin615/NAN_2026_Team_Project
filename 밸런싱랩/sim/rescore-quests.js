// 의뢰 보상을 산식대로 다시 매긴다. 달성률은 고정 메뉴로 격리해서 잰다 - 섞어 재면 정책이 섞인다.
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./v6-sim.js');
const BP = path.join(__dirname, '..', 'data', 'balance.json');
const b = JSON.parse(fs.readFileSync(BP, 'utf8'));
const SEEDS = Number(process.argv[2] || 900);
const APPLY = process.argv.includes('--apply');
const IDS = ['designated', 'multi', 'bargain', 'restraint', 'block'];
const NAME = { designated: '지정', multi: '다중', bargain: '차익', restraint: '절제', block: '견제' };

function rateOf(id) {
  let t = 0, o = 0;
  for (let i = 0; i < SEEDS; i += 1) {
    const r = S.runCampaign(900000 + i * 7, { questMenu: [id] });
    t += r.qTry[id] || 0; o += r.qOk[id] || 0;
  }
  return t ? o / t : 0;
}
const rate = {};
for (const id of IDS) rate[id] = rateOf(id);
const easiest = Math.max(...IDS.map((k) => rate[k]));
const reward = {};
for (const id of IDS) reward[id] = Math.round(2000 * (easiest / rate[id]) / 50) * 50;

console.log('\n== 의뢰 난이도 재산정 · 씨앗 ' + SEEDS + ' · 고정 메뉴로 격리 ==\n');
console.log('  ' + '의뢰'.padEnd(8) + '달성률(기록)'.padEnd(16) + '달성률(재측정)'.padEnd(18)
  + '보상(기록)'.padEnd(14) + '보상(재산정)');
console.log('  ' + '-'.repeat(70));
for (const id of IDS.slice().sort((x, y) => reward[x] - reward[y])) {
  const was = b.quests[id];
  const mark = Math.abs(reward[id] - was.reward) > was.reward * 0.15 ? '★' : ' ';
  console.log('  ' + mark + NAME[id].padEnd(7)
    + (was.completionRate * 100).toFixed(1).padEnd(16)
    + (rate[id] * 100).toFixed(1).padEnd(18)
    + String(was.reward).padEnd(14) + reward[id]);
}
console.log('\n  제일 쉬운 것 = ' + NAME[IDS.find((k) => rate[k] === easiest)]
  + ' · 산식 보상 = 2,000 x (제일쉬움 / 이것)');

if (!APPLY) { console.log('\n  (적용하려면 --apply)\n'); process.exit(0); }
for (const id of IDS) {
  b.quests[id].previousReward = b.quests[id].reward;
  b.quests[id].previousCompletionRate = b.quests[id].completionRate;
  b.quests[id].reward = reward[id];
  b.quests[id].completionRate = Number(rate[id].toFixed(3));
  b.quests[id].difficulty = Number((easiest / rate[id]).toFixed(2));
}
b.quests.remeasuredAt = {
  at: '2026-07-31', seeds: SEEDS,
  method: '의뢰마다 고정 메뉴로 하루 1건만 받게 하고 여정 ' + SEEDS + '회. 섞어 받으면 정책이 섞인다',
  why: 'v6-sim 이 balance.json 을 읽게 고친 뒤 처음 잰 값이다. 옛 시뮬은 6.19·6.25·6.34·6.36 이전 상수였다',
  reversal: '기록은 견제가 제일 어렵다고 했는데(4,250) 격리해서 재니 지정이 제일 어렵다. 순서가 뒤집혔다',
};
fs.writeFileSync(BP, JSON.stringify(b, null, 2) + '\n', 'utf8');
console.log('\n  balance.json 에 적용했다. 옛 값은 previousReward 로 남겼다\n');
