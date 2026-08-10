// 그레이박스 화면. 규칙은 rules-v6.js 가 갖고 여기는 화면만 한다.
// 손익분기선 라벨도 추천 입찰가도 안 준다 - 추측이 이 게임의 판단이다(6.36 결정 4).
'use strict';
const R = window.RULES;
const C = R.CFG;
const $ = (id) => document.getElementById(id);
const M = (n) => Math.round(n).toLocaleString();
const seed = Number(new URLSearchParams(location.search).get('seed')) || 20260731;

// ── 상태. 계약이 선언한 경로들이 값을 갖는 자리다 ──
const S = {
  rng: R.makeRandom(seed), day: 1, cash: C.startCash, stage: 1, questsTotal: 0,
  inventory: [], loan: null, guildLocked: false, ended: null,
  pool: null, path: null, lots: [], lotIndex: 0,
  bots: [], bid: 0, leader: null, passed: null, playerBid: false,
  appraised: {}, info: {}, offers: [], taken: [], botSpend: {}, pushed: {},
  wins: [], startDayCash: C.startCash, log: [], phase: 'city',
};
S.pool = R.makePool(S.rng);
S.path = R.makeIndexPath(S.rng);

const idx = () => S.path[S.day - 1].index;
const headline = () => S.path[S.day - 1].headline;
const say = (t, cls) => { S.log.unshift({ t, cls }); if (S.log.length > 60) S.log.pop(); };

// 하루를 연다. 출품 8건은 96종 풀에서 순서대로 잘라 쓴다.
function openDay() {
  S.lots = S.pool.slice((S.day - 1) * 8, S.day * 8);
  S.bots = R.makeBots(S.day, S.rng);
  S.appraised = {}; S.info = {}; S.taken = []; S.wins = [];
  S.botSpend = {}; S.pushed = {}; S.lotIndex = 0; S.startDayCash = S.cash;
  // 무작위 비교자로 섞으면 정렬 구현마다 난수 뽑는 수가 달라져 같은 씨앗이 다른 판이 된다.
  // 뽑는 수가 고정인 방식으로 섞는다 - 값을 하나씩 붙여 그걸로 정렬한다.
  const ids = Object.keys(C.quests).map((x) => ({ x, k: S.rng() }))
    .sort((a, c) => a.k - c.k).map((o) => o.x).slice(0, C.questOffer);
  S.offers = ids.map((id) => ({ id, targetFamily: C.families[Math.floor(S.rng() * 6)],
    targetBot: S.bots[Math.floor(S.rng() * S.bots.length)].id }));
  const h = headline();
  say(`${S.day}일차 — ${h.family} 시세가 ${h.shock > 0 ? '올랐다' : '내렸다'}`, h.shock > 0 ? 'ok' : 'no');
  loadLot();
}
function loadLot() {
  const l = S.lots[S.lotIndex];
  S.bid = l ? l.startBid : 0; S.leader = null; S.passed = new Set(); S.playerBid = false;
}

// 봇 한 바퀴. 아무도 안 올리면 true.
function botCycle() {
  const l = S.lots[S.lotIndex];
  for (const b of S.bots) {
    if (S.passed.has(b.id)) continue;
    const next = S.bid + R.minRaise(S.bid);
    if (next <= R.botCap(b, l, idx(), S.rng) && S.rng() < C.bots.continueP) {
      S.bid = next; S.leader = b.id; say(`${b.name} ${M(next)}`); return false;
    }
    S.passed.add(b.id); say(`${b.name} 패스`, 'dim');
  }
  return true;
}
// 낙찰 확정. 낙찰가는 내가 쓴 값이 아니라 경쟁자 위 최소폭이다.
function finalize() {
  const l = S.lots[S.lotIndex];
  if (S.leader === 'player') {
    const fee = R.round10(S.bid * R.feeRate(S.stage));
    S.cash -= S.bid + fee;
    S.inventory.push(Object.assign({}, l, { paid: S.bid + fee, acquiredDay: S.day, locked: false }));
    S.wins.push({ lot: l, price: S.bid });
    say(`낙찰 ${l.qualityName ? '' : ''}${M(S.bid)} + 수수료 ${M(fee)}`, 'ok');
  } else if (S.leader) {
    S.botSpend[S.leader] = (S.botSpend[S.leader] || 0) + S.bid;
    if (S.playerBid) S.pushed[S.leader] = (S.pushed[S.leader] || 0) + (S.bid - l.startBid);
    say(`${S.bots.find((b) => b.id === S.leader).name} 낙찰 ${M(S.bid)}`, 'no');
  } else say('유찰', 'dim');
  S.lotIndex += 1;
  if (S.lotIndex >= 8) settleDay(); else loadLot();
}

function act_bid() {
  const l = S.lots[S.lotIndex];
  const want = Number($('bidInput').value) || 0;
  const min = S.leader ? S.bid + R.minRaise(S.bid) : l.startBid;
  if (want < min) { $('msg').textContent = `최소 ${M(min)} 이상이어야 한다`; return; }
  const total = want + R.round10(want * R.feeRate(S.stage));
  if (total > S.cash) { $('msg').textContent = `수수료까지 ${M(total)}가 필요하다`; return; }
  if (S.inventory.filter((x) => !x.locked).length >= R.storageCap(S.stage) - S.inventory.filter((x) => x.locked).length) {
    if (S.inventory.length >= R.storageCap(S.stage)) { $('msg').textContent = '보관칸이 없다'; return; }
  }
  S.bid = want; S.leader = 'player'; S.playerBid = true;
  say(`나 ${M(want)}`, 'ok');
  if (botCycle()) finalize();
  $('msg').textContent = ''; draw();
}
function act_pass() {
  say('나 패스', 'dim');
  let guard = 0;
  while (!botCycle() && guard++ < 200) { /* 봇끼리 끝까지 */ }
  finalize(); draw();
}
function act_appraise(i) {
  const l = S.lots[i];
  const cost = R.appraisalCost(l, S.stage);
  if (S.appraised[l.id] || cost > S.cash) return;
  S.cash -= cost;
  const e = R.appraisalError(S.day);
  const v = R.disposalValue(l, idx());
  S.appraised[l.id] = { low: Math.round(v * (1 - e)), high: Math.round(v * (1 + e)), cost, err: e };
  say(`감정 ${M(cost)} — ${l.family} ${C.grades[l.grade].name}`, 'dim');
  draw();
}
function act_info(kind) {
  if (S.info[kind]) return;
  const cost = R.infoCost(kind, S.lots, S.stage);
  if (cost > S.cash) return;
  S.cash -= cost; S.info[kind] = true;
  say(`정보 구매 ${M(cost)}`, 'dim'); draw();
}
function act_quest(id) {
  if (S.taken.some((q) => q.id === id)) return;
  if (S.taken.length >= C.questAccept) return;
  const q = S.offers.find((o) => o.id === id);
  const fee = C.quests[id].fee;
  if (fee > S.cash) return;
  S.cash -= fee; S.taken.push(q);
  say(`${C.quests[id].name} 의뢰 수주 −${M(fee)}`, 'dim'); draw();
}
function act_sell(i) {
  const it = S.inventory[i];
  if (!it || it.locked) return;
  const v = R.disposalValue(it, idx());
  S.cash += v; S.inventory.splice(i, 1);
  say(`처분 ${M(v)}`, 'ok'); draw();
}
function act_set() {
  const free = S.inventory.filter((x) => !x.locked);
  const s = R.bestSet(free);
  if (!s) return;
  const base = s.combo.reduce((n, x) => n + R.disposalValue(x, idx()), 0);
  const total = R.round10(base * s.def.mult * R.setBonus(S.stage));
  S.cash += total;
  S.inventory = S.inventory.filter((x) => !s.combo.includes(x));
  say(`${s.def.name} ×${s.def.mult} → ${M(total)}`, 'ok'); draw();
}
function act_loan() {
  if (S.loan || S.guildLocked || S.stage < C.loan.minStage) return;
  const coll = S.inventory.filter((x) => !x.locked && x.acquiredDay < S.day);
  if (!coll.length) return;
  const c = coll.reduce((a, b) => (R.disposalValue(b, idx()) > R.disposalValue(a, idx()) ? b : a));
  const p = R.round10(R.disposalValue(c, idx()) * C.loan.ltv);
  c.locked = true;
  S.loan = { principal: p, repay: R.round10(p * C.loan.repay), dueDay: S.day + C.loan.term, id: c.id };
  S.cash += p; say(`대출 ${M(p)} — ${S.loan.dueDay}일차까지 ${M(S.loan.repay)}`, 'warn'); draw();
}
function act_repay() {
  if (!S.loan || S.cash < S.loan.repay) return;
  S.cash -= S.loan.repay;
  const c = S.inventory.find((x) => x.id === S.loan.id); if (c) c.locked = false;
  say(`상환 ${M(S.loan.repay)}`, 'ok'); S.loan = null; draw();
}
function act_upgrade() {
  const cost = C.upgradeCost[S.stage];
  if (S.stage >= 4 || S.cash < cost || S.questsTotal < C.upgradeQuests[S.stage]) return;
  S.cash -= cost; S.stage += 1;
  say(`상회 ${S.stage}단계 −${M(cost)}`, 'ok'); draw();
}

// 하루 끝. 의뢰 판정 → 대출 만기 → 마감·파산 판정.
function settleDay() {
  for (const q of S.taken) {
    let ok = false;
    if (q.id === 'designated') ok = S.wins.some((w) => w.lot.family === q.targetFamily);
    if (q.id === 'multi') ok = new Set(S.wins.map((w) => w.lot.family)).size >= 2;
    if (q.id === 'bargain') ok = S.wins.some((w) => w.price <= w.lot.basePrice * 0.85);
    if (q.id === 'restraint') ok = S.wins.length > 0 && S.cash >= S.startDayCash * C.restraintKeepRate;
    if (q.id === 'block') ok = (S.pushed[q.targetBot] || 0) >= C.blockPushThreshold;
    const rw = R.round100(C.quests[q.id].reward * R.questBonus(S.stage));
    if (ok) { S.cash += rw; S.questsTotal += 1; say(`${C.quests[q.id].name} 달성 +${M(rw)}`, 'ok'); }
    else say(`${C.quests[q.id].name} 실패`, 'no');
  }
  S.phase = 'summary'; draw();
}
function act_nextDay() {
  if (S.loan && S.day + 1 > S.loan.dueDay) {
    if (S.cash >= S.loan.repay) { S.cash -= S.loan.repay; const c = S.inventory.find((x) => x.id === S.loan.id); if (c) c.locked = false; say('만기 자동 상환', 'ok'); }
    else { S.inventory = S.inventory.filter((x) => x.id !== S.loan.id); S.guildLocked = true; say('담보 압류 · 조합 거래 제한', 'no'); }
    S.loan = null;
  }
  if (R.isBankrupt(S, S.day)) { S.ended = { type: '파산', why: '자산 0 · 팔 것 없음 · 대출 불가' }; draw(); return; }
  const req = R.requiredStage(S.day + 1);
  if (S.stage < req && S.day + 1 <= 12) { S.ended = { type: '개시 마감 실패', why: `${S.day + 1}일차는 ${req}단계가 필요한데 ${S.stage}단계다` }; draw(); return; }
  if (S.day >= 12) {
    for (const it of S.inventory.filter((x) => !x.locked)) S.cash += R.disposalValue(it, idx());
    S.inventory = [];
    S.ended = { type: S.cash >= C.goal ? '여정 성공' : '여정 종료', why: `${M(S.cash)} / 목표 ${M(C.goal)}` };
    draw(); return;
  }
  S.day += 1; S.phase = 'city'; openDay(); draw();
}

// ── 그리기. 상태에서 전부 다시 그린다 ──
function draw() {
  const l = S.lots[S.lotIndex];
  const over = !!S.ended;
  $('day').textContent = `${S.day} / 12`;
  $('cash').textContent = M(S.cash);
  $('stage').textContent = `${S.stage}단계 · 보관 ${R.storageCap(S.stage)}칸`;
  const req = R.requiredStage(Math.min(12, S.day + 1));
  // 다음 관문을 미리 보여준다. "여유" 만 띄우면 처음 하는 사람은 져 봐야 규칙을 안다.
  let gate = 0;
  for (let d = S.day + 1; d <= 12; d += 1) if (R.requiredStage(d) > S.stage) { gate = d; break; }
  $('deadline').innerHTML = S.stage < req
    ? `<span class="no">${S.day + 1}일차에 ${req}단계 필요 — 지금 ${S.stage}단계</span>`
    : gate
      ? `<span class="warn">${gate}일차까지 ${R.requiredStage(gate)}단계</span>`
        + `<span class="m"> · ${gate - S.day}일 남음</span>`
      : `<span class="ok">더 없다</span>`;

  $('lots').innerHTML = S.lots.map((x, i) => {
    const a = S.appraised[x.id];
    const st = i < S.lotIndex ? 'done' : i === S.lotIndex ? 'cur' : '';
    const won = S.wins.some((w) => w.lot.id === x.id);
    const cost = R.appraisalCost(x, S.stage);
    return `<div class="row ${st}"><span>${i + 1}</span><span>
      <span class="g">${C.grades[x.grade].name}</span> · ${x.family}
      <span class="m"> · 기준가 ${M(x.basePrice)} · 시작가 ${M(x.startBid)}
      ${a ? ` · 감정 <b>${M(a.low)}~${M(a.high)}</b>` : ''}</span></span>
      <span>${won ? '<span class="ok">낙찰</span>'
        : i > S.lotIndex && !a && !over ? `<button onclick="G.appraise(${i})">감정 ${M(cost)}</button>` : ''}</span></div>`;
  }).join('');

  if (over) {
    $('cur').innerHTML = `<b class="${S.ended.type.includes('성공') ? 'ok' : 'no'}">${S.ended.type}</b><div class="note">${S.ended.why}</div>`;
    $('bidzone').innerHTML = '';
  } else if (S.phase === 'summary') {
    $('cur').innerHTML = `<b>${S.day}일차 경매 종료</b>`;
    $('bidzone').innerHTML = `<button class="p" onclick="G.next()">${S.day >= 12 ? '여정 정산' : '다음 날'}</button>`;
  } else if (l) {
    const a = S.appraised[l.id];
    const min = S.leader ? S.bid + R.minRaise(S.bid) : l.startBid;
    $('cur').innerHTML =
      `<div class="stat"><span>${C.grades[l.grade].name} · ${l.family}</span><b>기준가 ${M(l.basePrice)}</b></div>
       <div class="stat"><span>현재 호가</span><b>${M(S.bid)}${S.leader ? ` (${S.leader === 'player' ? '나' : S.bots.find((b) => b.id === S.leader).name})` : ' · 아직 없음'}</b></div>
       <div class="stat"><span>최소 응찰</span><b>${M(min)}</b></div>
       ${a ? `<div class="stat"><span>감정 (±${a.err * 100}%)</span><b>${M(a.low)} ~ ${M(a.high)}</b></div>` : ''}`;
    $('bidzone').innerHTML =
      `<input id="bidInput" type="number" step="100" value="${min}">
       <button class="p" onclick="G.bid()">응찰</button>
       <button onclick="G.pass()">패스</button>`;
  }

  const cap = R.storageCap(S.stage);
  $('slots').innerHTML = Array.from({ length: cap }, (_, i) => {
    const it = S.inventory[i];
    if (!it) return '<div class="slot"></div>';
    return `<div class="slot full ${it.locked ? 'lock' : ''}" title="${it.family} ${C.grades[it.grade].name}">
      ${C.grades[it.grade].name}<br>${it.family.slice(0, 2)}${it.locked ? '<br>담보' : ''}</div>`;
  }).join('');
  const s = R.bestSet(S.inventory.filter((x) => !x.locked));
  $('setnow').innerHTML = s
    ? `<b class="ok">${s.def.name}</b> ×${s.def.mult} 성립 — <button onclick="G.set()">묶어 팔기</button>`
    : `족보 없음 · <span class="m">${C.sets.map((x) => x.name + ' ×' + x.mult).join(' · ')}</span>`
    + (S.inventory.some((x) => !x.locked) && !over
      ? '<br>' + S.inventory.map((it, i) => it.locked ? '' : `<button onclick="G.sell(${i})">${it.family.slice(0, 2)} 처분 ${M(R.disposalValue(it, idx()))}</button>`).join('')
      : '');

  $('quests').innerHTML = S.offers.map((o) => {
    const q = C.quests[o.id];
    const has = S.taken.some((t) => t.id === o.id);
    const clash = S.taken.some((t) => (C.questClash[o.id] || []).includes(t.id));
    const full = S.taken.length >= C.questAccept;
    return `<div class="stat"><span><span class="tag ${has ? 'on' : clash ? 'clash' : ''}">${q.name}</span>
      <span class="m">${q.rule}${o.id === 'designated' ? ` (${o.targetFamily})` : ''}${o.id === 'block' ? ` (${S.bots.find((b) => b.id === o.targetBot).name})` : ''}</span>
      ${clash && !has ? '<br><span class="no" style="font-size:10px">이미 받은 것과 부딪힌다</span>' : ''}</span>
      <b>${has ? '<span class="ok">수주</span>' : over || full ? '' : `<button onclick="G.quest('${o.id}')">${M(q.fee)}</button>`}
      <span class="m">+${M(q.reward)}</span></b></div>`;
  }).join('');

  const infoNames = { competitors: '경쟁자 예산', catalog: '출품 목록', forecast: '수요 동향' };
  $('info').innerHTML = Object.keys(infoNames).map((k) => {
    const cost = R.infoCost(k, S.lots, S.stage);
    return `<div class="stat"><span>${infoNames[k]}</span><b>${S.info[k] ? '<span class="ok">보유</span>'
      : over ? '' : `<button onclick="G.info('${k}')">${M(cost)}</button>`}</b></div>`;
  }).join('')
    + (S.info.catalog ? `<div class="sep m">남은 풀 — ${remainingPool()}</div>` : '')
    + (S.info.forecast ? `<div class="sep m">앞으로 3일 — ${forecast()}</div>` : '');

  $('bots').innerHTML = S.bots.map((b) => `<div class="stat"><span>${b.name}${b.target ? ` <span class="m">(${b.target} 선호)</span>` : ''}</span>
    <b>${S.info.competitors ? M(b.cash * C.bots.capRatio) : '<span class="m">모름</span>'}</b></div>`).join('');

  $('loan').innerHTML = S.loan
    ? `<div class="stat"><span>원금</span><b>${M(S.loan.principal)}</b></div>
       <div class="stat"><span>상환 총액</span><b>${M(S.loan.repay)}</b></div>
       <div class="stat"><span>만기</span><b>${S.loan.dueDay}일차</b></div>
       ${over ? '' : `<button onclick="G.repay()" ${S.cash < S.loan.repay ? 'disabled' : ''}>상환</button>`}`
    : S.guildLocked ? '<span class="no">조합 거래 제한</span>'
    : S.stage < C.loan.minStage ? `<span class="m">${C.loan.minStage}단계부터</span>`
    : over ? '' : `<button onclick="G.loan()" ${S.inventory.filter((x) => !x.locked && x.acquiredDay < S.day).length ? '' : 'disabled'}>
        빌리기 <span class="m">(청산가치의 ${C.loan.ltv * 100}% · ×${C.loan.repay} · ${C.loan.term}일)</span></button>`;

  const uc = C.upgradeCost[S.stage];
  $('shop').innerHTML = S.stage >= 4 ? '<span class="ok">최종 단계</span>'
    : `<div class="stat"><span>다음 단계</span><b>${S.stage + 1}단계 · 보관 ${C.storage[S.stage + 1]}칸</b></div>
       <div class="stat"><span>승급비</span><b>${M(uc)}</b></div>
       <div class="stat"><span>누적 의뢰</span><b>${S.questsTotal} / ${C.upgradeQuests[S.stage]}</b></div>
       ${over ? '' : `<button onclick="G.upgrade()" ${S.cash < uc || S.questsTotal < C.upgradeQuests[S.stage] ? 'disabled' : ''}>승급</button>`}`;

  $('log').innerHTML = S.log.map((x) => `<div class="${x.cls || ''}">${x.t}</div>`).join('');
  // 기록. 시드와 누른 순서만 쌓는다 - 그것만으로 판이 재현된다(replay.js 가 검사한다).
  const kept = (() => { try { return loadLog().runs.length; } catch (e) { return 0; } })();
  $('rec').innerHTML =
    `<div class="stat"><span>이 판 씨앗</span><b>${seed}</b></div>`
    + `<div class="stat"><span>이 판에 누른 수</span><b>${REC.acts.length}</b></div>`
    + `<div class="stat"><span>쌓인 판</span><b>${kept}</b></div>`
    + `<div style="margin-top:6px">`
    + `<button onclick="G.exportLog()"${kept ? '' : ' disabled'}>기록 내려받기</button>`
    + `<button onclick="G.clearLog()"${kept ? '' : ' disabled'}>비우기</button></div>`
    + `<div class="m">시드와 누른 순서만 담는다. 이 파일이면 내가 그 판을 그대로 다시 돌려볼 수 있다.</div>`;
  $('summaryBox').style.display = over ? '' : 'none';
  if (over) $('summary').innerHTML =
    `<b class="${S.ended.type.includes('성공') ? 'ok' : 'no'}">${S.ended.type}</b> — ${S.ended.why}
     <div class="note">씨앗 ${seed} · ${S.day}일차 · 누적 의뢰 ${S.questsTotal} · 상회 ${S.stage}단계</div>
     <div class="sep">
       <button class="p" onclick="location.search='?seed=' + Math.floor(Math.random() * 900000)">새 판</button>
       <button onclick="location.reload()">같은 씨앗 다시</button>
       <span class="m">같은 씨앗이면 출품·경쟁자·시세가 똑같다. 판단만 바꿔서 비교할 수 있다.</span>
     </div>`;
}
function remainingPool() {
  const rest = S.pool.slice(S.day * 8);
  const c = {};
  for (const x of rest) c[C.grades[x.grade].name] = (c[C.grades[x.grade].name] || 0) + 1;
  return Object.entries(c).map(([k, v]) => `${k} ${v}`).join(' · ') || '없음';
}
function forecast() {
  return S.path.slice(S.day, S.day + 3).map((p, i) =>
    `${S.day + i + 1}일 ${p.headline.family}${p.headline.shock > 0 ? '↑' : '↓'}`).join(' · ');
}

// ── 플레이 기록. 엔진이 시드에서 결정적이라 "시드 + 누른 순서" 만 있으면 판 전체가 재현된다.
//    그래서 화면 상태를 저장하지 않는다 - 결정만 담는다. 재현되는지는 replay.js 가 검사한다.
const LOGKEY = 'auction-greybox-log';
const REC = { v: 2, seed, at: new Date().toISOString(), acts: [], ended: null };
// 화면을 안 보고 있던 시간은 뺀다. 안 그러면 "고민 3분" 과 "자리 비움 3분" 이 같아 보인다.
const T0 = Date.now();
let hiddenMs = 0, hiddenAt = null, lastT = 0;
if (typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now();
    else if (hiddenAt) { hiddenMs += Date.now() - hiddenAt; hiddenAt = null; }
  });
}
const nowMs = () => Date.now() - T0 - hiddenMs - (hiddenAt ? Date.now() - hiddenAt : 0);
function loadLog() {
  try { return JSON.parse(localStorage.getItem(LOGKEY)) || { v: 1, runs: [] }; }
  catch (e) { return { v: 1, runs: [] }; }
}
function saveRun() {
  try {
    const all = loadLog();
    const i = all.runs.findIndex((r) => r.at === REC.at);
    const row = { v: REC.v, seed: REC.seed, at: REC.at, acts: REC.acts,
      day: S.day, cash: S.cash, stage: S.stage, quests: S.questsTotal, ended: S.ended,
      elapsedMs: nowMs(), awayMs: Math.round(hiddenMs) };
    if (i >= 0) all.runs[i] = row; else all.runs.push(row);
    localStorage.setItem(LOGKEY, JSON.stringify(all));
  } catch (e) { /* 사생활 모드면 저장이 막힌다. 놀이는 계속돼야 한다 */ }
}
const RAW = { bid: act_bid, pass: act_pass, appraise: act_appraise, info: act_info, quest: act_quest,
  sell: act_sell, set: act_set, loan: act_loan, repay: act_repay, upgrade: act_upgrade, next: act_nextDay };
window.G = { S };
for (const name of Object.keys(RAW)) {
  window.G[name] = (...args) => {
    // 입찰액은 인자가 아니라 입력칸에 있다. 기록에는 남겨야 재현된다.
    const a = name === 'bid' ? [$('bidInput') ? $('bidInput').value : ''] : args;
    const t = nowMs();
    const before = S.ended;
    RAW[name](...args);
    // 아무것도 안 바뀌는 호출(막힌 응찰 등)도 사람이 누른 것이므로 남긴다.
    // t = 여정 시작부터 걸린 시간, dt = 앞 수와의 간격. 둘 다 화면을 보고 있던 시간만 센다.
    REC.acts.push({ a: name, v: a, t, dt: t - lastT, day: S.day });
    lastT = t;
    if (!before) saveRun();
  };
}
window.G.exportLog = () => {
  const all = loadLog();
  const blob = new Blob([JSON.stringify(all, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'playtest-' + all.runs.length + '판.json';
  a.click();
};
window.G.clearLog = () => { if (confirm('기록을 지운다. 되돌릴 수 없다.')) { localStorage.removeItem(LOGKEY); draw(); } };
window.G.logCount = () => loadLog().runs.length;

openDay(); draw();
