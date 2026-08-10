# balance.json 에서 규칙 모듈을 생성한다. 값을 손으로 옮기면 시뮬과 갈라진다.
import io, json, sys, os
sys.stdout.reconfigure(encoding='utf-8')
# 팩 경로는 인자로 받는다. 박아 두면 다른 팩의 balance.json 을 읽는다 - 실제로 옛 팩을 가리키고 있었다.
ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
b = json.load(io.open(os.path.join(ROOT, 'data', 'balance.json'), encoding='utf-8'))

CFG = {
    'days': 12, 'lotsPerDay': 8, 'startCash': 20000, 'goal': 100000,
    'families': ['도자기', '시계', '회화', '고서', '금은세공', '장신구'],
    'perFamily': [['common', 4], ['rare', 6], ['epic', 4], ['legendary', 2]],
    'grades': {
        'common': {'name': '일반', 'base': 1500, 'beta': b['gradeBeta']['common']},
        'rare': {'name': '레어', 'base': 4000, 'beta': b['gradeBeta']['rare']},
        'epic': {'name': '에픽', 'base': 12000, 'beta': b['gradeBeta']['epic']},
        'legendary': {'name': '전설', 'base': 25000, 'beta': b['gradeBeta']['legendary']},
    },
    'quality': [[q['value'], q['label'], q['weight']] for q in b['quality']['table']],
    'auction': {'startBidRatio': b['auction']['startBidRatio'], 'minRaiseRate': b['auction']['minRaiseRate']},
    'fees': b['shop']['auctionFee'], 'storage': b['shop']['storage'],
    'upgradeCost': b['shop']['upgradeCost'], 'upgradeQuests': b['shop']['questRequirement'],
    'setBonus': b['shop']['setBonus'], 'questBonus': b['shop']['questBonus'],
    'infoDiscount': b['shop']['infoDiscount'], 'priceMultiplier': b['shop']['priceMultiplier'],
    'questCompletionBonus': b['quests']['rewardPolicy']['completionBonusByStage'],
    'bots': {'capitalByStage': b['bots']['capitalByStage'],
             'initial': b['bots']['nemesisInitial'], 'growth': b['bots']['growthPerDay'],
             'capRatio': b['bots']['bidCapRatio'], 'drifterRatio': b['bots']['drifterRatio'],
             'drifterCount': b['bots']['drifterCount'], 'continueP': 0.78, 'wantLo': 0.78, 'wantHi': 1.08},
    'market': {'phi': b['market']['phi'], 'shockSd': b['market']['shockSd'],
               'expectedDemand': b['market']['expectedDemand'], 'clamp': [0.6, 1.6]},
    'appraisal': {'rate': b['appraisal']['rate'], 'offersPerDay': b['appraisal'].get('offersPerDay', 4),
                  'errorByDay': [[1, 3, 0.35], [4, 6, 0.20], [7, 12, 0.10]]},
    'infoRate': {'competitors': b['informationRate']['competitors'],
                 'catalog': b['informationRate']['catalog'], 'forecast': b['informationRate']['forecast']},
    'sets': [{'id': t['id'], 'name': t['name'], 'rule': t['rule'], 'need': t['need'], 'mult': t['mult']}
             for t in b['sets']['table']],
    'quests': {k: {'name': n, 'fee': b['quests'][k]['fee'], 'reward': b['quests'][k]['reward'],
                   'rule': b['quests'][k]['rule']}
               for k, n in [('designated', '지정'), ('multi', '다중'), ('bargain', '차익'),
                            ('restraint', '절제'), ('block', '견제')]},
    'questOffer': b['quests']['offering']['perDay'], 'questAccept': b['quests']['offering']['acceptMax'],
    'questClash': {'restraint': ['multi', 'designated', 'block'], 'multi': ['restraint'],
                   'designated': ['bargain', 'restraint'], 'bargain': ['designated'], 'block': ['restraint']},
    'restraintKeepRate': 0.60, 'blockPushThreshold': 1500,
    'loan': {'ltv': b['loan']['limitFromDisposalValue'], 'repay': b['loan']['repayMultiplier'],
             'term': b['loan']['termDays'], 'minStage': b['loan']['minShopStage']},
    'deadline': {'3': 2, '6': 3, '9': 4},
}

js = '''// 미지의 경매장 — 규칙 한 벌. **이 파일은 생성된 것이다** (gen-rules.py <- data/balance.json).
// 손으로 고치지 마라. 값을 바꾸려면 balance.json 을 고치고 다시 생성한다.
// 근거는 docs/plan/SIMULATION-STATUS.md 6.16~6.37 에 있다.
'use strict';
const CFG = %s;

const round10 = (n) => Math.ceil(n / 10) * 10;
const round100 = (n) => Math.ceil(n / 100) * 100;
const clamp = (v, a, c) => Math.max(a, Math.min(c, v));

// 씨앗 고정 난수. 같은 씨앗이면 같은 여정이다 - 재현이 안 되면 잰 것이 아니다.
function makeRandom(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
function gaussian(R) { const u = Math.max(1e-9, R()); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * R()); }

// 품질 추첨. 기대값 1.0075 · 표준편차 0.2585 (6.2)
function pickQuality(R) {
  let x = R() * 100;
  for (const [k, name, w] of CFG.quality) { x -= w; if (x <= 0) return { k, name }; }
  const last = CFG.quality[CFG.quality.length - 1];
  return { k: last[0], name: last[1] };
}

// 96종 고정 풀. 여정 시작에 한 번 만든다 - 매일 무작위 생성이 아니다(6.19).
function makePool(R) {
  const pool = [];
  for (const f of CFG.families) {
    for (const [grade, n] of CFG.perFamily) {
      for (let i = 0; i < n; i += 1) {
        const q = pickQuality(R);
        pool.push({ id: f + '-' + grade + '-' + i, family: f, grade,
          basePrice: CFG.grades[grade].base, quality: q.k, qualityName: q.name,
          startBid: round100(CFG.grades[grade].base * CFG.auction.startBidRatio) });
      }
    }
  }
  return pool.map((x) => ({ x, k: R() })).sort((a, c) => a.k - c.k).map((o) => o.x);
}

// 12일치 계열 지수. AR(1) 평균회귀, 여정 시작에 고정한다 - 그래야 수요 동향이 앞을 판다(6.26).
function makeIndexPath(R) {
  const path = [];
  const cur = {};
  for (const f of CFG.families) cur[f] = 1;
  for (let d = 0; d < CFG.days; d += 1) {
    let top = { family: CFG.families[0], shock: 0 };
    for (const f of CFG.families) {
      const sh = gaussian(R) * CFG.market.shockSd;
      cur[f] = Number(clamp(1 + CFG.market.phi * (cur[f] - 1) + sh, CFG.market.clamp[0], CFG.market.clamp[1]).toFixed(3));
      if (Math.abs(sh) > Math.abs(top.shock)) top = { family: f, shock: sh };
    }
    path.push({ index: Object.assign({}, cur), headline: top });
  }
  return path;
}

// 6.13 시세. 같은 계열 지수라도 등급이 높을수록 크게 흔들린다.
function demandOf(item, index) {
  return CFG.market.expectedDemand + CFG.grades[item.grade].beta * ((index[item.family] || 1) - 1);
}
function disposalValue(item, index) { return round10(item.basePrice * item.quality * demandOf(item, index)); }

// 6.7/6.15 경쟁자. 자본은 플레이어와 무관한 절대값이다.
function makeBots(day, R, stage = 1) {
  const nem = CFG.bots.capitalByStage[stage];
  const pick = () => CFG.families[Math.floor(R() * CFG.families.length)];
  const bots = [{ id: 'bennett', name: '숙적 베넷', nemesis: true, target: pick(), cash: nem }];
  for (let i = 0; i < CFG.bots.drifterCount; i += 1) {
    bots.push({ id: 'drifter' + i, name: '떠돌이 상인 ' + (i + 1), nemesis: false, target: pick(),
      cash: nem });
  }
  return bots;
}
// 봇은 숨은 품질을 **안 본다**. 공개 기저가와 시세로만 부른다 - 이게 정보가 값을 갖는 이유다(6.25).
function botCap(bot, lot, index, R) {
  const affinity = bot.target === lot.family ? 1.18 : 1;
  const risk = { common: 0.9, rare: 1, epic: 1.05, legendary: 1.1 }[lot.grade];
  const seen = 1.0075;
  const want = round10(lot.basePrice * seen * demandOf(lot, index) * affinity * risk
    * (CFG.bots.wantLo + R() * (CFG.bots.wantHi - CFG.bots.wantLo)));
  return Math.min(bot.cash * CFG.bots.capRatio, want);
}

const minRaise = (bid) => Math.max(10, round10(bid * CFG.auction.minRaiseRate));
const feeRate = (stage) => CFG.fees[stage];
const storageCap = (stage) => CFG.storage[stage];
const setBonus = (stage) => 1 + CFG.setBonus[stage];
const questBonus = (stage) => 1 + CFG.questBonus[stage];
const infoDiscount = (stage) => 1 - CFG.infoDiscount[stage];
function appraisalError(day) {
  for (const [a, c, e] of CFG.appraisal.errorByDay) if (day >= a && day <= c) return e;
  return 0.10;
}
const appraisalCost = (lot, stage) => round100(lot.basePrice * CFG.appraisal.rate * infoDiscount(stage));
const infoCost = (kind, lots, stage) =>
  round100(lots.reduce((n, l) => n + l.basePrice, 0) * (CFG.infoRate[kind] || 0) * infoDiscount(stage));

// 6.12 족보. 계약이 아니다 - 모아서 같이 팔면 배수가 붙는다.
const GRADE_ORDER = ['common', 'rare', 'epic', 'legendary'];
function bestSet(inv) {
  const byFam = {};
  for (const x of inv) (byFam[x.family] = byFam[x.family] || []).push(x);
  let best = null;
  const take = (id, combo) => {
    const def = CFG.sets.find((s) => s.id === id);
    if (!def || !combo) return;
    if (!best || def.mult > best.def.mult) best = { def, combo };
  };
  const fh = [];
  for (const f of CFG.families) { const x = (byFam[f] || [])[0]; if (x) fh.push(x); }
  if (fh.length === 6) take('fullhouse', fh);
  for (const arr of Object.values(byFam)) {
    const hi = arr.filter((x) => x.grade === 'epic' || x.grade === 'legendary');
    if (hi.length >= 3) take('royal', hi.slice(0, 3));
    const st = [];
    for (const g of GRADE_ORDER) { const x = arr.find((i) => i.grade === g && !st.includes(i)); if (x && st.length < 3) st.push(x); }
    if (st.length === 3) take('straight', st);
    const byGrade = {};
    arr.forEach((x) => (byGrade[x.grade] = byGrade[x.grade] || []).push(x));
    const al = Object.values(byGrade).find((x) => x.length >= 2);
    if (al) take('align', al.slice(0, 2));
    if (arr.length >= 3) take('triple', arr.slice(0, 3));
    if (arr.length >= 2) take('pair', arr.slice(0, 2));
  }
  return best;
}

const requiredStage = (day) => (day >= 10 ? 4 : day >= 7 ? 3 : day >= 4 ? 2 : 1);
// 6.28 파산. 셋이 다 성립해야 한다 - 빌릴 수 있으면 안 죽는다.
function isBankrupt(st, day) {
  const sellable = st.inventory.filter((x) => !x.locked);
  const canLoan = st.stage >= CFG.loan.minStage && !st.guildLocked && !st.loan && sellable.length > 0;
  return st.cash <= 0 && sellable.length === 0 && !canLoan;
}

const API = { CFG, makeRandom, gaussian, pickQuality, makePool, makeIndexPath, demandOf, disposalValue,
  makeBots, botCap, minRaise, feeRate, storageCap, setBonus, questBonus, infoDiscount,
  appraisalError, appraisalCost, infoCost, bestSet, requiredStage, isBankrupt, round10, round100, clamp };
if (typeof module !== 'undefined') module.exports = API;
if (typeof window !== 'undefined') window.RULES = API;
''' % json.dumps(CFG, ensure_ascii=False, indent=2)

out = os.path.join(ROOT, 'greybox', 'rules-v6.js')
os.makedirs(os.path.dirname(out), exist_ok=True)
io.open(out, 'w', encoding='utf-8', newline='\n').write(js)
print('rules-v6.js 생성 · %d자' % len(js))
print('  족보 %d · 의뢰 %d · 계열 %d · 승급비 %s' % (len(CFG['sets']), len(CFG['quests']),
      len(CFG['families']), CFG['upgradeCost']))
