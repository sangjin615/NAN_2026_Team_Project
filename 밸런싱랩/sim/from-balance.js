// balance.json 하나에서 시뮬 상수를 만든다. 손으로 옮기면 갈라진다 - 실제로 갈라져 있었다.
// 없는 키를 만나면 여기서 죽는다. 조용히 기본값을 쓰지 않는다.
'use strict';
// 파일을 읽는 일과 값을 만드는 일을 갈랐다. 만드는 쪽은 순수 함수라 브라우저에서도 돈다.
function buildFromBalance(b) {

function need(obj, keyPath) {
  let v = obj;
  for (const k of keyPath.split('.')) {
    if (v === undefined || v === null || !(k in v)) {
      throw new Error('balance.json 에 ' + keyPath + ' 가 없다 - 시뮬이 기본값을 지어내지 않는다');
    }
    v = v[k];
  }
  return v;
}

const FAMILIES = ['도자기', '시계', '회화', '고서', '금은세공', '장신구'];
const gpf = need(b, 'lotPool.gradesPerFamily');
const PER_FAMILY = [['common', gpf.common], ['rare', gpf.rare], ['epic', gpf.epic], ['legendary', gpf.legendary]];

const GRADE = {};
for (const g of ['common', 'rare', 'epic', 'legendary']) {
  GRADE[g] = { base: need(b, 'gradeBase.' + g), beta: need(b, 'gradeBeta.' + g) };
}
// [품질계수, 가중치] - 순서가 시뮬의 누적 추첨 순서다
const QUALITY = need(b, 'quality.table').map((q) => [q.value, q.weight]);

// 감정 오차를 일차 구간으로 편다: {"1-3":0.35} -> [1,3,0.35]
const APPRAISAL_ERROR = Object.entries(need(b, 'appraisal.errorByDay'))
  .map(([span, v]) => { const [a, z] = span.split('-').map(Number); return [a, z, v]; })
  .sort((x, y) => x[0] - y[0]);

// 견제 문턱은 문장 안에 있다. 숫자를 뽑고, 못 뽑으면 죽는다.
const blockRule = need(b, 'quests.block.rule');
const m = blockRule.match(/([\d,]+)\s*이상/);
if (!m) throw new Error('견제 규칙에서 문턱을 못 읽었다: ' + blockRule);
const BLOCK_PUSH = Number(m[1].replace(/,/g, ''));

const QUESTS = {};
const QUEST_RATE = {};
for (const q of ['designated', 'multi', 'bargain', 'restraint', 'block']) {
  QUESTS[q] = [need(b, 'quests.' + q + '.fee'), need(b, 'quests.' + q + '.reward')];
  QUEST_RATE[q] = need(b, 'quests.' + q + '.completionRate');   // 격리 측정값. 기대값 계산에 쓴다
}

const B = {
  days: need(b, 'run.days'), lotsPerDay: need(b, 'run.lotsPerDay'), startCash: need(b, 'run.startCash'),
  fees: need(b, 'shop.auctionFee'), storage: need(b, 'shop.storage'),
  setBonus: need(b, 'shop.setBonus'), questBonus: need(b, 'shop.questBonus'),
  infoDiscount: need(b, 'shop.infoDiscount'), upgradeQuests: need(b, 'shop.questRequirement'),
  priceMultiplier: need(b, 'shop.priceMultiplier'),
  upgradeCost: need(b, 'shop.upgradeCost'),
  expectedDemand: need(b, 'market.expectedDemand'), indexSd: need(b, 'market.indexSd'),
  shockSd: need(b, 'market.shockSd'), phi: need(b, 'market.phi'), idioSd: need(b, 'market.idiosyncraticSd'),
  botCapital: need(b, 'bots.capitalByStage'),
  nemesisInitial: need(b, 'bots.nemesisInitial'), nemesisGrowth: need(b, 'bots.growthPerDay'),
  bidCapRatio: need(b, 'bots.bidCapRatio'), drifterRatio: need(b, 'bots.drifterRatio'),
  drifterCount: need(b, 'bots.drifterCount'),
  appraisalRate: need(b, 'appraisal.rate'), appraisalError: APPRAISAL_ERROR, botQualityError: 0,
  // 6.25 - 봇이 품질을 아예 안 본다. 이게 정보가 값을 갖는 이유다.
  botQualityMode: need(b, 'bots.qualityKnowledge') === 'none' ? 'blind' : 'true',
  damagedK: 0.60, damagedSale: 1.0, damagedNoSet: false,   // 6.24 에서 꺼둔 것 - 켜는 손잡이만 남긴다
  loanLtv: need(b, 'loan.limitFromDisposalValue'), loanRepay: need(b, 'loan.repayMultiplier'),
  loanTermDays: need(b, 'loan.termDays'), loanMinStage: need(b, 'loan.minShopStage'),
  quests: QUESTS, questRate: QUEST_RATE,
  restraintKeepRate: need(b, 'quests.tightened.restraintKeepRate'),
  blockSpendThreshold: need(b, 'quests.tightened.blockSpendThreshold'),
  blockByAction: true, blockPushThreshold: BLOCK_PUSH,   // 6.34 - 견제를 행동으로 판정한다
  sets: need(b, 'sets.table').map((s) => ({ id: s.id, mult: s.mult, need: s.need })),
  startBidRatio: need(b, 'auction.startBidRatio'), minRaiseRate: need(b, 'auction.minRaiseRate'),
  questOffer: need(b, 'quests.offering.perDay'), questAccept: need(b, 'quests.offering.acceptMax'),
};

return { B, GRADE, QUALITY, FAMILIES, PER_FAMILY };
}

// node 에서는 파일에서 읽어 바로 만들어 준다. 브라우저는 buildFromBalance 만 쓴다.
if (typeof module !== 'undefined' && typeof require !== 'undefined') {
  const fs = require('fs');
  const path = require('path');
  const B_JSON = path.join(__dirname, '..', 'data', 'balance.json');
  const loaded = buildFromBalance(JSON.parse(fs.readFileSync(B_JSON, 'utf8')));
  module.exports = Object.assign({ buildFromBalance, source: B_JSON }, loaded);
}
if (typeof window !== 'undefined') window.buildFromBalance = buildFromBalance;
