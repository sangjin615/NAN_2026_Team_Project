// 그레이박스를 브라우저 없이 12일 끝까지 클릭한다. 열어보고 아는 건 늦다 - 판정은 exit code 다.
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const HERE = __dirname;

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(44)} ${detail === undefined ? '' : detail}`);
}

// 화면 없는 DOM 흉내. greybox.js 가 만지는 것만 있으면 된다.
function makeDom() {
  const nodes = {};
  const ids = ['lots', 'cur', 'bidzone', 'msg', 'log', 'day', 'cash', 'stage', 'deadline',
    'slots', 'setnow', 'quests', 'info', 'bots', 'loan', 'shop', 'summaryBox', 'summary', 'bidInput'];
  for (const id of ids) nodes[id] = { id, textContent: '', innerHTML: '', value: '', style: {}, disabled: false };
  return { nodes, document: { getElementById: (id) => nodes[id] || (nodes[id] = { id, textContent: '', innerHTML: '', value: '', style: {} }) } };
}

function boot(seed) {
  const dom = makeDom();
  // 기록이 localStorage 에 쌓인다. 시험도 같은 자리를 흉내 내야 실제와 같은 길을 탄다.
  const store = {};
  const sandbox = {
    window: {}, location: { search: '?seed=' + seed },
    URLSearchParams, Math, Number, JSON, Array, Object, String, Set, Boolean, console, Date,
    Blob: function () {},
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; },
    },
    document: dom.document,
  };
  dom.document.createElement = () => ({ click() {}, style: {} });
  sandbox.window.document = dom.document;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(HERE, 'rules-v6.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(HERE, 'greybox.js'), 'utf8'), sandbox);
  return { G: sandbox.window.G, R: sandbox.window.RULES, dom, store };
}

// 한 판을 끝까지 논다. 정책은 단순하다 - 감정하고, 추정 범위 아래를 노리고, 족보가 서면 판다.
function play(seed, opts) {
  // info 손잡이는 예전에 선언만 해 두고 본문에서 한 번도 안 읽혔다 - 지웠다. 정보 구매를 넣으려면 본문에 써야 한다.
  const o = Object.assign({ safety: 0.90, quests: true, loan: true }, opts || {});
  const { G, R, dom } = boot(seed);
  const S = G.S, C = R.CFG;
  let guard = 0;
  while (!S.ended && guard++ < 4000) {
    if (S.phase === 'summary') { G.next(); continue; }
    // 의뢰 - 순수익 순으로 고르고 충돌하면 안 받는다. 시뮬(6.36)과 같은 정책이라야 대역을 비교할 수 있다.
    const PREF = ['designated', 'multi', 'bargain', 'restraint', 'block'];
    if (o.quests) for (const of_ of [...S.offers].sort((a, b) => PREF.indexOf(a.id) - PREF.indexOf(b.id))) {
      if (S.taken.length >= C.questAccept) break;
      if (S.taken.some((t) => (C.questClash[of_.id] || []).includes(t.id))) continue;
      G.quest(of_.id);
    }
    const i = S.lotIndex;
    const l = S.lots[i];
    if (!l) { G.next(); continue; }
    // 감정 - 자산의 5% 안에서
    if (!S.appraised[l.id] && R.appraisalCost(l, S.stage) <= S.cash * 0.05) G.appraise(i);
    const a = S.appraised[l.id];
    const est = a ? (a.low + a.high) / 2 : l.basePrice * 1.0075;
    const ceiling = Math.floor(est * o.safety / (1 + R.feeRate(S.stage)));
    const min = S.leader ? S.bid + R.minRaise(S.bid) : l.startBid;
    const full = S.inventory.length >= R.storageCap(S.stage);
    if (!full && min <= ceiling && min + R.round10(min * R.feeRate(S.stage)) <= S.cash) {
      dom.nodes.bidInput.value = String(min);
      G.bid();
    } else G.pass();
    // 족보가 서면 판다
    if (R.bestSet(S.inventory.filter((x) => !x.locked))) G.set();
    // 재고는 보관칸-2 까지만 들고 간다(시뮬과 같다). 다 들고 있으면 다음 날 못 산다.
    while (S.inventory.filter((x) => !x.locked).length > Math.max(1, R.storageCap(S.stage) - 2)) {
      const k = S.inventory.findIndex((x) => !x.locked);
      if (k < 0) break;
      G.sell(k);
    }
    // 승급은 되는 대로
    G.upgrade();
    if (o.loan && !S.loan && S.cash < 8000) G.loan();
  }
  return { S, R, dom, guard };
}

console.log('\n== 그레이박스를 12일 끝까지 클릭한다 ==\n');
const one = play(20260731);
check('여정이 끝났다', !!one.S.ended, one.S.ended && one.S.ended.type);
check('무한 루프가 아니다', one.guard < 4000, one.guard + '수');
check('12일을 넘지 않는다', one.S.day <= 12, one.S.day);
check('자산이 음수로 안 갔다', one.S.cash >= 0, one.S.cash);
check('보관칸을 안 넘겼다', one.S.inventory.length <= one.R.storageCap(one.S.stage),
  `${one.S.inventory.length} <= ${one.R.storageCap(one.S.stage)}`);
check('화면이 결과를 그렸다', one.dom.nodes.summary.innerHTML.includes(one.S.ended.type));

console.log('\n== 규칙 모듈이 balance.json 과 같은가 ==\n');
// rules-v6.js 는 balance.json 에서 생성된 것이다. 손으로 고치면 조용히 갈라진다 - 실제로 아무도 안 보고 있었다.
{
  const b = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'balance.json'), 'utf8'));
  const { R: RR } = boot(1);
  const K = RR.CFG;
  const PAIRS = [
    ['시작 자금', K.startCash, b.run.startCash],
    ['일수', K.days, b.run.days],
    ['하루 출품', K.lotsPerDay, b.run.lotsPerDay],
    ['보관칸', JSON.stringify(K.storage), JSON.stringify(b.shop.storage)],
    ['승급비', JSON.stringify(K.upgradeCost), JSON.stringify(b.shop.upgradeCost)],
    ['물가 배율', JSON.stringify(K.priceMultiplier), JSON.stringify(b.shop.priceMultiplier)],
    ['납품 완료 보너스', JSON.stringify(K.questCompletionBonus), JSON.stringify(b.quests.rewardPolicy.completionBonusByStage)],
    ['경쟁자 단계별 자금', JSON.stringify(K.bots.capitalByStage), JSON.stringify(b.bots.capitalByStage)],
    ['감정 비율', K.appraisal.rate, b.appraisal.rate],
    ['대출 한도', K.loan.ltv, b.loan.limitFromDisposalValue],
    ['대출 상환', K.loan.repay, b.loan.repayMultiplier],
    ['봇 입찰 상한', K.bots.capRatio, b.bots.bidCapRatio],
    ['숙적 초기 자본', K.bots.initial, b.bots.nemesisInitial],
    ['숙적 성장률', K.bots.growth, b.bots.growthPerDay],
    ['AR phi', K.market.phi, b.market.phi],
    ['충격 sd', K.market.shockSd, b.market.shockSd],
    ['시작가 비율', K.auction.startBidRatio, b.auction.startBidRatio],
    ['족보 수', K.sets.length, b.sets.table.length],
    ['의뢰 수', Object.keys(K.quests).length, 5],
    ['의뢰 보상 · 지정', K.quests.designated.reward, b.quests.designated.reward],
    ['의뢰 보상 · 견제', K.quests.block.reward, b.quests.block.reward],
    ['등급 베타(전설)', K.grades.legendary.beta, b.gradeBeta.legendary],
  ];
  for (const [n, x, y] of PAIRS) check('규칙 = balance · ' + n, String(x) === String(y), `${x} / ${y}`);
}

console.log('\n== 규칙이 화면에서도 지켜지는가 ==\n');
const { G, R, dom } = boot(777);
const S = G.S, C = R.CFG;
check('시작 자산 20,000', S.cash === C.startCash, S.cash);
check('1일차 보관 3칸', R.storageCap(S.stage) === 3, R.storageCap(S.stage));
check('오늘 출품 8건', S.lots.length === 8, S.lots.length);
check('의뢰 3종 제시', S.offers.length === C.questOffer, S.offers.length);
check('경쟁자 3인', S.bots.length === 3, S.bots.map((b) => b.name).join(', '));
// 경쟁자 상한은 정보를 사기 전엔 안 보인다
check('경쟁자 상한이 처음엔 감춰진다', dom.nodes.bots.innerHTML.includes('모름'));
G.info('competitors');
check('사면 보인다', !dom.nodes.bots.innerHTML.includes('모름'));
// 손익분기선 라벨도 추천 입찰가도 없다 (6.36 결정 4)
const screen = Object.values(dom.nodes).map((n) => n.innerHTML + n.textContent).join(' ');
check('손익분기선 라벨이 없다', !screen.includes('손익분기'));
check('추천 입찰가가 없다', !/추천|권장 입찰/.test(screen));
check('기준가는 보인다', dom.nodes.lots.innerHTML.includes('기준가'));
// 최소 응찰 아래로는 못 낸다
const before = S.cash;
dom.nodes.bidInput.value = '1';
G.bid();
check('최소 아래 응찰은 막힌다', S.cash === before && dom.nodes.msg.textContent.includes('최소'), dom.nodes.msg.textContent);
// 감정하면 범위가 뜨고 값이 준다
const c0 = S.cash;
G.appraise(1);
const l1 = S.lots[1];
check('감정하면 값이 준다', S.cash < c0, `−${c0 - S.cash}`);
check('감정은 범위를 준다(확정값이 아니다)', !!S.appraised[l1.id] && S.appraised[l1.id].low < S.appraised[l1.id].high,
  `${S.appraised[l1.id].low} ~ ${S.appraised[l1.id].high}`);
// 대출 해금 단계는 규칙이 정한다. 숫자를 박으면 규칙이 바뀔 때 시험이 거짓말을 한다 - 실제로 그랬다(2 -> 3).
check(`${C.loan.minStage}단계 아래에서는 대출이 막힌다`,
  dom.nodes.loan.innerHTML.includes(`${C.loan.minStage}단계부터`), dom.nodes.loan.innerHTML.slice(0, 40));

// 무작위 비교자로 섞으면 정렬 구현마다 난수 뽑는 수가 달라진다.
// node 와 브라우저가 같은 씨앗에서 다른 판을 냈다(도달 55.8% 대 56.9%). 소스에서 못 들어오게 막는다.
console.log('\n== 씨앗이 엔진을 타지 않는가 ==\n');
{
  const files = ['greybox.js', 'rules-v6.js', path.join('..', 'sim', 'v6-sim.js')];
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(HERE, f), 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return;                       // 주석은 뺀다
      if (/\.sort\(\s*\(\s*\)\s*=>/.test(line)) bad.push(`${f}:${i + 1}`);
    });
  }
  check('무작위 비교자로 정렬하지 않는다', bad.length === 0,
    bad.length ? bad.join(' · ') : files.length + '개 파일');
}

// 기록이 안 쌓이면 플레이테스트가 남는 게 없다. 그리고 기록만으로 판이 재현돼야 의미가 있다.
console.log('\n== 플레이 기록 ==\n');
{
  const b3 = boot(555);
  const S3 = b3.G.S;
  b3.G.appraise(1); b3.G.pass();
  let n3 = 0;
  while (!S3.ended && n3++ < 400) { if (S3.phase === 'summary') b3.G.next(); else b3.G.pass(); }
  const raw = b3.store[Object.keys(b3.store).find((k) => k.includes('log'))];
  check('판이 저장된다', !!raw, raw ? '있다' : '없다');
  const saved = raw ? JSON.parse(raw) : { runs: [] };
  const r0 = saved.runs[0] || {};
  check('시드가 남는다', r0.seed === 555, r0.seed);
  check('누른 순서가 남는다', Array.isArray(r0.acts) && r0.acts.length > 3, (r0.acts || []).length + '수');
  check('결말이 남는다', !!(r0.ended && r0.ended.type), r0.ended && r0.ended.type);
  // 시간이 없으면 "어디서 멈칫했나" 를 못 본다 - 플레이테스트의 알맹이다.
  const withT = (r0.acts || []).filter((x) => x && typeof x.t === 'number' && typeof x.dt === 'number');
  check('수마다 시간이 남는다', withT.length === (r0.acts || []).length,
    `${withT.length} / ${(r0.acts || []).length}`);
  check('시간이 뒤로 안 간다', withT.every((x, i) => i === 0 || x.t >= withT[i - 1].t), 'ok');
  check('한 판 걸린 시간이 남는다', typeof r0.elapsedMs === 'number', r0.elapsedMs + 'ms');
  check('자리 비운 시간을 따로 센다', typeof r0.awayMs === 'number', r0.awayMs + 'ms');
  check('수마다 몇 일차인지 남는다', (r0.acts || []).every((x) => typeof x.day === 'number'), 'ok');
  // 기록만으로 같은 판이 나오는가. 안 나오면 기록이 모자란 것이다.
  const b4 = boot(555);
  for (const a of (r0.acts || [])) {
    // v2 는 {a, v, t, dt, day} 다. replay.js 와 같은 방식으로 읽는다.
    const nm = Array.isArray(a) ? a[0] : a.a;
    const ar = Array.isArray(a) ? a.slice(1) : (a.v || []);
    if (nm === 'bid') { b4.dom.nodes.bidInput.value = ar[0]; b4.G.bid(); } else b4.G[nm](...ar);
  }
  check('기록만으로 같은 판이 나온다',
    b4.G.S.cash === r0.cash && b4.G.S.day === r0.day
      && (b4.G.S.ended || {}).type === (r0.ended || {}).type,
    `${b4.G.S.cash.toLocaleString()} / ${(r0.cash || 0).toLocaleString()}`);
}

// 플레이 안내서가 balance.json 과 어긋나면 사람이 틀린 기대를 갖고 앉는다.
{
  const play = fs.readFileSync(path.join(HERE, 'PLAY.md'), 'utf8');
  const bal = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'balance.json'), 'utf8'));
  const M = bal.measuredAt, LN = bal.loan;
  const has = (s) => play.includes(String(s));
  check('안내서 도달률이 맞다', has(M.reach + '%'), M.reach + '%');
  check('안내서 마감실패가 맞다', has(M.deadlineFail + '%'), M.deadlineFail + '%');
  check('안내서 생존중앙값이 맞다', has(M.survivorMedian.toLocaleString()), M.survivorMedian.toLocaleString());
  check('안내서 대출 조건이 맞다',
    has(Math.round(LN.limitFromDisposalValue * 100) + '%') && has('x' + LN.repayMultiplier.toFixed(2))
      && has(LN.termDays + '일') && has(LN.minShopStage + '단계'),
    `${LN.limitFromDisposalValue} · x${LN.repayMultiplier} · ${LN.termDays}일 · ${LN.minShopStage}단계`);
}

// 사람이 플레이하려면 있어야 하는 것들. 봇은 없어도 도는데 사람은 막힌다.
console.log('\n== 사람이 칠 수 있는가 ==\n');
{
  const b2 = boot(4242);
  const strip = (h) => String(h).replace(/<[^>]+>/g, '');
  // 다음 관문이 미리 보여야 한다. "여유" 만 뜨면 처음 하는 사람은 져 봐야 규칙을 안다.
  const dl0 = strip(b2.dom.nodes.deadline.innerHTML);
  check('1일차에 다음 관문이 보인다', /\d일차까지 \d단계/.test(dl0), dl0);
  check('며칠 남았는지 보인다', /\d일 남음/.test(dl0), dl0);
  const S2 = b2.G.S;
  let n2 = 0;
  while (!S2.ended && n2++ < 500) { if (S2.phase === 'summary') b2.G.next(); else b2.G.pass(); }
  const sum = String(b2.dom.nodes.summary.innerHTML);
  check('끝나면 이유가 뜬다', sum.includes(S2.ended.why), S2.ended.why);
  check('끝나면 다시 할 수 있다', /새 판/.test(sum) && /같은 씨앗/.test(sum),
    (sum.match(/<button[^>]*>[^<]*/g) || []).map((x) => x.replace(/.*>/, '')).join(' · '));
}

console.log('\n== 음성 시험 ==\n');
const t = play(20260731);
check('같은 씨앗은 같은 결과', play(20260731).S.cash === t.S.cash, t.S.cash);
check('다른 씨앗은 다른 결과', play(4242).S.cash !== t.S.cash);
const noQuest = play(20260731, { quests: false });
check('의뢰를 안 받으면 마감에 걸린다',
  noQuest.S.ended.type.includes('마감') || noQuest.S.cash < t.S.cash,
  noQuest.S.ended.type);

console.log('\n== 여러 판을 돌려 시뮬과 같은 대역인가 ==\n');
const runs = [];
for (let i = 0; i < 120; i += 1) runs.push(play(7000 + i * 17));
const fin = runs.map((r) => (r.S.ended.type.includes('실패') || r.S.ended.type === '파산' ? 0 : r.S.cash));
const sorted = [...fin].sort((a, b) => a - b);
const med = sorted[Math.floor(sorted.length / 2)];
const reach = fin.filter((x) => x >= 100000).length / fin.length * 100;
const dl = runs.filter((r) => r.S.ended.type.includes('마감')).length / runs.length * 100;
console.log(`  120판 · 도달 ${reach.toFixed(1)}% · 마감 실패 ${dl.toFixed(1)}% · 중앙값 ${Math.round(med).toLocaleString()}`);
// 시뮬 수치는 balance.json 이 원본이다. 손으로 적으면 또 갈라진다.
const M = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'balance.json'), 'utf8')).measuredAt;
console.log(`  시뮬(씨앗 ${M.seeds}) · 도달 ${M.reach}% · 마감 실패 ${M.deadlineFail}% · 생존중앙 ${M.survivorMedian.toLocaleString()}`);
// 밴드는 사람이 승인한 기준이다(2026-07-31). +-25 여유로 재면 15.6pp 벌어진 것도 통과한다.
check('도달률이 승인 밴드(45~60%) 안이다', reach >= 45 && reach <= 60, reach.toFixed(1) + '%');
check('마감 실패가 밴드(<38%) 안이다', dl < 38, dl.toFixed(1) + '%');
check('생존 중앙값이 밴드(<=250,000) 안이다', med <= 250000, Math.round(med).toLocaleString());
check('아무도 안 죽는 판이 아니다', dl > 0 || reach < 100, `마감 ${dl.toFixed(1)}%`);
console.log('');
console.log('  이 시험의 자동 플레이 정책은 시뮬 정책보다 약하다 - 안전계수 0.90 고정이고 의뢰별 상한 당김이 없다.');
console.log('  같은 규칙에 안전계수만 1.00 으로 올리면 도달 53.8% 로 붙는다(600판 측정). 규칙 탓이 아니라 정책 탓이다.');

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} · 위반 ${failures}\n`);
process.exit(failures === 0 ? 0 : 1);
