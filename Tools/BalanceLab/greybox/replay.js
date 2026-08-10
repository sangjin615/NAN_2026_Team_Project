// 플레이 기록을 다시 돌려 같은 판이 나오는지 본다.
// 안 나오면 기록이 모자란 것이다 - 그러면 플레이테스트 결과를 믿을 수 없다. 판정은 exit code 다.
//   node replay.js playtest-3판.json
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const HERE = __dirname;

function boot(seed) {
  const nodes = {};
  const ids = ['lots', 'cur', 'bidzone', 'msg', 'log', 'day', 'cash', 'stage', 'deadline', 'slots',
    'setnow', 'quests', 'info', 'bots', 'loan', 'shop', 'summaryBox', 'summary', 'bidInput'];
  for (const id of ids) nodes[id] = { id, textContent: '', innerHTML: '', value: '', style: {}, disabled: false };
  const store = {};
  const sandbox = {
    window: {}, location: { search: '?seed=' + seed },
    URLSearchParams, Math, Number, JSON, Array, Object, String, Set, Boolean, console, Date,
    Blob: function () {}, localStorage: {
      getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; },
    },
    document: {
      getElementById: (i) => nodes[i] || (nodes[i] = { id: i, textContent: '', innerHTML: '', value: '', style: {} }),
      createElement: () => ({ click() {}, style: {} }),
    },
  };
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(HERE, 'rules-v6.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(HERE, 'greybox.js'), 'utf8'), sandbox);
  return { G: sandbox.window.G, nodes, store };
}

const file = process.argv[2];
if (!file) { console.log('쓰는 법: node replay.js <기록.json>   ·   자기시험: node replay.js --selftest'); process.exit(2); }

// 자기시험 - 판을 하나 두고, 그 기록만으로 같은 판이 나오는지 본다.
// 기록·재현 고리가 살아 있는지를 파일 없이 확인한다. 규칙이 바뀌면 여기서 먼저 걸린다.
let log;
if (file === '--selftest') {
  const b0 = boot(20260731);
  const S0 = b0.G.S;
  b0.G.appraise(1); b0.G.pass();
  let n0 = 0;
  while (!S0.ended && n0++ < 500) { if (S0.phase === 'summary') b0.G.next(); else b0.G.pass(); }
  const raw = b0.store[Object.keys(b0.store).find((k) => k.includes('log'))];
  if (!raw) { console.log('FAIL · 기록이 안 쌓였다'); process.exit(1); }
  log = JSON.parse(raw);
  console.log('\n(자기시험 - 판 하나를 두고 그 기록을 다시 돌린다)');
} else {
  log = JSON.parse(fs.readFileSync(file, 'utf8'));
}
const runs = log.runs || [];
console.log('\n== 기록 ' + runs.length + '판을 다시 돌린다 ==\n');
console.log('  ' + '씨앗'.padEnd(10) + '수'.padEnd(6) + '기록된 결말'.padEnd(18)
  + '다시 돌린 결말'.padEnd(18) + '자산'.padEnd(20) + '판정');
console.log('  ' + '-'.repeat(88));

let bad = 0;
for (const r of runs) {
  const { G, nodes } = boot(r.seed);
  for (const raw of r.acts) {
    // v1 은 ['bid','6000'], v2 는 {a:'bid', v:['6000'], t, dt, day}. 둘 다 읽는다.
    const name = Array.isArray(raw) ? raw[0] : raw.a;
    const args = Array.isArray(raw) ? raw.slice(1) : (raw.v || []);
    if (typeof G[name] !== 'function') { console.log('  ★ 없는 행동: ' + name); bad += 1; break; }
    if (name === 'bid') { nodes.bidInput.value = args[0]; G.bid(); } else G[name](...args);
  }
  const S = G.S;
  const gotType = S.ended ? S.ended.type : '(안 끝남)';
  const wantType = r.ended ? r.ended.type : '(안 끝남)';
  const same = gotType === wantType && S.cash === r.cash && S.day === r.day;
  if (!same) bad += 1;
  console.log('  ' + String(r.seed).padEnd(10) + String(r.acts.length).padEnd(6)
    + wantType.padEnd(18) + gotType.padEnd(18)
    + (r.cash.toLocaleString() + ' / ' + S.cash.toLocaleString()).padEnd(20)
    + (same ? 'O' : '★ 다르다'));
}
// 시간이 담긴 판은 어디서 오래 멈췄는지도 보여준다. 재현과 별개로, 이게 플레이테스트의 알맹이다.
const timed = runs.filter((r) => (r.acts || []).some((x) => x && typeof x.dt === 'number'));
if (timed.length) {
  console.log('\n== 어디서 오래 멈췄나 ==\n');
  const byAct = {};
  for (const r of timed) {
    for (const x of r.acts) {
      if (!x || typeof x.dt !== 'number') continue;
      (byAct[x.a] = byAct[x.a] || []).push(x.dt);
    }
  }
  const rows = Object.entries(byAct).map(([k, v]) => {
    const s = [...v].sort((a, z) => a - z);
    return [k, v.length, s[Math.floor(s.length / 2)], s[s.length - 1]];
  }).sort((a, z) => z[2] - a[2]);
  console.log('  ' + '행동'.padEnd(12) + '수'.padEnd(7) + '중앙 간격'.padEnd(12) + '제일 오래');
  console.log('  ' + '-'.repeat(46));
  for (const row of rows) {
    console.log('  ' + row[0].padEnd(11) + String(row[1]).padEnd(7)
      + ((row[2] / 1000).toFixed(1) + '초').padEnd(12) + (row[3] / 1000).toFixed(1) + '초');
  }
  for (const r of timed) {
    if (typeof r.elapsedMs !== 'number') continue;
    console.log('\n  씨앗 ' + r.seed + ' · 한 판 ' + (r.elapsedMs / 60000).toFixed(1) + '분'
      + (r.awayMs ? ' (자리 비움 ' + (r.awayMs / 60000).toFixed(1) + '분은 뺐다)' : ''));
  }
}

console.log('\n' + (bad === 0 ? 'PASS' : 'FAIL') + ' · 재현 안 되는 판 ' + bad + '\n');
process.exit(bad === 0 ? 0 : 1);
