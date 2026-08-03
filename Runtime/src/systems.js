import { createRng, shuffle } from './rng.js';

const QUEST_IDS = ['designated', 'multi', 'bargain', 'restraint', 'block'];
const GRADE_BETA = { COMMON: 0.27, RARE: 1, EPIC: 2.09, LEGENDARY: 3.64 };
const QUEST_CLASH = { restraint: ['multi', 'designated', 'block'], multi: ['restraint'], designated: ['bargain', 'restraint'], bargain: ['designated'], block: ['restraint'] };

export function createMarketPath(balance, seed) {
  const rng = createRng(`${seed}:market`);
  const families = ['CER', 'CLK', 'PNT', 'BOK', 'MET', 'JEW'];
  const phi = balance.market?.phi ?? 0.7;
  const shock = balance.market?.shockSd ?? 0.0761;
  const path = {};
  for (const family of families) {
    let index = 1;
    path[family] = Array.from({ length: 12 }, () => {
      const noise = (rng() + rng() + rng() + rng() - 2) * shock * 1.7;
      index = Math.max(0.6, Math.min(1.6, 1 + phi * (index - 1) + noise));
      return Number(index.toFixed(4));
    });
  }
  return path;
}

export function createDailyQuestOffers(balance, day, seed, relics = []) {
  const count = relics.includes('royal-charter') ? 5 : balance.quests?.offering?.perDay || 3;
  return shuffle(QUEST_IDS, createRng(`${seed}:quests:${day}`)).slice(0, count).map((id) => ({
    id, fee: balance.quests[id].fee, reward: balance.quests[id].reward,
    rule: balance.quests[id].rule, accepted: false, completed: false
  }));
}

export function botBidForLot({ lot, day, balance, marketIndex, seed }) {
  const rng = createRng(`${seed}:bots:${lot.lotId}`);
  const nemesisCapital = balance.bots.nemesisInitial * (balance.bots.growthPerDay ** day);
  const demand = (balance.market.expectedDemand ?? 1.05) + (GRADE_BETA[lot.grade] ?? 1) * (marketIndex - 1);
  const publicEstimate = lot.pricing.basePrice * demand;
  const families = ['CER', 'CLK', 'PNT', 'BOK', 'MET', 'JEW'];
  const target = () => families[Math.floor(rng() * families.length)];
  const bids = [
    { id: 'nemesis', name: '갈레오', target: target(), cap: nemesisCapital, factor: 0.78 + rng() * 0.30 },
    { id: 'drifter-a', name: '모이라', target: target(), cap: nemesisCapital * balance.bots.drifterRatio * (0.85 + rng() * 0.3), factor: 0.78 + rng() * 0.30 },
    { id: 'drifter-b', name: '이네스', target: target(), cap: nemesisCapital * balance.bots.drifterRatio * (0.85 + rng() * 0.3), factor: 0.78 + rng() * 0.30 }
  ];
  return bids.map((bot) => ({ ...bot, maxBid: Math.max(0, Math.round(Math.min(bot.cap, publicEstimate * (bot.target === lot.category ? 1.18 : 1) * ({ COMMON: 0.9, RARE: 1, EPIC: 1.05, LEGENDARY: 1.1 }[lot.grade] ?? 1) * bot.factor))) }));
}

export function resolveAuction({ state, lot, playerBid, balance }) {
  const marketIndex = state.marketPath[lot.category][state.day - 1];
  const bots = botBidForLot({ lot, day: state.day, balance, marketIndex, seed: state.seed });
  const topBot = [...bots].sort((a, b) => b.maxBid - a.maxBid)[0];
  const minimumRaise = Math.max(1, Math.round(lot.pricing.basePrice * balance.auction.minRaiseRate));
  const occupiedStorage = state.inventory.filter((item) => !item.sold).length;
  if (playerBid > topBot.maxBid && playerBid <= state.cash && occupiedStorage < state.storage) {
    return { winner: 'player', price: Math.max(playerBid, topBot.maxBid + minimumRaise), bots };
  }
  return { winner: topBot.id, price: topBot.maxBid, bots };
}

export function appraisalError(balance, day) {
  const key = day <= 3 ? '1-3' : day <= 6 ? '4-6' : '7-12';
  return balance.appraisal.errorByDay[key];
}

export function appraiseAll(state, balance) {
  let count = 0;
  for (const item of state.inventory.filter((entry) => !entry.appraised && !entry.collateral)) {
    const discount = 1 - (balance.shop.infoDiscount?.[state.shopStage] ?? 0);
    const cost = Math.ceil(item.basePrice * balance.appraisal.rate * discount / 100) * 100;
    if (state.cash < cost) break;
    state.cash -= cost;
    item.appraised = true;
    item.appraisalRange = Math.round(item.trueValue * appraisalError(balance, state.day));
    count += 1;
  }
  return count;
}

export function appraiseItem(state, balance, lotId) {
  const item = state.inventory.find((entry) => entry.lotId === lotId && !entry.sold && !entry.appraised && !entry.collateral);
  if (!item) return false;
  const discount = 1 - (balance.shop.infoDiscount?.[state.shopStage] ?? 0);
  const cost = Math.ceil(item.basePrice * balance.appraisal.rate * discount / 100) * 100;
  if (state.cash < cost) return false;
  state.cash -= cost; item.appraised = true; item.appraisalRange = Math.round(item.trueValue * appraisalError(balance, state.day));
  return true;
}

export function bestSetMultiplier(inventory, balance, relics = [], shopStage = 1) {
  const active = inventory.filter((item) => !item.sold && !item.collateral);
  const byCategory = Object.groupBy(active, (item) => item.category);
  let multiplier = 1;
  for (const items of Object.values(byCategory)) {
    if (items.length >= 2) multiplier = Math.max(multiplier, 1.2);
    if (items.length >= 3) multiplier = Math.max(multiplier, 1.8);
    if (items.filter((x) => ['EPIC', 'LEGENDARY'].includes(x.grade)).length >= 3) multiplier = Math.max(multiplier, 2.4);
    if (new Set(items.map((x) => x.grade)).size >= 3) multiplier = Math.max(multiplier, 2.6);
  }
  if (new Set(active.map((item) => item.category)).size >= 6) multiplier = Math.max(multiplier, 1.4);
  if (multiplier > 1) multiplier *= 1 + (balance.shop.setBonus?.[shopStage] ?? 0);
  return multiplier + (relics.includes('house-crest') && multiplier > 1 ? 0.2 : 0);
}

export function sellAll(state, balance) {
  const fee = balance.shop.auctionFee[state.shopStage] ?? 0.05;
  const setMultiplier = bestSetMultiplier(state.inventory, balance, state.metaRelics, state.shopStage);
  let revenue = 0;
  for (const item of state.inventory.filter((entry) => !entry.sold && !entry.collateral)) {
    const marketIndex = state.marketPath[item.category][state.day - 1];
    const sale = Math.round(item.trueValue * marketIndex * setMultiplier * (1 - fee));
    item.sold = true;
    item.salePrice = sale;
    revenue += sale;
  }
  state.cash += revenue;
  return revenue;
}

export function sellItems(state, balance, lotIds) {
  const selected = new Set(lotIds);
  const fee = balance.shop.auctionFee[state.shopStage] ?? 0.05;
  const items = state.inventory.filter((entry) => selected.has(entry.lotId) && !entry.sold && !entry.collateral);
  const multiplier = bestSetMultiplier(items, balance, state.metaRelics, state.shopStage);
  let revenue = 0;
  for (const item of items) {
    const sale = Math.round(item.trueValue * state.marketPath[item.category][state.day - 1] * multiplier * (1 - fee));
    item.sold = true; item.salePrice = sale; revenue += sale;
  }
  state.cash += revenue; return revenue;
}

export function buyInformation(state, balance, kind) {
  const rate = balance.informationRate?.[kind];
  if (!rate || state.information?.[state.day]?.[kind]) return false;
  const lots = state.schedule.days[state.day - 1].lots;
  const discount = 1 - (balance.shop.infoDiscount?.[state.shopStage] ?? 0);
  const cost = Math.ceil(lots.reduce((sum, lot) => sum + lot.pricing.basePrice, 0) * rate * discount / 100) * 100;
  if (state.cash < cost) return false;
  state.cash -= cost; state.information ??= {}; state.information[state.day] ??= {}; state.information[state.day][kind] = { cost, boughtAt: Date.now() };
  return true;
}

export function acceptQuest(state, questId, balance) {
  if (state.activeQuests.length >= (balance.quests.offering.acceptMax || 2)) return false;
  const quest = state.questOffers.find((entry) => entry.id === questId && !entry.accepted);
  if (!quest || state.cash < quest.fee) return false;
  if (state.activeQuests.some((active) => QUEST_CLASH[active.id]?.includes(questId) || QUEST_CLASH[questId]?.includes(active.id))) return false;
  state.cash -= quest.fee; quest.accepted = true;
  state.activeQuests.push({ ...quest, startCash: state.cash, startHistory: state.history.length });
  return true;
}

export function settleQuests(state) {
  const today = state.history.filter((entry) => entry.day === state.day);
  const wins = today.filter((entry) => entry.won);
  for (const quest of state.activeQuests) {
    const wonItems = wins.map((win) => state.inventory.find((item) => item.lotId === win.lotId)).filter(Boolean);
    quest.completed = quest.id === 'designated' ? wonItems.some((item) => item.category === state.questTarget)
      : quest.id === 'multi' ? new Set(wonItems.map((item) => item.category)).size >= 2
      : quest.id === 'bargain' ? wonItems.some((item) => item.paid <= item.basePrice * 0.85)
      : quest.id === 'restraint' ? wins.length > 0 && state.cash >= quest.startCash * 0.6
      : today.some((entry) => entry.botPrice - entry.playerBid >= 1500);
    if (quest.completed) { state.cash += Math.round(quest.reward * (1 + (state.balanceQuestBonus?.[state.shopStage] ?? 0))); state.completedQuestCount += 1; }
  }
  const completed = state.activeQuests.filter((quest) => quest.completed).length;
  state.activeQuests = [];
  return completed;
}

export function upgradeShop(state, balance) {
  if (state.shopStage >= 4) return false;
  const next = state.shopStage + 1;
  const cost = balance.shop.upgradeCost[next - 1] || 0;
  const required = balance.shop.questRequirement[next - 1] || 0;
  if (state.cash < cost || state.completedQuestCount < required) return false;
  state.cash -= cost; state.shopStage = next; state.storage = balance.shop.storage[next];
  return true;
}

export function takeLoan(state, balance) {
  if (state.loan || state.shopStage < balance.loan.minShopStage || state.guildLocked) return false;
  const collateral = state.inventory.find((item) => !item.sold && !item.collateral);
  if (!collateral) return false;
  const principal = Math.round(collateral.trueValue * balance.loan.limitFromDisposalValue);
  collateral.collateral = true; state.cash += principal;
  state.loan = { principal, due: Math.round(principal * balance.loan.repayMultiplier), dueDay: state.day + balance.loan.termDays, lotId: collateral.lotId };
  return true;
}

export function settleLoan(state) {
  if (!state.loan || state.day < state.loan.dueDay) return 'none';
  const collateral = state.inventory.find((item) => item.lotId === state.loan.lotId);
  if (state.cash >= state.loan.due) { state.cash -= state.loan.due; collateral.collateral = false; state.loan = null; return 'repaid'; }
  collateral.sold = true; collateral.collateral = false; state.guildLocked = true; state.loan = null; return 'seized';
}

export function requiredStageForDay(day) { return day <= 3 ? 1 : day <= 6 ? 2 : day <= 9 ? 3 : 4; }

export function missedDeadline(state) { const required = { 3: 2, 6: 3, 9: 4 }[state.day]; return required ? state.shopStage < required : false; }

export function isBankrupt(state, balance) {
  const sellable = state.inventory.filter((item) => !item.sold && !item.collateral);
  const canLoan = state.shopStage >= balance.loan.minShopStage && !state.guildLocked && !state.loan && sellable.length > 0;
  return state.cash <= 0 && sellable.length === 0 && !canLoan;
}
