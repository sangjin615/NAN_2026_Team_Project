// 96종 고정 풀 모형. 상수는 balance.json 이 정한다 - 이 파일에 값을 적지 않는다.
// 2026-07-31: 옛 판은 상수를 직접 들고 있었고 6.19·6.25·6.34·6.36 이전 값에 멈춰 있었다.
'use strict';

const round10 = (n) => Math.ceil(n / 10) * 10;
const round100 = (n) => Math.ceil(n / 100) * 100;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 상수는 갈아끼울 수 있다. 밸런싱 툴이 값을 바꿔가며 재려면 필요하다.
// let 인 이유가 이것이다 - 함수들이 호출 시점에 읽으므로 configure 로 통째로 바꿔도 된다.
let B, GRADE, QUALITY, FAMILIES, PER_FAMILY;
function configure(loaded) {
  ({ B, GRADE, QUALITY, FAMILIES, PER_FAMILY } = loaded);
  return loaded;
}
if (typeof require !== 'undefined') configure(require('./from-balance.js'));

const GRADE_ORDER = ['common', 'rare', 'epic', 'legendary'];

// 6.6 성장 브랜치 4종. 6.27 에서 기각됐다 - cfg.branches 로 켤 때만 쓴다. 상회 등급은 보관칸(의무), 브랜치는 효율(선택)이다.
// 값은 6.6 의 표 그대로. 비용은 값어치의 1/2.5.
const BRANCH = {
  info:    { effect: [0, 0.10, 0.20, 0.30, 0.40], cost: [0, 600, 1250, 1900, 2550] },
  trade:   { effect: [0.05, 0.03, 0.01, 0.00],    cost: [0, 1250, 2550, 3200] },
  storage: { effect: [0, 0.10, 0.20, 0.30, 0.40], cost: [0, 1050, 2100, 3200, 4250] },
  network: { effect: [0, 0.10, 0.20, 0.30, 0.40], cost: [0, 1250, 2550, 3850, 5100] },
};

// 무작위 비교자로 섞으면 안 된다. 정렬 구현마다 비교 횟수가 달라서 난수를 뽑는 수도 달라진다 -
// node 와 브라우저가 같은 씨앗에서 다른 판을 냈다(도달 55.8% 대 56.9%). 뽑는 수가 고정인 방식으로 바꾼다.
function shuffled(arr, R) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(R() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

function makeRandom(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function gaussian(R) { const u = Math.max(1e-9, R()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); }
function pickQuality(R) { let x = R() * 100; for (const [k, w] of QUALITY) { x -= w; if (x <= 0) return k; } return 1.60; }

// 96종 풀. 여정 시작에 한 번 만들고 12일 x 8점으로 나눠 쓴다 - 무작위 생성이 아니다.
function makePool(R) {
  const pool = [];
  for (const f of FAMILIES) {
    for (const [grade, n] of PER_FAMILY) {
      for (let i = 0; i < n; i += 1) {
        pool.push({ id: `${f}-${grade}-${i}`, family: f, grade,
          basePrice: GRADE[grade].base, quality: pickQuality(R) });
      }
    }
  }
  return pool.map((x) => ({ x, k: R() })).sort((a, b) => a.k - b.k).map((o) => o.x);
}

// 6.13 시세. 계열 지수는 AR(1) 평균회귀, 등급 민감도 β 로 갈린다.
function stepIndex(prev, R) { return 1 + B.phi * (prev - 1) + gaussian(R) * B.shockSd; }
function demandOf(item, index) { return B.expectedDemand + GRADE[item.grade].beta * ((index[item.family] || 1) - 1); }
// 손상품은 팔 때 깎인다. 감정할 이유를 만드는 자리다.
function disposalValue(item, index) {
  const pen = (item.quality === B.damagedK) ? B.damagedSale : 1;
  return round10(item.basePrice * item.quality * demandOf(item, index) * pen);
}

function makeBots(day, R, stage = 1) {
  const nem = B.botCapital[stage];
  const bots = [{ id: 'bennett', nemesis: true, target: FAMILIES[Math.floor(R() * 6)], cash: nem }];
  for (let i = 0; i < B.drifterCount; i += 1)
    bots.push({ id: 'd' + i, nemesis: false, target: FAMILIES[Math.floor(R() * 6)],
      cash: nem });
  return bots;
}
// 봇도 품질을 모른다. V5 v1.1->v1.5 가 "일반 봇이 숨은 실제 품질을 직접 읽지 않도록" 고쳤다.
// 이걸 안 옮기면 봇이 완벽한 감정사라 플레이어가 정보로 이길 수가 없다.
function botCap(b, l, index, R) {
  const affinity = b.target === l.family ? 1.18 : 1;
  const risk = { common: 0.9, rare: 1, epic: 1.05, legendary: 1.1 }[l.grade];
  // 봇이 품질을 어떻게 보나. blind 면 아예 안 본다 - 공개 기저가의 기대값으로만 부른다.
  // 그래야 손상품이 제값처럼 팔려 올라가고, 눈 감고 산 사람이 진짜로 손해를 본다.
  const seen = B.botQualityMode === 'blind'
    ? 1.0075
    : (B.botQualityError > 0 ? Math.max(0.35, l.quality * (1 + (R() * 2 - 1) * B.botQualityError)) : l.quality);
  const want = round10(l.basePrice * seen * demandOf(l, index) * affinity * risk * (0.78 + R() * 0.30));
  return Math.min(b.cash * B.bidCapRatio, want);
}

// 공개 호가 한 판. 낙찰가는 플레이어가 쓴 값이 아니라 경쟁자 위 최소폭이다.
function runLot(l, bots, ceiling, cash, stage, index, R, cfg) {
  const startBid = round100(l.basePrice * cfg.startBidRatio);
  let bid = startBid, leader = null, playerBid = false;
  const passed = new Set();
  const raise = () => Math.max(10, round10(bid * cfg.minRaiseRate));
  const cycle = () => {
    for (const b of bots) {
      if (passed.has(b.id)) continue;
      if (bid + raise() <= botCap(b, l, index, R) && R() < 0.78) { bid += raise(); leader = b.id; return false; }
      passed.add(b.id);
    }
    return true;
  };
  if (!(ceiling >= startBid && startBid * (1 + B.fees[stage]) <= cash)) {
    while (!cycle()) { /* 봇끼리 */ }
    return { winner: leader, price: bid, playerBid: false, startBid };
  }
  leader = 'player'; playerBid = true;
  for (let g = 0; g < 500; g += 1) {
    if (cycle()) return { winner: 'player', price: bid, playerBid, startBid };
    if (bid + raise() > ceiling || (bid + raise()) * (1 + B.fees[stage]) > cash) return { winner: leader, price: bid, playerBid, startBid };
    bid += raise(); leader = 'player'; playerBid = true;
  }
  return { winner: leader, price: bid, playerBid, startBid };
}

// 족보 판정. 팔려는 묶음이 족보를 이루면 배수가 붙는다 - 수락도 이행도 없다.
function bestSet(inv) {
  // 손상품은 족보에 못 낀다 - 노리고 샀는데 손상이면 계획이 깨진다.
  if (B.damagedNoSet) inv = inv.filter((x) => x.quality !== B.damagedK);
  const byFam = {};
  for (const x of inv) (byFam[x.family] = byFam[x.family] || []).push(x);
  let best = null;
  const take = (def, combo) => {
    if (!def || !combo) return;   // 목록에 없는 족보면 def 가 undefined 다
    if (!best || def.mult > best.def.mult) best = { def, combo };
  };
  // 풀하우스 - 6계열 각 1점
  const fh = [];
  for (const f of FAMILIES) { const x = (byFam[f] || [])[0]; if (x) fh.push(x); }
  if (fh.length === 6) take(B.sets.find((s) => s.id === 'fullhouse'), fh);
  for (const arr of Object.values(byFam)) {
    const hi = arr.filter((x) => x.grade === 'epic' || x.grade === 'legendary');
    if (hi.length >= 3) take(B.sets.find((s) => s.id === 'royal'), hi.slice(0, 3));
    // 스트레이트 - 같은 계열의 서로 다른 등급 3점 (2026-07-30 완화: 4등급 -> 3등급)
    const st = [];
    for (const g of GRADE_ORDER) { const x = arr.find((i) => i.grade === g && !st.includes(i)); if (x && st.length < 3) st.push(x); }
    if (st.length === 3) take(B.sets.find((s) => s.id === 'straight'), st);
    const byGrade = {};
    arr.forEach((x) => (byGrade[x.grade] = byGrade[x.grade] || []).push(x));
    // 정렬 - 같은 계열 + 같은 등급 2점 (2026-07-30 완화: 3점 -> 2점)
    const al = Object.values(byGrade).find((x) => x.length >= 2);
    if (al) take(B.sets.find((s) => s.id === 'align'), al.slice(0, 2));
    if (arr.length >= 3) take(B.sets.find((s) => s.id === 'triple'), arr.slice(0, 3));
    if (arr.length >= 2) take(B.sets.find((s) => s.id === 'pair'), arr.slice(0, 2));
  }
  return best;
}

function appraisalError(day) {
  for (const [a, b, e] of B.appraisalError) if (day >= a && day <= b) return e;
  return 0.10;
}

// 여정 한 번.
function runCampaign(seed, opts) {
  // 규칙은 B(=balance.json) 에서, 정책만 여기 기본값으로 둔다. 예전엔 승급비까지 여기 박혀 있었다.
  const cfg = Object.assign({ startBidRatio: B.startBidRatio, minRaiseRate: B.minRaiseRate,
    upgradeCost: B.upgradeCost, safety: 0.90, appraiseBudget: 0.03,
    offersPerDay: B.questOffer, questsPerDay: B.questAccept, holdForSet: true }, opts || {});
  const R = makeRandom(seed);
  const pool = makePool(R);
  const index = Object.fromEntries(FAMILIES.map((f) => [f, 1 + gaussian(R) * B.indexSd]));

  const br = cfg.branches ? { info: 0, trade: 0, storage: 0, network: 0 } : null;
  let cash = B.startCash, stage = 1, quests = 0, inv = [], branchSpend = 0;
  const qTry = {}, qOk = {};
  let loan = null, loanTaken = 0, loanSeized = 0, guildLocked = false, loanInterest = 0;
  let setIncome = 0, questIncome = 0, upgradeSpend = 0, setsDone = 0, questsDone = 0, bought = 0;

  for (let day = 1; day <= B.days; day += 1) {
    for (const f of FAMILIES) index[f] = Number(clamp(stepIndex(index[f], R), 0.6, 1.6).toFixed(3));
    // 대출 만기. 못 갚으면 담보를 뺏기고 조합 거래가 막힌다.
    if (loan && day >= loan.dueDay) {
      if (cash >= loan.repay) { cash -= loan.repay; loanInterest += loan.repay - loan.principal;
        const c = inv.find((x) => x.locked); if (c) c.locked = false; loan = null; }
      else { const c = inv.find((x) => x.locked); const collateralCredit = c ? c.basePrice : 0;
        if (c) inv = inv.filter((x) => x !== c);
        cash -= Math.max(0, loan.repay - collateralCredit);
        guildLocked = true; loanSeized += 1; loan = null; }
    }
    // 그날의 상회 단계로 명목 기준가를 한 번 확정한다. 보유 중 승급해도 다시 오르지 않는다.
    const priceMul = B.priceMultiplier[stage] || 1;
    const lots = pool.slice((day - 1) * B.lotsPerDay, day * B.lotsPerDay).map((l) => ({
      ...l, catalogBasePrice: l.basePrice, basePrice: round100(l.basePrice * priceMul),
    }));
    const bots = makeBots(day, R, stage);

    // 의뢰 수주
    const taken = [];
    // 제시(offer)와 수주(accept)는 다르다. 제시가 늘면 고를 폭이 넓어질 뿐이다.
    // V5: 하루에 5종 중 3종을 무작위 제시하고 그중 골라 받는다.
    // 왕실 인가장은 "5종 전부 제시" 다 - 수주 수가 아니라 고를 폭이 늘어난다.
    const ALL5 = ['designated', 'multi', 'bargain', 'restraint', 'block'];
    // 고르는 기준은 순수익이다(6.34 실측). 달성률로 고르면 절제를 매일 받아 사는 것이 막힌다.
    // 고정 선호순이면 꼴찌는 3종 제시 x 2건 수주에서 절대 안 뽑힌다 - 견제가 900판 0회였다.
    // 기대값(보상 x 달성률 - 수수료)으로 고른다. 그러면 값이 바뀔 때 순서도 따라 바뀐다.
    const EV = (id) => B.quests[id][1] * B.questRate[id] - B.quests[id][0];
    // 기대값이 같게 맞춰져 있으므로 남는 차이는 오차뿐이다. 같으면 그날 무작위로 가른다 -
    // 안 그러면 배열 순서가 순위가 되고, 그러면 다시 꼴찌 하나가 영영 안 뽑힌다.
    // 기대값은 설계상 같다. 남는 차이는 50 단위 반올림 잔차(+-5)뿐이라 그보다 큰 폭으로 흔든다.
    // 안 흔들면 잔차가 순위가 되고, 3종 제시 x 2건 수주에서 꼴찌 하나가 영영 안 뽑힌다.
    const JITTER = 40;
    const key = {};
    for (const id of ALL5) key[id] = EV(id) + R() * JITTER;
    const PREF = [...ALL5].sort((a, z) => key[z] - key[a]);
    // 6.33/6.34 실측 충돌표. 이미 받은 것과 부딪히면 안 받는다 - 수주는 의무가 아니다.
    const CLASH = { restraint: ['multi', 'designated', 'block'], multi: ['restraint'],
      designated: ['bargain', 'restraint'], bargain: ['designated'], block: ['restraint'] };
    let picked;
    if (cfg.questMenu) picked = cfg.questMenu;
    else {
      const shown = cfg.offerAll ? ALL5 : shuffled(ALL5, R).slice(0, cfg.offersPerDay || 3);
      const ranked = [...shown].sort((a, b) => PREF.indexOf(a) - PREF.indexOf(b));
      picked = [];
      for (const id of ranked) {
        if (picked.length >= cfg.questsPerDay) break;
        if (cfg.pickWisely && picked.some((x) => (CLASH[id] || []).includes(x))) continue;
        picked.push(id);
      }
    }
    for (const id of picked.slice(0, cfg.questsPerDay)) {
      const fee = B.quests[id][0];
      if (fee > cash * 0.05) continue;
      cash -= fee;
      qTry[id] = (qTry[id] || 0) + 1;
      taken.push({ id, targetFamily: FAMILIES[Math.floor(R() * 6)], targetBot: bots[Math.floor(R() * bots.length)].id });
    }

    // 감정 - 정밀 하나뿐이다. 네 점까지 제시된다.
    const est = {};
    // 감정 제시 수. V5 는 4점이라 정보가 절반만 닿는다 - 손잡이로 뺀다.
    const offered = shuffled(lots.map((_, i) => i), R).slice(0, cfg.appraiseOffers || 4);
    for (const i of offered) {
      const infoOff = br ? BRANCH.info.effect[br.info] : B.infoDiscount[stage];
      const cost = round100(lots[i].basePrice * B.appraisalRate * (1 - infoOff));
      if (cost > cash * cfg.appraiseBudget) continue;
      cash -= cost;
      const e = appraisalError(day);
      est[i] = clamp(lots[i].quality * (1 + (R() * 2 - 1) * e), 0.35, 1.6);
    }

    // 대출. 현금이 오늘 살 수 있는 수준 아래로 떨어지면 재고를 담보로 잡는다.
    if (cfg.useLoan && !loan && !guildLocked && stage >= B.loanMinStage && day + B.loanTermDays <= B.days) {
      const coll = inv.filter((x) => !x.locked && x.acquiredDay < day);
      const need = cfg.loanTrigger || 0;
      if (coll.length && cash < need) {
        const c = coll.reduce((a, b) => (disposalValue(b, index) > disposalValue(a, index) ? b : a));
        // 공개 기준가를 사용한다. 숨은 품질·실가치를 대출 견적으로 역산할 수 없게 한다.
        const p = round10(c.basePrice * B.loanLtv);
        c.locked = true;
        loan = { principal: p, repay: round10(p * B.loanRepay), dueDay: day + B.loanTermDays };
        cash += p; loanTaken += 1;
      }
    }
    const startDayCash = cash;
    const botSpend = {};
    const pushed = {};   // 내가 부른 값 위에서 봇이 낙찰한 금액 - 내가 안 부르면 0 이다
    const wins = [];
    for (let i = 0; i < lots.length; i += 1) {
      if (inv.length >= B.storage[stage]) break;
      const l = lots[i];
      // 공개 호가에서는 낙찰가를 봇이 정한다. 감정으로 천장을 흔드는 것보다
      // "불량을 안 사는 것" 이 정보의 쓸모다(cfg.lemonCut 아래면 안 산다).
      if (cfg.lemonCut && est[i] !== undefined && est[i] < cfg.lemonCut) continue;
      // 눈 감고 사는 쪽도 "손상이 나오면 깎인다" 는 것은 안다. 기대값에 반영한다.
      const blindE = 0.15 * B.damagedK * B.damagedSale * (B.damagedNoSet ? 0.85 : 1) + 0.9175;
      const q = cfg.lemonCut ? blindE : (est[i] !== undefined ? est[i] : blindE);
      const estDamaged = est[i] !== undefined && Math.abs(est[i] - B.damagedK) < 0.18;
      const penNow = estDamaged ? B.damagedSale * (B.damagedNoSet ? 0.8 : 1) : 1;
      const expected = l.basePrice * q * demandOf(l, index) * penNow;
      // 의뢰 표적 계열이면 반드시 따야 한다 - 천장을 올릴 수밖에 없다.
      // 이것이 "살 수밖에 없게 만드는 압력" 이다(6.24 의 3번).
      const isTarget = taken.some((q) => q.id === 'designated' && q.targetFamily === l.family);
      const questPull = isTarget && cfg.questCeiling ? cfg.questCeiling / (cfg.safety || 0.90) : 1;
      const pull = (cfg.holdForSet && inv.some((x) => x.family === l.family) ? 1.15 : 1) * questPull;
      // 확신이 있으면 더 세게 부른다. 그것이 정보가 사는 것이다 -
      // 공개 호가에서 낙찰가의 상한은 봇이 아니라 내 천장이 정한다.
      const conf = (est[i] !== undefined && cfg.safeAppraised) ? cfg.safeAppraised : cfg.safety;
      const feeC = br ? BRANCH.trade.effect[br.trade] : B.fees[stage];
      let ceiling = Math.floor(expected * conf * pull / (1 + feeC));

      // ── 의뢰를 쫓는 정책. cfg.pursue 가 켜지면 받은 의뢰가 사는 방식을 바꾼다.
      // 이게 있어야 #11 의 배타성("쫓으면 서로 방해되는가")을 잴 수 있다.
      if (cfg.pursue) {
        for (const q of taken) {
          // 지정 - 그 계열은 비싸도 딴다
          if (q.id === 'designated' && l.family === q.targetFamily && !wins.some((w) => w.lot.family === q.targetFamily))
            ceiling = Math.floor(ceiling * 1.30);
          // 다중 - 오늘 아직 안 산 계열을 우선한다
          if (q.id === 'multi' && !wins.some((w) => w.lot.family === l.family))
            ceiling = Math.floor(ceiling * 1.15);
          // 차익 - 기준가의 85% 를 넘기지 않는다. 싸게 사야 하니 천장이 내려간다
          if (q.id === 'bargain')
            ceiling = Math.min(ceiling, Math.floor(l.basePrice * 0.85));
          // 절제 - 그날 시작 자금의 남길 몫을 깎아먹지 않는다. 안 사는 축이다
          if (q.id === 'restraint')
            ceiling = Math.min(ceiling, Math.max(0, Math.floor(cash - startDayCash * B.restraintKeepRate)));
          // 견제 - 표적 봇이 노리는 계열은 값을 올려 과지불하게 만든다
          if (q.id === 'block') {
            const tb = bots.find((x) => x.id === q.targetBot);
            if (tb && tb.target === l.family) ceiling = Math.floor(ceiling * 1.25);
          }
        }
      }
      const r = runLot(l, bots, ceiling, cash, stage, index, R, cfg);
      if (r.winner !== 'player') {
        if (r.winner) {
          const winnerBot = bots.find((b) => b.id === r.winner);
          if (winnerBot) winnerBot.cash = Math.max(0, winnerBot.cash - r.price);
          botSpend[r.winner] = (botSpend[r.winner] || 0) + r.price;
          if (r.playerBid) pushed[r.winner] = (pushed[r.winner] || 0) + (r.price - r.startBid);
        }
        continue;
      }
      const feeR = br ? BRANCH.trade.effect[br.trade] : B.fees[stage];
      const total = r.price + round10(r.price * feeR);
      if (total > cash) continue;
      cash -= total; bought += 1;
      inv.push({ ...l, paid: total, acquiredDay: day, locked: false });
      wins.push({ lot: l, price: r.price });
    }

    // 의뢰 판정
    for (const q of taken) {
      let ok = false;
      if (q.id === 'designated') ok = wins.some((w) => w.lot.family === q.targetFamily);
      if (q.id === 'multi') ok = new Set(wins.map((w) => w.lot.family)).size >= 2;
      if (q.id === 'bargain') ok = wins.some((w) => w.price <= w.lot.basePrice * 0.85);
      // 절제 - 사긴 사되 그날 시작 자금의 40% 를 남긴다. "안 산다" 축이다.
      if (q.id === 'restraint') ok = wins.length > 0 && cash >= startDayCash * B.restraintKeepRate;
      // 견제 - 표적 봇이 기준액 이상 쓰게 하되 아무것도 못 따게 한다. "과지불" 축이다.
      // 견제 - 2026-07-30: "표적 봇이 얼마 썼나" 에서 "내가 밀어올린 금액" 으로 바꿨다.
      // 전자는 내가 아무것도 안 해도 달성돼 다른 의뢰에 편승했다(6.33).
      if (q.id === 'block') ok = B.blockByAction
        ? (pushed[q.targetBot] || 0) >= B.blockPushThreshold
        : (botSpend[q.targetBot] || 0) >= B.blockSpendThreshold;
      if (!ok) {
        // 못 지키면 위약금. 이게 있어야 "받았으면 반드시" 가 성립한다.
        if (cfg.questPenalty) cash -= round100(B.quests[q.id][1] * cfg.questPenalty);
        continue;
      }
      const rw = round100(B.quests[q.id][1] * (1 + (br ? BRANCH.network.effect[br.network] : B.questBonus[stage])));
      cash += rw; questIncome += rw; quests += 1; questsDone += 1; qOk[q.id] = (qOk[q.id] || 0) + 1;
    }

    // 판매. 족보가 서면 묶어서 팔고, 아니면 즉시 처분한다. 둘 다 열려 있다.
    for (let guard = 0; guard < 10; guard += 1) {
      const s = bestSet(inv);
      if (!s) break;
      const base = s.combo.reduce((n, x) => n + disposalValue(x, index), 0);
      const total = round10(base * s.def.mult * (1 + (br ? BRANCH.storage.effect[br.storage] : B.setBonus[stage])));
      cash += total; setIncome += total; setsDone += 1;
      inv = inv.filter((x) => !s.combo.includes(x));
    }
    // 족보에 못 낀 것 - 한 칸만 남기고 즉시 처분한다(다음 날 족보 씨앗)
    if (cfg.holdForSet) {
      const keep = inv.slice(0, Math.max(0, Math.min(inv.length, B.storage[stage] - 2)));
      for (const it of inv) if (!keep.includes(it)) cash += disposalValue(it, index);
      inv = keep;
    } else {
      for (const it of inv) cash += disposalValue(it, index);
      inv = [];
    }

    while (stage < 4 && cash >= cfg.upgradeCost[stage] * 1.15 && quests >= B.upgradeQuests[stage]) {
      cash -= cfg.upgradeCost[stage]; upgradeSpend += cfg.upgradeCost[stage]; stage += 1;
    }
    // 브랜치는 승급 다음이다. 등급은 기한이 있어 의무고 브랜치는 선택이다 - 순서가 바뀌면 마감에 걸린다.
    if (br && cfg.buyOrder) {
      const nextUpg = stage < 4 ? cfg.upgradeCost[stage] : 0;
      for (const k of cfg.buyOrder) {
        const maxLv = BRANCH[k].cost.length - 1;
        while (br[k] < maxLv && cash - BRANCH[k].cost[br[k] + 1] >= nextUpg * (cfg.branchBuffer || 1.3)) {
          cash -= BRANCH[k].cost[br[k] + 1]; branchSpend += BRANCH[k].cost[br[k] + 1]; br[k] += 1;
        }
      }
    }
    // 6.28 실제 규칙: 현금 0 + 팔 수 있는 보유품 0 + 담보 대출 불가, 셋이 다 성립해야 파산이다.
    const sellable = inv.filter((x) => !x.locked);
    const canLoan = stage >= B.loanMinStage && !guildLocked && !loan && day + B.loanTermDays <= B.days
      && sellable.some((x) => x.acquiredDay < day + 1);
    if (cash <= 0 && sellable.length === 0 && !canLoan) return { final: 0, ruined: true, day, stage, setIncome, questIncome, upgradeSpend, setsDone, questsDone, bought, branchSpend, branches: br, loanTaken, loanSeized, loanInterest, guildLocked, qTry, qOk };
    const req = day >= 9 ? 4 : day >= 6 ? 3 : day >= 3 ? 2 : 1;
    if (stage < req) return { final: 0, ruined: false, deadlineFail: day + 1, day, stage, setIncome, questIncome, upgradeSpend, setsDone, questsDone, bought, branchSpend, branches: br, loanTaken, loanSeized, loanInterest, guildLocked, qTry, qOk };
  }
  for (const it of inv) cash += disposalValue(it, index);
  return { final: cash, ruined: false, day: 12, stage, setIncome, questIncome, upgradeSpend, setsDone, questsDone, bought, branchSpend, branches: br, loanTaken, loanSeized, loanInterest, guildLocked, qTry, qOk };
}

const API = { BRANCH, makePool, makeRandom, configure,
  disposalValue, demandOf, runCampaign, bestSet, makeBots, botCap, runLot,
  // 갈아끼우면 바뀌는 값들이라 함수로 내준다. 굳혀서 내보내면 옛 값을 쥐게 된다.
  get B() { return B; }, get GRADE() { return GRADE; }, get QUALITY() { return QUALITY; },
  get FAMILIES() { return FAMILIES; }, get PER_FAMILY() { return PER_FAMILY; } };
if (typeof module !== 'undefined') module.exports = API;
if (typeof window !== 'undefined') window.SIM = API;
