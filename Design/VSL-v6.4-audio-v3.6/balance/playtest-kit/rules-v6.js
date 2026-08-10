// 미지의 경매장 — 규칙 한 벌. **이 파일은 생성된 것이다** (gen-rules.py <- data/balance.json).
// 손으로 고치지 마라. 값을 바꾸려면 balance.json 을 고치고 다시 생성한다.
// 근거는 docs/plan/SIMULATION-STATUS.md 6.16~6.37 에 있다.
'use strict';
const CFG = {
  "days": 12,
  "lotsPerDay": 8,
  "startCash": 20000,
  "goal": 100000,
  "families": [
    "도자기",
    "시계",
    "회화",
    "고서",
    "금은세공",
    "장신구"
  ],
  "perFamily": [
    [
      "common",
      4
    ],
    [
      "rare",
      6
    ],
    [
      "epic",
      4
    ],
    [
      "legendary",
      2
    ]
  ],
  "grades": {
    "common": {
      "name": "일반",
      "base": 1500,
      "beta": 0.27
    },
    "rare": {
      "name": "레어",
      "base": 4000,
      "beta": 1
    },
    "epic": {
      "name": "에픽",
      "base": 12000,
      "beta": 2.09
    },
    "legendary": {
      "name": "전설",
      "base": 25000,
      "beta": 3.64
    }
  },
  "quality": [
    [
      0.6,
      "손상",
      15
    ],
    [
      0.9,
      "보통",
      40
    ],
    [
      1.1,
      "양호",
      25
    ],
    [
      1.35,
      "수려",
      15
    ],
    [
      1.6,
      "완품",
      5
    ]
  ],
  "auction": {
    "startBidRatio": 0.5,
    "minRaiseRate": 0.1
  },
  "fees": [
    0,
    0.05,
    0.03,
    0.01,
    0
  ],
  "storage": [
    0,
    3,
    4,
    5,
    6
  ],
  "upgradeCost": [
    0,
    7500,
    12000,
    17500
  ],
  "upgradeQuests": [
    0,
    1,
    2,
    3
  ],
  "setBonus": [
    0,
    0.1,
    0.2,
    0.3,
    0.4
  ],
  "questBonus": [
    0,
    0.1,
    0.2,
    0.3,
    0.4
  ],
  "infoDiscount": [
    0,
    0.1,
    0.2,
    0.3,
    0.4
  ],
  "bots": {
    "initial": 25000,
    "growth": 1.155,
    "capRatio": 1,
    "drifterRatio": 0.4,
    "drifterCount": 2,
    "continueP": 0.78,
    "wantLo": 0.78,
    "wantHi": 1.08
  },
  "market": {
    "phi": 0.7,
    "shockSd": 0.0761,
    "expectedDemand": 1.05,
    "clamp": [
      0.6,
      1.6
    ]
  },
  "appraisal": {
    "rate": 0.09,
    "offersPerDay": 4,
    "errorByDay": [
      [
        1,
        3,
        0.35
      ],
      [
        4,
        6,
        0.2
      ],
      [
        7,
        12,
        0.1
      ]
    ]
  },
  "infoRate": {
    "competitors": 0.008,
    "catalog": 0.007,
    "forecast": 0.004
  },
  "sets": [
    {
      "id": "pair",
      "name": "페어",
      "rule": "같은 계열 2점",
      "need": 2,
      "mult": 1.2
    },
    {
      "id": "fullhouse",
      "name": "풀하우스",
      "rule": "6계열 각 1점",
      "need": 6,
      "mult": 1.4
    },
    {
      "id": "align",
      "name": "정렬",
      "rule": "같은 계열 + 같은 등급 2점",
      "need": 2,
      "mult": 1.6
    },
    {
      "id": "triple",
      "name": "트리플",
      "rule": "같은 계열 3점",
      "need": 3,
      "mult": 1.8
    },
    {
      "id": "royal",
      "name": "로열",
      "rule": "같은 계열 3점, 전부 에픽 이상",
      "need": 3,
      "mult": 2.4
    },
    {
      "id": "straight",
      "name": "스트레이트",
      "rule": "같은 계열, 서로 다른 등급 3점",
      "need": 3,
      "mult": 2.6
    }
  ],
  "quests": {
    "designated": {
      "name": "지정",
      "fee": 300,
      "reward": 4250,
      "rule": "지정 계열 1점을 낙찰한다"
    },
    "multi": {
      "name": "다중",
      "fee": 500,
      "reward": 2050,
      "rule": "서로 다른 계열 2점을 낙찰한다"
    },
    "bargain": {
      "name": "차익",
      "fee": 400,
      "reward": 2350,
      "rule": "기준가의 85% 이하에 낙찰한다"
    },
    "restraint": {
      "name": "절제",
      "fee": 400,
      "reward": 2750,
      "rule": "낙찰하되 그날 시작 자금의 60% 를 남긴다 (40% 에서 강화, 2026-07-30)"
    },
    "block": {
      "name": "견제",
      "fee": 600,
      "reward": 3250,
      "rule": "내가 부른 값 위에서 표적 봇이 낙찰한 금액이 1,500 이상 (2026-07-30 행동 기반으로 변경)"
    }
  },
  "questOffer": 3,
  "questAccept": 2,
  "questClash": {
    "restraint": [
      "multi",
      "designated",
      "block"
    ],
    "multi": [
      "restraint"
    ],
    "designated": [
      "bargain",
      "restraint"
    ],
    "bargain": [
      "designated"
    ],
    "block": [
      "restraint"
    ]
  },
  "restraintKeepRate": 0.6,
  "blockPushThreshold": 1500,
  "loan": {
    "ltv": 0.45,
    "repay": 1.9,
    "term": 2,
    "minStage": 3
  },
  "deadline": {
    "3": 2,
    "6": 3,
    "9": 4
  }
};

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
function makeBots(day, R) {
  const nem = round100(CFG.bots.initial * Math.pow(CFG.bots.growth, day));
  const pick = () => CFG.families[Math.floor(R() * CFG.families.length)];
  const bots = [{ id: 'bennett', name: '숙적 베넷', nemesis: true, target: pick(), cash: nem }];
  for (let i = 0; i < CFG.bots.drifterCount; i += 1) {
    bots.push({ id: 'drifter' + i, name: '떠돌이 상인 ' + (i + 1), nemesis: false, target: pick(),
      cash: round100(nem * CFG.bots.drifterRatio * (0.85 + R() * 0.3)) });
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
