import { createMarketPath, createDailyQuestOffers } from './systems.js';

export function createInitialState({ schedule, sets, balance, startCash = 20000, metaRelics = [] }) {
  return { version: 1, seed: schedule.seed, day: 1, lotIndex: 0, cash: startCash, inventory: [], history: [], events: [], information: {}, schedule, sets, phase: 'hub', completed: false, marketPath: createMarketPath(balance, schedule.seed), shopStage: 1, storage: balance.shop.storage[1], completedQuestCount: 0, activeQuests: [], questOffers: createDailyQuestOffers(balance, 1, schedule.seed, metaRelics), questTarget: 'CER', loan: null, guildLocked: false, metaRelics, balanceQuestBonus: balance.shop.questBonus };
}

export function resolveLot(state, { action, playerBid = 0, auctionResult }) {
  const lot = state.schedule.days[state.day - 1].lots[state.lotIndex]; const won = auctionResult.winner === 'player';
  if (won) { state.cash -= auctionResult.price; state.inventory.push({ lotId: lot.lotId, name: lot.content?.displayName || lot.baseName, paid: auctionResult.price, basePrice: lot.pricing.basePrice, trueValue: lot.pricing.trueValue, category: lot.category, grade: lot.grade, appraised: false, sold: false, collateral: false }); }
  state.history.push({ day: state.day, lotId: lot.lotId, action, playerBid, botPrice: Math.max(...auctionResult.bots.map(x=>x.maxBid)), price: auctionResult.price, winner: auctionResult.winner, won });
  state.lotIndex += 1; if (state.lotIndex >= state.schedule.days[state.day - 1].lots.length) state.phase = 'settlement'; return { lot, won };
}

export function advanceDay(state) { state.day += 1; state.lotIndex = 0; state.phase = 'hub'; }
