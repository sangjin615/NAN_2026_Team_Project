import { loadCatalog, spriteUrl } from './catalog.js';
import { createRunSchedule, validateSchedule } from './schedule.js';
import { createSetGraph } from './set-graph.js';
import { GenerationBuffer } from './generation-buffer.js';
import { GenerationApiProvider } from './generation-api-provider.js';
import { SaveStore } from './save-store.js';
import { advanceDay, createInitialState, resolveLot } from './game-state.js';
import { VslRuntimeAdapter } from './vsl-adapter.js';
import {
  acceptQuest, appraiseItem, botBidForLot, buyInformation, createDailyQuestOffers,
  deliverQuestItem, expireQuestsBeforeAuction, missedDeadline, questMatchesItem,
  quoteItemsSale, repayLoanEarly, sellItems, settleLoan, settleQuests, takeLoan, upgradeShop,
} from './systems.js';
import { downloadRunLog, recordEvent } from './telemetry.js';
import { AudioBus } from './audio-bus.js';
import { createRng } from './rng.js';

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
let selectedInfoKind = 'competitors';

const GRADE_LABELS = { COMMON: '일반', RARE: '희귀', EPIC: '영웅', LEGENDARY: '전설' };
const RELIC_TIER_LABELS = { low: '하급', mid: '중급', high: '상급' };
const CATEGORY_LABELS = { CER: '도자기', CLK: '시계', PNT: '회화', BOK: '고서', MET: '금은세공', JEW: '장신구' };
const categoryIconUrl = (category) => `./assets/ui/market-categories/${category.toLowerCase()}.png`;
const gradeLabel = (grade) => GRADE_LABELS[grade] || grade;
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function clearActionTimer() {
  if (actionTimer) window.clearInterval(actionTimer);
  actionTimer = null;
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
const save = () => store.save(state, state.saveSlot);

function loadMeta() {
  try { return JSON.parse(localStorage.getItem('unknown-auction:relics') || '[]'); }
  catch { return []; }
}

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
  const schedule = createRunSchedule({ catalog, balance, seed });
  if (!validateSchedule(schedule).valid) throw new Error('96 LOT 생성 실패');
  const sets = createSetGraph(schedule, seed);
  state = createInitialState({ schedule, sets, balance, startCash: balance.run.startCash, metaRelics: loadMeta() });
  state.saveSlot = selectedSlot;
  state.version = 2;
  recordEvent(state, 'run-start', { saveSlot: selectedSlot });
  audio.playBgm('city');
  state.generationBlueprint = await generation.prepareRun({
    runSeed: seed, sets, market: state.marketPath,
  });
  await generation.ensure({ currentDay: 1, schedule, sets, aheadDays: 0 });
  save();
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
    hud.innerHTML = `<span class="hud-day"><b>${state.day}일차 / 12</b></span><span class="hud-cash"><b>${money(state.cash)}</b></span><span class="hud-storage"><small>보관칸</small><b>${ownedItems().length} / ${state.storage}</b></span><span class="hud-stage"><b>${state.shopStage}단계</b><small>상회 단계</small></span><span class="hud-loan"><small>담보 대출</small><b>${loan}</b></span><button class="scene-hud-settings" aria-label="설정">설정</button>`;
    hud.querySelector('.scene-hud-settings').onclick = () => document.querySelector('#settings-dialog').showModal();
  }
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
      return `<span class="market-spark ${trend}" data-category="${family}"><span class="market-quote"><img src="${categoryIconUrl(family)}" alt=""><b>${CATEGORY_LABELS[family]}</b><em>${(current * 100).toFixed(0)}</em><i aria-label="${trend === 'rise' ? '상승' : trend === 'fall' ? '하락' : '변동 없음'}">${arrow}</i></span><svg viewBox="0 0 100 46" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="25" x2="100" y2="25"></line><polyline points="${points}"></polyline><circle cx="${lastX}" cy="${lastY}" r="3.4"></circle></svg></span>`;
    }).join('')}</div>`;
  document.querySelector('#loan-status').textContent = state.loan
    ? `만기 ${state.loan.dueDay}일 · ${money(state.loan.due)}`
    : state.guildLocked ? '조합 이용 제한' : '대출 없음';
  document.querySelector('#hub-message').textContent = message;
  save();
}

function questTitle(quest) {
  const names = { designated: '지정 계열', multi: '희귀품 인도', bargain: '저가 매입품', restraint: '실속품 인도', block: '고등급 인도' };
  return `${names[quest.id] || quest.id}${quest.id === 'designated' ? ` · ${quest.targetCategory}` : ''}`;
}

function questRequirement(quest) {
  if (quest.id === 'designated') return `${quest.targetCategory} 계열 물품 1개를 인도한다.`;
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

function renderQuestOffice(message = '') {
  clearActionTimer(); audio.playBgm('workplace'); state.phase = 'quests'; adapter.showScene('quests'); syncHeader();
  document.querySelector('#quest-offers').innerHTML = state.questOffers.map((quest) => `
    <article><img class="quest-icon" src="${questIconUrl(quest.id)}" alt=""><b>${questTitle(quest)}</b><small>${questRequirement(quest)}</small><span>수주비 ${money(quest.fee)} · 보상 ${money(quest.reward)}</span>
    <button data-quest="${quest.id}" ${quest.accepted ? 'disabled' : ''}>${quest.accepted ? '수주 완료' : '수주'}</button></article>`).join('');
  const active = state.activeQuests.filter((quest) => !quest.completed);
  const activeMarkup = active.length ? active.map((quest) => {
    const candidates = ownedItems().filter((item) => questMatchesItem(quest, item));
    return `<article><img class="quest-icon" src="${questIconUrl(quest.id)}" alt=""><b>${questTitle(quest)}</b><span>${quest.deadlineDay}일차 경매 전까지</span>
      <select data-delivery-select="${quest.id}"><option value="">제출할 물품 선택</option>${candidates.map((item) => `<option value="${item.lotId}">${item.name} · ${gradeLabel(item.grade)}</option>`).join('')}</select>
      <button data-deliver-quest="${quest.id}" ${candidates.length ? '' : 'disabled'}>물품 제출</button></article>`;
  }).join('') : '<p class="empty-note">수주한 의뢰가 없습니다.</p>';
  const appraisalMarkup = ownedItems().length ? ownedItems().map((item) => {
    const lot = scheduledLot(item.lotId);
    const discount = 1 - (balance.shop.infoDiscount?.[state.shopStage] ?? 0);
    const cost = Math.ceil(item.basePrice * balance.appraisal.rate * discount / 100) * 100;
    const result = item.appraised
      ? `<strong>${money(item.trueValue)} <small>± ${money(item.appraisalRange)}</small></strong>`
      : `<span>감정 비용 ${money(cost)}</span>`;
    return `<article class="appraisal-card">
      <img src="${lot ? spriteUrl(lot, item.grade) : ''}" alt="${item.name}">
      <div><b>${item.name}</b><small>${gradeLabel(item.grade)} · ${item.category}</small>${result}</div>
      <button data-office-appraise="${item.lotId}" ${item.appraised || item.collateral || state.cash < cost ? 'disabled' : ''}>${item.appraised ? '감정 완료' : item.collateral ? '담보 설정됨' : '정밀 감정'}</button>
    </article>`;
  }).join('') : '<p class="empty-note">감정할 보유 물품이 없습니다.</p>';
  document.querySelector('#active-quests').innerHTML = `
    <section class="accepted-quests"><h4>수주 의뢰 · 물품 제출</h4>${activeMarkup}</section>
    <section class="appraisal-office"><h4>보유 물품 · 정밀 감정</h4><div class="appraisal-grid">${appraisalMarkup}</div></section>`;
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
  document.querySelector('#quest-message').textContent = message;
}

function renderExchange(message = '') {
  clearActionTimer(); audio.playBgm('workplace'); state.phase = 'exchange'; adapter.showScene('exchange'); syncHeader();
  const exchangeItems = ownedItems();
  const maxStorage = Math.max(...balance.shop.storage);
  const occupiedCards = exchangeItems.map((item) => `
    <article><label><input type="checkbox" data-item-select="${item.lotId}"> <b>${item.name}</b></label>
    <span>${gradeLabel(item.grade)} · ${item.category}</span><span>매입 ${money(item.paid)} · ${item.appraised ? `감정 ${money(item.trueValue)} ±${money(item.appraisalRange)}` : '미감정'}</span>
    <button data-sell-item="${item.lotId}" ${item.collateral ? 'disabled' : ''}>즉시 처분</button></article>`).join('');
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
  document.querySelectorAll('[data-sell-item]').forEach((button) => button.onclick = () => {
    const revenue = sellItems(state, balance, [button.dataset.sellItem]);
    if (revenue) audio.playSfx('sell');
    renderExchange(`${money(revenue)}에 처분했습니다.`);
  });
  document.querySelector('#exchange-market').innerHTML = `<h3>최근 시세</h3><div class="market-rates">${Object.entries(state.marketPath).map(([key, path]) => {
    const now = path[state.day - 1]; const previous = state.day > 1 ? path[state.day - 2] : 1; const delta = now - previous;
    return `<div><img src="${categoryIconUrl(key)}" alt=""><b>${CATEGORY_LABELS[key]}</b><strong>${Math.round(now * 100)}%</strong><span class="${delta >= 0 ? 'rise' : 'fall'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta * 100).toFixed(0)}%</span></div>`;
  }).join('')}</div><section class="bundle-sale-panel"><h4>묶음 판매</h4><p>같은 계열과 희귀도 조합을 함께 팔면 묶음 보너스가 적용됩니다.</p><div class="bundle-sale-summary"><span>선택 <b id="bundle-count">0개</b></span><span>조합 <b id="bundle-label">선택 없음</b></span><span>배율 <b id="bundle-multiplier">×1.00</b></span><strong id="bundle-estimate">예상 0 G</strong></div></section><section class="set-bonus-guide"><h4>세트 보너스</h4><div><span data-set-rule="same-2">동일 계열 2점 <b>×1.20</b></span><span data-set-rule="same-3">동일 계열 3점 <b>×1.80</b></span><span data-set-rule="high-3">영웅 이상 3점 <b>×2.40</b></span><span data-set-rule="grade-3">희귀도 3종 <b>×2.60</b></span><span data-set-rule="all-6">전 계열 6종 <b>×1.40</b></span></div><small>성립한 조합 중 가장 높은 배율이 적용됩니다.</small></section>`;
  const syncBulkActions = () => {
    const ids = [...document.querySelectorAll('[data-item-select]:checked')].map((input) => input.dataset.itemSelect);
    const items = ownedItems().filter((item) => ids.includes(item.lotId) && !item.collateral);
    const quote = quoteItemsSale(state, balance, ids);
    const groups = Object.values(Object.groupBy(items, (item) => item.category));
    const categories = groups.map((group) => group.length);
    const distinctGrades = new Set(items.map((item) => item.grade)).size;
    let label = items.length ? '일반 묶음' : '선택 없음';
    if (categories.some((count) => count >= 3) && distinctGrades >= 3) label = '혼합 희귀도 세트';
    else if (categories.some((count) => count >= 3)) label = '동일 계열 3점';
    else if (categories.some((count) => count >= 2)) label = '동일 계열 2점';
    else if (new Set(items.map((item) => item.category)).size >= 6) label = '전 계열 컬렉션';
    document.querySelector('#sell-selected').disabled = !quote.count;
    document.querySelector('#bundle-count').textContent = `${quote.count}개`;
    document.querySelector('#bundle-label').textContent = label;
    document.querySelector('#bundle-multiplier').textContent = `×${quote.multiplier.toFixed(2)}`;
    document.querySelector('#bundle-estimate').textContent = `예상 ${money(quote.revenue)}`;
    const activeRules = {
      'same-2': groups.some((group) => group.length >= 2),
      'same-3': groups.some((group) => group.length >= 3),
      'high-3': groups.some((group) => group.filter((item) => ['EPIC', 'LEGENDARY'].includes(item.grade)).length >= 3),
      'grade-3': groups.some((group) => new Set(group.map((item) => item.grade)).size >= 3),
      'all-6': new Set(items.map((item) => item.category)).size >= 6,
    };
    document.querySelectorAll('[data-set-rule]').forEach((rule) => rule.classList.toggle('is-active', activeRules[rule.dataset.setRule]));
  };
  document.querySelectorAll('[data-item-select]').forEach((input) => { input.onchange = syncBulkActions; });
  document.querySelector('#sell-selected').textContent = '판매';
  syncBulkActions();
  document.querySelector('#exchange-message').textContent = message;
}

function renderTavern(message = '') {
  clearActionTimer(); audio.playBgm('tavern'); state.phase = 'tavern'; adapter.showScene('tavern'); syncHeader();
  const bought = Object.keys(state.information?.[state.day] || {});
  const names = { forecast: '수요 동향', catalog: '출품 명세', competitors: '경쟁자 예산' };
  const descriptions = { forecast: '현재 시장에서 수요가 높은 계열과 방향을 분석합니다.', catalog: '주요 LOT의 예상 등급과 계열 분포를 알려드립니다.', competitors: '경매 참가자들의 보유 예산 범위를 추정합니다.' };
  const icons = { forecast: './assets/ui/tavern/demand-trend.png', catalog: './assets/ui/tavern/lot-specification.png', competitors: './assets/ui/tavern/competitor-budget.png' };
  const precision = { forecast: ['★★★★☆', '높음'], catalog: ['★★★☆☆', '보통'], competitors: ['★★★☆☆', '보통'] };
  const lots = state.schedule.days[state.day - 1].lots;
  const totalBase = lots.reduce((sum, lot) => sum + lot.pricing.basePrice, 0);
  document.querySelectorAll('[data-broker]').forEach((broker) => {
    const kind = broker.dataset.broker;
    const selectBroker = () => { selectedInfoKind = kind; renderTavern(); };
    broker.classList.toggle('is-active', kind === selectedInfoKind);
    broker.setAttribute('aria-pressed', String(kind === selectedInfoKind));
    broker.querySelector('span').textContent = bought.includes(kind) ? '오늘 구매 완료' : bought.length ? '오늘 구매 종료' : '오늘 구매 가능';
    broker.onclick = selectBroker;
    broker.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectBroker(); } };
  });
  document.querySelectorAll('[data-info]').forEach((button) => {
    const kind = button.dataset.info;
    const discount = 1 - (balance.shop.infoDiscount?.[state.shopStage] ?? 0);
    const cost = Math.ceil(totalBase * balance.informationRate[kind] * discount / 100) * 100;
    button.classList.toggle('is-selected', kind === selectedInfoKind);
    button.innerHTML = `<img class="info-symbol" src="${icons[kind]}" alt=""><span class="info-copy"><strong>${names[kind]}</strong><small>${descriptions[kind]}</small></span><b>${money(cost)}</b><em>${precision[kind][0]}<small>${precision[kind][1]}</small></em><span class="info-state">${bought.includes(kind) ? '구매 완료' : '구매 가능'}</span>`;
    button.onclick = () => { selectedInfoKind = kind; renderTavern(); };
  });
  const selected = selectedInfoKind;
  const discount = 1 - (balance.shop.infoDiscount?.[state.shopStage] ?? 0);
  const selectedCost = Math.ceil(totalBase * balance.informationRate[selected] * discount / 100) * 100;
  const categoryNames = { CER: '도자기', CLK: '시계', PNT: '회화', BOK: '고서', MET: '금은세공', JEW: '장신구' };
  const informationResult = (kind) => {
    if (kind === 'forecast') {
      const ranked = Object.entries(state.marketPath).map(([key, path]) => [key, path[state.day - 1]]).sort((a, b) => b[1] - a[1]).slice(0, 2);
      return `<ul>${ranked.map(([key, value]) => `<li>${categoryNames[key]} 수요 <b>${Math.round(value * 100)}%</b> · ${value >= 1 ? '상승 우세' : '하락 주의'}</li>`).join('')}</ul>`;
    }
    if (kind === 'catalog') {
      const grades = Object.entries(Object.groupBy(lots, (lot) => lot.grade)).map(([grade, entries]) => `${gradeLabel(grade)} ${entries.length}점`).join(' · ');
      const families = Object.entries(Object.groupBy(lots, (lot) => lot.category)).map(([key, entries]) => `${categoryNames[key]} ${entries.length}`).join(' · ');
      return `<p><b>예상 등급</b><br>${grades}</p><p><b>계열 분포</b><br>${families}</p>`;
    }
    const estimates = lots.flatMap((lot) => botBidForLot({ lot, day: state.day, balance, marketIndex: state.marketPath[lot.category][state.day - 1], seed: state.seed }));
    const grouped = Object.groupBy(estimates, (bot) => bot.name);
    return `<ul>${Object.entries(grouped).map(([name, entries]) => { const values = entries.map((entry) => entry.maxBid); return `<li><b>${name}</b> ${money(Math.min(...values))} ~ ${money(Math.max(...values))}</li>`; }).join('')}</ul>`;
  };
  const results = informationResult(selected);
  const owned = bought.includes(selected);
  document.querySelector('#tavern-detail').innerHTML = `<h3>정보 상세</h3><div class="detail-heading"><img class="detail-symbol" src="${icons[selected]}" alt=""><div><h2>${names[selected]}</h2><strong>${precision[selected][0]} <small>(${precision[selected][1]})</small></strong></div></div><p>${descriptions[selected]}</p><section class="info-result"><b>공개 범위</b><p>${owned ? '구매한 정보는 오른쪽 확보 정보에서 확인할 수 있습니다.' : '구매하면 추정 범위와 분석 결과가 오른쪽에 공개됩니다.'}</p></section><div class="detail-price"><span>가격</span><b>${money(selectedCost)}</b></div><button id="buy-tavern-info" ${bought.length || state.cash < selectedCost ? 'disabled' : ''}>${owned ? '구매 완료' : bought.length ? '오늘 구매 종료' : '구매하기'}</button>`;
  document.querySelector('#buy-tavern-info').onclick = () => { const ok = buyInformation(state, balance, selected); if (ok) { audio.playSfx('information'); save(); } renderTavern(ok ? '정보를 구매했습니다.' : '이미 구매했거나 현금이 부족합니다.'); };
  const ownedKind = bought[0];
  document.querySelector('#tavern-owned').innerHTML = ownedKind ? `<h3>오늘 확보한 정보</h3><div class="owned-heading"><img src="${icons[ownedKind]}" alt=""><div><h2>${names[ownedKind]}</h2><small>${precision[ownedKind][0]} (${precision[ownedKind][1]})</small></div></div><section class="info-result">${informationResult(ownedKind)}</section><p class="owned-note">당일 경매 종료까지 유지됩니다.</p>` : '<h3>오늘 확보한 정보</h3><p class="empty-info">정보상을 선택하고 오늘 사용할 정보 하나를 구매하세요.</p>';
  document.querySelector('#tavern-message').textContent = message;
}

function renderShop(message = '') {
  clearActionTimer(); audio.playBgm('workplace'); state.phase = 'shop'; adapter.showScene('shop'); syncHeader();
  const next = Math.min(4, state.shopStage + 1); const maxed = state.shopStage >= 4;
  const cost = maxed ? 0 : balance.shop.upgradeCost[next - 1];
  const required = maxed ? 0 : balance.shop.questRequirement[next - 1];
  const nextStorage = maxed ? state.storage : balance.shop.storage[next];
  const nextDiscount = maxed ? balance.shop.infoDiscount[state.shopStage] : balance.shop.infoDiscount[next];
  const maxStorage = Math.max(...balance.shop.storage);
  const inventory = ownedItems();
  const slots = Array.from({ length: maxStorage }, (_, index) => {
    const item = inventory[index];
    const unlocked = index < state.storage;
    if (item) {
      const lot = scheduledLot(item.lotId);
      return `<article class="shop-storage-slot is-filled"><span class="slot-number">${index + 1}</span><img src="${lot ? spriteUrl(lot, item.grade) : ''}" alt=""><div><b>${escapeHtml(item.name)}</b><small>${gradeLabel(item.grade)} · 감정가 ${money(item.appraisedValue || item.trueValue)}</small></div></article>`;
    }
    return `<article class="shop-storage-slot ${unlocked ? 'is-empty' : 'is-locked'}"><span class="slot-number">${index + 1}</span><img class="storage-placeholder" src="./assets/ui/exchange/${unlocked ? 'storage-empty.png' : 'storage-locked.png'}" alt=""><div><b>${unlocked ? '빈 보관칸' : '잠긴 보관칸'}</b><small>${unlocked ? '낙찰 물품 보관' : '상회 승급 시 해금'}</small></div></article>`;
  }).join('');
  const questReady = state.completedQuestCount >= required;
  const cashReady = state.cash >= cost;
  document.querySelector('#shop-detail').innerHTML = `<section class="shop-upgrade-panel"><header><h3>${maxed ? '상회 최고 단계' : `상회 ${next}단계 승급 조건`}</h3></header><ul class="shop-requirements"><li class="${questReady ? 'is-ready' : ''}"><span>▣ 의뢰 달성 조건</span><b>${state.completedQuestCount} / ${required}건</b></li><li class="${cashReady ? 'is-ready' : ''}"><span>● 승급비</span><b>${money(cost)}</b></li><li class="${cashReady ? 'is-ready' : ''}"><span>● 현재 자산</span><b>${money(state.cash)}</b></li></ul><h4>다음 단계 효과</h4><ul class="shop-benefits"><li>보관함 +${Math.max(0, nextStorage - state.storage)}</li><li>정보 구매 비용 ${Math.round((nextDiscount || 0) * 100)}% 할인</li>${next >= 3 ? '<li>유물 전시관 해금 확대</li>' : '<li>의뢰 동시 수주 강화</li>'}</ul></section><section class="shop-inventory-panel"><header><div><small>STORAGE</small><h3>보유품 관리</h3></div><b>${inventory.length} / ${state.storage}</b></header><div class="shop-storage-grid">${slots}</div><p class="shop-storage-note">※ 보유품 슬롯은 상회 단계에 따라 증가합니다.</p></section>`;
  document.querySelector('#shop-upgrade').textContent = maxed ? '최고 단계 달성' : `${next}단계로 승급하기`;
  document.querySelector('#shop-upgrade').disabled = maxed || state.cash < cost || state.completedQuestCount < required;
  document.querySelector('#shop-message').textContent = message;
}

function renderGuild(message = '') {
  clearActionTimer(); audio.playBgm('workplace'); state.phase = 'guild'; adapter.showScene('guild'); syncHeader();
  const locked = state.shopStage < balance.loan.minShopStage;
  const collateralItems = ownedItems().filter((item) => !item.collateral);
  const collateralCount = collateralItems.length;
  const collateralOptions = collateralItems.map((item) => `<option value="${item.lotId}">${item.name}</option>`).join('');
  const activeCollateral = state.loan ? state.inventory.find((item) => item.lotId === state.loan.lotId) : null;
  const statusTitle = locked ? '담보 대출 잠김' : state.loan ? '활성 대출' : state.guildLocked ? '조합 이용 제한' : '활성 대출 없음';
  const detail = `<h3>담보 대출 상태</h3><div class="guild-status-grid"><section><small>현재 상태</small><strong>${statusTitle}</strong><span>${locked ? `상회 ${balance.loan.minShopStage}단계에서 해금됩니다.` : state.loan ? `담보 · ${activeCollateral?.name || state.loan.lotId}` : '현재 활성 대출이 없습니다.'}</span></section><dl><div><dt>원금</dt><dd>${state.loan ? money(state.loan.principal) : '—'}</dd></div><div><dt>만기</dt><dd>${state.loan ? `${state.loan.dueDay}일차` : '—'}</dd></div><div><dt>상환 총액</dt><dd>${state.loan ? money(state.loan.due) : '—'}</dd></div></dl></div><label class="collateral-picker"><span>선택 담보</span><select id="guild-collateral"><option value="">물품을 선택하세요</option>${collateralOptions}</select></label><p id="loan-preview">보유 물품을 선택하면 대출 가능 금액을 계산합니다.</p>`;
  document.querySelector('#guild-detail').innerHTML = detail;
  const collateralMarkup = collateralItems.length ? collateralItems.map((item) => {
    const lot = scheduledLot(item.lotId);
    const value = Math.round(item.trueValue * balance.loan.limitFromDisposalValue);
    return `<label class="guild-collateral-card"><img src="${lot ? spriteUrl(lot, item.grade) : ''}" alt=""><span><b>${item.name}</b><small>${gradeLabel(item.grade)} · 정산가치 ${money(item.trueValue)}</small></span><strong>${money(value)}</strong><input type="radio" name="guild-collateral-card" value="${item.lotId}"></label>`;
  }).join('') : `<div class="guild-collateral-empty"><b>${locked ? '담보 기능이 잠겨 있습니다.' : '담보로 설정할 보유 물품이 없습니다.'}</b><span>${locked ? `상회를 ${balance.loan.minShopStage}단계로 승급하면 이용할 수 있습니다.` : '경매에서 물품을 낙찰한 뒤 다시 방문하세요.'}</span></div>`;
  document.querySelector('#guild-collateral-list').innerHTML = `<header><h3>담보 보유품 <small>(미판매 물품)</small></h3><b>${collateralCount} / ${state.storage}</b></header><div class="guild-collateral-scroll">${collateralMarkup}</div><footer><span>선택 담보 대출 한도</span><strong id="guild-limit-total">0 G</strong></footer>`;
  document.querySelector('#guild-loan').disabled = locked || Boolean(state.loan) || state.guildLocked || !collateralCount;
  document.querySelector('#guild-repay').disabled = !state.loan || state.day >= state.loan?.dueDay;
  document.querySelector('#guild-message').innerHTML = message ? `<b>${message}</b>` : `<b>대출 안내</b><p>선택한 물품은 상환 전까지 판매·감정·의뢰 제출이 제한됩니다.</p><p>만기 ${balance.loan.termDays}일 · 만기 상환액은 원금의 ${Math.round(balance.loan.repayMultiplier * 100)}%</p>`;
  const picker = document.querySelector('#guild-collateral');
  if (picker) {
    document.querySelector('#guild-loan').disabled = true;
    picker.onchange = () => {
    const item = collateralItems.find((entry) => entry.lotId === picker.value);
    const principal = item ? Math.round(item.trueValue * balance.loan.limitFromDisposalValue) : 0;
    document.querySelector('#guild-loan').disabled = !item;
    document.querySelector('#loan-preview').textContent = item ? `대출 ${money(principal)} · ${state.day + balance.loan.termDays}일차 만기 ${money(Math.round(principal * balance.loan.repayMultiplier))}` : '물품을 선택하면 대출액과 만기 상환액을 계산합니다.';
    };
    document.querySelectorAll('[name="guild-collateral-card"]').forEach((radio) => {
      radio.onchange = () => {
        picker.value = radio.value;
        picker.dispatchEvent(new Event('change'));
        const item = collateralItems.find((entry) => entry.lotId === radio.value);
        document.querySelector('#guild-limit-total').textContent = money(Math.round(item.trueValue * balance.loan.limitFromDisposalValue));
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
  const owned = new Set(state?.metaRelics || loadMeta());
  const relics = balance.relics.list;
  const tierNames = { low: '하급', mid: '중급', high: '상급' };
  document.querySelector('#relic-list').innerHTML = relics.map((relic, index) => {
    const isOwned = owned.has(relic.id);
    const art = relicArt[relic.id];
    return `<article class="${isOwned ? 'is-owned' : 'is-locked'}" role="button" tabindex="0" aria-label="${isOwned ? relic.name : '미획득 유물'}" data-slot="${index + 1}" data-relic="${relic.id}">${isOwned && art ? `<img src="./assets/relics/${encodeURIComponent(art)}" alt=""><b>${relic.name}</b><span>${relic.effect}</span>` : ''}</article>`;
  }).join('');
  const showRelicDetail = (relic) => {
    const isOwned = owned.has(relic.id); const art = relicArt[relic.id];
    document.querySelector('#relic-detail').innerHTML = isOwned
      ? `${art ? `<img src="./assets/relics/${encodeURIComponent(art)}" alt="">` : ''}<small>${tierNames[relic.tier]} 유물</small><h3>${relic.name}</h3><p>${relic.effect}</p>`
      : `<small>${tierNames[relic.tier]} 전시 슬롯</small><h3>미획득 유물</h3><p>여정을 완주하고 유물 경매에서 획득하면 정보가 공개됩니다.</p>`;
  };
  document.querySelectorAll('[data-relic]').forEach((card) => {
    const select = () => { document.querySelectorAll('[data-relic]').forEach((entry) => entry.classList.toggle('is-selected', entry === card)); showRelicDetail(relics.find((relic) => relic.id === card.dataset.relic)); audio.playSfx('museum'); };
    card.onclick = select; card.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } };
  });
  const ownedCount = relics.filter((relic) => owned.has(relic.id)).length;
  document.querySelector('#museum-progress').innerHTML = `<b>수집 현황</b><strong>${ownedCount} / ${relics.length}</strong><span>하급 ${relics.filter((relic) => relic.tier === 'low' && owned.has(relic.id)).length}/3 · 중급 ${relics.filter((relic) => relic.tier === 'mid' && owned.has(relic.id)).length}/3 · 상급 ${relics.filter((relic) => relic.tier === 'high' && owned.has(relic.id)).length}/3</span>`;
  const initial = relics.find((relic) => owned.has(relic.id)) || relics[0];
  document.querySelector(`[data-relic="${initial.id}"]`)?.click();
}

function renderCatalog() {
  clearActionTimer(); audio.playBgm('workplace'); state.phase = 'catalog'; adapter.showScene('catalog'); syncHeader();
  document.querySelector('#catalog-grid').innerHTML = state.schedule.days[state.day - 1].lots.map((lot) => `<article class="lot-card"><div class="mini-sprite ${lot.visualEffects.map((effect) => `vfx-${effect}`).join(' ')}"><img src="${spriteUrl(lot, lot.grade)}" alt=""></div><span>${gradeLabel(lot.grade)}</span><h3>${escapeHtml(lot.content.displayName)}</h3><p>${escapeHtml(lot.content.description)}</p></article>`).join('');
}

function renderAuction() {
  const lot = state.schedule.days[state.day - 1].lots[state.lotIndex];
  if (!lot) return renderSettlement();
  const expired = expireQuestsBeforeAuction(state);
  state.phase = 'auction'; audio.playBgm('auction');
  if (state.auctionSession?.lotId !== lot.lotId) {
    const marketIndex = state.marketPath[lot.category][state.day - 1];
    const generatedFeed = [lot.content.rumor, lot.content.setHint, lot.content.npcReaction].filter(Boolean);
    state.auctionSession = { lotId: lot.lotId, currentPrice: Math.max(1, Math.round(lot.pricing.basePrice * balance.auction.startBidRatio)), leader: null, bots: botBidForLot({ lot, day: state.day, balance, marketIndex, seed: state.seed }), deadline: Date.now() + 15000, feed: [...(expired ? [`기한이 지난 의뢰 ${expired}건이 만료됐습니다.`] : ['경매가 시작되었습니다.']), ...generatedFeed] };
  }
  state.auctionSession.deadline ||= Date.now() + 15000;
  adapter.showScene('auction');
  adapter.setText('lot-progress', `${state.day}일차 · LOT ${state.lotIndex + 1} / 8`); adapter.setText('lot-name', lot.content.displayName);
  adapter.setText('lot-grade', lot.grade); adapter.setText('lot-description', lot.content.description); adapter.setText('base-price', money(lot.pricing.basePrice));
  adapter.setText('current-bid', money(state.auctionSession.currentPrice)); adapter.setText('cash', money(state.cash)); adapter.setSprite('current-lot', spriteUrl(lot, lot.grade)); adapter.setEffects('current-lot', lot.visualEffects);
  document.querySelector('#auction-feed').innerHTML = state.auctionSession.feed.slice(-4).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  const participants = [
    { name: '당신', budget: state.cash, leader: state.auctionSession.leader === 'player', player: true },
    ...state.auctionSession.bots.map((bot) => ({ name: bot.name, budget: bot.maxBid, leader: state.auctionSession.leader === bot.id })),
  ];
  document.querySelector('#auction-participants').innerHTML = `<h3>참가자 명단 (${participants.length} / 4)</h3>${participants.map((participant, index) => `<div class="participant ${participant.leader ? 'is-leading' : ''}"><span>${participant.player ? '나' : index}</span><b>${participant.name}</b><strong>${money(participant.budget)}</strong></div>`).join('')}`;
  document.querySelector('#auction-lot-status').innerHTML = `<b>경매 ${state.lotIndex + 1} / 8</b><span>${gradeLabel(lot.grade)}</span><strong>${money(state.auctionSession.currentPrice)}</strong><em id="auction-timer" aria-label="남은 시간"></em>`;
  armActionTimer('#auction-timer', state.auctionSession.deadline, () => finishLot('pass'));
}

function finishLot(action, multiplier = 1) {
  clearActionTimer();
  const lot = state.schedule.days[state.day - 1].lots[state.lotIndex]; const session = state.auctionSession; let result;
  if (action === 'bid') {
    const raise = Math.max(1, Math.ceil(session.currentPrice * balance.auction.minRaiseRate));
    const proposed = Math.max(session.currentPrice + raise, Math.ceil(session.currentPrice * multiplier));
    if (proposed > state.cash) { session.feed.push('보유 자금이 부족합니다.'); return renderAuction(); }
    if (ownedItems().length >= state.storage) { session.feed.push('보관칸이 가득 찼습니다.'); return renderAuction(); }
    session.currentPrice = proposed; session.leader = 'player'; session.feed.push(`플레이어 ${money(proposed)}`); audio.playSfx('bid');
    session.deadline = Date.now() + 15000;
    const challenger = [...session.bots].filter((bot) => bot.maxBid > proposed).sort((a, b) => b.maxBid - a.maxBid)[0];
    if (challenger) { session.currentPrice = Math.min(challenger.maxBid, proposed + raise); session.leader = challenger.id; session.feed.push(`${challenger.name} ${money(session.currentPrice)}`); audio.playSfx('bot-bid'); return renderAuction(); }
    result = { winner: 'player', price: proposed, bots: session.bots };
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
  document.querySelector('#settlement-summary').textContent = `보유품 ${ownedItems().length}개 · 현금 ${money(state.cash)} · 제출 의뢰 ${state.lastSettlement.quests}건 · 대출 ${loanResult}`;
  document.querySelector('#next-day').textContent = state.failure ? '실패 결과 확인' : state.day === 12 ? '최종 유물 경매로' : `${state.day + 1}일차로`;
  save();
}

async function nextDay() {
  audio.playSfx('day');
  if (state.failure) return renderResult();
  if (state.day === 12) return startRelicAuction();
  const nextDayButton = document.querySelector('#next-day');
  nextDayButton.disabled = true;
  advanceDay(state); state.questOffers = createDailyQuestOffers(balance, state.day, state.seed, state.metaRelics); state.settledDay = null;
  save();
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
  const permanent = new Set(state.metaRelics || []);
  if (permanent.size >= 9) return renderResult();
  state.phase = 'relic'; state.relicRound ??= 0; state.relicChoices ??= []; state.relicSession = null; renderRelic();
}

function renderRelic() {
  if (state.relicRound >= 3) return renderResult();
  adapter.showScene('relic'); audio.playBgm('relic'); const tier = balance.relicAuction.tiers[state.relicRound]; const opening = balance.relicAuction.startBid[state.relicRound];
  const choices = balance.relics.list.filter((relic) => relic.tier === tier && !state.metaRelics.includes(relic.id));
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
  document.querySelector('#relic-card').innerHTML = `<p>${RELIC_TIER_LABELS[tier] || tier} · ${state.relicRound + 1}/3회</p><h2>${relic.name}</h2><p>${relic.effect}</p><strong>현재 호가 ${money(session.currentPrice)}</strong><em id="relic-timer" aria-label="남은 시간"></em>`;
  const participants = [{ id: 'player', name: '당신', budget: state.cash }, ...session.bots.map((bot) => ({ ...bot, budget: bot.maxBid }))];
  document.querySelector('#relic-participants').innerHTML = `<h3>최종 경매 참가자</h3>${participants.map((participant) => `<div class="participant ${session.leader === participant.id ? 'is-leading' : ''}"><b>${participant.name}</b><strong>${money(participant.budget)}</strong></div>`).join('')}`;
  document.querySelector('#relic-feed').innerHTML = session.feed.slice(-4).map((line) => `<p>${line}</p>`).join('');
  document.querySelector('#buy-relic').textContent = `10% 인상 입찰`;
  document.querySelector('#skip-relic').textContent = '물러나기';
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
  clearActionTimer(); audio.playBgm('settlement'); state.completed = true; state.phase = 'result'; adapter.showScene('result');
  document.querySelector('[data-scene="result"]').classList.toggle('is-failure', Boolean(state.failure));
  const unsold = ownedItems().reduce((sum, item) => sum + item.trueValue, 0);
  const relics = [...new Set([...state.metaRelics, ...(state.relicChoices || [])])]; localStorage.setItem('unknown-auction:relics', JSON.stringify(relics));
  document.querySelector('#result-title').textContent = state.failure ? '여정 실패' : '12일 여정 완료';
  document.querySelector('#run-summary').innerHTML = `${state.failure ? `<p class="failure">${state.failure}</p>` : ''}<p>현금 ${money(state.cash)} · 미판매 자산 ${money(unsold)}</p><p>낙찰 ${state.history.filter((entry) => entry.won).length}건 · 완료 의뢰 ${state.completedQuestCount}건 · 상회 ${state.shopStage}단계</p><p>획득 유물 ${(state.relicChoices || []).join(', ') || '없음'}</p>`;
  save();
}

const placeRenderers = { city: renderHub, quests: renderQuestOffice, tavern: renderTavern, exchange: renderExchange, shop: renderShop, guild: renderGuild, museum: () => renderMuseum('city'), catalog: renderCatalog };

document.querySelector('#new-run').onclick = () => newRun(document.querySelector('#seed').value.trim() || Date.now());
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
  generation.blueprint = state.generationBlueprint || null;
  ({ auction: renderAuction, settlement: renderSettlement, relic: renderRelic, result: renderResult, quests: renderQuestOffice, tavern: renderTavern, exchange: renderExchange, shop: renderShop, guild: renderGuild, museum: () => renderMuseum('city'), catalog: renderCatalog }[state.phase] || renderHub)();
};
document.querySelector('#start-auction').onclick = renderAuction;
document.querySelectorAll('[data-raise]').forEach((button) => button.onclick = () => finishLot('bid', Number(button.dataset.raise)));
document.querySelector('#pass').onclick = () => finishLot('pass'); document.querySelector('#next-day').onclick = nextDay;
document.querySelector('#buy-relic').onclick = () => finishRelic(true); document.querySelector('#skip-relic').onclick = () => finishRelic(false);
document.querySelector('#return-title').onclick = () => adapter.showScene('title');
document.querySelector('#title-museum').onclick = () => renderMuseum('title');
document.querySelector('#museum-back').onclick = () => museumReturn === 'title' ? adapter.showScene('title') : renderHub();
document.querySelector('#title-exit').onclick = () => status('브라우저 게임은 이 탭을 닫으면 종료됩니다.');
document.querySelector('#title-settings').onclick = () => document.querySelector('#settings-dialog').showModal();
document.querySelector('#hub-settings').onclick = () => document.querySelector('#settings-dialog').showModal();
document.querySelector('#close-settings').onclick = () => document.querySelector('#settings-dialog').close();
const syncSoundToggle = () => {
  const button = document.querySelector('#sound-toggle');
  button.setAttribute('aria-pressed', String(!audio.enabled));
  button.textContent = audio.enabled ? '소리: 켜짐' : '소리: 꺼짐';
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
document.querySelector('#guild-loan').onclick = () => { const lotId = document.querySelector('#guild-collateral')?.value; const ok = takeLoan(state, balance, lotId); if (ok) audio.playSfx('loan'); renderGuild(ok ? '선택한 물품으로 담보 대출을 실행했습니다.' : '담보 물품을 선택하고 해금 조건을 확인하세요.'); };
document.querySelector('#guild-repay').onclick = () => { const ok = repayLoanEarly(state, balance); if (ok) audio.playSfx('repay'); renderGuild(ok ? '원금을 중도 상환했습니다.' : '상환할 수 없습니다.'); };
document.querySelector('#download-log').onclick = () => downloadRunLog(state);

boot();
