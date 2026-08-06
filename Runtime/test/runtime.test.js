import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRunSchedule, normalizeVisualEffects, validateSchedule, VISUAL_EFFECTS_PER_GRADE } from '../src/schedule.js';
import { createSetGraph } from '../src/set-graph.js';
import { FallbackContentProvider, GenerationBuffer } from '../src/generation-buffer.js';
import { createInitialState, resolveLot, advanceDay, prepareAuctionEntry } from '../src/game-state.js';
import { resolveAuction, sellAll, sellItems, quoteItemsSale, bestSetMultiplier, acceptQuest, takeLoan, botBidForLot, estimateBotDailyAssets, openingBotBid, buyInformation, missedDeadline, isBankrupt, deliverQuestItem, questCompletionBonus, refreshDailyQuestOffers, repayLoanEarly, selectDistinctBotInterests } from '../src/systems.js';
import { recordEvent, runMetrics } from '../src/telemetry.js';
import { GenerationApiProvider } from '../src/generation-api-provider.js';
import { SaveStore } from '../src/save-store.js';
import { qualityErrors, setIncidentErrors } from '../generation-server.js';
import { RELIC_AUCTION_DAY, RUN_DAYS } from '../src/constants.js';
import { mergeOwnedRelicIds } from '../src/relic-ownership.js';
import { extendAuctionDeadline, formatAuctionTime } from '../src/auction-clock.js';

const catalog = JSON.parse(await readFile(new URL('../assets/items/catalog.json', import.meta.url), 'utf8'));
const balance = JSON.parse(await readFile(new URL('../data/balance.json', import.meta.url), 'utf8'));

test('relic ownership includes saved and newly acquired relics without duplicates', () => {
  assert.deepEqual(
    mergeOwnedRelicIds(['compass'], ['royal-charter'], ['compass', 'merchant-safe'], undefined),
    ['compass', 'royal-charter', 'merchant-safe'],
  );
});

test('auction bids add three seconds and the clock shows tenths', () => {
  assert.equal(extendAuctionDeadline(15000), 18000);
  assert.equal(extendAuctionDeadline(18000), 21000);
  assert.equal(formatAuctionTime(14949), '14.9초');
  assert.equal(formatAuctionTime(0), '0.0초');
});

test('creates a reproducible 12 day, 96 lot schedule from the 60 base items', () => {
  const first = createRunSchedule({ catalog, balance, seed: 'demo' });
  const second = createRunSchedule({ catalog, balance, seed: 'demo' });
  assert.deepEqual(first, second);
  assert.deepEqual(validateSchedule(first), { valid: true, days: 12, lots: 96, uniqueBaseItems: 60 });
});

test('set graph is fixed for the full run before rolling descriptions are generated', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'sets' });
  const sets = createSetGraph(schedule, 'sets');
  assert.equal(sets.length, 12);
  assert.equal(sets.flatMap((set) => set.lotIds).length, 96);
  assert.ok(schedule.days.flatMap((day) => day.lots).every((lot) => lot.setId));
});

test('generation buffer prepares current day plus two and falls back without blocking', async () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'buffer' });
  const sets = createSetGraph(schedule, 'buffer');
  const broken = { async generateDay() { throw new Error('offline'); } };
  const buffer = new GenerationBuffer({ provider: broken, fallback: new FallbackContentProvider() });
  const result = await buffer.ensure({ currentDay: 1, schedule, sets });
  assert.equal(result.readyThrough, 3);
  assert.equal(buffer.readyDays.size, 3);
  assert.equal(result.failures.length, 3);
  assert.ok(schedule.days.slice(0, 3).every((day) => day.lots.every((lot) => lot.content?.provenance === 'local-fallback')));
  assert.ok(schedule.days.slice(0, 3).every((day) => day.lots.every((lot) => lot.content?.description.includes('테마와 연결된'))));
  assert.ok(schedule.days.slice(0, 3).every((day) => day.lots.every((lot) => lot.content?.rumor && lot.content?.setHint && lot.content?.npcReaction)));
});

test('daily price stages are fixed once from catalog prices', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'daily-price-stages' });
  for (const [dayIndex, multiplier] of [0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 1, 1, 1, 1.25, 1.25, 1.25].entries()) {
    for (const lot of schedule.days[dayIndex].lots) {
      assert.equal(lot.pricing.basePrice, Math.round(lot.pricing.catalogBasePrice * multiplier / 100) * 100);
      assert.equal(lot.pricing.priceMultiplier, multiplier);
    }
  }
});

test('competitor estimated assets stay fixed for the day and decrease after a win', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'daily-assets' });
  const state = createInitialState({ schedule, sets: [], balance });
  const before = estimateBotDailyAssets({ state, balance });
  assert.equal(before.nemesis.initial, 8000);
  assert.equal(before['drifter-a'].initial, 8000);
  const winner = 'nemesis';
  state.history.push({ day: 1, winner, price: 3000 });
  const after = estimateBotDailyAssets({ state, balance });
  assert.equal(after[winner].initial, before[winner].initial);
  assert.equal(after[winner].remaining, before[winner].remaining - 3000);
  assert.equal(after['drifter-a'].remaining, before['drifter-a'].remaining);
});

test('competitor daily capital follows the day stage', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'capital-stages' });
  const state = createInitialState({ schedule, sets: [], balance });
  for (const [day, expected] of [[1, 8000], [4, 12000], [7, 16000], [10, 20000]]) {
    state.day = day;
    assert.equal(estimateBotDailyAssets({ state, balance }).nemesis.initial, expected);
  }
});

test('competitor information selects a different preferred lot for each competitor', () => {
  const lots = ['lot-a', 'lot-b', 'lot-c'].map((lotId) => ({ lotId }));
  const estimates = ['갈레오', '모이라', '이네스'].flatMap((name) => lots.map((lot, index) => ({
    name,
    lot,
    maxBid: 3000 - index * 100,
  })));

  const interests = selectDistinctBotInterests(estimates);
  assert.deepEqual(interests.map(({ interest }) => interest.lot.lotId), ['lot-a', 'lot-b', 'lot-c']);
});

test('repairs the first-day auction cursor after generated lot content changes', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'auction-entry-repair' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'auction-entry-repair'), balance });
  const firstLot = schedule.days[0].lots[0];
  state.lotIndex = 'missing';
  state.auctionSession = { lotId: 'stale-lot' };
  firstLot.content = { ...firstLot.content, displayName: '새로 생성된 첫 경매품' };

  assert.equal(prepareAuctionEntry(state), firstLot);
  assert.equal(state.lotIndex, 0);
  assert.equal(state.auctionSession, null);
});

test('resumes auction entry at the first unresolved lot', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'auction-entry-resume' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'auction-entry-resume'), balance });
  state.history.push({ day: 1, lotId: schedule.days[0].lots[0].lotId });
  state.lotIndex = 99;

  assert.equal(prepareAuctionEntry(state), schedule.days[0].lots[1]);
  assert.equal(state.lotIndex, 1);
});

test('visual effect counts are consistent within a grade and increase by grade', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'equal-vfx-count' });
  const lots = schedule.days.flatMap((day) => day.lots);
  assert.ok(lots.every((lot) => lot.visualEffects.length === VISUAL_EFFECTS_PER_GRADE[lot.grade]));
  assert.ok(lots.every((lot) => new Set(lot.visualEffects).size === VISUAL_EFFECTS_PER_GRADE[lot.grade]));
  assert.equal(normalizeVisualEffects('CER', 'COMMON', ['display-shadow']).length, 1);
  assert.equal(normalizeVisualEffects('CER', 'RARE', ['display-shadow']).length, 2);
  assert.equal(normalizeVisualEffects('CER', 'EPIC', ['display-shadow']).length, 3);
  assert.equal(normalizeVisualEffects('CER', 'LEGENDARY', ['display-shadow']).length, 4);
});

test('core state can finish all 12 days without a VSL implementation', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'finish' });
  const sets = createSetGraph(schedule, 'finish');
  const state = createInitialState({ schedule, sets, balance });
  for (let day = 1; day <= 12; day += 1) {
    for (let lot = 0; lot < 8; lot += 1) {
      const current = schedule.days[day - 1].lots[lot];
      const auctionResult = resolveAuction({ state, lot: current, playerBid: 0, balance });
      resolveLot(state, { action: 'pass', auctionResult });
    }
    if (day < 12) advanceDay(state);
  }
  assert.equal(state.phase, 'settlement');
  assert.equal(state.history.length, 96);
});

test('auction inventory connects to sale, quest and loan systems', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'systems' });
  const sets = createSetGraph(schedule, 'systems');
  const state = createInitialState({ schedule, sets, balance, startCash: 1000000 });
  const lot = schedule.days[0].lots[0];
  const auctionResult = resolveAuction({ state, lot, playerBid: 99999, balance });
  resolveLot(state, { action: 'bid', playerBid: 99999, auctionResult });
  assert.equal(state.inventory.length, 1);
  assert.ok(sellAll(state, balance) > 0);
  assert.equal(state.inventory[0].sold, true);
  assert.equal(acceptQuest(state, state.questOffers[0].id, balance), true);
  state.inventory[0].sold = false; state.shopStage = 3;
  assert.equal(takeLoan(state, balance), true);
});

test('V6.2 rules apply grade demand, allow all offered quests, upgrade deadlines and no bankruptcy', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'lab-rules' });
  const sets = createSetGraph(schedule, 'lab-rules');
  const state = createInitialState({ schedule, sets, balance, startCash: 20000 });
  const lot = { ...schedule.days[0].lots[0], grade: 'LEGENDARY' };
  const low = botBidForLot({ lot, day: 1, balance, marketIndex: 0.8, seed: 'same' });
  const high = botBidForLot({ lot, day: 1, balance, marketIndex: 1.2, seed: 'same' });
  assert.ok(Math.max(...high.map((x) => x.maxBid)) > Math.max(...low.map((x) => x.maxBid)));
  state.questOffers = ['restraint', 'multi', 'designated'].map((id) => ({ id, ...balance.quests[id], accepted: false }));
  assert.equal(acceptQuest(state, 'restraint', balance), true);
  assert.equal(acceptQuest(state, 'multi', balance), true);
  assert.equal(acceptQuest(state, 'designated', balance), true);
  state.day = 3; state.shopStage = 1;
  assert.equal(missedDeadline(state), true);
  state.cash = 0; state.inventory = []; state.loan = null;
  assert.equal(isBankrupt(state, balance), false);
});

test('V6.2 quests complete only after a matching inventory item is delivered', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'delivery' });
  const sets = createSetGraph(schedule, 'delivery');
  const state = createInitialState({ schedule, sets, balance, startCash: 1000000 });
  const lot = schedule.days[0].lots[0];
  state.inventory.push({ lotId: lot.lotId, name: lot.baseName, paid: 1, basePrice: lot.pricing.basePrice, trueValue: lot.pricing.trueValue, category: lot.category, grade: lot.grade, sold: false, collateral: false });
  state.questOffers = [{ id: 'designated', fee: 0, reward: 1000, accepted: false, targetCategory: lot.category }];
  assert.equal(acceptQuest(state, 'designated', balance), true);
  assert.equal(deliverQuestItem(state, 'designated', lot.lotId), true);
  assert.equal(state.inventory[0].delivered, true);
  assert.equal(state.completedQuestCount, 1);
});

test('delivery quest reward refunds base price and fee, then adds a fixed 3000 completion bonus', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'delivery-reward' });
  const sets = createSetGraph(schedule, 'delivery-reward');
  const state = createInitialState({ schedule, sets, balance, startCash: 1000000 });
  const lot = schedule.days[0].lots[0];
  state.shopStage = 3;
  state.inventory.push({ lotId: lot.lotId, name: lot.baseName, paid: 1, basePrice: 4000, trueValue: lot.pricing.trueValue, category: lot.category, grade: lot.grade, sold: false, collateral: false });
  state.questOffers = [{ id: 'designated', fee: 400, reward: 1, rewardMode: 'deliveredBasePlusFeePlusBonus', completionBonus: 3000, accepted: false, targetCategory: lot.category }];
  assert.equal(acceptQuest(state, 'designated', balance), true);
  const beforeDelivery = state.cash;
  assert.equal(deliverQuestItem(state, 'designated', lot.lotId), true);
  assert.equal(state.cash - beforeDelivery, 7400);
  assert.equal(state.activeQuests[0].paidReward, 7400);
});

test('stage-based quest bonus uses the same value for display and payment', () => {
  const quest = { completionBonus: 6000, completionBonusByStage: [0, 3000, 4500, 6000, 7500] };
  assert.equal(questCompletionBonus(quest, 1), 3000);
  assert.equal(questCompletionBonus(quest, 4), 7500);
});

test('the 12 normal auction days advance to a separate day 13 relic-auction hub', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'relic-day-transition' });
  const state = createInitialState({ schedule, sets: [], balance });
  state.day = RUN_DAYS;
  state.phase = 'settlement';

  advanceDay(state);

  assert.equal(state.day, RELIC_AUCTION_DAY);
  assert.equal(state.phase, 'hub');
  assert.equal(state.schedule.days.length, RUN_DAYS);
});

test('each day allows every offered quest even when earlier quests are still active', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'quest-carryover' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'quest-carryover'), balance, startCash: 100000 });
  state.activeQuests = ['old-1', 'old-2', 'old-3'].map((id) => ({ id, acceptedDay: 1, deadlineDay: 3, completed: false }));
  state.day = 2;
  state.questOffers = ['restraint', 'multi', 'designated'].map((id) => ({ id, ...balance.quests[id], accepted: false }));
  assert.equal(acceptQuest(state, 'restraint', balance), true);
  assert.equal(acceptQuest(state, 'multi', balance), true);
  assert.equal(acceptQuest(state, 'designated', balance), true);
  assert.equal(state.activeQuests.length, 6);
});

test('daily quest refresh replaces yesterday offers with three new offers', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'quest-refresh' });
  const sets = createSetGraph(schedule, 'quest-refresh');
  const state = createInitialState({ schedule, sets, balance, startCash: 1000000 });
  const [first, second] = state.questOffers;
  assert.equal(acceptQuest(state, first.offerId, balance), true);
  assert.equal(acceptQuest(state, second.offerId, balance), true);
  state.activeQuests.forEach((quest) => { quest.completed = true; });
  advanceDay(state);
  refreshDailyQuestOffers(state, balance, state.metaRelics);
  assert.equal(state.questOffers.length, 3);
  assert.equal(state.questOffers.every((quest) => quest.offeredDay === 2), true);
  assert.equal(state.questOffers.some((quest) => quest.offerId === first.offerId || quest.offerId === second.offerId), false);
  assert.equal(new Set(state.questOffers.map((quest) => quest.offerId)).size, state.questOffers.length);
});

test('royal charter expands the refreshed daily quest offers from three to five', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'quest-royal-charter' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'quest-royal-charter'), balance, startCash: 100000 });
  state.metaRelics = ['royal-charter'];
  refreshDailyQuestOffers(state, balance, state.metaRelics);
  assert.equal(state.questOffers.length, 5);
  assert.equal(state.questOffers.every((quest) => quest.offeredDay === state.day), true);
});

test('disabled bargain quests are not generated or carried into a new day', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'no-bargain' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'no-bargain'), balance, startCash: 100000 });
  assert.equal(state.questOffers.some((quest) => quest.id === 'bargain'), false);
  state.questOffers.push({ id: 'bargain', offerId: 'legacy-bargain', offeredDay: 1, acceptDeadlineDay: 2, accepted: false, fee: 400 });
  assert.equal(acceptQuest(state, 'legacy-bargain', balance), false);
  state.day = 2;
  refreshDailyQuestOffers(state, balance, []);
  assert.equal(state.questOffers.some((quest) => quest.id === 'bargain'), false);
});

test('loan uses public base price and charges 105% for early repayment', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'loan-v62' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'loan-v62'), balance, startCash: 100000 });
  const lot = schedule.days[0].lots[0];
  state.inventory.push({ lotId: lot.lotId, basePrice: 10000, trueValue: 20000, sold: false, collateral: false });
  state.shopStage = 2;
  assert.equal(takeLoan(state, balance), true);
  assert.equal(state.loan.principal, 15000);
  const cashBeforeRepay = state.cash;
  assert.equal(repayLoanEarly(state, balance), true);
  assert.equal(state.cash, cashBeforeRepay - 15750);
  assert.equal(state.loan, null);
});

test('guild loan uses the collateral item selected by the player', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'selected-collateral' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'selected-collateral'), balance, startCash: 100000 });
  state.shopStage = 2;
  state.inventory.push(
    { lotId: 'first', basePrice: 10000, trueValue: 50000, sold: false, collateral: false },
    { lotId: 'chosen', basePrice: 20000, trueValue: 1000, sold: false, collateral: false },
  );
  assert.equal(takeLoan(state, balance, 'chosen'), true);
  assert.equal(state.loan.lotId, 'chosen');
  assert.equal(state.loan.principal, 30000);
  assert.equal(state.inventory[0].collateral, false);
  assert.equal(state.inventory[1].collateral, true);
});

test('new loans cannot mature beyond day twelve', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'late-loan' });
  const state = createInitialState({ schedule, sets: [], balance, startCash: 100000 });
  state.shopStage = 2;
  state.day = 10;
  state.inventory.push({ lotId: 'late', basePrice: 10000, trueValue: 20000, sold: false, collateral: false });
  assert.equal(takeLoan(state, balance, 'late'), false);
});

test('relic-auction day uses the final market price and keeps sale cash finite', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'final-day-sale' });
  const state = createInitialState({ schedule, sets: [], balance, startCash: 5000 });
  state.day = RELIC_AUCTION_DAY;
  state.shopStage = 4;
  state.inventory.push({ lotId: 'final-sale', trueValue: 1000, basePrice: 1000, paid: 500, category: 'CER', grade: 'COMMON', sold: false, collateral: false });
  const expected = Math.round(1000 * state.marketPath.CER.at(-1) * (1 - balance.shop.auctionFee[4]));

  assert.equal(sellItems(state, balance, ['final-sale']), expected);
  assert.equal(state.cash, 5000 + expected);
  assert.equal(Number.isFinite(state.cash), true);
});

test('a quest accepted on day twelve can be delivered before the relic auction', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'final-day-quest' });
  const state = createInitialState({ schedule, sets: [], balance, startCash: 100000 });
  state.day = RUN_DAYS;
  const quest = state.questOffers.find((entry) => entry.id === 'restraint') || state.questOffers[0];
  quest.id = 'restraint';
  assert.equal(acceptQuest(state, quest.offerId, balance), true);
  state.activeQuests[0].deadlineDay = RUN_DAYS;
  state.inventory.push({ lotId: 'final-quest-item', basePrice: 1000, paid: 500, category: 'CER', grade: 'COMMON', sold: false, collateral: false });
  state.day = RELIC_AUCTION_DAY;

  assert.equal(deliverQuestItem(state, quest.offerId, 'final-quest-item'), true);
  assert.equal(state.completedQuestCount, 1);
});

test('three save slots keep current and backup packets independently', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const saves = new SaveStore(storage);
  const schedule = createRunSchedule({ catalog, balance, seed: 'save-v62' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'save-v62'), balance });
  assert.equal(saves.save(state, 2), true);
  state.day = 2;
  assert.equal(saves.save(state, 2), true);
  assert.equal(saves.load(2).day, 2);
  assert.equal(saves.list()[1].empty, false);
  assert.equal(saves.list()[0].empty, true);
});

test('save slots preserve the day thirteen relic-auction state', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const saves = new SaveStore(storage);
  const schedule = createRunSchedule({ catalog, balance, seed: 'save-relic-day' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'save-relic-day'), balance });
  state.day = RELIC_AUCTION_DAY;
  state.phase = 'hub';

  assert.equal(saves.save(state, 1), true);
  assert.equal(saves.load(1).day, RELIC_AUCTION_DAY);
});

test('individual inventory actions, information and telemetry are ready for place scenes', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'places' });
  const sets = createSetGraph(schedule, 'places');
  const state = createInitialState({ schedule, sets, balance, startCash: 1000000 });
  const lot = schedule.days[0].lots[0];
  const auctionResult = resolveAuction({ state, lot, playerBid: 99999, balance });
  resolveLot(state, { action: 'bid', playerBid: 99999, auctionResult });
  const id = state.inventory[0].lotId;
  const cashBeforeInformation = state.cash;
  assert.equal(buyInformation(state, balance, 'forecast'), true);
  assert.equal(state.cash, cashBeforeInformation);
  assert.equal(buyInformation(state, balance, 'competitors'), false);
  assert.ok(sellItems(state, balance, [id]) > 0);
  recordEvent(state, 'test-action', { lotId: id });
  assert.equal(runMetrics(state).events.length, 1);
});

test('disabled generation API fails fast so the two-day buffer can use fallback', async () => {
  const provider = new GenerationApiProvider({ enabled: false });
  await assert.rejects(() => provider.generateDay({ day: 1, lots: [], sets: [] }), /disabled/);
});

test('exchange quote matches the actual bundle sale without mutating inventory', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'bundle-quote' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'bundle-quote'), balance, startCash: 20000 });
  state.inventory.push(
    { lotId: 'cer-1', trueValue: 1000, category: 'CER', grade: 'COMMON', sold: false, collateral: false },
    { lotId: 'cer-2', trueValue: 1200, category: 'CER', grade: 'RARE', sold: false, collateral: false },
  );
  const quote = quoteItemsSale(state, balance, ['cer-1', 'cer-2']);
  assert.equal(quote.count, 2);
  assert.ok(quote.multiplier >= 1.2);
  assert.equal(state.inventory.some((item) => item.sold), false);
  assert.equal(sellItems(state, balance, ['cer-1', 'cer-2']), quote.revenue);
});

test('exchange applies only the highest matching set bonus', () => {
  const items = [
    { category: 'CER', grade: 'COMMON', sold: false, collateral: false },
    { category: 'CER', grade: 'RARE', sold: false, collateral: false },
    { category: 'CER', grade: 'EPIC', sold: false, collateral: false },
  ];
  assert.equal(bestSetMultiplier(items, balance, [], 0), 1.35);
  const highGradeItems = items.map((item, index) => ({ ...item, grade: index === 2 ? 'LEGENDARY' : 'EPIC' }));
  assert.equal(bestSetMultiplier(highGradeItems, balance, [], 0), 1.4);
  const allCategories = ['CER', 'CLK', 'PNT', 'BOK', 'MET', 'JEW'].map((category) => ({ category, grade: 'COMMON', sold: false, collateral: false }));
  assert.equal(bestSetMultiplier(allCategories, balance, [], 0), 1.5);
});

test('an opponent places the opening bid without exceeding its budget', () => {
  const bots = [{ id: 'a', name: 'A', maxBid: 900 }, { id: 'b', name: 'B', maxBid: 1400 }];
  assert.deepEqual(openingBotBid(bots, 1000), { bidder: bots[1], price: 1000 });
  assert.deepEqual(openingBotBid(bots, 1800), { bidder: bots[1], price: 1400 });
  assert.equal(openingBotBid([{ id: 'a', maxBid: 0 }], 1000), null);
});

test('generation API sends only narrative identifiers and accepts fixed-order content', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body); requests.push(request);
    const payload = request.mode === 'run-blueprint'
      ? { schemaVersion: '1.0', runSeed: request.runSeed, premise: '도시의 경매 기록', marketArc: Array.from({ length: 12 }, (_, index) => ({ day: index + 1, headline: `${index + 1}일`, mood: '긴장' })), sets: request.sets.map(({ setId }) => ({ setId, title: setId, sharedSecret: '비밀', revealHint: '문양', incidentTitle: '봉인 창고 문서 발견', incidentSummary: '세 물품이 같은 창고의 압류 기록에서 발견되었다.', newspaperLead: '항구 창고를 정리하던 조합원이 오래된 압류 문서를 발견했다. 문서에는 오늘 경매품과 같은 표식이 남아 있었다.' })) }
      : { schemaVersion: '1.0', day: request.day, lots: request.lots.map(({ lotId, baseName }) => ({ lotId, displayName: baseName, description: `${baseName}의 기록`, rumor: '소문', setHint: '문양', npcReaction: '주시한다' })) };
    return { ok: true, async json() { return payload; } };
  };
  try {
    const provider = new GenerationApiProvider({ enabled: true, endpoint: 'http://local.test/generate', timeoutMs: 1000 });
    const sets = Array.from({ length: 12 }, (_, index) => ({
      setId: `set-${index + 1}`,
      themeKey: 'voyage',
      lotIds: [`set-${index + 1}-a`, `set-${index + 1}-b`],
    }));
    const schedule = {
      days: [{
        day: 1,
        lots: sets.flatMap((set, index) => [
          { lotId: `${set.setId}-a`, baseName: `기록품 ${index + 1}A`, category: 'CER' },
          { lotId: `${set.setId}-b`, baseName: `기록품 ${index + 1}B`, category: 'BOK' },
        ]),
      }],
    };
    const market = Object.fromEntries(['CER', 'CLK'].map((category) => [category, Array(12).fill(category === 'CER' ? 1.1 : 0.9)]));
    const blueprint = await provider.generateBlueprint({ runSeed: 'api-test', sets, schedule, market });
    const lots = Array.from({ length: 8 }, (_, index) => ({ lotId: `api-test-d1-l${index + 1}`, baseName: `물품 ${index + 1}`, category: 'CER', grade: 'COMMON', setId: sets[index].setId, pricing: { basePrice: 100, trueValue: 200 }, quality: 1.5 }));
    const generated = await provider.generateDay({ day: 1, lots, sets, blueprint });
    assert.equal(generated.length, 8);
    assert.deepEqual(requests[0].sets[0].members, [
      { lotId: 'set-1-a', baseName: '기록품 1A', category: 'CER' },
      { lotId: 'set-1-b', baseName: '기록품 1B', category: 'BOK' },
    ]);
    assert.deepEqual(Object.keys(requests[1].lots[0]), ['lotId', 'baseName', 'category', 'grade', 'setId']);
    assert.equal(JSON.stringify(requests).includes('basePrice'), false);
    assert.equal(JSON.stringify(requests).includes('trueValue'), false);
    assert.equal(JSON.stringify(requests).includes('quality'), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('generation copy quality rejects supernatural, awkward and repeated catalog prose', () => {
  const request = { mode: 'daily-content', lots: Array.from({ length: 8 }, (_, index) => ({ baseName: `물품 ${index + 1}` })) };
  const lot = (description, index) => ({ displayName: request.lots[index].baseName, description, rumor: '오래된 창고에서 발견됐다는 소문이 돈다.', setHint: '같은 각인', npcReaction: '중개인이 표면의 흠집을 살핀다.' });
  const bad = { lots: Array.from({ length: 8 }, (_, index) => lot('새로운 세계를 탐험할 수 있는 힘이 느껴진다.', index)) };
  const errors = qualityErrors(request, bad);
  assert.ok(errors.some((error) => error.includes('banned phrase')));
  assert.ok(errors.some((error) => error.includes('repeated clause')));
  const categoryMismatch = qualityErrors(
    { mode: 'daily-content', lots: [{ baseName: '창가의 재봉사', category: 'PNT' }] },
    { lots: [lot('재봉사의 바늘 끝에 금속 손상이 남아 있다.', 0)] },
  );
  assert.ok(categoryMismatch.some((error) => error.includes('does not match category PNT')));
  const goodDescriptions = [
    '은제 뚜껑 가장자리에 항로를 닮은 가는 선각이 남아 있다.',
    '검게 바랜 가죽 표지 안쪽에 여러 필체의 메모가 겹쳐 보인다.',
    '사파이어 둘레의 작은 흠집 사이로 별자리 각인이 이어진다.',
    '북문 거리의 행렬을 그린 안료 일부의 변색이 보인다.',
    '범선 모형의 돛대 밑에서 오래된 조선소 표식이 확인된다.',
    '티아라의 세 갈래 받침마다 서로 다른 세공 흔적이 보인다.',
    '사자 모양 손잡이 안쪽에 붉은 안료가 얇게 남아 있다.',
    '육각 몸체와 황동 뚜껑의 마모 정도가 서로 다르게 보인다.',
  ];
  assert.deepEqual(qualityErrors(request, { lots: goodDescriptions.map(lot) }), []);
});

test('set incident quality requires Korean copy, member names, and distinct grounded reporting', () => {
  const input = { setId: 'set-01', members: [{ baseName: '은제 항로함' }, { baseName: '선박 등록부' }] };
  const valid = {
    setId: 'set-01', title: '항구 인계 기록', sharedSecret: '같은 인계 번호가 남아 있다.', revealHint: '같은 번호',
    incidentTitle: '항구 창고에서 누락 장부 발견',
    incidentSummary: '창고 관리인이 은제 항로함과 선박 등록부를 함께 적은 장부를 발견했다.',
    newspaperLead: '항구 정리 중 나온 문서에서 은제 항로함과 선박 등록부의 공동 보관 기록이 확인됐다.',
  };
  assert.deepEqual(setIncidentErrors(input, valid), []);
  const invalid = { ...valid, incidentSummary: '마법 물품이 내일 시세를 예언한다.', newspaperLead: '마법 물품이 내일 시세를 예언한다.' };
  const errors = setIncidentErrors(input, invalid);
  assert.ok(errors.some((error) => error.includes('two set members')));
  assert.ok(errors.some((error) => error.includes('magic')));
  assert.ok(errors.some((error) => error.includes('distinct')));
  assert.ok(setIncidentErrors(input, valid, [valid]).some((error) => error.includes('repeats another set')));
});
