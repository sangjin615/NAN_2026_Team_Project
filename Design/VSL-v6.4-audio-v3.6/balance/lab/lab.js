// 밸런싱 랩. balance.json 을 불러와 수치를 바꾸고 그 자리에서 다시 잰다.
// 원칙: 여기서 바꾼 값은 **내보내기 전까지 아무 데도 안 남는다.** 원본과 갈라진 것을 늘 보여준다.
'use strict';
const $ = (id) => document.getElementById(id);
const M = (n) => Number(n).toLocaleString();

// 밴드는 사람이 승인한 기준이다(2026-07-31). 랩이 마음대로 넓히지 않는다.
const BAND = { reach: [45, 60], deadlineFail: [0, 38], survivorMedian: [0, 250000] };

// 만질 수 있는 자리. balance.json 의 어디를 가리키는지 경로로 적는다 - 이름을 손으로 옮기지 않는다.
const FIELDS = [
  ['여정', null],
  ['시작 자금', 'run.startCash', 1000],
  ['일수', 'run.days', 1],
  ['상회', null],
  ['승급비 2단계', 'shop.upgradeCost.1', 500],
  ['승급비 3단계', 'shop.upgradeCost.2', 500],
  ['승급비 4단계', 'shop.upgradeCost.3', 500],
  ['보관칸 1단계', 'shop.storage.1', 1],
  ['보관칸 4단계', 'shop.storage.4', 1],
  ['감정', null],
  ['비용 (기준가 대비)', 'appraisal.rate', 0.01],
  ['경쟁자', null],
  ['숙적 초기 자본', 'bots.nemesisInitial', 1000],
  ['숙적 성장률 (하루)', 'bots.growthPerDay', 0.005],
  ['입찰 상한 (자본 대비)', 'bots.bidCapRatio', 0.05],
  ['시세', null],
  ['평균회귀 phi', 'market.phi', 0.05],
  ['하루 충격 sd', 'market.shockSd', 0.005],
  ['담보 대출', null],
  ['한도 (처분가 대비)', 'loan.limitFromDisposalValue', 0.05],
  ['상환 배수', 'loan.repayMultiplier', 0.05],
  ['만기 (일)', 'loan.termDays', 1],
  ['해금 단계', 'loan.minShopStage', 1],
  ['의뢰 보상', null],
  ['지정', 'quests.designated.reward', 50],
  ['다중', 'quests.multi.reward', 50],
  ['차익', 'quests.bargain.reward', 50],
  ['절제', 'quests.restraint.reward', 50],
  ['견제', 'quests.block.reward', 50],
  ['족보 배수', null],
  ['페어', 'sets.table.0.mult', 0.1],
  ['풀하우스', 'sets.table.1.mult', 0.1],
  ['정렬', 'sets.table.2.mult', 0.1],
  ['트리플', 'sets.table.3.mult', 0.1],
  ['로열', 'sets.table.4.mult', 0.1],
  ['스트레이트', 'sets.table.5.mult', 0.1],
];

let BASE = null;   // 불러온 원본. 절대 안 고친다
let CUR = null;    // 지금 만지는 것
let LAST = null;   // 마지막 측정 결과

const get = (o, p) => p.split('.').reduce((v, k) => (v === undefined || v === null ? v : v[k]), o);
function set(o, p, val) {
  const ks = p.split('.');
  const last = ks.pop();
  const t = ks.reduce((v, k) => v[k], o);
  t[last] = val;
}
const clone = (x) => JSON.parse(JSON.stringify(x));

function changed() {
  return FIELDS.filter((f) => f[1]).filter((f) => String(get(CUR, f[1])) !== String(get(BASE, f[1])));
}

function drawPack() {
  if (!BASE) {
    $('pack').innerHTML =
      '<div class="drop" id="drop">여기에 <b>balance.json</b> 을 끌어다 놓거나<br>'
      + '<input type="file" id="file" accept=".json" style="margin-top:8px"></div>'
      + '<div class="m" style="margin-top:6px">팩 안에서 열었으면 자동으로 불러온다. '
      + '파일에서 직접 열었으면 브라우저가 읽기를 막아서 손으로 줘야 한다.</div>';
    wireDrop();
    return;
  }
  $('pack').innerHTML =
    `<div class="stat">불러온 팩 · 측정 기록 <b>${BASE.measuredAt ? BASE.measuredAt.at || '' : ''}</b></div>`
    + `<div class="m">기록된 값 — 도달 ${BASE.measuredAt.reach}% · 마감실패 ${BASE.measuredAt.deadlineFail}%`
    + ` · 생존중앙 ${M(BASE.measuredAt.survivorMedian)} (씨앗 ${BASE.measuredAt.seeds})</div>`
    + `<div style="margin-top:7px">`
    + `<button onclick="LAB.reset()">원래대로</button>`
    + `<button class="p" onclick="LAB.exportPack()">바뀐 팩 내려받기</button></div>`;
}

function drawFields() {
  if (!BASE) { $('fields').innerHTML = '<div class="m">팩을 먼저 불러와라.</div>'; return; }
  let h = '<table><tr><th>수치</th><th>값</th><th>원래</th></tr>';
  for (const [label, p, step] of FIELDS) {
    if (!p) { h += `<tr class="sec"><td colspan="3">${label}</td></tr>`; continue; }
    const v = get(CUR, p), was = get(BASE, p);
    const diff = String(v) !== String(was);
    h += `<tr><td>${label}</td>`
      + `<td><input type="number" step="${step}" value="${v}" data-p="${p}"`
      + ` class="${diff ? 'chg' : ''}" oninput="LAB.edit(this)"></td>`
      + `<td class="was">${diff ? was : ''}</td></tr>`;
  }
  $('fields').innerHTML = h + '</table>';
}

function drawDiff() {
  const c = changed();
  if (!c.length) { $('diff').innerHTML = '<div class="m">원본 그대로다.</div>'; return; }
  $('diff').innerHTML = '<table><tr><th>수치</th><th>원래</th><th>바꾼 값</th></tr>'
    + c.map(([label, p]) => `<tr><td>${label}</td><td class="was">${get(BASE, p)}</td>`
      + `<td class="warn"><b>${get(CUR, p)}</b></td></tr>`).join('') + '</table>';
}

function drawBanner() {
  const c = changed();
  $('banner').innerHTML = !c.length ? ''
    : `<div class="banner">원본과 ${c.length}곳이 다르다. `
      + `${LAST && LAST.stamp === stamp() ? '아래 수치는 이 값으로 잰 것이다.'
        : '아직 이 값으로 안 쟀다 — <b>다시 재기</b> 를 눌러라.'}</div>`;
}

const stamp = () => JSON.stringify(changed().map((f) => [f[1], get(CUR, f[1])]));

function drawRun() {
  if (!BASE) { $('run').innerHTML = ''; return; }
  $('run').innerHTML =
    '<button class="p" onclick="LAB.measure(300)">다시 재기 · 300판</button>'
    + '<button onclick="LAB.measure(900)">900판</button>'
    + '<div class="m">씨앗 900000 부터 7 씩. <code>remeasure.js</code> 와 같은 자리다.</div>';
}

function bar(v, lo, hi, min, max) {
  const pct = (x) => Math.max(0, Math.min(100, (x - min) / (max - min) * 100));
  return `<div class="bar"><i style="left:${pct(lo)}%;width:${pct(hi) - pct(lo)}%"></i>`
    + `<u style="left:${pct(v)}%"></u></div>`;
}

function drawResult() {
  if (!LAST) { $('result').innerHTML = ''; return; }
  const r = LAST.res, W = BASE.measuredAt;
  const row = (name, key, v, lo, hi, min, max, fmt) => {
    const ok = v >= lo && v <= hi;
    const d = v - W[key];
    return `<div style="margin-top:9px"><span class="m">${name}</span> `
      + `<span class="res ${ok ? 'ok' : 'no'}">${fmt(v)}</span> `
      + `<span class="m">기록 ${fmt(W[key])} · ${d >= 0 ? '+' : ''}${fmt(Math.round(d * 10) / 10)}</span>`
      + bar(v, lo, hi, min, max)
      + `<span class="m">밴드 ${fmt(lo)} ~ ${fmt(hi)}</span></div>`;
  };
  const p1 = (x) => x + '%';
  $('result').innerHTML =
    `<div class="m">${LAST.seeds}판 · ${LAST.ms}ms${LAST.stamp === stamp() ? '' : ' · <b class="no">지금 값과 다르다</b>'}</div>`
    + row('도달', 'reach', r.reach, 45, 60, 0, 100, p1)
    + row('개시 마감 실패', 'deadlineFail', r.deadlineFail, 0, 38, 0, 100, p1)
    + row('생존 중앙값', 'survivorMedian', r.survivorMedian, 0, 250000, 0, 400000, M)
    + `<div class="m" style="margin-top:8px">파산 ${r.ruin}% · 족보 ${r.setsPerRun}건 · 의뢰 ${r.questsPerRun}건</div>`
    + `<div style="margin-top:6px">${LAST.pass ? '<b class="ok">밴드 안이다</b>'
      : '<b class="no">밴드 밖 — ' + LAST.bad.join(' · ') + '</b>'}</div>`;
}

function draw() { drawPack(); drawFields(); drawDiff(); drawBanner(); drawRun(); drawResult(); }

function measure(seeds) {
  const built = window.buildFromBalance(CUR);
  window.SIM.configure(built);
  const t0 = Date.now();
  const runs = [];
  for (let i = 0; i < seeds; i += 1) runs.push(window.SIM.runCampaign(900000 + i * 7));
  const fin = runs.map((x) => x.final);
  const surv = fin.filter((x) => x > 0).sort((a, z) => a - z);
  const res = {
    reach: Number((fin.filter((x) => x >= 100000).length / runs.length * 100).toFixed(1)),
    deadlineFail: Number((runs.filter((x) => x.deadlineFail).length / runs.length * 100).toFixed(1)),
    ruin: Number((runs.filter((x) => x.ruined).length / runs.length * 100).toFixed(1)),
    survivorMedian: surv.length ? surv[Math.floor(surv.length / 2)] : 0,
    setsPerRun: Number((runs.reduce((a, x) => a + x.setsDone, 0) / runs.length).toFixed(2)),
    questsPerRun: Number((runs.reduce((a, x) => a + x.questsDone, 0) / runs.length).toFixed(2)),
  };
  const bad = Object.keys(BAND).filter((k) => res[k] < BAND[k][0] || res[k] > BAND[k][1]);
  LAST = { res, seeds, ms: Date.now() - t0, stamp: stamp(), bad, pass: bad.length === 0 };
  draw();
}

function loadPack(obj) {
  for (const [, p] of FIELDS) if (p && get(obj, p) === undefined) {
    alert('이 팩에 ' + p + ' 가 없다. balance.json 이 맞는지 봐라.');
    return;
  }
  BASE = obj; CUR = clone(obj); LAST = null; draw();
}

function wireDrop() {
  const d = $('drop'), f = $('file');
  if (f) f.onchange = (e) => readFile(e.target.files[0]);
  if (!d) return;
  d.ondragover = (e) => { e.preventDefault(); d.classList.add('over'); };
  d.ondragleave = () => d.classList.remove('over');
  d.ondrop = (e) => { e.preventDefault(); d.classList.remove('over'); readFile(e.dataTransfer.files[0]); };
}
function readFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => { try { loadPack(JSON.parse(r.result)); } catch (err) { alert('JSON 을 못 읽었다: ' + err.message); } };
  r.readAsText(file);
}

window.LAB = {
  edit(el) {
    set(CUR, el.dataset.p, Number(el.value));
    drawDiff(); drawBanner(); drawResult();
    el.classList.toggle('chg', String(get(CUR, el.dataset.p)) !== String(get(BASE, el.dataset.p)));
    $('fields').querySelectorAll('input').forEach((x) => {
      const tr = x.closest('tr');
      const was = get(BASE, x.dataset.p);
      tr.lastElementChild.textContent = String(get(CUR, x.dataset.p)) !== String(was) ? was : '';
    });
  },
  reset() { CUR = clone(BASE); LAST = null; draw(); },
  measure,
  exportPack() {
    const out = clone(CUR);
    out.labEdit = {
      at: new Date().toISOString(),
      changed: changed().map(([label, p]) => ({ 수치: label, 경로: p, 원래: get(BASE, p), 바꾼값: get(CUR, p) })),
      measured: LAST && LAST.stamp === stamp() ? { seeds: LAST.seeds, ...LAST.res } : null,
      warning: '밸런싱 랩에서 손으로 바꾼 팩이다. measuredAt 은 아직 옛 측정이다 - '
        + 'sim/record-measurement.js 를 돌려 다시 박아야 확정이다',
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
    a.download = 'balance-lab.json';
    a.click();
  },
};

// 팩 안에서 열었으면 알아서 불러온다. file:// 이면 막히므로 그때는 손으로 준다.
fetch('../data/balance.json').then((r) => r.json()).then(loadPack).catch(() => draw());
draw();
