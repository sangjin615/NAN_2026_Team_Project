import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRunSchedule, validateSchedule } from '../src/schedule.js';
import { createSetGraph } from '../src/set-graph.js';
import { FallbackContentProvider, GenerationBuffer } from '../src/generation-buffer.js';
import { createInitialState, resolveLot, advanceDay } from '../src/game-state.js';
import { resolveAuction, appraiseAll, appraiseItem, sellAll, sellItems, acceptQuest, takeLoan, botBidForLot, buyInformation, missedDeadline, isBankrupt, deliverQuestItem, repayLoanEarly } from '../src/systems.js';
import { recordEvent, runMetrics } from '../src/telemetry.js';
import { GenerationApiProvider } from '../src/generation-api-provider.js';
import { SaveStore } from '../src/save-store.js';
import { qualityErrors } from '../generation-server.js';

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
  assert.ok(schedule.days.slice(0, 3).every((day) => day.lots.every((lot) => lot.content?.description.includes('테마와 연결된'))));
  assert.ok(schedule.days.slice(0, 3).every((day) => day.lots.every((lot) => lot.content?.rumor && lot.content?.setHint && lot.content?.npcReaction)));
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

test('V6.2 loan unlocks at stage two and early repayment costs principal only', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'loan-v62' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'loan-v62'), balance, startCash: 100000 });
  const lot = schedule.days[0].lots[0];
  state.inventory.push({ lotId: lot.lotId, trueValue: 10000, sold: false, collateral: false });
  state.shopStage = 2;
  assert.equal(takeLoan(state, balance), true);
  assert.equal(state.loan.principal, 3500);
  const cashBeforeRepay = state.cash;
  assert.equal(repayLoanEarly(state, balance), true);
  assert.equal(state.cash, cashBeforeRepay - 3500);
  assert.equal(state.loan, null);
});

test('guild loan uses the collateral item selected by the player', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'selected-collateral' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'selected-collateral'), balance, startCash: 100000 });
  state.shopStage = 2;
  state.inventory.push(
    { lotId: 'first', trueValue: 10000, sold: false, collateral: false },
    { lotId: 'chosen', trueValue: 20000, sold: false, collateral: false },
  );
  assert.equal(takeLoan(state, balance, 'chosen'), true);
  assert.equal(state.loan.lotId, 'chosen');
  assert.equal(state.loan.principal, 7000);
  assert.equal(state.inventory[0].collateral, false);
  assert.equal(state.inventory[1].collateral, true);
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
  assert.equal(buyInformation(state, balance, 'competitors'), false);
  assert.ok(sellItems(state, balance, [id]) > 0);
  recordEvent(state, 'test-action', { lotId: id });
  assert.equal(runMetrics(state).events.length, 1);
});

test('disabled generation API fails fast so the two-day buffer can use fallback', async () => {
  const provider = new GenerationApiProvider({ enabled: false });
  await assert.rejects(() => provider.generateDay({ day: 1, lots: [], sets: [] }), /disabled/);
});

test('generation API sends only narrative identifiers and accepts fixed-order content', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body); requests.push(request);
    const payload = request.mode === 'run-blueprint'
      ? { schemaVersion: '1.0', runSeed: request.runSeed, premise: '도시의 경매 기록', marketArc: Array.from({ length: 12 }, (_, index) => ({ day: index + 1, headline: `${index + 1}일`, mood: '긴장' })), sets: request.sets.map(({ setId }) => ({ setId, title: setId, sharedSecret: '비밀', revealHint: '문양' })) }
      : { schemaVersion: '1.0', day: request.day, lots: request.lots.map(({ lotId, baseName }) => ({ lotId, displayName: baseName, description: `${baseName}의 기록`, rumor: '소문', setHint: '문양', npcReaction: '주시한다' })) };
    return { ok: true, async json() { return payload; } };
  };
  try {
    const provider = new GenerationApiProvider({ enabled: true, endpoint: 'http://local.test/generate', timeoutMs: 1000 });
    const sets = Array.from({ length: 12 }, (_, index) => ({ setId: `set-${index + 1}`, themeKey: 'voyage' }));
    const market = Object.fromEntries(['CER', 'CLK'].map((category) => [category, Array(12).fill(category === 'CER' ? 1.1 : 0.9)]));
    const blueprint = await provider.generateBlueprint({ runSeed: 'api-test', sets, market });
    const lots = Array.from({ length: 8 }, (_, index) => ({ lotId: `api-test-d1-l${index + 1}`, baseName: `물품 ${index + 1}`, category: 'CER', grade: 'COMMON', setId: sets[index].setId, pricing: { basePrice: 100, trueValue: 200 }, quality: 1.5 }));
    const generated = await provider.generateDay({ day: 1, lots, sets, blueprint });
    assert.equal(generated.length, 8);
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
