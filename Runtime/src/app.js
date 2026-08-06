import { loadCatalog, spriteUrl } from './catalog.js';
import { createRunSchedule, normalizeVisualEffects, validateSchedule } from './schedule.js';
import { createSetGraph } from './set-graph.js';
import { GenerationBuffer } from './generation-buffer.js';
import { GenerationApiProvider } from './generation-api-provider.js';
import { SaveStore } from './save-store.js';
import { advanceDay, createInitialState, prepareAuctionEntry, resolveLot } from './game-state.js';
import { VslRuntimeAdapter } from './vsl-adapter.js';
import {
  acceptQuest, appraiseItem, botBidForLot, estimateBotDailyAssets, openingBotBid, selectDistinctBotInterests,
  deliverQuestItem, effectiveQuestDeadline, expireQuestsBeforeAuction, missedDeadline, questMatchesItem,
  marketIndexForDay, quoteItemsSale, refreshDailyQuestOffers, repayLoanEarly, sellItems, settleLoan, settleQuests, takeLoan, upgradeShop,
} from './systems.js';
import { downloadRunLog, recordEvent } from './telemetry.js';
import { AudioBus } from './audio-bus.js';
import { createRng } from './rng.js';
import { JOURNEY_DAYS, RELIC_AUCTION_DAY, RUN_DAYS } from './constants.js';
import { mergeOwnedRelicIds } from './relic-ownership.js';

const root = document.querySelector('#app');
const adapter = new VslRuntimeAdapter(root);
const store = new SaveStore();
const audio = new AudioBus();
audio.setEnabled(localStorage.getItem('unknown-auction:sound') !== 'off');
let generation = new GenerationBuffer();
let state;
let catalog;
let balance;
let selectedSlot = 1;
let slotMode = 'new';
let museumReturn = 'city';
let actionTimer = null;
let auctionBotTimer = null;
let actionToastTimer = null;
let selectedInfoKind = 'competitors';

const GRADE_LABELS = { COMMON: '일반', RARE: '희귀', EPIC: '영웅', LEGENDARY: '전설' };
const RELIC_TIER_LABELS = { low: '하급', mid: '중급', high: '상급' };
const CATEGORY_LABELS = { CER: '도자기', CLK: '시계', PNT: '회화', BOK: '고서', MET: '금은세공', JEW: '장신구' };
const categoryIconUrl = (category) => `./assets/ui/market-categories/${category.toLowerCase()}.png`;
const gradeLabel = (grade) => GRADE_LABELS[grade] || grade;
const categoryLabel = (category) => CATEGORY_LABELS[category] || category;
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function clearActionTimer() {
  if (actionTimer) window.clearInterval(actionTimer);
  if (auctionBotTimer) window.clearTimeout(auctionBotTimer);
  actionTimer = null;
  auctionBotTimer = null;
}

function queueAuctionBotResponse(lotId, playerPrice) {
  if (auctionBotTimer) window.clearTimeout(auctionBotTimer);
  const delay = 1000 + Math.floor(Math.random() * 1001);
  auctionBotTimer = window.setTimeout(() => {
    auctionBotTimer = null;
    const session = state.auctionSession;
    if (!session || session.lotId !== lotId || session.leader !== 'player' || session.currentPrice !== playerPrice) return;
    const raise = Math.max(1, Math.ceil(session.currentPrice * balance.auction.minRaiseRate));
    const challenger = [...session.bots].filter((bot) => bot.maxBid > session.currentPrice).sort((a, b) => b.maxBid - a.maxBid)[0];
    if (!challenger) { finishLot('pass'); return; }
    session.currentPrice = Math.min(challenger.maxBid, session.currentPrice + raise);
    session.leader = challenger.id;
    session.feed.push(`${challenger.name} ${money(session.currentPrice)}`);
    session.deadline = Date.now() + 15000;
    audio.playSfx('bot-bid');
    renderAuction();
  }, delay);
}

function armActionTimer(selector, deadline, onExpire) {
  clearActionTimer();
  let expired = false;
  const update = () => {
    const remaining = Math.max(0, deadline - Date.now());
    const element = document.querySelector(selector);
    if (element) element.textContent = `${Math.ceil(remaining / 1000)}초`;
    if (!remaining && !expired) {
      expired = true; clearActionTimer(); onExpire();
    }
  };
  update(); actionTimer = window.setInterval(update, 200);
}

const relicArt = {
  'old-scale': '황금 저울의 심장.png',
  'leather-ledger': '끝나지 않는 장부.png',
  'worn-seal': '봉인된 유리잔.png',
  magnifier: '침묵하는 감정안.png',
  compass: '상인의 별 나침반.png',
  'broker-card': '망각의 낙찰표.png',
  'royal-charter': '도시의 축소 모형.png',
  'house-crest': '마지막 상회의 문장.png',
  'merchant-safe': '검은 금고의 열쇠.png',
};

const money = (value) => `${Math.round(Number(value || 0)).toLocaleString('ko-KR')} G`;
const status = (text, tone = 'ready') => { const element = document.querySelector('#boot-status'); element.textContent = text; element.dataset.tone = tone; };
const ownedItems = () => state.inventory.filter((item) => !item.sold && !item.delivered);
const scheduledLot = (lotId) => state.schedule.days.flatMap((day) => day.lots).find((lot) => lot.lotId === lotId);
const spriteAnchorAttrs = (lot) => `class="item-sprite-anchor" style="--sprite-anchor-x:${Number(lot?.spriteAnchor?.x || 0)}%;--sprite-anchor-y:${Number(lot?.spriteAnchor?.y || 0)}%"`;
const save = () => store.save(state, state.saveSlot);

function loadMeta() {
  try { return JSON.parse(localStorage.getItem('unknown-auction:relics') || '[]'); }
  catch { return []; }
}

const ownedRelicIds = () => mergeOwnedRelicIds(loadMeta(), state?.metaRelics, state?.relicChoices);

function renderSaveSlots() {
  const slots = store.list();
  const savedTime = (value) => value ? new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '';
  document.querySelector('#save-slots').innerHTML = slots.map((slot) => `
    <button class="save-slot slot-${slot.slot} ${slot.empty ? 'is-empty' : ''} ${slot.slot === selectedSlot ? 'is-selected' : ''}" data-save-slot="${slot.slot}">
      <b class="slot-number">${String(slot.slot).padStart(2, '0')}</b>
      <span class="slot-preview ${slot.empty ? 'is-empty' : ''}" aria-hidden="true">${slot.empty ? '+' : ''}</span>
      ${slot.empty ? '<span class="empty-slot-copy"><strong>빈 저장칸</strong><small>새 게임을 시작하여 저장할 수 있습니다.</small></span>' : `
        <span class="slot-stat"><small>현재 일차</small><strong>${slot.day}일차</strong></span>
        <span class="slot-stat"><small>보유 자산</small><strong>${money(slot.cash)}</strong></span>
        <span class="slot-stat"><small>상회 단계</small><strong>${slot.shopStage}단계</strong></span>
        <span class="slot-stat saved-at"><small>마지막 저장</small><strong>${savedTime(slot.savedAt)}</strong></span>`}
    </button>`).join('');
  document.querySelectorAll('[data-save-slot]').forEach((button) => {
    button.onclick = () => { selectedSlot = Number(button.dataset.saveSlot); renderSaveSlots(); };
  });
  document.querySelector('#continue-run').disabled = store.list().find((slot) => slot.slot === selectedSlot)?.empty ?? true;
  const selected = slots.find((slot) => slot.slot === selectedSlot);
  document.querySelector('#new-run').textContent = selected?.empty ? '새 여정 시작' : '선택 슬롯 덮어쓰기';
  document.querySelector('#new-run').hidden = slotMode !== 'new';
  document.querySelector('#continue-run').hidden = slotMode !== 'continue';
  document.querySelector('#delete-save').hidden = slotMode !== 'continue';
  document.querySelector('#delete-save').disabled = selected?.empty ?? true;
  document.querySelector('#save-guide').textContent = slotMode === 'continue' ? '저장 슬롯을 선택한 후 이어하기 버튼을 눌러 진행하세요.' : '새 여정을 저장할 슬롯을 선택하세요.';
  document.querySelector('#save-mode-title').textContent = slotMode === 'new' ? '새 여정 슬롯 선택' : '이어할 여정 선택';
}

function openSlotScene(mode) {
  slotMode = mode;
  document.querySelector('[data-scene="save"]').dataset.mode = mode;
  adapter.showScene('save');
  renderSaveSlots();
}

const waitForPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function updateRunLoading(progress, message, completedSteps = [], activeStep = '') {
  const scene = document.querySelector('[data-scene="loading"]');
  const value = Math.max(0, Math.min(100, Math.round(progress)));
  document.querySelector('#loading-message').textContent = message;
  document.querySelector('#loading-progress-fill').style.width = `${value}%`;
  document.querySelector('#loading-percent').textContent = `${value}%`;
  scene.querySelector('.loading-progress').setAttribute('aria-valuenow', String(value));
  scene.querySelectorAll('[data-loading-step]').forEach((step) => {
    step.classList.toggle('is-complete', completedSteps.includes(step.dataset.loadingStep));
    step.classList.toggle('is-active', step.dataset.loadingStep === activeStep);
  });
}

async function boot() {
  try {
    await adapter.loadContract();
    const apiConfig = await fetch('./data/api-config.json').then((response) => response.json());
    generation = new GenerationBuffer({ provider: new GenerationApiProvider(apiConfig) });
    [catalog, balance] = await Promise.all([
      loadCatalog(),
      fetch('./data/balance.json').then((response) => response.json()),
      audio.load(),
    ]);
    status(`기본 품목 ${catalog.items.length}종 · 등급 스프라이트 240개 · V6.2 준비 완료`);
    renderSaveSlots();
  } catch (error) {
    status(`초기화 실패: ${error.message}`, 'error');
  }
}

async function newRun(seed) {
  const loadingStartedAt = performance.now();
  adapter.showScene('loading');
  updateRunLoading(6, '저장 슬롯과 새 여정을 준비하고 있습니다.', [], 'schedule');
  await waitForPaint();

  updateRunLoading(18, '12일 경매 일정을 구성했습니다.', ['schedule'], 'sets');
  const schedule = createRunSchedule({ catalog, balance, seed });
  if (!validateSchedule(schedule).valid) throw new Error('96 LOT 생성 실패');
  updateRunLoading(38, '품목 세트와 시장 흐름을 연결하고 있습니다.', ['schedule'], 'sets');
  const sets = createSetGraph(schedule, seed);
  state = createInitialState({ schedule, sets, balance, startCash: balance.run.startCash, metaRelics: loadMeta() });
  state.saveSlot = selectedSlot;
  state.version = 2;
  recordEvent(state, 'run-start', { saveSlot: selectedSlot });
  updateRunLoading(58, '첫날 경매와 도시 정보를 생성하고 있습니다.', ['schedule', 'sets'], 'content');
  state.generationBlueprint = await generation.prepareRun({
    runSeed: seed, sets, schedule, market: state.marketPath,
  });
  await generation.ensure({ currentDay: 1, schedule, sets, aheadDays: 0 });
  updateRunLoading(88, `SLOT ${selectedSlot}에 새 여정을 저장하고 있습니다.`, ['schedule', 'sets', 'content'], 'save');
  save();
  const remainingMs = 900 - (performance.now() - loadingStartedAt);
  if (remainingMs > 0) await new Promise((resolve) => window.setTimeout(resolve, remainingMs));
  updateRunLoading(100, '준비가 완료되었습니다. 도시로 이동합니다.', ['schedule', 'sets', 'content', 'save']);
  await waitForPaint();
  audio.playBgm('city');
  renderHub();
  generation.ensure({ currentDay: 1, schedule, sets }).then(save);
}

function syncHeader() {
  adapter.setText('day', state.day);
  adapter.setText('cash', money(state.cash));
  const scene = document.querySelector('.scene:not([hidden])');
  const facilityScenes = new Set(['hub', 'quests', 'tavern', 'catalog', 'exchange', 'shop', 'guild', 'museum']);
  if (scene && facilityScenes.has(scene.dataset.scene)) {
    let hud = scene.querySelector('.scene-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.className = 'scene-hud';
      hud.setAttribute('aria-label', '현재 여정 상태');
      scene.prepend(hud);
    }
    const loan = state.loan ? `${state.loan.dueDay}일 만기` : '대출 없음';
    hud.innerHTML = `<span class="hud-day"><b>${state.day}일차 / ${JOURNEY_DAYS}</b></span><span class="hud-cash"><b>${money(state.cash)}</b></span><span class="hud-storage"><small>보관칸</small><b>${ownedItems().length} / ${state.storage}</b></span><span class="hud-stage"><b>${state.shopStage}단계</b><small>상회 단계</small></span><span class="hud-loan"><small>담보 대출</small><b>${loan}</b></span><button class="scene-hud-settings" aria-label="설정">설정</button>`;
    hud.querySelector('.scene-hud-settings').onclick = () => document.querySelector('#settings-dialog').showModal();
  }
}

function currentNewspaperIncident() {
  const blueprintSets = state.generationBlueprint?.sets;
  const todayLots = state.schedule?.days?.[Math.min(state.day, 12) - 1]?.lots || [];
  if (!Array.isArray(blueprintSets) || !todayLots.length) return null;
  const todaySetIds = new Set(todayLots.map((lot) => lot.setId));
  return blueprintSets.find((set) => todaySetIds.has(set.setId) && set.incidentTitle && set.newspaperLead) || null;
}

function renderHub(message = '') {
  clearActionTimer(); audio.playBgm('city');
  state.phase = 'hub';
  adapter.showScene('hub');
  syncHeader();
  const values = {
    day: state.day,
    cash: money(state.cash),
    stage: state.shopStage,
    storage: `${ownedItems().length} / ${state.storage}`,
    quests: state.completedQuestCount,
  };
  for (const [key, value] of Object.entries(values)) adapter.setText(key, value);
  const incident = currentNewspaperIncident();
  const incidentArticle = incident
    ? `<article class="market-incident"><small>도시 사건 기록</small><h4>${escapeHtml(incident.incidentTitle)}</h4><p>${escapeHtml(incident.newspaperLead)}</p></article>`
    : '';
  document.querySelector('#market-indices').innerHTML = `<strong>오늘의 시세</strong><div class="market-sparklines">${Object.entries(state.marketPath)
    .map(([family, valuesByDay]) => {
      const visible = valuesByDay.slice(0, state.day);
      const current = visible.at(-1);
      const previous = visible.at(-2) ?? current;
      const trend = current > previous ? 'rise' : current < previous ? 'fall' : 'flat';
      const arrow = trend === 'rise' ? '▲' : trend === 'fall' ? '▼' : '—';
      const pointList = visible.map((value, index) => {
        const x = visible.length === 1 ? 50 : 3 + (index / (visible.length - 1)) * 94;
        const y = 40 - Math.max(0, Math.min(1, (value - 0.7) / 0.6)) * 32;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      if (pointList.length === 1) {
        const y = pointList[0].split(',')[1];
        pointList.splice(0, 1, `3,${y}`, `97,${y}`);
      }
      const points = pointList.join(' ');
      const [lastX, lastY] = points.split(' ').at(-1).split(',');
      const trendImage = trend === 'flat' ? '' : `<img class="trend-icon" src="./assets/ui/action-icons/market-${trend}.png" alt="">`;
      return `<span class="market-spark ${trend}" data-category="${family}"><span class="market-quote"><img src="${categoryIconUrl(family)}" alt=""><b>${CATEGORY_LABELS[family]}</b><em>${(current * 100).toFixed(0)}</em><i aria-label="${trend === 'rise' ? '상승' : trend === 'fall' ? '하락' : '변동 없음'}">${trendImage || arrow}</i></span><svg viewBox="0 0 100 46" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="25" x2="100" y2="25"></line><polyline points="${points}"></polyline><circle cx="${lastX}" cy="${lastY}" r="3.4"></circle></svg></span>`;
    }).join('')}</div>${incidentArticle}`;
  document.querySelector('#loan-status').textContent = state.loan
    ? `만기 ${state.loan.dueDay}일 · ${money(state.loan.due)}`
    : state.guildLocked ? '조합 이용 제한' : '대출 없음';
  document.querySelector('#hub-message').textContent = message;
  save();
}

function questTitle(quest) {
  const names = { designated: '지정 계열', multi: '희귀품 인도', bargain: '저가 매입품', restraint: '실속품 인도', block: '고등급 인도' };
  return `${names[quest.id] || quest.id}${quest.id === 'designated' ? ` · ${categoryLabel(quest.targetCategory)}` : ''}`;
}

function questRequirement(quest) {
  if (quest.id === 'designated') return `${categoryLabel(quest.targetCategory)} 계열 물품 1개를 인도한다.`;
  if (quest.id === 'multi') return '희귀 등급 이상 물품 1개를 인도한다.';
  if (quest.id === 'bargain') return '기준가의 85% 이하에 낙찰한 물품을 인도한다.';
  if (quest.id === 'restraint') return '일반 또는 희귀 등급 물품 1개를 인도한다.';
  return '영웅 또는 전설 등급 물품 1개를 인도한다.';
}

function questIconUrl(questId) {
  const icon = {
    designated: 'designated', multi: 'multi', bargain: 'bargain',
    restraint: 'restraint', block: 'block',
  }[questId] || 'quest-board';
  return `./assets/ui/quest-icons/${icon}.png`;
}

function questRewardLabel(quest) {
  return quest.rewardMode === 'deliveredBasePlusFeePlusBonus'
    ? `물품 기준가 + 수주비 + ${money(quest.completionBonus || 0)}`
    : money(quest.reward);
}

function showActionToast(message) {
  if (actionToastTimer) window.clearTimeout(actionToastTimer);
  actionToastTimer = null;
  const element = document.querySelector('#action-toast');
  element.textContent = message;
  element.classList.toggle('is-visible', Boolean(message));
  if (!message) return;
  actionToastTimer = window.setTimeout(() => {
    if (element.textContent === message) {
      element.textContent = '';
      element.classList.remove('is-visible');
    }
    actionToastTimer = null;
  }, 1500);
}

const showQuestMessage = showActionToast;
const showShopMessage = showActionToast;

function renderQuestOffice(message = '') {
  clearActionTimer(); audio.playBgm('workplace'); state.phase = 'quests'; adapter.showScene('quests'); syncHeader();
  const visibleQuestOffers = state.questOffers.filter((quest) => balance.quests[quest.id]?.enabled !== false);
  document.querySelector('#quest-offers').innerHTML = visibleQuestOffers.map((quest) => `
    <article><img class="quest-icon" src="${questIconUrl(quest.id)}" alt=""><b>${questTitle(quest)}</b><small>${questRequirement(quest)}</small><span>수주비 ${money(quest.fee)} · 보상 ${questRewardLabel(quest)}</span>
    <button data-quest="${quest.offerId || quest.id}" ${quest.accepted ? 'disabled' : ''}>${quest.accepted ? '수주 완료' : '수주'}</button></article>`).join('');
  const active = state.activeQuests.filter((quest) => !quest.completed);
  const activeMarkup = active.length ? active.map((quest) => {
    const candidates = ownedItems().filter((item) => questMatchesItem(quest, item));
    return `<article class="accepted-quest" data-active-quest="${quest.offerId || quest.id}" tabindex="0" role="button" aria-label="${questTitle(quest)} 상세 보기"><img class="quest-icon" src="${questIconUrl(quest.id)}" alt=""><b>${questTitle(quest)}</b><span>${effectiveQuestDeadline(quest)}일차 경매 전까지</span>
      <select data-delivery-select="${quest.offerId || quest.id}"><option value="">제출할 물품 선택</option>${candidates.map((item) => `<option value="${item.lotId}">${item.name} · ${gradeLabel(item.grade)}</option>`).join('')}</select>
      <button data-deliver-quest="${quest.offerId || quest.id}" ${candidates.length ? '' : 'disabled'}>물품 제출</button></article>`;
  }).join('') : '<p class="empty-note">수주한 의뢰가 없습니다.</p>';
  const appraisalMarkup = ownedItems().length ? ownedItems().map((item) => {
    const lot = scheduledLot(item.lotId);
    const discount = 1 - (balance.shop.infoDiscount?.[state.shopStage] ?? 0);
    const cost = Math.ceil(item.basePrice * balance.appraisal.rate * discount / 100) * 100;
    const result = item.appraised
      ? `<strong>${money(item.trueValue)} <small>± ${money(item.appraisalRange)}</small></strong>`
      : `<span>감정 비용 ${money(cost)}</span>`;
    return `<article class="appraisal-card">
      <img ${spriteAnchorAttrs(lot)} src="${lot ? spriteUrl(lot, item.grade) : ''}" alt="${item.name}">
      <div><b>${item.name}</b><small>${gradeLabel(item.grade)} · ${categoryLabel(item.category)}</small>${result}</div>
      <button data-office-appraise="${item.lotId}" ${item.appraised || item.collateral || state.cash < cost ? 'disabled' : ''}>${item.appraised ? '감정 완료' : item.collateral ? '담보 설정됨' : '정밀 감정'}</button>
    </article>`;
  }).join('') : '<p class="empty-note">감정할 보유 물품이 없습니다.</p>';
  document.querySelector('#active-quests').innerHTML = `
    <section class="accepted-quests"><h4>수주 의뢰 · 물품 제출</h4>${activeMarkup}</section>
    <section class="appraisal-office"><h4>보유 물품 · 정밀 감정</h4><div class="appraisal-grid">${appraisalMarkup}</div></section>`;
  const openQuestDetail = (quest) => {
    document.querySelector('#quest-detail-title').textContent = questTitle(quest);
    document.querySelector('#quest-detail-icon').src = questIconUrl(quest.id);
    document.querySelector('#quest-detail-requirement').textContent = questRequirement(quest);
    document.querySelector('#quest-detail-fee').textContent = money(quest.fee);
    document.querySelector('#quest-detail-reward').textContent = questRewardLabel(quest);
    document.querySelector('#quest-detail-deadline').textContent = `${effectiveQuestDeadline(quest)}일차 경매 전까지`;
    document.querySelector('#quest-detail-dialog').showModal();
  };
  document.querySelectorAll('[data-active-quest]').forEach((article) => {
    const quest = active.find((entry) => (entry.offerId || entry.id) === article.dataset.activeQuest);
    article.onclick = (event) => { if (event.target.closest('select, button')) return; openQuestDetail(quest); };
    article.onkeydown = (event) => { if (event.target !== article || !['Enter', ' '].includes(event.key)) return; event.preventDefault(); openQuestDetail(quest); };
  });
  document.querySelectorAll('[data-quest]').forEach((button) => {
    button.onclick = () => {
      const ok = acceptQuest(state, button.dataset.quest, balance);
      if (ok) { recordEvent(state, 'quest-accept', { questId: button.dataset.quest }); audio.playSfx('quest'); }
      renderQuestOffice(ok ? '의뢰를 수주했습니다.' : '수주비와 오늘 제시된 의뢰인지 확인하세요.');
    };
  });
  document.querySelectorAll('[data-deliver-quest]').forEach((button) => {
    button.onclick = () => {
      const select = document.querySelector(`[data-delivery-select="${button.dataset.deliverQuest}"]`);
      const ok = deliverQuestItem(state, button.dataset.deliverQuest, select.value);
      if (ok) recordEvent(state, 'quest-deliver', { questId: button.dataset.deliverQuest, lotId: select.value });
      renderQuestOffice(ok ? '물품을 제출하고 보상을 받았습니다.' : '제출 조건과 물품을 확인하세요.');
    };
  });
  document.querySelectorAll('[data-office-appraise]').forEach((button) => {
    button.onclick = () => {
      const ok = appraiseItem(state, balance, button.dataset.officeAppraise);
      if (ok) { recordEvent(state, 'appraisal', { lotId: button.dataset.officeAppraise, location: 'quest-office' }); audio.playSfx('appraise'); }
      renderQuestOffice(ok ? '정밀 감정을 완료했습니다.' : '감정 비용 또는 물품 상태를 확인하세요.');
    };
  });
  showQuestMessage(message);
}

function renderExchange(message = '') {
  clearActionTimer(); audio.playBgm('workplace'); state.phase = 'exchange'; adapter.showScene('exchange'); syncHeader();
  const exchangeItems = ownedItems();
  const maxStorage = Math.max(...balance.shop.storage);
  const occupiedCards = exchangeItems.map((item) => `
    <article><label><input type="checkbox" data-item-select="${item.lotId}" ${item.collateral ? 'disabled' : ''}> <b>${item.name}</b></label>
    <span>${gradeLabel(item.grade)} · ${categoryLabel(item.category)}</span><span>매입 ${money(item.paid)} · ${item.appraised ? `감정 ${money(item.trueValue)} ±${money(item.appraisalRange)}` : '미감정'}</span></article>`).join('');
  const emptyCards = Array.from({ length: Math.max(0, state.storage - exchangeItems.length) }, (_, index) => `
    <article class="empty-inventory-slot" aria-label="빈 보관칸 ${exchangeItems.length + index + 1}">
      <span class="empty-slot-number">${String(exchangeItems.length + index + 1).padStart(2, '0')}</span>
      <span class="empty-slot-icon"><img src="./assets/ui/exchange/storage-empty.png" alt=""></span>
      <span><b>빈 보관칸</b><small>낙찰한 물품이 이곳에 표시됩니다.</small></span>
    </article>`).join('');
  const lockedCards = Array.from({ length: Math.max(0, maxStorage - state.storage) }, (_, index) => {
    const slotNumber = state.storage + index + 1;
    const unlockStage = balance.shop.storage.findIndex((capacity) => capacity >= slotNumber);
    return `<article class="empty-inventory-slot locked-inventory-slot" aria-label="잠긴 보관칸 ${slotNumber}">
      <span class="empty-slot-number">${String(slotNumber).padStart(2, '0')}</span>
      <span class="empty-slot-icon" aria-hidden="true"><img src="./assets/ui/exchange/storage-locked.png" alt=""></span>
      <span><b>잠긴 보관칸</b><small>상회 ${unlockStage}단계에서 해금됩니다.</small></span>
    </article>`;
  }).join('');
  document.querySelector('#inventory-list').innerHTML = occupiedCards + emptyCards + lockedCards;
  document.querySelector('#exchange-market').innerHTML = `<h3>최근 시세</h3><div class="market-rates">${Object.entries(state.marketPath).map(([key, path]) => {
    const now = marketIndexForDay(path, state.day); const previous = marketIndexForDay(path, state.day - 1); const delta = now - previous;
    const trend = delta >= 0 ? 'rise' : 'fall';
    return `<div><img src="${categoryIconUrl(key)}" alt=""><b>${CATEGORY_LABELS[key]}</b><strong>${Math.round(now * 100)}%</strong><span class="${trend}"><img class="trend-icon" src="./assets/ui/action-icons/market-${trend}.png" alt="">${Math.abs(delta * 100).toFixed(0)}%</span></div>`;
  }).join('')}</div><section class="set-bonus-guide"><h4>세트 보너스</h4><div><span data-set-rule="same-2">한 계열을 2점 이상 선택 <b>×1.20</b></span><span data-set-rule="same-3">한 계열을 3점 이상 선택 <b>×1.30</b></span><span data-set-rule="grade-3">같은 계열에서 서로 다른 희귀도 3종 <b>×1.35</b></span><span data-set-rule="high-3">같은 계열의 영웅 이상 3점 <b>×1.40</b></span><span data-set-rule="all-6">모든 6개 계열을 1점씩 선택 <b>×1.50</b></span></div><small>여러 조건을 동시에 만족하면 가장 높은 세트 배수 하나만 적용됩니다.</small><strong id="set-bonus-summary">적용 보너스 없음 · 최종 ×1.00</strong></section>`;
  const syncBulkActions = () => {
    const ids = [...document.querySelectorAll('[data-item-select]:checked')].map((input) => input.dataset.itemSelect);
    const items = ownedItems().filter((item) => ids.includes(item.lotId) && !item.collateral);
    const quote = quoteItemsSale(state, balance, ids);
    const groups = Object.values(Object.groupBy(items, (item) => item.category));
    document.querySelector('#sell-selected').disabled = !quote.count;
    const selectable = [...document.querySelectorAll('[data-item-select]:not(:disabled)')];
    const allSelected = selectable.length > 0 && selectable.every((input) => input.checked);
    document.querySelector('#select-all-items').disabled = !selectable.length;
    document.querySelector('#select-all-items').textContent = allSelected ? '모두 해제' : '모두 선택';
    const activeRules = {
      'same-2': groups.some((group) => group.length >= 2),
      'same-3': groups.some((group) => group.length >= 3),
      'high-3': groups.some((group) => group.filter((item) => ['EPIC', 'LEGENDARY'].includes(item.grade)).length >= 3),
      'grade-3': groups.some((group) => new Set(group.map((item) => item.grade)).size >= 3),
      'all-6': new Set(items.map((item) => item.category)).size >= 6,
    };
    const ruleMultipliers = { 'same-2': 1.2, 'same-3': 1.3, 'grade-3': 1.35, 'high-3': 1.4, 'all-6': 1.5 };
    const appliedRule = Object.keys(activeRules).filter((key) => activeRules[key]).sort((a, b) => ruleMultipliers[b] - ruleMultipliers[a])[0];
    document.querySelectorAll('[data-set-rule]').forEach((rule) => rule.classList.toggle('is-active', rule.dataset.setRule === appliedRule));
    document.querySelector('#set-bonus-summary').textContent = appliedRule
      ? `적용 세트 ×${ruleMultipliers[appliedRule].toFixed(2)} · 최종 ×${quote.multiplier.toFixed(2)} · 예상 판매액 ${money(quote.revenue)}`
      : `적용 보너스 없음 · 최종 ×${quote.multiplier.toFixed(2)} · 예상 판매액 ${money(quote.revenue)}`;
  };
  document.querySelectorAll('[data-item-select]').forEach((input) => { input.onchange = syncBulkActions; });
  document.querySelector('#select-all-items').onclick = () => {
    const selectable = [...document.querySelectorAll('[data-item-select]:not(:disabled)')];
    const shouldSelect = !selectable.every((input) => input.checked);
    selectable.forEach((input) => { input.checked = shouldSelect; });
    syncBulkActions();
  };
  syncBulkActions();
  document.querySelector('#exchange-message').textContent = '';
  showActionToast(message);
}

function renderTavern(message = '') {
  clearActionTimer(); audio.playBgm('tavern'); state.phase = 'tavern'; adapter.showScene('tavern'); syncHeader();
  const names = { forecast: '내일의 시세', catalog: '다음 날 경매품 정보', competitors: '경쟁자의 관심 경매품' };
  const descriptions = { forecast: '여행 상인이 오늘과 비교한 내일의 계열별 시세 변동을 알려줍니다. 상회 단계에 따라 2개, 4개, 6개 계열이 공개됩니다.', catalog: '상회 단계에 따라 다음 날 경매품의 이름, 계열, 등급을 순차적으로 공개합니다.', competitors: '상회 단계에 따라 경쟁자 1명부터 최대 3명까지 관심 경매품을 공개합니다.' };
  const icons = { forecast: './assets/ui/tavern/demand-trend.png', catalog: './assets/ui/tavern/lot-specification.png', competitors: './assets/ui/tavern/competitor-budget.png' };
  document.querySelectorAll('[data-broker]').forEach((broker) => {
    const kind = broker.dataset.broker;
    const selectBroker = () => { selectedInfoKind = kind; renderTavern(); };
    broker.classList.toggle('is-active', kind === selectedInfoKind);
    broker.setAttribute('aria-pressed', String(kind === selectedInfoKind));
    broker.querySelector('span').textContent = kind === selectedInfoKind ? '정보 확인 중' : '확인하기';
    broker.onclick = selectBroker;
    broker.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectBroker(); } };
  });
  const selected = selectedInfoKind;
  const categoryNames = { CER: '도자기', CLK: '시계', PNT: '회화', BOK: '고서', MET: '금은세공', JEW: '장신구' };
  const informationResult = (kind) => {
    const stage = Math.max(1, Math.min(3, state.shopStage));
    const nextDayIndex = state.day;
    const nextLots = state.schedule.days[nextDayIndex]?.lots || [];
    if (!nextLots.length) return '<p>마지막 날에는 다음 날 경매 정보가 없습니다.</p>';
    if (kind === 'forecast') {
      const categoryOrder = ['CER', 'CLK', 'PNT', 'BOK', 'MET', 'JEW'];
      const visible = categoryOrder.slice(0, stage * 2);
      return `<p><b>${nextDayIndex + 1}일차 계열 시세 · ${visible.length}개 공개</b></p><ul>${visible.map((category) => {
        const today = state.marketPath[category]?.[Math.max(0, nextDayIndex - 1)] ?? 1;
        const tomorrow = state.marketPath[category]?.[nextDayIndex] ?? today;
        const change = today ? ((tomorrow / today) - 1) * 100 : 0;
        const tone = change > 0.5 ? 'rise' : change < -0.5 ? 'fall' : 'flat';
        const direction = tone === 'rise' ? '▲ 상승' : tone === 'fall' ? '▼ 하락' : '─ 보합';
        const changeText = tone === 'flat' ? '변동 없음' : `${direction} ${Math.abs(change).toFixed(0)}%`;
        return `<li><img src="${categoryIconUrl(category)}" alt=""><span><b>${categoryNames[category]}</b><small>내일 시세 지수 ${Math.round(tomorrow * 100)}</small></span><strong class="market-${tone}">${changeText}</strong></li>`;
      }).join('')}</ul>`;
    }
    if (kind === 'catalog') {
      return `<p><b>${nextDayIndex + 1}일차 경매품</b></p><ul>${nextLots.map((lot) => `<li><b>${escapeHtml(lot.content?.displayName || lot.baseName)}</b>${stage >= 2 ? ` · ${categoryNames[lot.category]}` : ''}${stage >= 3 ? ` · ${gradeLabel(lot.grade)}` : ''}</li>`).join('')}</ul>`;
    }
    const estimates = nextLots.flatMap((lot) => botBidForLot({ lot, day: state.day + 1, balance, marketIndex: state.marketPath[lot.category][nextDayIndex], seed: state.seed }).map((bot) => ({ ...bot, lot })));
    const interests = selectDistinctBotInterests(estimates);
    return `<p><b>${stage}명 공개</b></p><ul>${interests.slice(0, stage).map(({ name, interest }) => `<li><b>${name}</b> · ${escapeHtml(interest.lot.content?.displayName || interest.lot.baseName)}</li>`).join('')}</ul>`;
  };
  document.querySelector('#tavern-detail').innerHTML = `<h3>정보 상세</h3><div class="detail-heading"><img class="detail-symbol" src="${icons[selected]}" alt=""><div><h2>${names[selected]}</h2><small>상회 ${state.shopStage}단계 공개 정보</small></div></div><p>${descriptions[selected]}</p><section class="info-result tavern-live-result info-${selected}">${informationResult(selected)}</section>`;
  const effectiveStage = Math.max(1, Math.min(3, state.shopStage));
  const stageRows = [
    { stage: 1, competitors: '경쟁자 1명', catalog: '이름', forecast: '시세 2개' },
    { stage: 2, competitors: '경쟁자 2명', catalog: '이름 · 계열', forecast: '시세 4개' },
    { stage: 3, competitors: '경쟁자 3명', catalog: '이름 · 계열 · 등급', forecast: '시세 6개' },
  ];
  document.querySelector('#tavern-owned').innerHTML = `<h3>상회 단계별 정보 확장</h3><p class="stage-intro">상회를 성장시키면 세 정보의 공개 범위가 함께 넓어집니다.</p><div class="tavern-stage-list">${stageRows.map((row) => `<article class="${row.stage === effectiveStage ? 'is-current' : ''}"><div class="stage-heading"><b>${row.stage}단계</b>${row.stage === effectiveStage ? '<span>현재</span>' : ''}</div><p><img src="${icons.competitors}" alt="">${row.competitors}</p><p><img src="${icons.catalog}" alt="">${row.catalog}</p><p><img src="${icons.forecast}" alt="">${row.forecast}</p></article>`).join('')}</div>`;
  document.querySelector('#tavern-message').textContent = '';
  showActionToast(message);
}

function renderShop(message = '') {
  clearActionTimer(); audio.playBgm('workplace'); state.phase = 'shop'; adapter.showScene('shop'); syncHeader();
  const next = Math.min(4, state.shopStage + 1); const maxed = state.shopStage >= 4;
  const cost = maxed ? 0 : balance.shop.upgradeCost[next - 1];
  const required = maxed ? 0 : balance.shop.questRequirement[next - 1];
  const nextStorage = maxed ? state.storage : balance.shop.storage[next];
  const benefitStage = maxed ? state.shopStage : next;
  const visibleCompetitors = Math.min(3, benefitStage);
  const visiblePrices = Math.min(6, benefitStage * 2);
  const catalogScope = benefitStage === 1 ? '이름' : benefitStage === 2 ? '이름 · 계열' : '이름 · 계열 · 등급';
  const auctionFee = Math.round((balance.shop.auctionFee?.[benefitStage] || 0) * 100);
  const maxStorage = Math.max(...balance.shop.storage);
  const inventory = ownedItems();
  const slots = Array.from({ length: maxStorage }, (_, index) => {
    const item = inventory[index];
    const unlocked = index < state.storage;
    if (item) {
      const lot = scheduledLot(item.lotId);
      return `<article class="shop-storage-slot is-filled"><span class="slot-number">${index + 1}</span><img ${spriteAnchorAttrs(lot)} src="${lot ? spriteUrl(lot, item.grade) : ''}" alt=""><div><b>${escapeHtml(item.name)}</b><small>${gradeLabel(item.grade)} · 감정가 ${money(item.appraisedValue || item.trueValue)}</small></div></article>`;
    }
    return `<article class="shop-storage-slot ${unlocked ? 'is-empty' : 'is-locked'}"><span class="slot-number">${index + 1}</span><img class="storage-placeholder" src="./assets/ui/exchange/${unlocked ? 'storage-empty.png' : 'storage-locked.png'}" alt=""><div><b>${unlocked ? '빈 보관칸' : '잠긴 보관칸'}</b><small>${unlocked ? '낙찰 물품 보관' : '상회 승급 시 해금'}</small></div></article>`;
  }).join('');
  const questReady = state.completedQuestCount >= required;
  const cashReady = state.cash >= cost;
  document.querySelector('#shop-detail').innerHTML = `<section class="shop-upgrade-panel"><header><h3>${maxed ? '상회 최고 단계 달성' : `상회 ${next}단계 승급 조건`}</h3></header><ul class="shop-requirements"><li class="${questReady ? 'is-ready' : ''}"><span>▣ 완료 의뢰</span><b>${state.completedQuestCount} / ${required}건</b></li><li class="${cashReady ? 'is-ready' : ''}"><span>● 승급 비용</span><b>${money(cost)}</b></li><li class="${cashReady ? 'is-ready' : ''}"><span>● 보유 자산</span><b>${money(state.cash)}</b></li></ul><h4>${maxed ? '현재 적용 효과' : `${next}단계 적용 효과`}</h4><ul class="shop-benefits"><li>보관칸 ${nextStorage}칸</li><li>경매 수수료 ${auctionFee}%</li><li>경쟁자 관심 정보 ${visibleCompetitors}명 공개</li><li>다음 날 경매품: ${catalogScope}</li><li>다음 날 시세 ${visiblePrices}개 공개</li></ul></section><section class="shop-inventory-panel"><header><div><small>STORAGE</small><h3>보유품 관리</h3></div><b>${inventory.length} / ${state.storage}</b></header><div class="shop-storage-grid">${slots}</div><p class="shop-storage-note">※ 보관칸은 상회 단계에 따라 3칸에서 최대 6칸까지 확장됩니다.</p></section>`;
  document.querySelector('#shop-upgrade').textContent = maxed ? '최고 단계 달성' : `${next}단계로 승급하기`;
  document.querySelector('#shop-upgrade').disabled = maxed || state.cash < cost || state.completedQuestCount < required;
  showShopMessage(message);
}

function renderGuild(message = '') {
  clearActionTimer(); audio.playBgm('workplace'); state.phase = 'guild'; adapter.showScene('guild'); syncHeader();
  const locked = state.shopStage < balance.loan.minShopStage;
  const lateForLoan = state.day + balance.loan.termDays > RUN_DAYS;
  const loanValue = (item) => Math.round(item.basePrice * balance.loan.limitFromDisposalValue / 10) * 10;
  const collateralItems = ownedItems().filter((item) => !item.collateral);
  const collateralCount = collateralItems.length;
  const collateralOptions = collateralItems.map((item) => `<option value="${item.lotId}">${item.name}</option>`).join('');
  const activeCollateral = state.loan ? state.inventory.find((item) => item.lotId === state.loan.lotId) : null;
  const statusTitle = locked ? '담보 대출 잠김' : state.loan ? '활성 대출' : state.guildLocked ? '조합 이용 제한' : '활성 대출 없음';
  const detail = `<h3>담보 대출 상태</h3><div class="guild-status-grid"><section><small>현재 상태</small><strong>${statusTitle}</strong><span>${locked ? `상회 ${balance.loan.minShopStage}단계에서 해금됩니다.` : state.loan ? `담보 · ${activeCollateral?.name || state.loan.lotId}` : '현재 활성 대출이 없습니다.'}</span></section><dl><div><dt>원금</dt><dd>${state.loan ? money(state.loan.principal) : '—'}</dd></div><div><dt>만기</dt><dd>${state.loan ? `${state.loan.dueDay}일차` : '—'}</dd></div><div><dt>상환 총액</dt><dd>${state.loan ? money(state.loan.due) : '—'}</dd></div></dl></div><label class="collateral-picker"><span>선택 담보</span><select id="guild-collateral"><option value="">물품을 선택하세요</option>${collateralOptions}</select></label><p id="loan-preview">보유 물품을 선택하면 대출 가능 금액을 계산합니다.</p>`;
  document.querySelector('#guild-detail').innerHTML = detail;
  const collateralMarkup = collateralItems.length ? collateralItems.map((item) => {
    const lot = scheduledLot(item.lotId);
    const value = loanValue(item);
    return `<label class="guild-collateral-card"><img ${spriteAnchorAttrs(lot)} src="${lot ? spriteUrl(lot, item.grade) : ''}" alt=""><span><b>${item.name}</b><small>${gradeLabel(item.grade)} · 공개 기준가 ${money(item.basePrice)}</small></span><strong>${money(value)}</strong><input type="radio" name="guild-collateral-card" value="${item.lotId}"></label>`;
  }).join('') : `<div class="guild-collateral-empty"><b>${locked ? '담보 기능이 잠겨 있습니다.' : '담보로 설정할 보유 물품이 없습니다.'}</b><span>${locked ? `상회를 ${balance.loan.minShopStage}단계로 승급하면 이용할 수 있습니다.` : '경매에서 물품을 낙찰한 뒤 다시 방문하세요.'}</span></div>`;
  document.querySelector('#guild-collateral-list').innerHTML = `<header><h3>담보 보유품 <small>(미판매 물품)</small></h3><b>${collateralCount} / ${state.storage}</b></header><div class="guild-collateral-scroll">${collateralMarkup}</div><footer><span>선택 담보 대출 한도</span><strong id="guild-limit-total">0 G</strong></footer>`;
  document.querySelector('#guild-loan').disabled = locked || lateForLoan || Boolean(state.loan) || state.guildLocked || !collateralCount;
  document.querySelector('#guild-repay').disabled = !state.loan || state.day >= state.loan?.dueDay;
  document.querySelector('#guild-return').disabled = false;
  document.querySelector('#guild-message').innerHTML = message ? `<b>${message}</b>` : lateForLoan ? `<b>신규 대출 기간 종료</b><p>만기가 12일차를 넘는 대출은 받을 수 없습니다.</p>` : `<b>대출 안내</b><p>공개 기준가의 150%를 대출하며, 담보는 상환 전까지 판매·감정·의뢰 제출이 제한됩니다.</p><p>조기 상환 105% · 만기 ${balance.loan.termDays}일 · 만기 상환 110%</p>`;
  const picker = document.querySelector('#guild-collateral');
  if (picker) {
    document.querySelector('#guild-loan').disabled = true;
    picker.onchange = () => {
    const item = collateralItems.find((entry) => entry.lotId === picker.value);
    const principal = item ? loanValue(item) : 0;
    document.querySelector('#guild-loan').disabled = !item || lateForLoan;
    document.querySelector('#loan-preview').textContent = item ? `대출 ${money(principal)} · 조기 ${money(Math.round(principal * balance.loan.earlyRepayMultiplier / 10) * 10)} · ${state.day + balance.loan.termDays}일차 만기 ${money(Math.round(principal * balance.loan.repayMultiplier / 10) * 10)}` : '물품을 선택하면 대출액과 상환액을 계산합니다.';
    };
    document.querySelectorAll('[name="guild-collateral-card"]').forEach((radio) => {
      radio.onchange = () => {
        picker.value = radio.value;
        picker.dispatchEvent(new Event('change'));
        const item = collateralItems.find((entry) => entry.lotId === radio.value);
        document.querySelector('#guild-limit-total').textContent = money(loanValue(item));
      };
    });
  }
}

function renderMuseum(returnTo = 'city') {
  clearActionTimer(); audio.playBgm('museum');
  museumReturn = returnTo;
  if (state) state.phase = 'museum';
  adapter.showScene('museum');
  if (state) syncHeader();
  const owned = new Set(ownedRelicIds());
  const relics = balance.relics.list;
  const tierNames = { low: '하급', mid: '중급', high: '상급' };
  const detail = document.querySelector('#relic-detail');
  detail.innerHTML = '';
  detail.hidden = true;
  document.querySelector('#relic-list').innerHTML = relics.map((relic, index) => {
    const isOwned = owned.has(relic.id);
    const art = relicArt[relic.id];
    return `<article class="${isOwned ? 'is-owned' : 'is-empty'}" ${isOwned ? `role="button" tabindex="0" aria-label="${relic.name}" data-relic="${relic.id}"` : 'aria-label="빈 진열장"'}>${isOwned && art ? `<img data-relic-art="${relic.id}" src="./assets/relics/${encodeURIComponent(art)}" alt=""><b>${relic.name}</b><span>${relic.effect}</span>` : ''}</article>`;
  }).join('');
  const showRelicDetail = (relic) => {
    const isOwned = owned.has(relic.id); const art = relicArt[relic.id];
    if (!isOwned) return;
    detail.innerHTML = `<button type="button" class="relic-detail-close" aria-label="유물 정보 닫기">×</button>${art ? `<img data-relic-art="${relic.id}" src="./assets/relics/${encodeURIComponent(art)}" alt="">` : ''}<small>${tierNames[relic.tier]} 유물</small><h3>${relic.name}</h3><p>${relic.effect}</p>`;
    detail.hidden = false;
    detail.querySelector('.relic-detail-close').onclick = () => {
      detail.hidden = true;
      document.querySelectorAll('[data-relic]').forEach((entry) => entry.classList.remove('is-selected'));
    };
  };
  document.querySelectorAll('[data-relic]').forEach((card) => {
    const select = () => { document.querySelectorAll('[data-relic]').forEach((entry) => entry.classList.toggle('is-selected', entry === card)); showRelicDetail(relics.find((relic) => relic.id === card.dataset.relic)); audio.playSfx('museum'); };
    card.onclick = select; card.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } };
  });
  const ownedCount = relics.filter((relic) => owned.has(relic.id)).length;
  document.querySelector('#museum-progress').innerHTML = `<b>수집 현황</b><strong>${ownedCount} / ${relics.length}</strong>`;
}

function renderCatalog() {
  if (state.day >= RELIC_AUCTION_DAY) return startRelicAuction();
  clearActionTimer(); audio.playBgm('workplace'); state.phase = 'catalog'; adapter.showScene('catalog'); syncHeader();
  document.querySelector('#catalog-grid').innerHTML = state.schedule.days[state.day - 1].lots.map((lot, index) => { const visualEffects = normalizeVisualEffects(lot.category, lot.grade, lot.visualEffects); return `<article class="lot-card catalog-lot-${index + 1}" tabindex="0" aria-label="경매품 ${index + 1} ${escapeHtml(lot.content.displayName)} 상세 정보">
    <b class="catalog-number">${String(index + 1).padStart(2, '0')}</b>
    <div class="mini-sprite ${visualEffects.map((effect) => `vfx-${effect}`).join(' ')}"><img ${spriteAnchorAttrs(lot)} src="${spriteUrl(lot, lot.grade)}" alt=""></div>
    <span class="catalog-grade">${gradeLabel(lot.grade)}</span><h3>${escapeHtml(lot.content.displayName)}</h3>
    <p class="catalog-meta"><span>${escapeHtml(categoryLabel(lot.category))}</span><strong>${money(lot.pricing.basePrice)}</strong></p>
    <aside class="catalog-tooltip" role="tooltip"><b>${escapeHtml(lot.content.displayName)}</b><span>${gradeLabel(lot.grade)} · ${escapeHtml(categoryLabel(lot.category))}</span><p>${escapeHtml(lot.content.description)}</p>${lot.content.setHint ? `<em>${escapeHtml(lot.content.setHint)}</em>` : ''}<strong>기준가 ${money(lot.pricing.basePrice)}</strong></aside>
  </article>`; }).join('');
}

function renderAuction() {
  const lot = prepareAuctionEntry(state);
  if (!lot) return renderSettlement();
  const expired = expireQuestsBeforeAuction(state);
  state.phase = 'auction'; audio.playBgm('auction');
  if (state.auctionSession?.lotId !== lot.lotId) {
    const marketIndex = state.marketPath[lot.category][state.day - 1];
    const generatedFeed = [lot.content.rumor, lot.content.setHint, lot.content.npcReaction].filter(Boolean);
    const dailyAssets = estimateBotDailyAssets({ state, balance });
    const bots = botBidForLot({ lot, day: state.day, balance, marketIndex, seed: state.seed }).map((bot) => ({ ...bot, maxBid: Math.min(bot.maxBid, dailyAssets[bot.id]?.remaining || 0) }));
    const opening = openingBotBid(bots, Math.max(1, Math.round(lot.pricing.basePrice * balance.auction.startBidRatio)));
    const openingFeed = opening ? [`${opening.bidder.name} ${money(opening.price)}`] : ['입찰 가능한 상대가 없습니다.'];
    state.auctionSession = { lotId: lot.lotId, currentPrice: opening?.price || 1, leader: opening?.bidder.id || null, bots, deadline: Date.now() + 15000, feed: [...(expired ? [`기한이 지난 의뢰 ${expired}건이 만료됐습니다.`] : ['경매가 시작되었습니다.']), ...generatedFeed, ...openingFeed] };
  }
  state.auctionSession.deadline ||= Date.now() + 15000;
  adapter.showScene('auction');
  adapter.setText('lot-progress', `${state.day}일차 · 경매품 ${state.lotIndex + 1} / 8`); adapter.setText('lot-name', lot.content.displayName);
  adapter.setText('lot-grade', lot.grade); adapter.setText('lot-description', lot.content.description); adapter.setText('base-price', money(lot.pricing.basePrice));
  adapter.setText('current-bid', money(state.auctionSession.currentPrice)); adapter.setText('cash', money(state.cash)); adapter.setSprite('current-lot', spriteUrl(lot, lot.grade)); adapter.setEffects('current-lot', normalizeVisualEffects(lot.category, lot.grade, lot.visualEffects));
  const currentLotSprite = document.querySelector('[data-sprite="current-lot"], [data-bind="current-lot"]');
  if (currentLotSprite) { currentLotSprite.classList.add('item-sprite-anchor'); currentLotSprite.style.setProperty('--sprite-anchor-x', `${Number(lot.spriteAnchor?.x || 0)}%`); currentLotSprite.style.setProperty('--sprite-anchor-y', `${Number(lot.spriteAnchor?.y || 0)}%`); }
  const auctionFeed = document.querySelector('#auction-feed');
  auctionFeed.innerHTML = state.auctionSession.feed.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  auctionFeed.scrollTop = auctionFeed.scrollHeight;
  const participants = [
    { name: '당신', budget: state.cash, leader: state.auctionSession.leader === 'player', player: true },
    ...state.auctionSession.bots.map((bot) => ({ id: bot.id, name: bot.name, budget: estimateBotDailyAssets({ state, balance })[bot.id]?.remaining || 0, leader: state.auctionSession.leader === bot.id })),
  ];
  const competitorPortraits = {
    nemesis: './assets/ui/auction/competitors/galeo.png',
    'drifter-a': './assets/ui/auction/competitors/moira.png',
    'drifter-b': './assets/ui/auction/competitors/ines.png',
  };
  document.querySelector('#auction-participants').innerHTML = `<h3>참가자 명단 (${participants.length} / 4)</h3>${participants.map((participant) => `<div class="participant ${participant.leader ? 'is-leading' : ''}">${participant.player ? '<span class="player-mark">나</span>' : `<img class="competitor-portrait" src="${competitorPortraits[participant.id]}" alt="${participant.name} 초상">`}<b>${participant.name}</b><small>${participant.player ? '보유 자산' : '추정 자산'}</small><strong>${money(participant.budget)}</strong></div>`).join('')}`;
  document.querySelector('#auction-lot-status').innerHTML = `<b>경매 ${state.lotIndex + 1} / 8</b><span>${gradeLabel(lot.grade)}</span><strong>${money(state.auctionSession.currentPrice)}</strong><em id="auction-timer" aria-label="남은 시간"></em>`;
  armActionTimer('#auction-timer', state.auctionSession.deadline, () => finishLot('pass'));
}

function finishLot(action, multiplier = 1, directPrice = null) {
  clearActionTimer();
  const lot = state.schedule.days[state.day - 1].lots[state.lotIndex]; const session = state.auctionSession; let result;
  if (action === 'bid') {
    const raise = Math.max(1, Math.ceil(session.currentPrice * balance.auction.minRaiseRate));
    const minimumBid = session.currentPrice + raise;
    const proposed = directPrice === null ? Math.max(minimumBid, Math.ceil(session.currentPrice * multiplier)) : directPrice;
    if (!Number.isInteger(proposed) || proposed < minimumBid) { session.feed.push(`최소 입찰 금액은 ${money(minimumBid)}입니다.`); return renderAuction(); }
    if (proposed > state.cash) { session.feed.push('보유 자금이 부족합니다.'); return renderAuction(); }
    if (ownedItems().length >= state.storage) { session.feed.push('보관칸이 가득 찼습니다.'); return renderAuction(); }
    session.currentPrice = proposed; session.leader = 'player'; session.feed.push(`플레이어 ${money(proposed)}`); audio.playSfx('bid');
    session.deadline = Date.now() + 15000;
    renderAuction();
    queueAuctionBotResponse(lot.lotId, proposed);
    return;
  } else {
    const leader = [...session.bots].sort((a, b) => b.maxBid - a.maxBid)[0];
    result = session.leader === 'player' ? { winner: 'player', price: session.currentPrice, bots: session.bots } : { winner: leader.id, price: Math.max(1, session.currentPrice), bots: session.bots };
  }
  resolveLot(state, { action, playerBid: session.currentPrice, auctionResult: result });
  recordEvent(state, 'auction', { lotId: lot.lotId, action, winner: result.winner, price: result.price });
  audio.playSfx(action === 'pass' ? 'pass' : 'gavel');
  state.auctionSession = null;
  state.phase === 'settlement' ? renderSettlement() : renderAuction();
}

function renderSettlement() {
  clearActionTimer(); audio.playBgm('settlement');
  if (state.settledDay !== state.day) {
    const quests = settleQuests(state); const loan = settleLoan(state); state.settledDay = state.day; state.lastSettlement = { quests, loan };
    if (missedDeadline(state)) state.failure = `${state.day}일차 승급 기한 실패 · 상회 ${state.shopStage}단계`;
  }
  adapter.showScene('settlement'); adapter.setText('day', state.day);
  const loanLabels = { none: '변동 없음', repaid: '상환 완료', seized: '담보 처분' };
  const loanResult = loanLabels[state.lastSettlement.loan] || state.lastSettlement.loan;
  const dayHistory = state.history.filter((entry) => entry.day === state.day);
  const wins = dayHistory.filter((entry) => entry.won);
  const spent = wins.reduce((sum, entry) => sum + entry.price, 0);
  const dayLots = state.schedule.days[state.day - 1].lots;
  const categories = [...new Set(dayLots.map((lot) => lot.category))].slice(0, 4);
  const buyerNames = { player: '당신', nemesis: '갈레오', 'drifter-a': '모이라', 'drifter-b': '이네스' };
  document.querySelector('#settlement-summary').innerHTML = `
    <section class="settlement-lots"><h3>낙찰 / 유찰 결과 (경매품 8개)</h3>${dayHistory.map((entry, index) => { const lot = dayLots.find((candidate) => candidate.lotId === entry.lotId); const lotName = lot?.content?.displayName || lot?.baseName || `경매품 ${index + 1}`; const buyerName = buyerNames[entry.winner] || '경쟁자'; return `<article><div><b title="${escapeHtml(lotName)}">${escapeHtml(lotName)}</b><span class="${entry.won ? 'won' : 'lost'}">${entry.won ? '낙찰' : '유찰'}</span></div><p><em>구매자 · ${buyerName}</em><strong>${money(entry.price)}</strong></p></article>`; }).join('')}</section>
    <section class="settlement-center"><h3>오늘의 정산</h3><div class="settlement-owned"><b>획득 물품</b><strong>${wins.length}개</strong><span>현재 보관 ${ownedItems().length} / ${state.storage}</span></div><div class="settlement-money settlement-finance"><h4>자금 현황</h4><p><img src="./assets/ui/action-icons/total-spent.png" alt=""><span>총 지출 금액</span><strong>${money(spent)}</strong></p><p><img src="./assets/ui/action-icons/current-assets.png" alt=""><span>현재 자산</span><strong>${money(state.cash)}</strong></p></div><div class="settlement-money settlement-progress"><h4>운영 현황</h4><p><span>완료 의뢰</span><strong>${state.lastSettlement.quests}건</strong></p><p><span>대출 상태</span><strong>${loanResult}</strong></p></div></section>
    <section class="settlement-market"><h3>계열별 시세 요약</h3>${categories.map((category) => { const value = state.marketPath[category]?.[state.day - 1] ?? 100; const trendIcon = value >= 100 ? 'market-rise.png' : 'market-fall.png'; return `<p><img src="./assets/ui/action-icons/${trendIcon}" alt=""><b>${categoryLabel(category)}</b><span class="market-line" style="--market:${Math.max(15, Math.min(95, value - 40))}%"></span><strong>${value.toFixed(2)}</strong></p>`; }).join('')}</section>`;
  const nextDayLabel = state.failure ? '실패 결과 확인' : state.day === RUN_DAYS ? `${RELIC_AUCTION_DAY}일차 도시로` : `${state.day + 1}일차로`;
  document.querySelector('#next-day').innerHTML = `<img src="./assets/ui/action-icons/next-day.png" alt=""><span>${nextDayLabel}</span>`;
  save();
}

async function nextDay() {
  audio.playSfx('day');
  if (state.failure) return renderResult();
  const nextDayButton = document.querySelector('#next-day');
  nextDayButton.disabled = true;
  advanceDay(state); state.settledDay = null;
  if (state.day <= RUN_DAYS) refreshDailyQuestOffers(state, balance, state.metaRelics);
  save();
  if (state.day === RELIC_AUCTION_DAY) {
    renderHub('12일차 경매가 끝났습니다. 경매장으로 이동해 최종 유물 경매를 시작하세요.');
    nextDayButton.disabled = false;
    return;
  }
  try {
    await generation.ensure({ currentDay: state.day, schedule: state.schedule, sets: state.sets });
    renderHub();
  } catch (error) {
    console.warn('Daily content buffer failed; continuing with prepared fallback.', error);
    renderHub('콘텐츠 준비에 실패해 기본 데이터를 사용합니다.');
  } finally {
    nextDayButton.disabled = false;
  }
}

function startRelicAuction() {
  clearActionTimer(); audio.playBgm('relic');
  const permanent = new Set(ownedRelicIds());
  if (permanent.size >= 9) return renderResult();
  state.phase = 'relic'; state.relicRound ??= 0; state.relicChoices ??= []; state.relicSession = null; renderRelic();
}

function renderRelic() {
  if (state.relicRound >= 3) return renderResult();
  adapter.showScene('relic'); audio.playBgm('relic'); const tier = balance.relicAuction.tiers[state.relicRound]; const opening = balance.relicAuction.startBid[state.relicRound];
  const owned = new Set(ownedRelicIds());
  const choices = balance.relics.list.filter((relic) => relic.tier === tier && !owned.has(relic.id));
  const relic = choices[(state.relicRound + state.seed.length) % Math.max(1, choices.length)] || balance.relics.list.find((entry) => entry.tier === tier);
  state.currentRelic = relic;
  if (!state.relicSession || state.relicSession.round !== state.relicRound) {
    const rng = createRng(`${state.seed}:relic:${state.relicRound}`);
    const bands = [[.6,.85],[.85,1.1],[1.1,1.4]];
    const names = ['왕실 대리인', '북부 대상인', '해외 수집가'];
    const bots = bands.map(([low, high], index) => ({ id: `royal-${index + 1}`, name: names[index], maxBid: Math.max(opening, Math.min(opening * 2, Math.round(state.cash * (low + rng() * (high - low))))) }));
    state.relicSession = { round: state.relicRound, currentPrice: opening, leader: null, bots, deadline: Date.now() + 15000, feed: ['최종 유물 경매가 시작되었습니다.'] };
  }
  const session = state.relicSession;
  const art = relicArt[relic.id];
  document.querySelector('#relic-card').innerHTML = `<p>${RELIC_TIER_LABELS[tier] || tier} · ${state.relicRound + 1}/3회</p><h2>${relic.name}</h2>${art ? `<img data-relic-art="${relic.id}" src="./assets/relics/${encodeURIComponent(art)}" alt="">` : ''}<p>${relic.effect}</p><strong>현재 호가 ${money(session.currentPrice)}</strong><em id="relic-timer" aria-label="남은 시간"></em>`;
  const participants = [{ id: 'player', name: '당신', budget: state.cash }, ...session.bots.map((bot) => ({ ...bot, budget: bot.maxBid }))];
  document.querySelector('#relic-participants').innerHTML = `<h3>최종 경매 참가자</h3>${participants.map((participant) => `<div class="participant ${session.leader === participant.id ? 'is-leading' : ''}"><b>${participant.name}</b><strong>${money(participant.budget)}</strong></div>`).join('')}`;
  document.querySelector('#relic-feed').innerHTML = session.feed.slice(-4).map((line) => `<p>${line}</p>`).join('');
  document.querySelector('#buy-relic').innerHTML = `<img src="./assets/ui/action-icons/bid.png" alt=""><span>10% 인상 입찰</span>`;
  document.querySelector('#skip-relic').innerHTML = `<img src="./assets/ui/action-icons/pass.png" alt=""><span>물러나기</span>`;
  document.querySelector('#buy-relic').disabled = state.cash < Math.ceil(session.currentPrice * 1.1);
  armActionTimer('#relic-timer', session.deadline, () => finishRelic(false));
}

function finishRelic(bid) {
  clearActionTimer(); const session = state.relicSession;
  if (bid) {
    const price = Math.ceil(session.currentPrice * 1.1);
    if (state.cash < price) return renderRelic();
    session.currentPrice = price; session.leader = 'player'; session.feed.push(`당신 ${money(price)}`); audio.playSfx('relic-bid');
    session.deadline = Date.now() + 15000;
    const challenger = [...session.bots].filter((bot) => bot.maxBid > price).sort((a, b) => b.maxBid - a.maxBid)[0];
    if (challenger) {
      session.currentPrice = Math.min(challenger.maxBid, Math.ceil(price * 1.1)); session.leader = challenger.id; session.feed.push(`${challenger.name} ${money(session.currentPrice)}`); audio.playSfx('bot-bid'); return renderRelic();
    }
  }
  if (session.leader === 'player') {
    state.cash -= session.currentPrice; state.relicChoices.push(state.currentRelic.id); audio.playSfx('relic-gavel');
    recordEvent(state, 'relic-auction', { relicId: state.currentRelic.id, winner: 'player', price: session.currentPrice });
  } else {
    const winner = [...session.bots].sort((a, b) => b.maxBid - a.maxBid)[0]; audio.playSfx('relic-pass');
    recordEvent(state, 'relic-auction', { relicId: state.currentRelic.id, winner: session.leader || winner.id, price: session.currentPrice });
  }
  state.relicRound += 1; state.relicSession = null; renderRelic();
}

function renderResult() {
  const journeyFinished = state.day >= RELIC_AUCTION_DAY;
  const relicAuctionFinished = (state.relicRound || 0) >= 3 || new Set(state.metaRelics || []).size >= 9;
  if (!state.failure && !(journeyFinished && relicAuctionFinished)) {
    state.completed = false;
    state.phase = journeyFinished ? 'relic' : 'hub';
    save();
    return journeyFinished
      ? startRelicAuction()
      : renderHub(`런 결과는 ${RELIC_AUCTION_DAY}일차 유물 경매가 끝난 뒤에 확인할 수 있습니다.`);
  }
  clearActionTimer(); audio.playBgm('settlement'); state.completed = true; state.phase = 'result'; adapter.showScene('result');
  document.querySelector('[data-scene="result"]').classList.toggle('is-failure', Boolean(state.failure));
  const unsold = ownedItems().reduce((sum, item) => sum + item.trueValue, 0);
  const relics = ownedRelicIds(); localStorage.setItem('unknown-auction:relics', JSON.stringify(relics));
  document.querySelector('#result-title').textContent = state.failure ? '여정 실패' : `${JOURNEY_DAYS}일 여정 완료`;
  const wonCount = state.history.filter((entry) => entry.won).length;
  const acquiredRelics = (state.relicChoices || []).map((id) => balance.relics.list.find((entry) => entry.id === id)?.name || id);
  const resultIcon = state.failure ? 'restart.png' : 'clear.png';
  document.querySelector('#run-summary').innerHTML = `<section class="result-ending"><img class="result-status-icon" src="./assets/ui/action-icons/${resultIcon}" alt=""><h3>${state.failure ? '여정 실패' : `상회 ${state.shopStage}단계 달성`}</h3>${state.failure ? `<p class="failure">${state.failure}</p>` : '<p>신중한 거래와 꾸준한 성장으로 여정을 마쳤습니다.</p>'}<strong>${state.failure ? '마감 조건을 다시 확인하세요.' : '완주 성공'}</strong></section><section class="result-stats"><h3>여정 요약</h3><p><span>완주 일수</span><b>${state.day}일</b></p><p><span>최종 상회 단계</span><b>${state.shopStage}단계</b></p><p><span>최종 자산</span><b>${money(state.cash + unsold)}</b></p><p><span>낙찰 / 완료 의뢰</span><b>${wonCount}건 / ${state.completedQuestCount}건</b></p><p><span>획득 유물</span><b>${acquiredRelics.join(', ') || '없음'}</b></p></section>`;
  if (state.failure) save();
  else store.clear(state.saveSlot);
}

const placeRenderers = { city: renderHub, quests: renderQuestOffice, tavern: renderTavern, exchange: renderExchange, shop: renderShop, guild: renderGuild, museum: () => renderMuseum('city'), catalog: renderCatalog };

document.querySelector('#new-run').onclick = async () => {
  const button = document.querySelector('#new-run');
  if (button.disabled) return;
  button.disabled = true;
  try {
    await newRun(document.querySelector('#seed').value.trim() || Date.now());
  } catch (error) {
    console.error('새 런 생성 실패', error);
    openSlotScene('new');
    document.querySelector('#save-guide').textContent = `새 런 생성에 실패했습니다: ${error.message}`;
  } finally {
    button.disabled = false;
  }
};
document.querySelector('#open-new-slots').onclick = () => { audio.playBgm('title'); openSlotScene('new'); };
document.querySelector('#open-continue-slots').onclick = () => { audio.playBgm('title'); openSlotScene('continue'); };
document.querySelector('#back-title').onclick = () => adapter.showScene('title');
document.querySelector('#save-settings').onclick = () => document.querySelector('#settings-dialog').showModal();
document.querySelector('#delete-save').onclick = () => {
  const slot = store.list().find((entry) => entry.slot === selectedSlot);
  if (!slot || slot.empty || !window.confirm(`SLOT ${selectedSlot} 저장을 삭제할까요?`)) return;
  store.clear(selectedSlot); renderSaveSlots();
};
document.querySelector('#continue-run').onclick = () => {
  state = store.load(selectedSlot);
  if (!state) return status('유효한 저장 데이터가 없습니다.', 'error');
  for (const lot of state.schedule.days.flatMap((day) => day.lots)) {
    const catalogItem = catalog.items.find((item) => item.base_id === lot.baseItemId);
    lot.spriteAnchor ??= catalogItem?.sprite_anchors?.[lot.grade] || { x: 0, y: 0 };
  }
  generation.blueprint = state.generationBlueprint || null;
  ({ auction: renderAuction, settlement: renderSettlement, relic: renderRelic, result: renderResult, quests: renderQuestOffice, tavern: renderTavern, exchange: renderExchange, shop: renderShop, guild: renderGuild, museum: () => renderMuseum('city'), catalog: renderCatalog }[state.phase] || renderHub)();
};
document.querySelector('#start-auction').onclick = () => {
  if (state.day >= RELIC_AUCTION_DAY) return startRelicAuction();
  prepareAuctionEntry(state);
  renderAuction();
};
document.querySelectorAll('[data-raise]').forEach((button) => button.onclick = () => finishLot('bid', Number(button.dataset.raise)));
document.querySelector('#direct-bid').onclick = () => {
  const session = state.auctionSession;
  if (!session) return;
  const minimumBid = session.currentPrice + Math.max(1, Math.ceil(session.currentPrice * balance.auction.minRaiseRate));
  const input = window.prompt('입찰 금액을 입력하세요.', String(minimumBid));
  if (input === null) return;
  const proposed = Number(input.replace(/[^0-9]/g, ''));
  finishLot('bid', 1, proposed);
};
document.querySelector('#pass').onclick = () => finishLot('pass'); document.querySelector('#next-day').onclick = nextDay;
document.querySelector('#buy-relic').onclick = () => finishRelic(true); document.querySelector('#skip-relic').onclick = () => finishRelic(false);
document.querySelector('#return-title').onclick = () => adapter.showScene('title');
document.querySelector('#title-museum').onclick = () => renderMuseum('title');
document.querySelector('#museum-back').onclick = () => museumReturn === 'title' ? adapter.showScene('title') : renderHub();
document.querySelector('#title-settings').onclick = () => document.querySelector('#settings-dialog').showModal();
document.querySelector('#hub-settings').onclick = () => document.querySelector('#settings-dialog').showModal();
document.querySelector('#close-settings').onclick = () => document.querySelector('#settings-dialog').close();
document.querySelector('#close-quest-detail').onclick = () => document.querySelector('#quest-detail-dialog').close();
const syncSoundToggle = () => {
  const button = document.querySelector('#sound-toggle');
  button.setAttribute('aria-pressed', String(audio.enabled));
  button.setAttribute('aria-label', `전체 소리 ${audio.enabled ? '켜짐' : '꺼짐'}`);
  button.innerHTML = `<span>전체 소리</span><strong>${audio.enabled ? '켜짐' : '꺼짐'}</strong>`;
};
document.querySelector('#sound-toggle').onclick = () => {
  audio.setEnabled(!audio.enabled);
  localStorage.setItem('unknown-auction:sound', audio.enabled ? 'on' : 'off');
  syncSoundToggle();
};
syncSoundToggle();
document.querySelectorAll('[data-place]').forEach((button) => button.onclick = () => { audio.playSfx('navigate'); placeRenderers[button.dataset.place]?.(); });
document.querySelector('#sell-selected').onclick = () => { const ids = [...document.querySelectorAll('[data-item-select]:checked')].map((input) => input.dataset.itemSelect); const revenue = sellItems(state, balance, ids); if (revenue) audio.playSfx('sell'); renderExchange(`${money(revenue)}에 처분했습니다.`); };
document.querySelector('#shop-upgrade').onclick = () => { const ok = upgradeShop(state, balance); if (ok) audio.playSfx('upgrade'); renderShop(ok ? '상회를 승급했습니다.' : '현금 또는 완료 의뢰가 부족합니다.'); };
document.querySelector('#guild-loan').onclick = () => {
  if (state.shopStage < balance.loan.minShopStage) {
    renderGuild(`담보 대출은 상회 ${balance.loan.minShopStage}단계부터 이용할 수 있습니다.`);
    return;
  }
  const lotId = document.querySelector('#guild-collateral')?.value;
  const ok = takeLoan(state, balance, lotId);
  if (ok) audio.playSfx('loan');
  renderGuild(ok ? '선택한 물품으로 담보 대출을 실행했습니다.' : '담보 물품을 선택하고 대출 조건을 확인하세요.');
};
document.querySelector('#guild-repay').onclick = () => { const ok = repayLoanEarly(state, balance); if (ok) audio.playSfx('repay'); renderGuild(ok ? '원금을 중도 상환했습니다.' : '상환할 수 없습니다.'); };
document.querySelector('#download-log').onclick = () => downloadRunLog(state);

boot();
