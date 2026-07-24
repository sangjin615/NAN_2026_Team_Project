#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
nemesis-cast.sim.py — 캐스트 구조 A/B 하네스 (숙적 상시화 후보 검증)
002-bot-v2.sim.py 파생. 원본과 다른 점:
  * 난수 스트림 분리(items/bots/auction) — 두 cast_mode가 동일 카탈로그를 받아 공정 비교
  * cast_mode="base": 단골 2 + 뜨내기 1 (현행 §6.1)
  * cast_mode="nemesis": 1일차 튜토리얼(약한 뜨내기 3) → 2일차부터 숙적 1 + 뜨내기 2
      - 숙적: 런 지속 지갑(최대), 런 관통 지정형 사정(후반 물건), 성장 스케줄
        stage1(2~4일) noise .30 / stage2(5~7일) .22 / stage3(8~10일) .15 + 대인 지속의지(Tier2 근사, 유저 좌석시 ×1.08)
      - 뜨내기: 조건형 40% + 지정형 30%(오늘 물건 대상 — 세션 미니 아크)
  * 측정: 무경합·유찰율 / 누설 잔차 / 유저 프록시 ROI 평균·표준편차 / 일자 구간별 유저 승률
모든 수치는 밸런싱 대상 임시값. 실행: python nemesis-cast.sim.py [--runs 24] [--seed 7]
"""
import random, math, argparse, statistics
from collections import defaultdict

CATS = ["도자기", "해양", "서적", "보석", "무구", "회화"]
A_S = 5000.0
TIER_MULT = {"low": 0.5, "mid": 1.0, "high": 1.8}
DAYS = 10
ITEMS_PER_DAY = 6
RHO, LAM = 0.5, 0.75
P = dict(floor=0.5, uplift=1.15, k=0.25, resale=0.90)   # sim-findings 권고 노브 + 마찰
NOISE = 0.30
FEE = 0.05
CAP_MARKET = 1.5
D_MARGIN = {"D1": 0.20, "D2": 0.10, "D3": 0.02}
D_DELAY = {"D1": 2, "D2": 1, "D3": 3}
BRANCHES = {r: [r + str(i) for i in (1, 2, 3)] for r in "ABCD"}
NEM_NOISE = {1: 0.30, 2: 0.22, 3: 0.15}
NEM_INCOME = {1: 0.15, 2: 0.25, 3: 0.40}   # 일일 수입 (A_S×물건수 배수) — 성장 스케줄의 자금 축
NEM_WILL = {1: 0.85, 2: 1.0, 3: 1.0}       # stage1 관망 (의지 억제) — 튜토리얼 이후 완만한 진입
def nem_stage(day): return 1 if day <= 4 else (2 if day <= 7 else 3)


def make_item(rng, iid):
    tier = rng.choices(["low", "mid", "high"], [0.4, 0.4, 0.2])[0]
    V = A_S * TIER_MULT[tier] * rng.uniform(0.55, 1.6)
    return dict(id=iid, V=V, tier=tier, cat=rng.choice(CATS),
                link=rng.randrange(8) if rng.random() < 0.2 else None,
                sents=rng.randint(0, 3), pub=V * rng.uniform(0.8, 1.2), re=0)


class Bot:
    def __init__(self, rng, branch, regular, wallet, identity="regular"):
        self.br, self.root = branch, branch[0]
        self.regular = regular
        self.identity = identity          # regular | drifter | nemesis
        self.W = wallet
        self.W0 = wallet
        self.noise = NOISE
        self.fav = rng.choice(CATS)
        self.link = rng.randrange(8)
        self.hold = defaultdict(int)
        self.spent = self.won = 0
        self.pend = []
        self.saj = []
        self.first_got = False

    def est(self, item, rng):
        return item["V"] * rng.uniform(1 - self.noise, 1 + self.noise)

    def market_axis(self, it, est, ctx):
        b = self.br
        if b == "A1": m = est
        elif b == "A2": m = est * (1.1 if it["tier"] == "high" else 0.8)
        elif b == "A3":
            m = min(est, 1.2 * A_S)
            if ctx["rival_avg_W"] < self.W: m = est
            if ctx["rival_hold"][it["cat"]] >= 2: m *= 1.1
        elif b == "B1": m = est * (1.25 if it["cat"] == self.fav else 0.95)
        elif b == "B2": m = est * (1.2 if it["link"] == self.link else 0.95)
        elif b == "B3":
            m = est * (1.05 if not self.first_got else 0.95)
            if ctx["cat_left"][self.fav] <= 1 and not self.first_got: m = est * 0.7
            if ctx["rival_hold"][it["cat"]] >= 2: m *= 1.08
        elif b == "C1":
            m = A_S * TIER_MULT[it["tier"]] * (1 + 0.08 * it["sents"])
        elif b == "C2":
            m = est * ctx["trend"]
        elif b == "C3":
            m = est * (1 + 0.05 * min(ctx["pass_streak"], 4))
            if it["re"]: m *= 1.05
            if ctx["rival_hold"][it["cat"]] >= 2: m *= 0.85
        else:
            mg = D_MARGIN[b]
            if b == "D3":
                mg = 0.02 if it["cat"] == self.fav else 0.55
            m = est * ctx["cat_temp"][it["cat"]] * (1 - mg) * (1 - FEE)
        return min(m * P["uplift"], est * CAP_MARKET)

    def private_axis(self, it, day):
        best = 0.0
        for typ, key, amt, dl in self.saj:
            hit = (typ == "item" and key == it["id"]) or \
                  (typ == "cat" and key == it["cat"]) or \
                  (typ == "link" and key == it["link"])
            if not hit: continue
            v = amt
            if dl is not None and dl - 2 <= day <= dl: v *= 1.3
            if dl is not None and day > dl: v = 0
            best = max(best, v)
        return best

    def plan(self, it, ctx, rng):
        est = self.est(it, rng)
        mp = max(self.market_axis(it, est, ctx), self.private_axis(it, ctx["day"]))
        slack = ctx["budget_left"] - ctx["items_left"] * 0.6 * A_S
        if slack > 0: mp += slack / max(ctx["items_left"], 1) * P["k"]
        # Tier2 근사: 숙적 stage3 + 유저 좌석 → 지속 의지 (공표된 성장의 마지막 단계)
        if self.identity == "nemesis":
            mp *= NEM_WILL[nem_stage(ctx["day"])]
            if ctx.get("proxy_seated") and nem_stage(ctx["day"]) >= 3:
                mp *= 1.08
        return min(mp, ctx["budget_left"], self.W)


class Proxy:
    def __init__(self, rng, kind):
        self.kind, self.rng = kind, rng
        self.W0 = self.W = ITEMS_PER_DAY * A_S * 0.7
        self.spent = self.wins = 0; self.pend = []
    def plan(self, it):
        est = it["V"] * self.rng.uniform(0.8, 1.2)
        if self.kind == "blind":  mp = it["pub"] * 1.1
        elif self.kind == "fair": mp = est * 0.95
        else:
            mp = est * 0.9 if est > it["pub"] * 1.25 else 0.0
        return min(mp, self.W)
    def win(self, it, price, day):
        self.W -= price; self.spent += price; self.wins += 1
        self.pend.append((day + 1, it["V"] * P["resale"]))
    def tick(self, day):
        arrived = sum(a for d, a in self.pend if d <= day)
        self.pend = [(d, a) for d, a in self.pend if d > day]; self.W += arrived
    def wealth(self): return self.W + sum(a for _, a in self.pend)


def assign_sajeong_regulars(rng, cast, catalog):
    for b in cast:
        if b.root == "B":
            tgt = rng.choice(catalog)
            b.saj.append(("item", tgt["id"], A_S * rng.uniform(1, 3), None))
            b.saj.append(("cat", b.fav, A_S * rng.uniform(0.8, 2), None))
            if b.br == "B2":
                b.saj.append(("link", b.link, A_S * rng.uniform(1, 2.5), None))
        elif rng.random() < 0.5:
            b.saj.append(("cat", rng.choice(CATS), A_S * rng.uniform(0.8, 2.5), None))
    dead = rng.choice([b for b in cast if b.root != "B"])
    dead.saj.append(("cat", rng.choice(CATS), A_S * rng.uniform(1.2, 2.2), rng.randint(3, DAYS - 1)))


def make_drifter(rng, today, weak=False, mini_arc=True):
    root = rng.choice("ABCD")
    d = Bot(rng, rng.choice(BRANCHES[root]), False,
            ITEMS_PER_DAY * A_S * (0.25 if weak else 0.45), identity="drifter")
    roll = rng.random()
    if roll < 0.4:
        d.saj.append(("cat", rng.choice(CATS), A_S * rng.uniform(0.6, 1.8), None))
    elif mini_arc and roll < 0.7 and today:
        tgt = rng.choice(today)      # 지정형 — 세션 미니 아크
        d.saj.append(("item", tgt["id"], A_S * rng.uniform(1.0, 2.0), None))
    return d


def simulate(runs, seed, cast_mode, proxy_kind=None):
    log = []
    wallet_end = defaultdict(list)
    proxy_roi = []
    proxy_day = defaultdict(lambda: [0, 0])   # day → [유저 낙찰, 총 낙찰]
    nem_share = defaultdict(lambda: [0, 0])   # stage → [숙적 낙찰, 총 낙찰]
    unsold = sold = solo = 0
    for run_i in range(runs):
        rI = random.Random(f"{seed}:items:{run_i}")
        rB = random.Random(f"{seed}:bots:{run_i}")
        rA = random.Random(f"{seed}:auction:{run_i}")
        catalog = [make_item(rI, i) for i in range(DAYS * ITEMS_PER_DAY)]
        proxy = Proxy(random.Random(f"{seed}:proxy:{run_i}"), proxy_kind) if proxy_kind else None

        if cast_mode == "base":
            cast = [Bot(rB, rB.choice(BRANCHES[r]), True, ITEMS_PER_DAY * A_S * 0.7) for r in "ABCD"]
            assign_sajeong_regulars(rB, cast, catalog)
            nemesis = None
        else:
            root = rB.choice("ABCD")
            nemesis = Bot(rB, rB.choice(BRANCHES[root]), True, ITEMS_PER_DAY * A_S * 1.2, identity="nemesis")
            late = [it for it in catalog if it["id"] >= (DAYS - 3) * ITEMS_PER_DAY]
            nemesis.saj.append(("item", rB.choice(late)["id"], A_S * rB.uniform(2.0, 4.0), None))   # 런 관통 아크
            nemesis.saj.append(("cat", nemesis.fav, A_S * rB.uniform(1.0, 2.0), None))
            cast = [nemesis]

        ratios, queue = [], list(catalog)
        cat_temp = defaultdict(lambda: 1.0); pass_streak = 0
        cat_left = defaultdict(int)
        for it in catalog: cat_left[it["cat"]] += 1

        for day in range(1, DAYS + 1):
            if proxy: proxy.tick(day)
            for b in cast:
                b.pend, arrived = [(d, a) for d, a in b.pend if d > day], sum(a for d, a in b.pend if d <= day)
                b.W += arrived
            today, queue = queue[:ITEMS_PER_DAY], queue[ITEMS_PER_DAY:]

            if cast_mode == "base":
                r1, r2 = rA.sample(cast, 2)
                while r2.root == r1.root: r2 = rA.choice(cast)
                drifter = make_drifter(rA, today, mini_arc=False)   # 현행: 조건형만
                seats = [r1, r2, drifter]
            else:
                if day == 1:
                    seats = [make_drifter(rA, today, weak=True) for _ in range(3)]   # 튜토리얼
                else:
                    st = nem_stage(day)
                    nemesis.noise = NEM_NOISE[st]                                    # 성장: 안목
                    nemesis.W += A_S * ITEMS_PER_DAY * NEM_INCOME[st]                # 성장: 자금 (오프스크린 수입)
                    seats = [nemesis, make_drifter(rA, today), make_drifter(rA, today)]

            budget = {id(b): min(b.W, b.W * RHO * (1 + LAM * day / DAYS)) for b in seats}
            for idx, it in enumerate(today):
                floor = P["floor"] * it["pub"] * (0.9 if it["re"] else 1.0)
                ctx_common = dict(day=day, items_left=len(today) - idx,
                                  trend=max(0.7, min(1.4, sum(ratios[-4:]) / len(ratios[-4:]))) if ratios else 1.0,
                                  cat_temp=cat_temp, pass_streak=pass_streak, cat_left=cat_left,
                                  proxy_seated=proxy is not None)
                bids = []
                for b in seats:
                    others = [o for o in seats if o is not b]
                    ctx = dict(ctx_common, budget_left=budget[id(b)],
                               rival_avg_W=sum(o.W for o in others) / len(others),
                               rival_hold=defaultdict(int, {c: sum(o.hold[c] for o in others) for c in CATS}))
                    mp = b.plan(it, ctx, rA)
                    if mp >= floor: bids.append((mp, rA.random(), b))
                if proxy:
                    pmp = proxy.plan(it)
                    if pmp >= floor: bids.append((pmp, rA.random(), proxy))
                cat_left[it["cat"]] -= 1
                if not bids:
                    unsold += 1; pass_streak += 1
                    if not it["re"]:
                        it["re"] = 1; queue.append(it)
                    continue
                pass_streak = 0
                sold += 1
                if len(bids) == 1: solo += 1
                bids.sort(key=lambda t: (t[0], t[1]), reverse=True)
                price = max(floor, (bids[1][0] + 0.02 * A_S) if len(bids) > 1 else floor)
                price = min(price, bids[0][0])
                w = bids[0][2]
                proxy_day[day][1] += 1
                if cast_mode == "nemesis" and day >= 2:
                    nem_share[nem_stage(day)][1] += 1
                if isinstance(w, Proxy):
                    w.win(it, price, day)
                    proxy_day[day][0] += 1
                    ratios.append(price / max(it["pub"], 1))
                    cat_temp[it["cat"]] = max(0.8, min(1.3, 0.7 * cat_temp[it["cat"]] + 0.3 * price / max(it["pub"], 1)))
                    log.append(dict(V=it["V"], price=price, pub=it["pub"], nbid=len(bids), root="P",
                                    reg=False, overV=price / it["V"]))
                    continue
                w.W -= price; w.spent += price; w.won += 1
                budget[id(w)] -= price; w.hold[it["cat"]] += 1
                if it["cat"] == w.fav: w.first_got = True
                if w.root == "D":
                    w.pend.append((day + D_DELAY[w.br],
                                   price * (1 + (0.30 if w.br == "D3" else D_MARGIN[w.br])) * rA.uniform(0.9, 1.15)))
                if w.identity == "nemesis":
                    nem_share[nem_stage(day)][0] += 1
                ratios.append(price / max(it["pub"], 1))
                cat_temp[it["cat"]] = max(0.8, min(1.3, 0.7 * cat_temp[it["cat"]] + 0.3 * price / max(it["pub"], 1)))
                log.append(dict(V=it["V"], price=price, pub=it["pub"], nbid=len(bids), root=w.root,
                                reg=(w.identity != "drifter"), overV=price / it["V"]))
        for b in cast:
            wallet_end[b.root].append((b.W - sum(a for _, a in b.pend)) / b.W0)
        if proxy: proxy_roi.append((proxy.wealth() - proxy.W0) / proxy.W0)
    return dict(log=log, wend=wallet_end, roi=proxy_roi, pday=proxy_day,
                nshare=nem_share, unsold=unsold, sold=sold, solo=solo)


def pearson(xs, ys):
    n = len(xs)
    if n < 3: return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = math.sqrt(sum((x - mx) ** 2 for x in xs)); vy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return cov / (vx * vy) if vx and vy else 0.0


def bots_report(tag, r):
    log = r["log"]; total = len(log)
    cont = [x for x in log if x["nbid"] >= 2]
    resid = pearson([x["price"] / x["pub"] for x in cont], [x["V"] / x["pub"] for x in cont])
    print(f"[{tag}] 낙찰 {total} | 무경합 {r['solo']/max(r['sold'],1):5.1%} | 유찰 {r['unsold']/(r['unsold']+r['sold']):5.1%} "
          f"| 낙찰가/실가치 {sum(x['overV'] for x in log)/total:4.2f} | 누설 잔차 {resid:+.3f}")


def proxy_report(tag, kind, r):
    roi = r["roi"]
    mean = sum(roi) / len(roi); sd = statistics.pstdev(roi)
    p = [x for x in r["log"] if x["root"] == "P"]
    buckets = {"1일(튜토)": (1, 1), "2~4일": (2, 4), "5~7일": (5, 7), "8~10일": (8, 10)}
    wr = []
    for name, (a, b) in buckets.items():
        w = sum(r["pday"][d][0] for d in range(a, b + 1)); t = sum(r["pday"][d][1] for d in range(a, b + 1))
        wr.append(f"{name} {w/t:4.0%}" if t else f"{name}   -")
    print(f"  {kind:6s} | ROI {mean:+7.1%} (σ {sd:5.1%}) | 낙찰 {len(p):3d} | 유저 낙찰 점유: " + " / ".join(wr))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=24)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    total_lots = a.runs * DAYS * ITEMS_PER_DAY
    print(f"캐스트 A/B: {a.runs}런 × {DAYS}일 × {ITEMS_PER_DAY}물건 = 출품 {total_lots} | 노브 {P} | 시드 {a.seed}")

    print("\n— 봇 전용 (경합·누설·소진) —")
    results = {}
    for mode in ("base", "nemesis"):
        results[mode] = simulate(a.runs, a.seed, mode)
        bots_report({"base": "현행 단골2+뜨내기1", "nemesis": "숙적1+뜨내기2   "}[mode], results[mode])
    for mode in ("base", "nemesis"):
        wend = results[mode]["wend"]
        print(f"  {mode:7s} 런 종료 지갑/초기: " + " ".join(f"{k}={sum(v)/len(v):.2f}" for k, v in sorted(wend.items())))
    ns = results["nemesis"]["nshare"]
    print("  숙적 낙찰 점유 (성장 단계별): " + " / ".join(f"stage{s} {ns[s][0]/ns[s][1]:4.0%}" for s in (1, 2, 3) if ns[s][1]))

    print("\n— 유저 프록시 (ROI·구간 승률) —")
    for mode in ("base", "nemesis"):
        print(f"[{'현행' if mode=='base' else '숙적 상시화'}]")
        for kind in ("blind", "fair", "sniper"):
            proxy_report(mode, kind, simulate(a.runs, a.seed, mode, kind))
