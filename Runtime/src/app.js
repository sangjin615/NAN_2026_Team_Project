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
  repayLoanEarly, sellItems, settleLoan, settleQuests, takeLoan, upgradeShop,
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

const GRADE_LABELS = { COMMON: '일반', RARE: '희귀', EPIC: '영웅', LEGENDARY: '전설' };
const RELIC_TIER_LABELS = { low: '하급', mid: '중급', high: '상급' };
const gradeLabel = (grade) => GRADE_LABELS[grade] || grade;

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
  if (scene?.classList.contains('place')) {
    let hud = scene.querySelector('.scene-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.className = 'scene-hud';
      hud.setAttribute('aria-label', '현재 여정 상태');
      scene.prepend(hud);
    }
    const loan = state.loan ? `${state.loan.dueDay}일 만기` : '없음';
    hud.innerHTML = `<span><small>여정</small><b>${state.day}일차 / 12</b></span><span><small>자산</small><b>${money(state.cash)}</b></span><span><small>보관칸</small><b>${ownedItems().length} / ${state.storage}</b></span><span><small>상회 단계</small><b>${state.shopStage}단계</b></span><span><small>담보 대출</small><b>${loan}</b></span>`;
  }
}

function renderHub(message = '') {
  clearActionTimer(); audio.playBgm('city');
  state.phase = 'hub';
  adapter.showScene('hub');
  const values = {
    day: state.day,
    cash: money(state.cash),
    stage: state.shopStage,
    storage: `${ownedItems().length} / ${state.storage}`,
    quests: state.completedQuestCount,
  };
  for (const [key, value] of Object.entries(values)) adapter.setText(key, value);
  document.querySelector('#market-indices').innerHTML = Object.entries(state.marketPath)
    .map(([family, valuesByDay]) => `<span>${family} ${(valuesByDay[state.day - 1] * 100).toFixed(0)}</span>`).join('');
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

function renderQuestOffice(message = '') {
  clearActionTimer(); audio.playBgm('office'); state.phase = 'quests'; adapter.showScene('quests'); syncHeader();
  document.querySelector('#quest-offers').innerHTML = state.questOffers.map((quest) => `
    <article><b>${questTitle(quest)}</b><small>${questRequirement(quest)}</small><span>수주비 ${money(quest.fee)} · 보상 ${money(quest.reward)}</span>
    <button data-quest="${quest.id}" ${quest.accepted ? 'disabled' : ''}>${quest.accepted ? '수주 완료' : '수주'}</button></article>`).join('');
  const active = state.activeQuests.filter((quest) => !quest.completed);
  const activeMarkup = active.length ? active.map((quest) => {
    const candidates = ownedItems().filter((item) => questMatchesItem(quest, item));
    return `<article><b>${questTitle(quest)}</b><span>${quest.deadlineDay}일차 경매 전까지</span>
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
      renderQuestOffice(ok ? '의뢰를 수주했습니다.' : '현금·수주 한도·충돌 조건을 확인하세요.');
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
  clearActionTimer(); audio.playBgm('exchange'); state.phase = 'exchange'; adapter.showScene('exchange'); syncHeader();
  document.querySelector('#inventory-list').innerHTML = ownedItems().length ? ownedItems().map((item) => `
    <article><label><input type="checkbox" data-item-select="${item.lotId}"> <b>${item.name}</b></label>
    <span>${gradeLabel(item.grade)} · ${item.category}</span><span>매입 ${money(item.paid)} · ${item.appraised ? `감정 ${money(item.trueValue)} ±${money(item.appraisalRange)}` : '미감정'}</span>
    <button data-sell-item="${item.lotId}" ${item.collateral ? 'disabled' : ''}>즉시 처분</button></article>`).join('') : '<p>보유 물품이 없습니다.</p>';
  document.querySelectorAll('[data-sell-item]').forEach((button) => button.onclick = () => {
    const revenue = sellItems(state, balance, [button.dataset.sellItem]);
    if (revenue) audio.playSfx('sell');
    renderExchange(`${money(revenue)}에 처분했습니다.`);
  });
  const syncBulkActions = () => {
    const checked = [...document.querySelectorAll('[data-item-select]:checked')];
    document.querySelector('#sell-selected').disabled = !checked.some((input) => {
      const item = ownedItems().find((entry) => entry.lotId === input.dataset.itemSelect);
      return item && !item.collateral;
    });
  };
  document.querySelectorAll('[data-item-select]').forEach((input) => { input.onchange = syncBulkActions; });
  syncBulkActions();
  const names = { CER: '도자기', CLK: '시계', PNT: '회화', BOK: '고서', MET: '금은세공', JEW: '장신구' };
  document.querySelector('#exchange-market').innerHTML = `<h3>최근 시세</h3><div class="market-rates">${Object.entries(state.marketPath).map(([key, path]) => {
    const now = path[state.day - 1]; const previous = state.day > 1 ? path[state.day - 2] : 1; const delta = now - previous;
    return `<div><b>${names[key]}</b><strong>${Math.round(now * 100)}%</strong><span class="${delta >= 0 ? 'rise' : 'fall'}">${delta >= 0 ? '▲' : '▼'} ${Math.abs(delta * 100).toFixed(0)}%</span></div>`;
  }).join('')}</div>`;
  document.querySelector('#exchange-message').textContent = message;
}

function renderTavern(message = '') {
  clearActionTimer(); audio.playBgm('tavern'); state.phase = 'tavern'; adapter.showScene('tavern'); syncHeader();
  const bought = Object.keys(state.information?.[state.day] || {});
  const names = { forecast: '수요 동향', catalog: '출품 목록', competitors: '경쟁자 정보' };
  const descriptions = { forecast: '시장 수요가 높은 계열을 분석합니다.', catalog: '오늘 출품될 물품 목록을 확인합니다.', competitors: '경쟁자들의 예상 입찰 한도를 확인합니다.' };
  const lots = state.schedule.days[state.day - 1].lots;
  const totalBase = lots.reduce((sum, lot) => sum + lot.pricing.basePrice, 0);
  document.querySelectorAll('[data-info]').forEach((button) => {
    const kind = button.dataset.info;
    const discount = 1 - (balance.shop.infoDiscount?.[state.shopStage] ?? 0);
    const cost = Math.ceil(totalBase * balance.informationRate[kind] * discount / 100) * 100;
    button.innerHTML = `<strong>${names[kind]}</strong><small>${descriptions[kind]}</small><span>${bought.includes(kind) ? '구매 완료' : money(cost)}</span>`;
    button.disabled = bought.includes(kind);
  });
  document.querySelector('#tavern-owned').innerHTML = `<h3>오늘 확보한 정보</h3><p>${bought.length ? bought.map((key) => names[key]).join(' · ') : '아직 구매한 정보가 없습니다.'}</p>`;
  document.querySelector('#tavern-message').textContent = message;
}

function renderShop(message = '') {
  clearActionTimer(); audio.playBgm('merchant'); state.phase = 'shop'; adapter.showScene('shop'); syncHeader();
  const next = Math.min(4, state.shopStage + 1); const maxed = state.shopStage >= 4;
  const cost = maxed ? 0 : balance.shop.upgradeCost[next - 1];
  const required = maxed ? 0 : balance.shop.questRequirement[next - 1];
  const nextStorage = maxed ? state.storage : balance.shop.storage[next];
  const nextDiscount = maxed ? balance.shop.infoDiscount[state.shopStage] : balance.shop.infoDiscount[next];
  document.querySelector('#shop-detail').innerHTML = `<section><h3>${state.shopStage}단계 상회</h3><dl><div><dt>보관칸</dt><dd>${state.storage}칸</dd></div><div><dt>정보 할인</dt><dd>${Math.round((balance.shop.infoDiscount[state.shopStage] || 0) * 100)}%</dd></div><div><dt>완료 의뢰</dt><dd>${state.completedQuestCount}건</dd></div></dl></section>
    <section><h3>${maxed ? '최고 단계 달성' : `${next}단계 승급`}</h3><p>${maxed ? '대상회에 도달했습니다.' : `비용 ${money(cost)} · 완료 의뢰 ${required}건 필요`}</p><ul><li>보관칸 ${nextStorage}칸</li><li>동시 의뢰 및 보상 강화</li><li>정보 비용 ${Math.round((nextDiscount || 0) * 100)}% 할인</li>${next >= 3 ? '<li>유물 전시관 이용 확대</li>' : ''}</ul></section>`;
  document.querySelector('#shop-upgrade').disabled = maxed || state.cash < cost || state.completedQuestCount < required;
  document.querySelector('#shop-message').textContent = message;
}

function renderGuild(message = '') {
  clearActionTimer(); audio.playBgm('guild'); state.phase = 'guild'; adapter.showScene('guild'); syncHeader();
  const locked = state.shopStage < balance.loan.minShopStage;
  const collateralItems = ownedItems().filter((item) => !item.collateral);
  const collateralCount = collateralItems.length;
  const collateralOptions = collateralItems.map((item) => `<option value="${item.lotId}">${item.name} · ${money(Math.round(item.trueValue * balance.loan.limitFromDisposalValue))}</option>`).join('');
  const detail = locked ? `<h3>담보 대출 잠김</h3><p>상회 ${balance.loan.minShopStage}단계에서 해금됩니다.</p>`
    : state.loan ? `<h3>활성 대출</h3><p>담보 ${state.inventory.find((item) => item.lotId === state.loan.lotId)?.name || state.loan.lotId}</p><p>원금 ${money(state.loan.principal)} · 만기 ${state.loan.dueDay}일 · 상환 ${money(state.loan.due)}</p>`
      : state.guildLocked ? '<h3>조합 이용 제한</h3><p>연체로 인해 이번 여정에서는 조합을 이용할 수 없습니다.</p>'
        : `<h3>담보 물품 선택</h3><p>대출 가능 물품 ${collateralCount}개 · 정산가치의 ${Math.round(balance.loan.limitFromDisposalValue * 100)}%</p><label class="collateral-picker"><span>담보</span><select id="guild-collateral"><option value="">물품을 선택하세요</option>${collateralOptions}</select></label><p id="loan-preview">물품을 선택하면 대출액과 만기 상환액을 계산합니다.</p>`;
  document.querySelector('#guild-detail').innerHTML = detail;
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
  document.querySelector('#catalog-grid').innerHTML = state.schedule.days[state.day - 1].lots.map((lot) => `<article class="lot-card"><div class="mini-sprite ${lot.visualEffects.map((effect) => `vfx-${effect}`).join(' ')}"><img src="${spriteUrl(lot, lot.grade)}" alt=""></div><span>${gradeLabel(lot.grade)}</span><h3>${lot.content.displayName}</h3><p>${lot.content.description}</p></article>`).join('');
}

function renderAuction() {
  const lot = state.schedule.days[state.day - 1].lots[state.lotIndex];
  if (!lot) return renderSettlement();
  const expired = expireQuestsBeforeAuction(state);
  state.phase = 'auction'; audio.playBgm('auction');
  if (state.auctionSession?.lotId !== lot.lotId) {
    const marketIndex = state.marketPath[lot.category][state.day - 1];
    state.auctionSession = { lotId: lot.lotId, currentPrice: Math.max(1, Math.round(lot.pricing.basePrice * balance.auction.startBidRatio)), leader: null, bots: botBidForLot({ lot, day: state.day, balance, marketIndex, seed: state.seed }), deadline: Date.now() + 15000, feed: expired ? [`기한이 지난 의뢰 ${expired}건이 만료됐습니다.`] : ['경매가 시작되었습니다.'] };
  }
  state.auctionSession.deadline ||= Date.now() + 15000;
  adapter.showScene('auction');
  adapter.setText('lot-progress', `${state.day}일차 · LOT ${state.lotIndex + 1} / 8`); adapter.setText('lot-name', lot.content.displayName);
  adapter.setText('lot-grade', lot.grade); adapter.setText('lot-description', lot.content.description); adapter.setText('base-price', money(lot.pricing.basePrice));
  adapter.setText('current-bid', money(state.auctionSession.currentPrice)); adapter.setText('cash', money(state.cash)); adapter.setSprite('current-lot', spriteUrl(lot, lot.grade)); adapter.setEffects('current-lot', lot.visualEffects);
  document.querySelector('#auction-feed').innerHTML = state.auctionSession.feed.slice(-4).map((line) => `<p>${line}</p>`).join('');
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
  advanceDay(state); state.questOffers = createDailyQuestOffers(balance, state.day, state.seed, state.metaRelics); state.settledDay = null;
  await generation.ensure({ currentDay: state.day, schedule: state.schedule, sets: state.sets });
  renderHub();
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
document.querySelectorAll('[data-info]').forEach((button) => button.onclick = () => { const ok = buyInformation(state, balance, button.dataset.info); if (ok) audio.playSfx('information'); renderTavern(ok ? '정보를 구매했습니다.' : '이미 구매했거나 현금이 부족합니다.'); });
document.querySelector('#shop-upgrade').onclick = () => { const ok = upgradeShop(state, balance); if (ok) audio.playSfx('upgrade'); renderShop(ok ? '상회를 승급했습니다.' : '현금 또는 완료 의뢰가 부족합니다.'); };
document.querySelector('#guild-loan').onclick = () => { const lotId = document.querySelector('#guild-collateral')?.value; const ok = takeLoan(state, balance, lotId); if (ok) audio.playSfx('loan'); renderGuild(ok ? '선택한 물품으로 담보 대출을 실행했습니다.' : '담보 물품을 선택하고 해금 조건을 확인하세요.'); };
document.querySelector('#guild-repay').onclick = () => { const ok = repayLoanEarly(state, balance); if (ok) audio.playSfx('repay'); renderGuild(ok ? '원금을 중도 상환했습니다.' : '상환할 수 없습니다.'); };
document.querySelector('#download-log').onclick = () => downloadRunLog(state);

boot();
