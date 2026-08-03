import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRunSchedule, validateSchedule } from '../src/schedule.js';
import { createSetGraph } from '../src/set-graph.js';
import { FallbackContentProvider, GenerationBuffer } from '../src/generation-buffer.js';
import { createInitialState, resolveLot, advanceDay } from '../src/game-state.js';
import { resolveAuction, appraiseAll, appraiseItem, sellAll, sellItems, acceptQuest, takeLoan, botBidForLot, buyInformation, missedDeadline, isBankrupt } from '../src/systems.js';
import { recordEvent, runMetrics } from '../src/telemetry.js';
import { GenerationApiProvider } from '../src/generation-api-provider.js';

const catalog = JSON.parse(await readFile(new URL('../assets/items/catalog.json', import.meta.url), 'utf8'));
const balance = JSON.parse(await readFile(new URL('../data/balance.json', import.meta.url), 'utf8'));

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

test('auction inventory connects to appraisal, sale, quest and loan systems', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'systems' });
  const sets = createSetGraph(schedule, 'systems');
  const state = createInitialState({ schedule, sets, balance, startCash: 1000000 });
  const lot = schedule.days[0].lots[0];
  const auctionResult = resolveAuction({ state, lot, playerBid: 99999, balance });
  resolveLot(state, { action: 'bid', playerBid: 99999, auctionResult });
  assert.equal(state.inventory.length, 1);
  assert.equal(appraiseAll(state, balance), 1);
  assert.ok(sellAll(state, balance) > 0);
  assert.equal(state.inventory[0].sold, true);
  assert.equal(acceptQuest(state, state.questOffers[0].id, balance), true);
  state.inventory[0].sold = false; state.shopStage = 3;
  assert.equal(takeLoan(state, balance), true);
});

test('balance-lab rules apply grade demand, quest clashes, deadlines and bankruptcy', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'lab-rules' });
  const sets = createSetGraph(schedule, 'lab-rules');
  const state = createInitialState({ schedule, sets, balance, startCash: 20000 });
  const lot = { ...schedule.days[0].lots[0], grade: 'LEGENDARY' };
  const low = botBidForLot({ lot, day: 1, balance, marketIndex: 0.8, seed: 'same' });
  const high = botBidForLot({ lot, day: 1, balance, marketIndex: 1.2, seed: 'same' });
  assert.ok(Math.max(...high.map((x) => x.maxBid)) > Math.max(...low.map((x) => x.maxBid)));
  state.questOffers = ['restraint', 'multi'].map((id) => ({ id, ...balance.quests[id], accepted: false }));
  assert.equal(acceptQuest(state, 'restraint', balance), true);
  assert.equal(acceptQuest(state, 'multi', balance), false);
  state.day = 3; state.shopStage = 1;
  assert.equal(missedDeadline(state), true);
  state.cash = 0; state.inventory = []; state.loan = null;
  assert.equal(isBankrupt(state, balance), true);
});

test('individual inventory actions, information and telemetry are ready for place scenes', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'places' });
  const sets = createSetGraph(schedule, 'places');
  const state = createInitialState({ schedule, sets, balance, startCash: 1000000 });
  const lot = schedule.days[0].lots[0];
  const auctionResult = resolveAuction({ state, lot, playerBid: 99999, balance });
  resolveLot(state, { action: 'bid', playerBid: 99999, auctionResult });
  const id = state.inventory[0].lotId;
  assert.equal(appraiseItem(state, balance, id), true);
  assert.equal(buyInformation(state, balance, 'forecast'), true);
  assert.ok(sellItems(state, balance, [id]) > 0);
  recordEvent(state, 'test-action', { lotId: id });
  assert.equal(runMetrics(state).events.length, 1);
});

test('disabled generation API fails fast so the two-day buffer can use fallback', async () => {
  const provider = new GenerationApiProvider({ enabled: false });
  await assert.rejects(() => provider.generateDay({ day: 1, lots: [], sets: [] }), /disabled/);
});
