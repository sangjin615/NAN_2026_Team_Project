import { loadCatalog, spriteUrl } from './catalog.js';
import { createRunSchedule, validateSchedule } from './schedule.js';
import { createSetGraph } from './set-graph.js';
import { GenerationBuffer } from './generation-buffer.js';
import { GenerationApiProvider } from './generation-api-provider.js';
import { SaveStore } from './save-store.js';
import { advanceDay, createInitialState, resolveLot } from './game-state.js';
import { MockVslAdapter } from './vsl-adapter.js';
import { acceptQuest, appraiseAll, appraiseItem, botBidForLot, buyInformation, createDailyQuestOffers, isBankrupt, missedDeadline, resolveAuction, sellAll, sellItems, settleLoan, settleQuests, takeLoan, upgradeShop } from './systems.js';
import { downloadRunLog, recordEvent } from './telemetry.js';
import { AudioBus } from './audio-bus.js';

const root = document.querySelector('#app');
const adapter = new MockVslAdapter(root);
const store = new SaveStore();
let generation = new GenerationBuffer();
const audio = new AudioBus();
let state, catalog, balance, currentBid = 0;
const money = (v) => `${Math.round(Number(v || 0)).toLocaleString('ko-KR')} G`;
const status = (text) => document.querySelector('#boot-status').textContent = text;
const save = () => store.save(state);
const flash = (text) => { const el = document.querySelector('#hub-message'); if (el) el.textContent = text; };

async function boot() {
  try {
    const apiConfig = await fetch('./data/api-config.json').then((r) => r.json());
    generation = new GenerationBuffer({ provider: new GenerationApiProvider(apiConfig) });
    [catalog, balance] = await Promise.all([loadCatalog(), fetch('./data/balance.json').then((r) => r.json()), audio.load()]);
    status(`아이템 ${catalog.items.length}종 · 스프라이트 240개 · 밸런스 ${balance.status}`);
    document.querySelector('#continue-run').disabled = !store.load();
  } catch (error) { status(`초기화 실패: ${error.message}`); }
}

async function newRun(seed) {
  const schedule = createRunSchedule({ catalog, balance, seed });
  if (!validateSchedule(schedule).valid) throw new Error('96 LOT 생성 실패');
  const sets = createSetGraph(schedule, seed);
  state = createInitialState({ schedule, sets, balance, startCash: balance.run.startCash, metaRelics: loadMeta() });
  recordEvent(state, 'run-start'); audio.playBgm('city');
  await generation.ensure({ currentDay: 1, schedule, sets });
  save(); renderHub();
}

function loadMeta() { try { return JSON.parse(localStorage.getItem('unknown-auction:relics') || '[]'); } catch { return []; } }
function ownedItems() { return state.inventory.filter((x) => !x.sold); }

function renderHub(message = '') {
  state.phase = 'hub'; adapter.showScene('hub');
  for (const [key, value] of Object.entries({ day: state.day, cash: money(state.cash), stage: state.shopStage, storage: `${ownedItems().length} / ${state.storage}`, quests: state.completedQuestCount })) adapter.setText(key, value);
  const indices = Object.entries(state.marketPath).map(([k,v]) => `<span>${k} ${(v[state.day - 1] * 100).toFixed(0)}</span>`).join('');
  document.querySelector('#market-indices').innerHTML = indices;
  document.querySelector('#loan-status').textContent = state.loan ? `상환 ${money(state.loan.due)} · ${state.loan.dueDay}일차` : state.guildLocked ? '길드 거래 제한' : '대출 없음';
  document.querySelector('#hub-message').textContent = message;
  save();
}

function renderQuestOffice(message = '') {
  state.phase = 'quests'; adapter.showScene('quests'); syncPlaceHeader();
  document.querySelector('#quest-offers').innerHTML = state.questOffers.map((q) => `<article><b>${questName(q.id)}</b><small>${q.rule}</small><span>비용 ${money(q.fee)} / 보상 ${money(q.reward)}</span><button data-quest="${q.id}" ${q.accepted ? 'disabled' : ''}>${q.accepted ? '수주 완료' : '수주'}</button></article>`).join('');
  document.querySelectorAll('[data-quest]').forEach((button) => button.onclick = () => { const ok = acceptQuest(state, button.dataset.quest, balance); if (ok) recordEvent(state, 'quest-accept', { questId: button.dataset.quest }); save(); renderQuestOffice(ok ? '의뢰를 수주했습니다.' : '의뢰 충돌·현금·수주 한도를 확인하세요.'); });
  document.querySelector('#quest-message').textContent = message; save();
}

function syncPlaceHeader() { adapter.setText('day', state.day); adapter.setText('cash', money(state.cash)); }

function renderExchange(message = '') {
  state.phase = 'exchange'; adapter.showScene('exchange'); syncPlaceHeader();
  const inventory = ownedItems();
  document.querySelector('#inventory-list').innerHTML = inventory.length ? inventory.map((item) => `<article><label><input type="checkbox" data-item-select="${item.lotId}"> <b>${item.name}</b></label><span>${item.grade} · ${item.category}</span><span>매입 ${money(item.paid)} · ${item.appraised ? `감정 ${money(item.trueValue)} ±${money(item.appraisalRange)}` : '미감정'}</span><button data-appraise-item="${item.lotId}" ${item.appraised || item.collateral ? 'disabled' : ''}>감정</button><button data-sell-item="${item.lotId}" ${item.collateral ? 'disabled' : ''}>판매</button></article>`).join('') : '<p>보유 물품이 없습니다.</p>';
  document.querySelectorAll('[data-appraise-item]').forEach((button) => button.onclick = () => { const ok=appraiseItem(state,balance,button.dataset.appraiseItem); if(ok) recordEvent(state,'appraise',{lotId:button.dataset.appraiseItem}); renderExchange(ok?'감정 완료':'감정 비용이 부족합니다.'); });
  document.querySelectorAll('[data-sell-item]').forEach((button) => button.onclick = () => { const revenue=sellItems(state,balance,[button.dataset.sellItem]); recordEvent(state,'sell',{lotIds:[button.dataset.sellItem],revenue}); renderExchange(`${money(revenue)}에 판매했습니다.`); });
  const categoryNames={CER:'도자기',CLK:'시계',PNT:'회화',BOK:'고서',MET:'금속 공예',JEW:'장신구'};
  document.querySelector('#exchange-market').innerHTML=`<h3>오늘의 계열별 시세</h3><div class="market-rates">${Object.entries(state.marketPath).map(([key,path])=>{const now=path[state.day-1];const prev=state.day>1?path[state.day-2]:1;const delta=now-prev;return `<div><b>${categoryNames[key]||key}</b><strong>${Math.round(now*100)}%</strong><span class="${delta>=0?'rise':'fall'}">${delta>=0?'▲':'▼'} ${Math.abs(delta*100).toFixed(0)}%</span></div>`}).join('')}</div><p>정보를 구매하면 경쟁자·출품 목록·수요 전망을 확인할 수 있습니다.</p>`;
  document.querySelector('#exchange-message').textContent = message; save();
}

function renderShop(message = '') { state.phase='shop'; adapter.showScene('shop'); syncPlaceHeader(); const next=Math.min(3,state.shopStage+1); const maxed=state.shopStage>=3; document.querySelector('#shop-detail').innerHTML=`<section><p class="eyebrow">CURRENT MERCHANT HOUSE</p><h3>${state.shopStage}단계 상회</h3><dl><div><dt>창고 용량</dt><dd>${state.storage}칸</dd></div><div><dt>판매 수수료</dt><dd>${((balance.shop.auctionFee[state.shopStage]||0)*100).toFixed(0)}%</dd></div><div><dt>완료 의뢰</dt><dd>${state.completedQuestCount}건</dd></div></dl></section><section><p class="eyebrow">NEXT UPGRADE</p><h3>${maxed?'최고 단계 달성':`${next}단계 확장`}</h3><p>${maxed?'더 이상 확장할 필요가 없습니다.':'창고와 거래 효율을 높이고 새로운 거점을 해금합니다.'}</p><strong>${maxed?'완료':'조건을 충족하면 확장 가능'}</strong></section>`; document.querySelector('#shop-upgrade').disabled=maxed; document.querySelector('#shop-message').textContent=message; save(); }
function renderGuild(message = '') { state.phase='guild'; adapter.showScene('guild'); syncPlaceHeader(); document.querySelector('#guild-detail').textContent=state.loan?`담보 ${state.loan.lotId} · ${state.loan.dueDay}일차에 ${money(state.loan.due)} 상환`:state.guildLocked?'연체로 길드 거래가 제한되었습니다.':'현재 대출이 없습니다.'; document.querySelector('#guild-message').textContent=message; save(); }
function renderMuseum() { state.phase='museum'; adapter.showScene('museum'); const relics=state.metaRelics||[]; document.querySelector('#relic-list').innerHTML=(relics.length?relics:['보유 유물 없음']).map((id)=>`<article>${id}</article>`).join(''); save(); }

function questName(id) { return ({designated:'지정 수집',multi:'다중 수집',bargain:'차익',restraint:'절제',block:'견제'})[id] || id; }

function renderCatalog() {
  state.phase = 'catalog'; adapter.showScene('catalog'); adapter.setText('day', state.day); adapter.setText('cash', money(state.cash));
  document.querySelector('#catalog-grid').innerHTML = state.schedule.days[state.day - 1].lots.map((lot) => `<article class="lot-card"><div class="mini-sprite ${lot.visualEffects.map((e) => `vfx-${e}`).join(' ')}"><img src="${spriteUrl(lot, lot.grade)}" alt=""></div><span>${lot.grade}</span><h3>${lot.content.displayName}</h3><p>${lot.content.description}</p></article>`).join(''); save();
}

function renderAuction() {
  state.phase = 'auction';
  audio.playBgm('auction');
  const lot = state.schedule.days[state.day - 1].lots[state.lotIndex];
  if (state.auctionSession?.lotId !== lot.lotId) {
    const marketIndex=state.marketPath[lot.category][state.day-1];
    state.auctionSession={lotId:lot.lotId,currentPrice:Math.max(1,Math.round(lot.pricing.basePrice*balance.auction.startBidRatio)),leader:null,bots:botBidForLot({lot,day:state.day,balance,marketIndex,seed:state.seed}),round:0,feed:['경매가 시작되었습니다.']};
  }
  currentBid = state.auctionSession.currentPrice;
  adapter.showScene('auction'); adapter.setText('lot-progress', `${state.day}일차 · LOT ${state.lotIndex + 1} / 8`); adapter.setText('lot-name', lot.content.displayName); adapter.setText('lot-grade', lot.grade); adapter.setText('lot-description', lot.content.description); adapter.setText('base-price', money(lot.pricing.basePrice)); adapter.setText('current-bid', money(currentBid)); adapter.setText('cash', money(state.cash)); adapter.setSprite('current-lot', spriteUrl(lot, lot.grade)); adapter.setEffects('current-lot', lot.visualEffects);
  document.querySelector('#auction-feed').innerHTML=state.auctionSession.feed.slice(-4).map((line)=>`<p>${line}</p>`).join(''); save();
}

function finishLot(action, multiplier = 1) {
  const lot = state.schedule.days[state.day - 1].lots[state.lotIndex];
  const session=state.auctionSession;
  let result;
  if(action==='bid'){
    const raise=Math.max(1,Math.round(session.currentPrice*balance.auction.minRaiseRate));
    const proposed=Math.max(session.currentPrice+raise,Math.round(session.currentPrice*multiplier));
    if(proposed>state.cash){session.feed.push('보유 현금이 부족합니다.');audio.playSfx('error');return renderAuction();}
    if(ownedItems().length>=state.storage){session.feed.push('창고가 가득 찼습니다.');return renderAuction();}
    session.round+=1; session.currentPrice=proposed; session.leader='player'; session.feed.push(`플레이어가 ${money(proposed)}를 제시했습니다.`); audio.playSfx('bid');
    const challenger=[...session.bots].filter((bot)=>bot.maxBid>proposed).sort((a,b)=>b.maxBid-a.maxBid)[0];
    if(challenger){session.currentPrice=Math.min(challenger.maxBid,proposed+raise);session.leader=challenger.id;session.feed.push(`${challenger.name}이 ${money(session.currentPrice)}로 응찰했습니다.`);return renderAuction();}
    result={winner:'player',price:proposed,bots:session.bots};
  }else{
    const leader=session.bots.sort((a,b)=>b.maxBid-a.maxBid)[0];
    result=session.leader==='player'?{winner:'player',price:session.currentPrice,bots:session.bots}:{winner:leader.id,price:Math.max(session.currentPrice,Math.min(leader.maxBid,session.currentPrice)),bots:session.bots};
  }
  resolveLot(state, { action, playerBid: session.currentPrice, auctionResult: result }); save();
  recordEvent(state, 'auction', { lotId: lot.lotId, action, winner: result.winner, price: result.price });
  state.auctionSession=null;
  if (isBankrupt(state, balance)) { state.failure = '파산'; return renderResult(); }
  state.phase === 'settlement' ? renderSettlement() : renderAuction();
}

function renderSettlement() {
  if (state.settledDay !== state.day) {
    const quests = settleQuests(state); const loan = settleLoan(state); state.settledDay = state.day;
    state.lastSettlement = { quests, loan };
    if (missedDeadline(state)) state.failure = `${state.day}일차 개시 마감 실패 · 상점 ${state.shopStage}단계`;
    if (isBankrupt(state, balance)) state.failure = '파산 · 현금, 판매 가능 자산, 대출 수단 없음';
  }
  adapter.showScene('settlement'); adapter.setText('day', state.day);
  document.querySelector('#settlement-summary').textContent = `보유품 ${ownedItems().length}개 · 현금 ${money(state.cash)} · 의뢰 ${state.lastSettlement.quests}건 완료 · 대출 ${state.lastSettlement.loan}`;
  document.querySelector('#next-day').textContent = state.failure ? '실패 결과 확인' : state.day === 12 ? '유물 경매로' : `${state.day + 1}일차로`; save();
}

async function nextDay() {
  if (state.failure) return renderResult();
  if (state.day === 12) return startRelicAuction();
  advanceDay(state); state.questOffers = createDailyQuestOffers(balance, state.day, state.seed, state.metaRelics);
  await generation.ensure({ currentDay: state.day, schedule: state.schedule, sets: state.sets }); renderHub();
}

function startRelicAuction() { state.phase = 'relic'; state.relicRound ??= 0; state.relicChoices ??= []; renderRelic(); }
function renderRelic() {
  if (state.relicRound >= 3) return renderResult();
  adapter.showScene('relic'); const tier = balance.relicAuction.tiers[state.relicRound]; const price = balance.relicAuction.startBid[state.relicRound];
  const choices = balance.relics.list.filter((r) => r.tier === tier); const relic = choices[(state.relicRound + state.seed.length) % choices.length];
  state.currentRelic = relic; document.querySelector('#relic-card').innerHTML = `<p>${tier.toUpperCase()} · ROUND ${state.relicRound + 1}/3</p><h2>${relic.name}</h2><p>${relic.effect}</p><strong>${money(price)}</strong>`;
  document.querySelector('#buy-relic').disabled = state.cash < price; save();
}
function finishRelic(buy) { const price = balance.relicAuction.startBid[state.relicRound]; if (buy && state.cash >= price) { state.cash -= price; state.relicChoices.push(state.currentRelic.id); } state.relicRound += 1; renderRelic(); }

function renderResult() {
  state.completed = true; state.phase = 'result'; adapter.showScene('result'); const unsold = ownedItems().reduce((s,x) => s + x.trueValue, 0);
  document.querySelector('[data-scene="result"]').classList.toggle('is-failure', Boolean(state.failure));
  const relics = [...new Set([...state.metaRelics, ...(state.relicChoices || [])])]; localStorage.setItem('unknown-auction:relics', JSON.stringify(relics));
  document.querySelector('#result-title').textContent = state.failure ? '여정 실패' : '12일 여정 종료';
  document.querySelector('#run-summary').innerHTML = `${state.failure ? `<p class="failure">${state.failure}</p>` : ''}<p>현금 ${money(state.cash)} · 미판매 자산 ${money(unsold)}</p><p>낙찰 ${state.history.filter(x=>x.won).length}건 · 완료 의뢰 ${state.completedQuestCount}건 · 상점 ${state.shopStage}단계</p><p>획득 유물: ${(state.relicChoices || []).join(', ') || '없음'}</p>`; store.clear();
}

document.querySelector('#new-run').onclick = () => newRun(document.querySelector('#seed').value.trim() || Date.now());
document.querySelector('#continue-run').onclick = () => {
  state = store.load();
  if (!state) return status('저장된 여정이 없습니다.');
  ({ auction: renderAuction, settlement: renderSettlement, relic: renderRelic, quests: renderQuestOffice, exchange: renderExchange, shop: renderShop, guild: renderGuild, museum: renderMuseum, catalog: renderCatalog }[state.phase] || renderHub)();
};
document.querySelector('#start-auction').onclick = renderAuction;
document.querySelectorAll('[data-raise]').forEach((b) => b.onclick = () => finishLot('bid', Number(b.dataset.raise))); document.querySelector('#pass').onclick = () => finishLot('pass'); document.querySelector('#next-day').onclick = nextDay;
document.querySelector('#buy-relic').onclick = () => finishRelic(true); document.querySelector('#skip-relic').onclick = () => finishRelic(false);
document.querySelector('#return-title').onclick = () => adapter.showScene('title');
document.querySelectorAll('[data-place]').forEach((button) => button.onclick = () => { audio.playSfx('navigate'); ({city:renderHub,quests:renderQuestOffice,exchange:renderExchange,shop:renderShop,guild:renderGuild,museum:renderMuseum,catalog:renderCatalog})[button.dataset.place]?.(); });
document.querySelector('#appraise-selected').onclick = () => { const ids=[...document.querySelectorAll('[data-item-select]:checked')].map((x)=>x.dataset.itemSelect); let n=0; ids.forEach((id)=>{if(appraiseItem(state,balance,id))n++;}); if(n)recordEvent(state,'appraise-selected',{lotIds:ids,count:n}); renderExchange(`${n}개를 감정했습니다.`); };
document.querySelector('#sell-selected').onclick = () => { const ids=[...document.querySelectorAll('[data-item-select]:checked')].map((x)=>x.dataset.itemSelect); const revenue=sellItems(state,balance,ids); if(revenue)recordEvent(state,'sell-selected',{lotIds:ids,revenue}); renderExchange(`${money(revenue)}에 판매했습니다.`); };
document.querySelectorAll('[data-info]').forEach((button)=>button.onclick=()=>{const ok=buyInformation(state,balance,button.dataset.info); if(ok)recordEvent(state,'information',{kind:button.dataset.info}); renderExchange(ok?'정보를 구매했습니다.':'이미 구매했거나 현금이 부족합니다.');});
document.querySelector('#shop-upgrade').onclick=()=>{const ok=upgradeShop(state,balance); if(ok)recordEvent(state,'shop-upgrade',{stage:state.shopStage}); renderShop(ok?'상점을 확장했습니다.':'현금 또는 완료 의뢰가 부족합니다.');};
document.querySelector('#guild-loan').onclick=()=>{const ok=takeLoan(state,balance); if(ok)recordEvent(state,'loan',{principal:state.loan.principal}); renderGuild(ok?'담보 대출을 실행했습니다.':'3단계 상점과 담보품이 필요합니다.');};
document.querySelector('#download-log').onclick=()=>downloadRunLog(state);
boot();
