// 봇 V2 검증 하네스 (impl-handoff §5 체크리스트의 실코드) — 초안
// 위치 규약: 승인 후 test/auction/botv2.verification.cjs 로 이동 (B트랙 태스크로 land).
// 실행: node <이 파일> [--strict]
//   - V2 API 미검출 시: 스켈레톤 모드 = 활성화 대기 메시지 출력 후 exit 0 (--strict면 exit 1)
//   - V2 API 검출 시: 검사 6종 실행, 실패 있으면 exit 1
// 스타일: engine.regression.cjs의 check() 패턴 준수. 모든 수치 임계값은 밸런싱 대상 임시값.
const path = require("path");
const E = require(path.join(__dirname, "../../public/auction/engine/engine.js"));

let fails = 0;
function check(cond, msg) { if (!cond) { fails++; console.log("FAIL:", msg); } }
const strict = process.argv.includes("--strict");

/* ---------- V2 API 매핑 표 ----------
 * impl-handoff는 "기존 함수명은 004 기준 — 실코드 확인 후 매핑"을 요구한다.
 * V2 구현 시 아래 감지 함수가 참이 되도록 엔진이 노출해야 하는 것:
 *   E.generateRunCast(seed)  → CompetitorNPC[] (sajeong 포함)   [런 시작 캐스트]
 *   E.computeBotPlan(...)    → BotPlan { maxPay, policy, ... }  [기존 이름 유지 가정]
 *   npc.sajeong[]            → { type, key, amount, deadline, satisfied }
 * 이름이 다르게 구현되면 이 표만 고치면 된다. */
function detectV2() {
  return typeof E.generateRunCast === "function";
}

/* ---------- 통계 유틸 ---------- */
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; num += dx * dy; dx2 += dx * dx; dy2 += dy * dy; }
  return dx2 && dy2 ? num / Math.sqrt(dx2 * dy2) : 0;
}
// 공시(x)로 낙찰가(y)를 단순회귀로 통제한 잔차
function residuals(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const beta = den ? num / den : 0;
  return ys.map((y, i) => y - (my + beta * (xs[i] - mx)));
}

/* ---------- 검사 본체 (V2 API 검출 시 실행) ---------- */
function run() {
  const SEEDS = Array.from({ length: 60 }, (_, i) => "V2-" + i);

  // §5.1 생성 시점: 사정 amount ⟂ 대상 물건 실가치 (배치 검정 |r| ≤ 0.15 임시)
  {
    const amounts = [], truths = [];
    for (const seed of SEEDS) {
      const cast = E.generateRunCast(seed);
      const g = E.createGame(seed, true);
      for (const npc of cast) for (const sj of npc.sajeong || []) {
        if (sj.type !== "item") continue;
        const item = E.getItem(g, sj.key);
        if (!item) continue;
        amounts.push(sj.amount); truths.push(item.mechanics.actualValue);
      }
    }
    const r = pearson(amounts, truths);
    check(Math.abs(r) <= 0.15, `생성 시점 위반 의심: 사정액-실가치 상관 r=${r.toFixed(3)} (표본 ${amounts.length})`);
    check(amounts.length >= 30, `사정 표본 부족(${amounts.length}) — 배정 밀도 확인`);
  }

  // §5.2 plan 불변성: 경매 중 maxPay·policy 변경 없음 (시드 재현)
  {
    for (const seed of SEEDS.slice(0, 10)) {
      const g = E.createGame(seed, true);
      const next = E.peekNextAuction(g);
      if (!next) continue;
      E.startAuction(g, next.itemId, next.isRe);
      const bots = g.pack.participants.filter((p) => p.isBot);
      const before = bots.map((b) => JSON.stringify(g.plans ? g.plans[b.id] : E.computeBotPlan(g, b.id)));
      let guard = 0;
      while (!g.auction.finished && guard++ < 500) {
        const pid = E.currentActorId(g.auction);
        if (pid === null) break;
        if (g.pack.participants.find((x) => x.id === pid).isBot) E.botStep(g);
        else E.actPass(g, "player", "pass");
      }
      const after = bots.map((b) => JSON.stringify(g.plans ? g.plans[b.id] : E.computeBotPlan(g, b.id)));
      check(before.join("|") === after.join("|"), "plan 불변성 위반 seed=" + seed);
    }
  }

  // §5.3 누설 회귀: 봇 낙찰가의 공시 통제 잔차와 실가치 상관 ≤ 0.3
  {
    const disclosed = [], prices = [], truths = [];
    for (const seed of SEEDS) {
      const g = playBotsOnly(seed);
      for (const [id, st] of Object.entries(g.itemState)) {
        if (st.status !== "sold" || st.owner === "player") continue;
        const item = E.getItem(g, id);
        disclosed.push(TIER_APPROX(item)); prices.push(st.price); truths.push(item.mechanics.actualValue);
      }
    }
    const res = residuals(disclosed, prices);
    const r = pearson(res, truths);
    check(r <= 0.3, `누설 회귀 초과: 잔차-실가치 상관 r=${r.toFixed(3)} (기준 ≤0.3, sim 기준선 0.26)`);
  }

  // §5.4 소진: 수집형(비 D 뿌리) 런 종료 지갑 ≤ 초기 20%
  {
    let checked = 0;
    for (const seed of SEEDS.slice(0, 20)) {
      const cast = E.generateRunCast(seed);
      const g = playBotsOnly(seed);
      for (const npc of cast) {
        if (npc.root === "D" || npc.identity !== "regular") continue;
        checked++;
        check(g.balances[npc.id] <= npc.walletInitial * 0.20,
          `소진 미달 seed=${seed} ${npc.id}: 잔존 ${g.balances[npc.id]}/${npc.walletInitial}`);
      }
    }
    check(checked > 0, "소진 검사 표본 0 — walletInitial 노출 여부 확인");
  }

  // §5.5 캡: 시장축 ≤ est×1.5 / 사정축 ≤ amount / 왕립 ≤ est×2.0
  {
    for (const seed of SEEDS.slice(0, 20)) {
      const g = E.createGame(seed, true);
      for (const b of g.pack.participants.filter((p) => p.isBot)) {
        for (const item of g.pack.items) {
          const plan = E.computeBotPlan(g, b.id, item.mechanics.key);
          if (!plan) continue;
          const capBase = plan.estBot ?? item.mechanics.actualValue; // est_bot 노출 필요 — 매핑 표 참조
          const capMul = b.identity === "royal" ? 2.0 : 1.5;
          const sajeongMax = Math.max(0, ...(b.sajeong || []).map((s) => s.amount));
          check(plan.maxPay <= Math.max(capBase * capMul, sajeongMax) + 1e-9,
            `캡 위반 seed=${seed} ${b.id} ${item.mechanics.key}: maxPay=${plan.maxPay}`);
        }
      }
    }
  }

  // §5.6 회귀 시드 확대: 뿌리 4택3 조합에서 기존 불변식(음수 잔액 금지 등) 유지
  {
    let rootSets = new Set();
    for (let s = 0; s < 40; s++) {
      const seed = "V2R" + s;
      const g = playBotsOnly(seed);
      for (const p of g.pack.participants) check(g.balances[p.id] >= 0, "음수 잔액 " + seed);
      const cast = E.generateRunCast(seed);
      rootSets.add(cast.map((n) => n.root).sort().join(""));
    }
    check(rootSets.size >= 3, `뿌리 조합 다양성 부족: ${[...rootSets].join(",")}`);
  }
}

/* 봇만 진행하는 판 (플레이어 전패스) — engine.regression의 playGame 축약 */
function playBotsOnly(seed) {
  const g = E.createGame(seed, true);
  let auctions = 0;
  while (!g.finished && auctions++ < 30) {
    const next = E.peekNextAuction(g);
    if (!next) break;
    E.startAuction(g, next.itemId, next.isRe);
    let guard = 0;
    while (!g.auction.finished && guard++ < 500) {
      const pid = E.currentActorId(g.auction);
      if (pid === null) break;
      if (g.pack.participants.find((x) => x.id === pid).isBot) E.botStep(g);
      else E.actPass(g, "player", "pass");
    }
  }
  return g;
}
function TIER_APPROX(item) { return { low: 15, mid: 30, high: 48 }[item.mechanics.tier] ?? 30; }

/* ---------- 진입 ---------- */
if (!detectV2()) {
  console.log("[botv2-harness] V2 API 미검출 (E.generateRunCast 부재) — 스켈레톤 모드.");
  console.log("[botv2-harness] 구현 land 시 이 하네스가 자동 활성화된다. 매핑 표는 파일 상단 참조.");
  process.exit(strict ? 1 : 0);
}
run();
console.log(fails === 0 ? "[botv2-harness] ALL CHECKS PASSED" : `[botv2-harness] ${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
