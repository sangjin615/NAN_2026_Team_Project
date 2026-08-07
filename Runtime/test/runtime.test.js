import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRunSchedule, normalizeVisualEffects, validateSchedule, VISUAL_EFFECTS_PER_GRADE } from '../src/schedule.js';
import { createSetGraph } from '../src/set-graph.js';
import { FallbackContentProvider, GenerationBuffer } from '../src/generation-buffer.js';
import { createInitialState, resolveLot, advanceDay, prepareAuctionEntry } from '../src/game-state.js';
import { resolveAuction, sellAll, sellItems, quoteItemsSale, bestSetMultiplier, acceptQuest, takeLoan, botBidForLot, estimateBotDailyAssets, nextBotBid, openingBotBid, missedDeadline, isBankrupt, deliverQuestItem, questCompletionBonus, refreshDailyQuestOffers, repayLoanEarly, selectDistinctBotInterests, createMarketPath } from '../src/systems.js';
import { recordEvent, runMetrics } from '../src/telemetry.js';
import { GenerationApiProvider } from '../src/generation-api-provider.js';
import { assertPublicGenerationConfig, resolveGenerationApiConfig } from '../src/generation-api-config.js';
import { SaveStore } from '../src/save-store.js';
import { dailyRepairIndices, qualityErrors, setIncidentErrors } from '../generation-server.js';
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

test('relic auction exposes the same bid controls as the normal auction', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const relicScene = html.match(/<section class="scene relic"[\s\S]*?<\/section>/)?.[0] || '';
  assert.deepEqual([...relicScene.matchAll(/data-relic-raise="([^"]+)"/g)].map((match) => match[1]), ['1.05', '1.1', '1.2']);
  assert.match(relicScene, /id="direct-relic-bid"/);
  assert.match(relicScene, /id="skip-relic"/);
});

test('auction participant portraits include the player and all relic rivals', async () => {
  const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const portrait of ['player-merchant.png', 'royal-agent.png', 'northern-merchant.png', 'foreign-collector.png']) {
    assert.match(appSource, new RegExp(portrait.replace('.', '\\.')));
  }
});

test('relic auction renders a three-lot guide with effects and auction states', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /class="relic-lot-list"/);
  assert.match(app, /세 유물의 효과와 낙찰 현황/);
  assert.match(app, /낙찰 ·/);
  assert.match(app, /경매 중 ·/);
  assert.match(app, /대기 중/);
});

test('relic auction side panels fill their painted frames', async () => {
  const css = await readFile(new URL('../runtime-fixes.css', import.meta.url), 'utf8');
  assert.match(css, /#relic-feed\s*\{[\s\S]*?top: \.5%;[\s\S]*?height: 98%;/);
  assert.match(css, /#relic-participants h3\s*\{[\s\S]*?place-items: center;/);
});

test('successful ending content fills the inner parchment without a dead lower section', async () => {
  const css = await readFile(new URL('../runtime-fixes.css', import.meta.url), 'utf8');
  assert.match(css, /grid-template-rows: 50% 45%; gap: 1%;[\s\S]*?padding: 15% 7% 7%;/);
});

test('final relic auction values stay around two hundred to two hundred fifty thousand gold', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.deepEqual(balance.relicAuction.startBid, [200000, 210000, 220000]);
  assert.deepEqual(balance.relicAuction.valueRange, [200000, 250000]);
  assert.equal(balance.relicAuction.botMaxBid, 227000);
  assert.match(app, /balance\.relicAuction\.botMaxBid/);
});

test('auction lots use their public base price without hidden quality values', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'no-hidden-quality' });
  const lots = schedule.days.flatMap((day) => day.lots);
  assert.equal(lots.every((lot) => !('quality' in lot)), true);
  assert.equal(lots.every((lot) => !('trueValue' in lot.pricing)), true);
});

test('sales ignore legacy hidden values and settle from the public base price', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'legacy-hidden-quality' });
  const state = createInitialState({ schedule, sets: [], balance, startCash: 0 });
  state.shopStage = 4;
  state.marketPath.CER = Array(12).fill(1);
  state.inventory.push({ lotId: 'legacy', basePrice: 1500, trueValue: 1200, category: 'CER', grade: 'COMMON', sold: false, collateral: false });
  assert.equal(quoteItemsSale(state, balance, ['legacy']).revenue, 1500);
});

test('browser zoom is inversely compensated while preserving the 16:9 layout viewport', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
    readFile(new URL('../runtime-fixes.css', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /outerWidth \/ viewportWidth/);
  assert.match(app, /--browser-zoom-inverse/);
  assert.match(app, /visualViewport\?\.addEventListener\('resize'/);
  assert.match(css, /#app\s*\{[\s\S]*?position: fixed; left: 0; top: 0;[\s\S]*?transform: scale\(var\(--browser-zoom-inverse\)\); transform-origin: top left;/);
  assert.match(css, /width: min\(var\(--layout-viewport-width\)/);
});

test('run start and every day transition keep the painted loading scene visible for two seconds', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /const MIN_LOADING_VISIBLE_MS = 2000;/);
  assert.match(app, /await waitForPaint\(\);\r?\n  const loadingVisibleSince = performance\.now\(\);/);
  assert.match(app, /async function nextDay\(\)[\s\S]*?adapter\.showScene\('loading'\);[\s\S]*?completeLoadingWindow\(loadingVisibleSince/);
  assert.match(app, /MIN_LOADING_VISIBLE_MS - \(performance\.now\(\) - visibleSince\)/);
});

test('guild artwork keeps its native ratio inside the 16:9 canvas', async () => {
  const css = await readFile(new URL('../runtime-fixes.css', import.meta.url), 'utf8');
  assert.match(css, /\[data-scene="guild"\]::before\s*\{[\s\S]*?inset: 0;[\s\S]*?background-size: 100% 100%;/);
  assert.match(css, /\[data-scene="guild"\] \.guild-heading\s*\{\s*display: none;/);
  assert.match(css, /#guild-collateral-list\s*\{[\s\S]*?top: 16\.5%;/);
});

test('the 16:9 canvas can grow beyond 1600 by 900', async () => {
  const css = await readFile(new URL('../runtime-fixes.css', import.meta.url), 'utf8');
  const sceneRule = css.match(/\.scene\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(sceneRule, /width: min\(var\(--layout-viewport-width\), calc\(var\(--layout-viewport-height\) \* 16 \/ 9\)\)/);
  assert.doesNotMatch(sceneRule, /--design-width/);
  assert.doesNotMatch(sceneRule, /--design-height/);
});

test('catalog exposes active quests in a dedicated side popup', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/app.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /id="catalog-quests"[^>]*aria-controls="catalog-quest-dialog"/);
  assert.match(html, /id="catalog-quest-dialog"/);
  assert.match(app, /function openCatalogQuestDialog\(\)/);
  assert.match(app, /state\.activeQuests\.filter\(\(quest\) => !quest\.completed\)/);
  assert.match(app, /#catalog-quest-dialog'\)\.showModal\(\)/);
});

test('catalog quest title uses the painted popup title bar without a duplicate panel', async () => {
  const css = await readFile(new URL('../runtime-fixes.css', import.meta.url), 'utf8');
  assert.match(css, /#catalog-quest-dialog > header\s*\{[\s\S]*?left: 21%; right: 22%; top: 1\.5%; height: 15%;[\s\S]*?grid-template-columns: 48px minmax\(0,max-content\);[\s\S]*?justify-content: center;[\s\S]*?background: transparent;/);
  assert.match(css, /#catalog-quest-dialog > header > div\s*\{[\s\S]*?position: static;[\s\S]*?text-align: left;/);
  assert.match(css, /#catalog-quest-dialog > header h2[^\{]*\{[^\}]*overflow: hidden;[^\}]*color: #f0dfc1;[^\}]*white-space: nowrap;/);
  assert.match(css, /#catalog-quest-dialog #close-catalog-quests[^\{]*\{[\s\S]*?right: -33%;[\s\S]*?border-image: none !important;/);
});

test('accepted quest label sits centered below the quest office heading', async () => {
  const css = await readFile(new URL('../runtime-fixes.css', import.meta.url), 'utf8');
  assert.match(css, /#active-quests \.accepted-quests > h4\s*\{[\s\S]*?left: 50%;[\s\S]*?transform: translateX\(-50%\); text-align: center;/);
});

test('auction merchandise has no repeating movement effects', async () => {
  const css = await readFile(new URL('../runtime-fixes.css', import.meta.url), 'utf8');
  assert.match(css, /\.mini-sprite\.vfx-focus-pulse img,[\s\S]*?animation: none !important;/);
  assert.match(css, /\.sprite-stage\.vfx-rising-particles::after[\s\S]*?content: none !important; animation: none !important;/);
});

test('shop storage cards show the item category', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /class="storage-category">계열 · \$\{escapeHtml\(categoryLabel\(lot\?\.category \|\| item\.category\)\)\}/);
});

test('successful result uses the full ending scene instead of the clear icon', async () => {
  const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  const cssSource = await readFile(new URL('../runtime-fixes.css', import.meta.url), 'utf8');
  assert.match(appSource, /ending-success-scene\.png/);
  assert.doesNotMatch(appSource, /action-icons\/clear\.png/);
  assert.match(cssSource, /ending-success-background\.png/);
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
  assert.equal(before.nemesis.initial, 14000);
  assert.equal(before['drifter-a'].initial, 14000);
  const winner = 'nemesis';
  state.history.push({ day: 1, winner, price: 3000 });
  const after = estimateBotDailyAssets({ state, balance });
  assert.equal(after[winner].initial, before[winner].initial);
  assert.equal(after[winner].remaining, before[winner].remaining - 3000);
  assert.equal(after['drifter-a'].remaining, before['drifter-a'].remaining);
});

test('competitor daily capital follows the shop stage', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'capital-stages' });
  const state = createInitialState({ schedule, sets: [], balance });
  for (const [shopStage, expected] of [[1, 14000], [2, 21000], [3, 28000], [4, 35000]]) {
    state.shopStage = shopStage;
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

test('bartender competitor information uses the current day auction lots', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /competitors: '오늘 경쟁자가 원하는 물품'/);
  assert.match(app, /const currentDayIndex = Math\.max\(0, state\.day - 1\);/);
  assert.match(app, /currentLots\.flatMap\(\(lot\) => botBidForLot\(\{ lot, day: state\.day,/);
  assert.doesNotMatch(app, /nextLots\.flatMap\(\(lot\) => botBidForLot\(\{ lot, day: state\.day \+ 1,/);
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

test('daily quest refresh removes active quests after their deadline', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'quest-expiry' });
  const state = createInitialState({ schedule, sets: createSetGraph(schedule, 'quest-expiry'), balance, startCash: 100000 });
  const quest = state.questOffers[0];
  assert.equal(acceptQuest(state, quest.offerId, balance), true);
  state.activeQuests[0].deadlineDay = state.day;

  advanceDay(state);
  refreshDailyQuestOffers(state, balance, state.metaRelics);

  assert.equal(state.activeQuests.length, 0);
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

test('individual inventory actions and telemetry are ready for place scenes', () => {
  const schedule = createRunSchedule({ catalog, balance, seed: 'places' });
  const sets = createSetGraph(schedule, 'places');
  const state = createInitialState({ schedule, sets, balance, startCash: 1000000 });
  const lot = schedule.days[0].lots[0];
  const auctionResult = resolveAuction({ state, lot, playerBid: 99999, balance });
  resolveLot(state, { action: 'bid', playerBid: 99999, auctionResult });
  const id = state.inventory[0].lotId;
  assert.ok(sellItems(state, balance, [id]) > 0);
  recordEvent(state, 'test-action', { lotId: id });
  assert.equal(runMetrics(state).events.length, 1);
});

test('disabled generation API fails fast so the two-day buffer can use fallback', async () => {
  const provider = new GenerationApiProvider({ enabled: false });
  await assert.rejects(() => provider.generateDay({ day: 1, lots: [], sets: [] }), /disabled/);
});

test('cancelling generation aborts the request in flight and the buffer falls back', async () => {
  // 블루프린트는 최악 120초까지 기다린다. 로딩 화면의 취소 수단이 이 경로를 쓴다.
  let aborted = false;
  const hang = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
  });
  const provider = new GenerationApiProvider({ enabled: true, endpoint: '/generate', timeoutMs: 120000 });
  const globalFetch = globalThis.fetch;
  globalThis.fetch = hang;
  try {
    const pending = provider.request({ mode: 'daily-content' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    provider.cancel();
    await assert.rejects(() => pending, /cancelled/);
    assert.equal(aborted, true);
    // 취소한 뒤에는 새 요청도 즉시 실패해야 한다. 그래야 남은 날짜에서 다시 멈추지 않는다.
    await assert.rejects(() => provider.request({ mode: 'daily-content' }), /cancelled/);
    // 다음 런에서는 다시 살아나야 한다.
    provider.reset();
    assert.equal(provider.cancelled, false);
  } finally {
    globalThis.fetch = globalFetch;
  }
});

test('a prefetched blueprint is adopted without calling the provider again', async () => {
  // 저장 슬롯 화면에서 미리 만들어 둔 것을 새 런이 그대로 쓴다. 여기서 공급자를
  // 한 번 더 부르면 미리 만든 의미가 없다 — 대기 시간도 비용도 두 배가 된다.
  let calls = 0;
  const provider = { async generateBlueprint() { calls += 1; return { runSeed: 'prefetch', premise: '늦게 만든 것' }; } };
  const buffer = new GenerationBuffer({ provider });
  const prefetched = { runSeed: 'prefetch', premise: '미리 만든 것' };
  const adopted = await buffer.prepareRun({ runSeed: 'prefetch' }, prefetched);
  assert.equal(calls, 0, '미리 만든 것이 있는데 공급자를 불렀다');
  assert.deepEqual(adopted, prefetched);
  // 일자 생성이 이 blueprint 를 맥락으로 받는다. 붙지 않으면 조용히 맥락 없는
  // 문구가 나온다.
  assert.deepEqual(buffer.blueprint, prefetched);
});

test('without a prefetched blueprint the run still generates one', async () => {
  let calls = 0;
  const provider = { async generateBlueprint() { calls += 1; return { runSeed: 'no-prefetch', premise: '지금 만든 것' }; } };
  const buffer = new GenerationBuffer({ provider });
  const made = await buffer.prepareRun({ runSeed: 'no-prefetch' });
  assert.equal(calls, 1);
  assert.equal(made.premise, '지금 만든 것');
});

test('a cancelled provider lets the buffer serve local fallback content', async () => {
  const provider = new GenerationApiProvider({ enabled: true, endpoint: '/generate' });
  provider.cancel();
  const buffer = new GenerationBuffer({ provider });
  const schedule = createRunSchedule({ catalog, balance, seed: 'cancel-fallback' });
  const sets = createSetGraph(schedule, 'cancel-fallback');
  assert.equal(await buffer.prepareRun({ runSeed: 'cancel-fallback', sets, schedule, market: createMarketPath(balance, 'cancel-fallback') }), null);
  const result = await buffer.ensure({ currentDay: 1, schedule, sets, aheadDays: 0 });
  const lots = schedule.days[0].lots;
  assert.equal(lots.every((lot) => lot.content?.description), true);
  assert.equal(lots[0].content.provenance, 'local-fallback');
  assert.equal(result.failures.some(({ message }) => /cancelled/.test(message)), true);
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

test('different opponents can raise against the current auction leader', () => {
  const bots = [
    { id: 'a', maxBid: 1800 },
    { id: 'b', maxBid: 1300 },
    { id: 'c', maxBid: 1600 },
  ];
  const first = nextBotBid({ bots, currentPrice: 1000, leader: 'a', minRaiseRate: 0.1 });
  assert.deepEqual(first, { bidder: bots[1], price: 1100 });
  const second = nextBotBid({ bots, currentPrice: first.price, leader: first.bidder.id, minRaiseRate: 0.1 });
  assert.deepEqual(second, { bidder: bots[2], price: 1210 });
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

test('generation API separates operation timeouts and accepts auth only from runtime config', async () => {
  const publicConfig = { enabled: false, endpoint: '/generate', timeoutMs: 15000, blueprintTimeoutMs: 12000, dayTimeoutMs: 30000 };
  const config = resolveGenerationApiConfig(publicConfig, { enabled: true, requestHeaders: { authorization: 'Bearer runtime-only' } });
  assert.equal(config.enabled, true);
  assert.equal(config.endpoint, '/generate');
  assert.throws(() => assertPublicGenerationConfig({ ...publicConfig, apiKey: 'must-not-embed' }), /must not be stored/);
  assert.throws(() => assertPublicGenerationConfig({ ...publicConfig, requestHeaders: { authorization: 'must-not-embed' } }), /must not be stored/);

  const provider = new GenerationApiProvider(config);
  assert.equal(provider.timeoutFor('run-blueprint'), 12000);
  assert.equal(provider.timeoutFor('daily-content'), 30000);

  const originalFetch = globalThis.fetch;
  let observedHeaders;
  globalThis.fetch = async (_url, options) => {
    observedHeaders = options.headers;
    return { ok: true, async json() { return { ok: true }; } };
  };
  try {
    await provider.request({ mode: 'probe' }, 1000);
    assert.equal(observedHeaders.authorization, 'Bearer runtime-only');
    assert.equal(observedHeaders['content-type'], 'application/json');
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
  const pearlJewelry = qualityErrors(
    { mode: 'daily-content', lots: [{ baseName: '흑진주 리본 목걸이', category: 'JEW' }] },
    { lots: [{ displayName: '흑진주 리본 목걸이', description: '진주 표면에 미세한 긁힘 자국이 드러난다.', rumor: '오래된 연회 기록에 등장했다는 소문이 있다.', setHint: '리본 각인', npcReaction: '보존 흔적을 자세히 살핀다.' }] },
  );
  assert.deepEqual(pearlJewelry, []);
  const liddedCeramic = qualityErrors(
    { mode: 'daily-content', lots: [{ baseName: '황동뚜껑 육각 항아리', category: 'CER' }] },
    { lots: [{ displayName: '황동뚜껑 육각 항아리', description: '육각 항아리에 황동 뚜껑이 밀착된 흔적이 확인된다.', rumor: '창고 기록에 등장했다는 소문이 있다.', setHint: '육각 보관품', npcReaction: '뚜껑의 마모를 자세히 살핀다.' }] },
  );
  assert.deepEqual(liddedCeramic, []);
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

test('a required ending appended after a finished sentence is rejected', () => {
  // 복구 경로가 실제로 만들어낸 형태다. 요구된 어미를 이미 끝난 문장 뒤에 덧붙여
  // safeDescriptionEnding 은 만족시키지만 두 문장이 된다. normalizedClauses 가
  // 10자 미만 조각("확인된다")을 버리는 탓에 한 문장으로 세어져 통과했고, 이
  // 문구가 경매장 카탈로그에 그대로 나갔다.
  const request = { mode: 'daily-content', lots: [{ baseName: '항로문 금은 상감함', category: 'MET' }] };
  const lot = (description) => ({ displayName: '항로문 금은 상감함', description, rumor: '창고 기록에 등장했다는 소문이 있다.', setHint: '항로 각인', npcReaction: '중개인이 이음새를 살핀다.' });

  const appended = qualityErrors(request, { lots: [lot('금속 표면에 세밀한 문양이 새겨져 있으며, 이음새가 잘 처리되어 있다. 확인된다.')] });
  assert.ok(appended.some((error) => error.includes('must end with a single period')), JSON.stringify(appended));

  // 같은 내용을 한 문장으로 쓰면 통과해야 한다. 규칙이 정상 문구까지 막으면 안 된다.
  const single = qualityErrors(request, { lots: [lot('금속 표면의 세밀한 문양과 이음새 마모가 함께 확인된다.')] });
  assert.deepEqual(single, []);
});

test('daily generation repair targets local errors but repairs all lots for global duplication', () => {
  const request = {
    mode: 'daily-content',
    lots: Array.from({ length: 8 }, (_, index) => ({ lotId: `lot-${index + 1}`, baseName: `물품 ${index + 1}`, category: 'MET' })),
  };
  const validLot = (index) => ({ lotId: `lot-${index + 1}`, displayName: `물품 ${index + 1}`, description: `금속 표면에 ${index + 1}번 마모 흔적이 남아 있다.`, rumor: '창고 장부에 기록됐다는 소문이 있다.', setHint: '같은 인계 표식', npcReaction: '표면의 마모를 자세히 살핀다.' });
  const localError = { lots: Array.from({ length: 8 }, (_, index) => validLot(index)) };
  localError.lots[3].description = '매우 특별한 물품이다.';
  assert.deepEqual(dailyRepairIndices(request, localError), [3]);

  const duplicate = { lots: Array.from({ length: 8 }, (_, index) => validLot(index)) };
  duplicate.lots[7].description = duplicate.lots[0].description;
  assert.deepEqual(dailyRepairIndices(request, duplicate), [0, 1, 2, 3, 4, 5, 6, 7]);
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
