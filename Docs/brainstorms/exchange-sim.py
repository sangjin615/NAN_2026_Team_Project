#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
exchange-sim.py — 거래소 층 감각 확인 (간이 밸런싱 하네스)
nemesis-cast.sim.py 파생 (캐스트: 숙적 상시화 후보 고정). 추가된 것:
  * 유저 프록시의 출구가 단일 환금(V×0.90)에서 3전략으로 분화:
      instant : 다음날 전량 즉시 처분 (V × INSTANT)
      set     : 최다 계열 3개 세트 노림 (성공 V합×SET_MULT, 런 종료 잔고 떨이 ×FIRE)
      waiter  : 특별 제안 3일 대기 → 없으면 즉시 처분
  * 구매봇 특별 제안: 좌석 봇(숙적·뜨내기)의 취향(fav)·사정(cat) 매칭 보유품에
      일일 OFFER_P 확률, 제안가 = est_bot × OFFER_MULT (캡 est×1.5) — 세션당 좌석봇 합산 1건
  * 입찰은 전 전략 fair(est×0.95) 고정 — 차이는 순수하게 출구 전략에서만 발생
측정: 전략별 ROI / 특별 제안 발생·수락·수익 기여 / 세트 성공률 / 떨이 손실.
감각 확인용 — 수치 전부 임시값. 실행: python exchange-sim.py [--runs 24] [--seed 7]
"""
import random, math, argparse, statistics
from collections import defaultdict

CATS = ["도자기", "해양", "서적", "보석", "무구", "회화"]
A_S = 5000.0
TIER_MULT = {"low": 0.5, "mid": 1.0, "high": 1.8}
DAYS = 10
ITEMS_PER_DAY = 6
RHO, LAM = 0.5, 0.75
P = dict(floor=0.5, uplift=1.15, k=0.25)
NOISE = 0.30
FEE = 0.05
CAP_MARKET = 1.5
D_MARGIN = {"D1": 0.20, "D2": 0.10, "D3": 0.02}
D_DELAY = {"D1": 2, "D2": 1, "D3": 3}
BRANCHES = {r: [r + str(i) for i in (1, 2, 3)] for r in "ABCD"}
NEM_NOISE = {1: 0.30, 2: 0.22, 3: 0.15}
NEM_INCOME = {1: 0.15, 2: 0.25, 3: 0.30}     # findings 주의② 반영: stage3 0.40→0.30 완화
NEM_WILL = {1: 0.85, 2: 1.0, 3: 1.0}
def nem_stage(day): return 1 if day <= 4 else (2 if day <= 7 else 3)

# 거래소 노브 (전부 임시)
INSTANT = 0.85       # 즉시 매입 계수
SET_MULT = 1.8       # 세트(같은 계열 3) 배수
FIRE = 0.70          # 런 종료 떨이
OFFER_P = 0.20       # 매칭 보유품당 일일 제안 확률
OFFER_MULT = 1.25    # 제안가 = est_bot × 이 값 (캡 est×1.5)
WAIT_DAYS = 3


def make_item(rng, iid):
    tier = rng.choices(["low", "mid", "high"], [0.4, 0.4, 0.2])[0]
    V = A_S * TIER_MULT[tier] * rng.uniform(0.55, 1.6)
    return dict(id=iid, V=V, tier=tier, cat=rng.choice(CATS),
                link=rng.randrange(8) if rng.random() < 0.2 else None,
                sents=rng.randint(0, 3), pub=V * rng.uniform(0.8, 1.2), re=0)


class Bot:
    def __init__(self, rng, branch, wallet, identity="drifter"):
        self.br, self.root = branch, branch[0]
        self.identity = identity
        self.W = wallet; self.W0 = wallet
        self.noise = NOISE
        self.fav = rng.choice(CATS)
        self.link = rng.randrange(8)
        self.hold = defaultdict(int)
        self.pend = []; self.saj = []
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
        if self.identity == "nemesis":
            mp *= NEM_WILL[nem_stage(ctx["day"])]
        return min(mp, ctx["budget_left"], self.W)

    def wants(self, cat):
        if cat == self.fav: return True
        return any(t == "cat" and k == cat for t, k, _, _ in self.saj)


class Trader:
    """유저 프록시 — 입찰 fair 고정, 출구 전략만 분화."""
    def __init__(self, rng, kind):
        self.kind, self.rng = kind, rng
        self.W0 = self.W = ITEMS_PER_DAY * A_S * 0.7
        self.inv = []                     # {V, cat, day}
        self.stats = defaultdict(float)
    def bid_plan(self, it):
        est = it["V"] * self.rng.uniform(0.8, 1.2)
        return min(est * 0.95, self.W)
    def win(self, it, price, day):
        self.W -= price
        self.inv.append(dict(V=it["V"], cat=it["cat"], day=day))
        self.stats["bought"] += 1
    def exchange(self, day, seats):
        # 1) 특별 제안 (세션 합산 1건)
        offered = False
        for b in seats:
            if offered: break
            for item in list(self.inv):
                if not b.wants(item["cat"]): continue
                if self.rng.random() > OFFER_P: continue
                est_b = item["V"] * self.rng.uniform(1 - b.noise, 1 + b.noise)
                offer = min(est_b * OFFER_MULT, est_b * CAP_MARKET)
                self.stats["offers"] += 1
                if offer > item["V"] * INSTANT:            # 즉시가보다 나으면 수락 (전 전략 공통)
                    self.W += offer
                    self.stats["offer_income"] += offer
                    self.stats["offer_taken"] += 1
                    self.inv.remove(item)
                offered = True
                break
        # 2) 전략별 처분
        if self.kind == "instant":
            for item in list(self.inv):
                if day > item["day"]:
                    self.W += item["V"] * INSTANT; self.stats["instant_income"] += item["V"] * INSTANT
                    self.inv.remove(item)
        elif self.kind == "set":
            bycat = defaultdict(list)
            for item in self.inv: bycat[item["cat"]].append(item)
            for cat, items in bycat.items():
                if len(items) >= 3:
                    total = sum(i["V"] for i in items[:3]) * SET_MULT
                    self.W += total; self.stats["set_income"] += total; self.stats["sets"] += 1
                    for i in items[:3]: self.inv.remove(i)
        else:  # waiter
            for item in list(self.inv):
                if day - item["day"] >= WAIT_DAYS:
                    self.W += item["V"] * INSTANT; self.stats["instant_income"] += item["V"] * INSTANT
                    self.inv.remove(item)
    def run_end(self):
        for item in self.inv:
            self.W += item["V"] * FIRE; self.stats["fire_income"] += item["V"] * FIRE; self.stats["fired"] += 1
        self.inv = []
    def roi(self): return (self.W - self.W0) / self.W0


def make_drifter(rng, today, weak=False):
    root = rng.choice("ABCD")
    d = Bot(rng, rng.choice(BRANCHES[root]),
            ITEMS_PER_DAY * A_S * (0.25 if weak else 0.45))
    roll = rng.random()
    if roll < 0.4:
        d.saj.append(("cat", rng.choice(CATS), A_S * rng.uniform(0.6, 1.8), None))
    elif roll < 0.7 and today:
        d.saj.append(("item", rng.choice(today)["id"], A_S * rng.uniform(1.0, 2.0), None))
    return d


def simulate(runs, seed, kind):
    rois, agg = [], defaultdict(float)
    for run_i in range(runs):
        rI = random.Random(f"{seed}:items:{run_i}")
        rB = random.Random(f"{seed}:bots:{run_i}")
        rA = random.Random(f"{seed}:auction:{run_i}")
        catalog = [make_item(rI, i) for i in range(DAYS * ITEMS_PER_DAY)]
        trader = Trader(random.Random(f"{seed}:trader:{run_i}"), kind)
        root = rB.choice("ABCD")
        nemesis = Bot(rB, rB.choice(BRANCHES[root]), ITEMS_PER_DAY * A_S * 1.2, identity="nemesis")
        late = [it for it in catalog if it["id"] >= (DAYS - 3) * ITEMS_PER_DAY]
        nemesis.saj.append(("item", rB.choice(late)["id"], A_S * rB.uniform(2.0, 4.0), None))
        nemesis.saj.append(("cat", nemesis.fav, A_S * rB.uniform(1.0, 2.0), None))

        ratios, queue = [], list(catalog)
        cat_temp = defaultdict(lambda: 1.0); pass_streak = 0
        cat_left = defaultdict(int)
        for it in catalog: cat_left[it["cat"]] += 1
        for day in range(1, DAYS + 1):
            nemesis.pend, arrived = [(d, a) for d, a in nemesis.pend if d > day], sum(a for d, a in nemesis.pend if d <= day)
            nemesis.W += arrived
            today, queue = queue[:ITEMS_PER_DAY], queue[ITEMS_PER_DAY:]
            if day == 1:
                seats = [make_drifter(rA, today, weak=True) for _ in range(3)]
            else:
                st = nem_stage(day)
                nemesis.noise = NEM_NOISE[st]
                nemesis.W += A_S * ITEMS_PER_DAY * NEM_INCOME[st]
                seats = [nemesis, make_drifter(rA, today), make_drifter(rA, today)]
            trader.exchange(day, seats)          # 장은 경매 전에 선다 (전일 물건 처분)
            budget = {id(b): min(b.W, b.W * RHO * (1 + LAM * day / DAYS)) for b in seats}
            for idx, it in enumerate(today):
                floor = P["floor"] * it["pub"] * (0.9 if it["re"] else 1.0)
                ctx_common = dict(day=day, items_left=len(today) - idx,
                                  trend=max(0.7, min(1.4, sum(ratios[-4:]) / len(ratios[-4:]))) if ratios else 1.0,
                                  cat_temp=cat_temp, pass_streak=pass_streak, cat_left=cat_left)
                bids = []
                for b in seats:
                    others = [o for o in seats if o is not b]
                    ctx = dict(ctx_common, budget_left=budget[id(b)],
                               rival_avg_W=sum(o.W for o in others) / len(others),
                               rival_hold=defaultdict(int, {c: sum(o.hold[c] for o in others) for c in CATS}))
                    mp = b.plan(it, ctx, rA)
                    if mp >= floor: bids.append((mp, rA.random(), b))
                tm = trader.bid_plan(it)
                if tm >= floor: bids.append((tm, rA.random(), trader))
                cat_left[it["cat"]] -= 1
                if not bids:
                    pass_streak += 1
                    if not it["re"]:
                        it["re"] = 1; queue.append(it)
                    continue
                pass_streak = 0
                bids.sort(key=lambda t: (t[0], t[1]), reverse=True)
                price = max(floor, (bids[1][0] + 0.02 * A_S) if len(bids) > 1 else floor)
                price = min(price, bids[0][0])
                w = bids[0][2]
                ratios.append(price / max(it["pub"], 1))
                cat_temp[it["cat"]] = max(0.8, min(1.3, 0.7 * cat_temp[it["cat"]] + 0.3 * price / max(it["pub"], 1)))
                if isinstance(w, Trader):
                    w.win(it, price, day)
                    continue
                w.W -= price; budget[id(w)] -= price; w.hold[it["cat"]] += 1
                if it["cat"] == w.fav: w.first_got = True
                if w.root == "D":
                    w.pend.append((day + D_DELAY[w.br],
                                   price * (1 + (0.30 if w.br == "D3" else D_MARGIN[w.br])) * rA.uniform(0.9, 1.15)))
        trader.run_end()
        rois.append(trader.roi())
        for k, v in trader.stats.items(): agg[k] += v
    return rois, agg


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=24)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    print(f"거래소 감각 확인: {a.runs}런 | 노브 즉시 {INSTANT} / 세트 ×{SET_MULT} / 떨이 {FIRE} / 제안 P{OFFER_P}·×{OFFER_MULT} | 시드 {a.seed}")
    print(f"{'전략':8s} | ROI 평균 (σ)      | 매입 | 제안 발생/수락 | 제안 수익 비중 | 세트 성공 | 떨이")
    for kind in ("instant", "set", "waiter"):
        rois, g = simulate(a.runs, a.seed, kind)
        mean = sum(rois) / len(rois); sd = statistics.pstdev(rois)
        total_income = g["instant_income"] + g["set_income"] + g["offer_income"] + g["fire_income"]
        share = g["offer_income"] / total_income if total_income else 0
        print(f"{kind:8s} | {mean:+7.1%} ({sd:5.1%}) | {g['bought']/a.runs:4.1f} | "
              f"{g['offers']/a.runs:4.1f} / {g['offer_taken']/a.runs:4.1f}  | {share:8.1%}     | "
              f"{g['sets']/a.runs:4.1f}   | {g['fired']/a.runs:4.1f}")
