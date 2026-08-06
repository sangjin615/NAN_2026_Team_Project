import { createRng, shuffle } from './rng.js';
import { RELIC_AUCTION_DAY, RUN_DAYS } from './constants.js';

const QUEST_IDS = ['designated', 'multi', 'bargain', 'restraint', 'block'];
const GRADE_BETA = { COMMON: 0.27, RARE: 1, EPIC: 2.09, LEGENDARY: 3.64 };

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
  const count = Math.min(5, relics.includes('royal-charter') ? 5 : balance.quests?.offering?.perDay || 3);
  const enabledQuestIds = QUEST_IDS.filter((id) => balance.quests[id]?.enabled !== false);
  const rewardPolicy = balance.quests?.rewardPolicy || {};
  const families = shuffle(['CER', 'CLK', 'PNT', 'BOK', 'MET', 'JEW'], createRng(`${seed}:quest-targets:${day}`));
  const shuffledIds = shuffle(enabledQuestIds, createRng(`${seed}:quests:${day}`));
  const dailyIds = Array.from({ length: count }, (_, index) => shuffledIds[index % shuffledIds.length]);
  return dailyIds.map((id, index) => ({
    offerId: `day-${day}-${id}-${index + 1}`, offeredDay: day, acceptDeadlineDay: Math.min(12, day + 1),
    id, fee: balance.quests[id].fee, reward: balance.quests[id].reward,
    rewardMode: rewardPolicy.mode, completionBonus: rewardPolicy.completionBonus,
    completionBonusByStage: rewardPolicy.completionBonusByStage,
    rule: balance.quests[id].rule, accepted: false, completed: false,
    targetCategory: families[index % families.length], acceptedDay: null, deadlineDay: null
  }));
}

export function marketIndexForDay(path, day) {
  if (!Array.isArray(path) || !path.length) return 1;
  const index = Math.max(0, Math.min(path.length - 1, Number(day || 1) - 1));
  const value = Number(path[index]);
  return Number.isFinite(value) ? value : 1;
}

export function refreshDailyQuestOffers(state, balance, relics = []) {
  state.questOffers = createDailyQuestOffers(balance, state.day, state.seed, relics);
  return state.questOffers;
}

export function botBidForLot({ lot, day, balance, marketIndex, seed }) {
  const rng = createRng(`${seed}:bots:${lot.lotId}`);
  const dayStage = Math.min(4, Math.floor((day - 1) / 3) + 1);
  const dailyCapital = balance.bots.capitalByStage?.[dayStage] ?? balance.bots.nemesisInitial * (balance.bots.growthPerDay ** day);
  const demand = (balance.market.expectedDemand ?? 1.05) + (GRADE_BETA[lot.grade] ?? 1) * (marketIndex - 1);
  const publicEstimate = lot.pricing.basePrice * demand;
  const families = ['CER', 'CLK', 'PNT', 'BOK', 'MET', 'JEW'];
  const target = () => families[Math.floor(rng() * families.length)];
  const bids = [
    { id: 'nemesis', name: '갈레오', target: target(), cap: dailyCapital, factor: 0.78 + rng() * 0.30 },
    { id: 'drifter-a', name: '모이라', target: target(), cap: dailyCapital, factor: 0.78 + rng() * 0.30 },
    { id: 'drifter-b', name: '이네스', target: target(), cap: dailyCapital, factor: 0.78 + rng() * 0.30 }
  ];
  return bids.map((bot) => ({ ...bot, maxBid: Math.max(0, Math.round(Math.min(bot.cap, publicEstimate * (bot.target === lot.category ? 1.18 : 1) * ({ COMMON: 0.9, RARE: 1, EPIC: 1.05, LEGENDARY: 1.1 }[lot.grade] ?? 1) * bot.factor))) }));
}

export function selectDistinctBotInterests(estimates) {
  const grouped = Object.groupBy(estimates, (bot) => bot.name);
  const selectedLotIds = new Set();
  return Object.entries(grouped).map(([name, entries]) => {
    const ranked = [...entries].sort((a, b) => b.maxBid - a.maxBid);
    const interest = ranked.find((entry) => !selectedLotIds.has(entry.lot.lotId)) || ranked[0];
    if (interest) selectedLotIds.add(interest.lot.lotId);
    return { name, interest };
  }).filter(({ interest }) => interest);
}

export function openingBotBid(bots, openingPrice) {
  const bidder = [...bots].filter((bot) => bot.maxBid > 0).sort((a, b) => b.maxBid - a.maxBid)[0];
  if (!bidder) return null;
  return { bidder, price: Math.max(1, Math.min(openingPrice, bidder.maxBid)) };
}

export function estimateBotDailyAssets({ state, balance, day = state.day }) {
  const dayStage = Math.min(4, Math.floor((day - 1) / 3) + 1);
  const initial = balance.bots.capitalByStage?.[dayStage] ?? 0;
  const ids = ['nemesis', 'drifter-a', 'drifter-b'];
  const spent = {};
  for (const entry of state.history || []) {
    if (entry.day !== day || entry.winner === 'player') continue;
    spent[entry.winner] = (spent[entry.winner] || 0) + Number(entry.price || 0);
  }
  return Object.fromEntries(ids.map((id) => [id, {
    initial,
    remaining: Math.max(0, initial - (spent[id] || 0)),
  }]));
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

export function bestSetMultiplier(inventory, balance, relics = [], shopStage = 1) {
  const active = inventory.filter((item) => !item.sold && !item.collateral);
  const byCategory = Object.groupBy(active, (item) => item.category);
  let multiplier = 1;
  const groups = Object.values(byCategory);
  const rules = [
    [groups.some((items) => items.length >= 2), 1.2],
    [groups.some((items) => items.length >= 3), 1.3],
    [groups.some((items) => new Set(items.map((x) => x.grade)).size >= 3), 1.35],
    [groups.some((items) => items.filter((x) => ['EPIC', 'LEGENDARY'].includes(x.grade)).length >= 3), 1.4],
    [new Set(active.map((item) => item.category)).size >= 6, 1.5],
  ];
  for (const [matches, bonus] of rules) {
    if (matches) multiplier = Math.max(multiplier, bonus);
  }
  if (multiplier > 1) multiplier *= 1 + (balance.shop.setBonus?.[shopStage] ?? 0);
  return multiplier + (relics.includes('house-crest') && multiplier > 1 ? 0.2 : 0);
}

export function sellAll(state, balance) {
  const fee = balance.shop.auctionFee[state.shopStage] ?? 0.05;
  const setMultiplier = bestSetMultiplier(state.inventory, balance, state.metaRelics, state.shopStage);
  let revenue = 0;
  for (const item of state.inventory.filter((entry) => !entry.sold && !entry.collateral)) {
    const marketIndex = marketIndexForDay(state.marketPath[item.category], state.day);
    const calculatedSale = Math.round(item.trueValue * marketIndex * setMultiplier * (1 - fee));
    const sale = Number.isFinite(calculatedSale) ? calculatedSale : 0;
    item.sold = true;
    item.salePrice = sale;
    revenue += sale;
  }
  state.cash += revenue;
  return revenue;
}

export function sellItems(state, balance, lotIds) {
  const quote = quoteItemsSale(state, balance, lotIds);
  const selected = new Set(lotIds);
  const items = state.inventory.filter((entry) => selected.has(entry.lotId) && !entry.sold && !entry.collateral);
  for (const item of items) {
    const sale = quote.sales[item.lotId];
    item.sold = true; item.salePrice = sale;
  }
  state.cash += quote.revenue; return quote.revenue;
}

export function quoteItemsSale(state, balance, lotIds) {
  const selected = new Set(lotIds);
  const fee = balance.shop.auctionFee[state.shopStage] ?? 0.05;
  const items = state.inventory.filter((entry) => selected.has(entry.lotId) && !entry.sold && !entry.collateral);
  const multiplier = bestSetMultiplier(items, balance, state.metaRelics, state.shopStage);
  const sales = Object.fromEntries(items.map((item) => {
    const marketIndex = marketIndexForDay(state.marketPath[item.category], state.day);
    const calculatedSale = Math.round(item.trueValue * marketIndex * multiplier * (1 - fee));
    return [item.lotId, Number.isFinite(calculatedSale) ? calculatedSale : 0];
  }));
  return { count: items.length, multiplier, revenue: Object.values(sales).reduce((sum, sale) => sum + sale, 0), sales };
}

export function acceptQuest(state, questId, balance) {
  const quest = state.questOffers.find((entry) => (entry.offerId === questId || entry.id === questId) && !entry.accepted);
  if (!quest || state.day > RUN_DAYS || balance.quests[quest.id]?.enabled === false || state.cash < quest.fee) return false;
  state.cash -= quest.fee; quest.accepted = true;
  state.activeQuests.push({ ...quest, acceptedDay: state.day, deadlineDay: Math.min(RELIC_AUCTION_DAY, state.day + 2) });
  return true;
}

export function questMatchesItem(quest, item) {
  if (!quest || !item || item.sold || item.collateral || item.delivered) return false;
  if (quest.id === 'designated') return item.category === quest.targetCategory;
  if (quest.id === 'multi') return ['RARE', 'EPIC', 'LEGENDARY'].includes(item.grade);
  if (quest.id === 'bargain') return item.paid <= item.basePrice * 0.85;
  if (quest.id === 'restraint') return ['COMMON', 'RARE'].includes(item.grade);
  return ['EPIC', 'LEGENDARY'].includes(item.grade);
}

export function effectiveQuestDeadline(quest) {
  return quest?.deadlineDay === RUN_DAYS ? RELIC_AUCTION_DAY : quest?.deadlineDay;
}

export function questCompletionBonus(quest, shopStage) {
  return quest?.completionBonusByStage?.[shopStage] ?? quest?.completionBonus ?? 0;
}

export function deliverQuestItem(state, questId, lotId) {
  const quest = state.activeQuests.find((entry) => (entry.offerId === questId || entry.id === questId) && !entry.completed);
  const item = state.inventory.find((entry) => entry.lotId === lotId);
  if (!quest || state.day > effectiveQuestDeadline(quest) || !questMatchesItem(quest, item)) return false;
  item.delivered = true; item.sold = true; item.salePrice = 0;
  quest.completed = true; quest.deliveredLotId = lotId; quest.completedDay = state.day;
  const shopBonus = state.balanceQuestBonus?.[state.shopStage] ?? 0;
  const completionBonus = questCompletionBonus(quest, state.shopStage);
  const reward = quest.rewardMode === 'deliveredBasePlusFeePlusBonus'
    ? item.basePrice + quest.fee + completionBonus
    : Math.round(quest.reward * (1 + shopBonus));
  quest.paidReward = reward;
  state.cash += reward; state.completedQuestCount += 1;
  return true;
}

export function expireQuestsBeforeAuction(state) {
  const expired = state.activeQuests.filter((quest) => !quest.completed && state.day > effectiveQuestDeadline(quest));
  state.activeQuests = state.activeQuests.filter((quest) => !quest.completed && state.day <= effectiveQuestDeadline(quest));
  return expired.length;
}

export function settleQuests(state) {
  const completed = state.activeQuests.filter((quest) => quest.completed).length;
  state.activeQuests = state.activeQuests.filter((quest) => !quest.completed);
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

export function takeLoan(state, balance, lotId = null) {
  if (state.loan || state.shopStage < balance.loan.minShopStage || state.guildLocked || state.day + balance.loan.termDays > 12) return false;
  const collateral = state.inventory.find((item) => !item.sold && !item.collateral && !item.delivered && (!lotId || item.lotId === lotId));
  if (!collateral) return false;
  const round10 = (value) => Math.round(value / 10) * 10;
  const principal = round10(collateral.basePrice * balance.loan.limitFromDisposalValue);
  collateral.collateral = true; state.cash += principal;
  state.loan = { principal, due: round10(principal * balance.loan.repayMultiplier), earlyRepayment: round10(principal * balance.loan.earlyRepayMultiplier), dueDay: state.day + balance.loan.termDays, lotId: collateral.lotId };
  return true;
}

export function settleLoan(state) {
  if (!state.loan || state.day < state.loan.dueDay) return 'none';
  const collateral = state.inventory.find((item) => item.lotId === state.loan.lotId);
  if (state.cash >= state.loan.due) { state.cash -= state.loan.due; collateral.collateral = false; state.loan = null; return 'repaid'; }
  if (collateral) { collateral.sold = true; collateral.collateral = false; }
  state.cash -= Math.max(0, state.loan.due - Number(collateral?.basePrice || 0));
  state.guildLocked = true; state.loan = null; return 'seized';
}

export function repayLoanEarly(state, balance) {
  if (!state.loan || state.day >= state.loan.dueDay) return false;
  const amount = state.loan.earlyRepayment ?? Math.round(state.loan.principal * (balance.loan.earlyRepayMultiplier ?? 1) / 10) * 10;
  if (state.cash < amount) return false;
  const collateral = state.inventory.find((item) => item.lotId === state.loan.lotId);
  state.cash -= amount;
  if (collateral) collateral.collateral = false;
  state.loan = null;
  return true;
}

export function requiredStageForDay(day) { return day <= 3 ? 1 : day <= 6 ? 2 : day <= 9 ? 3 : 4; }

export function missedDeadline(state) { const required = { 3: 2, 6: 3, 9: 4 }[state.day]; return required ? state.shopStage < required : false; }

export function isBankrupt(state, balance) {
  return false;
}
