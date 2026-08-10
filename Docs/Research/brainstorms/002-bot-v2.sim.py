#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
002-bot-v2.sim.py — V2 봇 트리 봇-전용 경매 시뮬레이터 (브레인스토밍 하네스)

* 게임 코드가 아니다. 002 문서 체인의 설계를 경향·편향 확인용으로 축소 구현한 것.
* 모든 수치는 밸런싱 대상 임시값 (recommendation §6 파라미터 표 기준).
* 단순화 (findings 문서에 명시):
  - 경매 해소를 2위 가격 근사로 처리 (호가 스텝·점프·15초 제한 생략 — 가격 형성엔 2차 효과)
  - 유저 부재 (봇 3좌석만), 상회 단계 1 고정, 숙적·시장 사건·L1/L2 스코프 제외
  - D 환금은 지불가 × (1+마진) × 노이즈로 근사
  - 유찰 물건은 다음 날 1회 재출품 (공시 ×0.9)
실행: python 002-bot-v2.sim.py [--runs 12] [--seed 7]
"""
import random, math, argparse
from collections import defaultdict

CATS = ["도자기", "해양", "서적", "보석", "무구", "회화"]
A_S = 5000.0                      # 단계1 세션 앵커 (임시)
TIER_MULT = {"low": 0.5, "mid": 1.0, "high": 1.8}
DAYS = 10                         # 런 기간 N (임시)
ITEMS_PER_DAY = 6
RHO, LAM = 0.5, 0.75                  # 하루 지출률 / 후반 가속
P = dict(floor=0.35, uplift=1.0, k=0.25, resale=0.95)   # 노브: 시작가 공시배 / 시장축 상향 / 압력 계수 / 유저 환금률(판매층 마찰)
NOISE = 0.30                      # 추정 노이즈 ±30%
FEE = 0.05                        # 거래비용률
CAP_MARKET = 1.5                  # 시장축 캡 (est 배수)
D_MARGIN = {"D1": 0.20, "D2": 0.10, "D3": 0.02}
D_DELAY = {"D1": 2, "D2": 1, "D3": 3}
BRANCHES = {r: [r + str(i) for i in (1, 2, 3)] for r in "ABCD"}


def make_item(rng, iid):
    tier = rng.choices(["low", "mid", "high"], [0.4, 0.4, 0.2])[0]
    V = A_S * TIER_MULT[tier] * rng.uniform(0.55, 1.6)      # 실가치 (봇 비공개)
    return dict(id=iid, V=V, tier=tier, cat=rng.choice(CATS),
                link=rng.randrange(8) if rng.random() < 0.2 else None,
                sents=rng.randint(0, 3),
                pub=V * rng.uniform(0.8, 1.2),               # 공시 범위 중앙 (유저용 — 봇 비참조)
                re=0)


class Bot:
    def __init__(self, rng, branch, regular, wallet):
        self.br, self.root = branch, branch[0]
        self.regular = regular                # 단골 여부
        self.W = wallet
        self.fav = rng.choice(CATS)           # 관심 계열
        self.link = rng.randrange(8)          # B2용 링크
        self.hold = defaultdict(int)          # 계열별 보유
        self.spent = self.won = 0
        self.pend = []                        # D 환금 대기 [(day, 금액)]
        self.saj = []                         # 사정축 [(type, key, 절대액, 기한)]
        self.first_got = False                # B3 첫 조각

    def est(self, item, rng):
        return item["V"] * rng.uniform(1 - NOISE, 1 + NOISE)

    def market_axis(self, it, est, ctx):
        b = self.br
        if b == "A1": m = est
        elif b == "A2": m = est * (1.1 if it["tier"] == "high" else 0.8)
        elif b == "A3":
            m = min(est, 1.2 * A_S)
            if ctx["rival_avg_W"] < self.W: m = est            # 상한 해제
            if ctx["rival_hold"][it["cat"]] >= 2: m *= 1.1     # 견제
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
        else:  # D
            mg = D_MARGIN[b]
            if b == "D3":
                mg = 0.02 if it["cat"] == self.fav else 0.55   # 지정 계열 외 무관심
            t_c = ctx["cat_temp"][it["cat"]]
            m = est * t_c * (1 - mg) * (1 - FEE)
        return min(m * P["uplift"], est * CAP_MARKET)

    def private_axis(self, it, day):
        best = 0.0
        for typ, key, amt, dl in self.saj:
            hit = (typ == "item" and key == it["id"]) or \
                  (typ == "cat" and key == it["cat"]) or \
                  (typ == "link" and key == it["link"])
            if not hit: continue
            v = amt
            if dl is not None and dl - 2 <= day <= dl: v *= 1.3   # 기한 임박 과열
            if dl is not None and day > dl: v = 0                  # 기한 만료
            best = max(best, v)
        return best

    def plan(self, it, ctx, rng):
        est = self.est(it, rng)
        mp = max(self.market_axis(it, est, ctx), self.private_axis(it, ctx["day"]))
        slack = ctx["budget_left"] - ctx["items_left"] * 0.6 * A_S    # 세션 소진 압력
        if slack > 0: mp += slack / max(ctx["items_left"], 1) * P["k"]
        return min(mp, ctx["budget_left"], self.W)


class Proxy:
    """유저 전략 프록시 — 4번째 좌석. 낙찰품은 다음 날 실가치×0.95로 환금(판매층 근사)."""
    def __init__(self, rng, kind):
        self.kind, self.rng = kind, rng
        self.W0 = self.W = ITEMS_PER_DAY * A_S * 0.7
        self.spent = self.wins = 0; self.pend = []
    def plan(self, it):
        est = it["V"] * self.rng.uniform(0.8, 1.2)            # 유저 추정 ±20% (감정 반영 임시)
        if self.kind == "blind":  mp = it["pub"] * 1.1        # 무지성: 뭐든 공시 1.1배까지
        elif self.kind == "fair": mp = est * 0.95             # 공정가 매수
        else:                                                  # sniper: 저평가로 보일 때만
            mp = est * 0.9 if est > it["pub"] * 1.25 else 0.0
        return min(mp, self.W)
    def win(self, it, price, day):
        self.W -= price; self.spent += price; self.wins += 1
        self.pend.append((day + 1, it["V"] * P["resale"]))
    def tick(self, day):
        arrived = sum(a for d, a in self.pend if d <= day)
        self.pend = [(d, a) for d, a in self.pend if d > day]; self.W += arrived
    def wealth(self): return self.W + sum(a for _, a in self.pend)


def assign_sajeong(rng, cast, catalog):
    for b in cast:
        if b.root == "B":
            tgt = rng.choice(catalog)
            b.saj.append(("item", tgt["id"], A_S * rng.uniform(1, 3), None))     # 지정형
            b.saj.append(("cat", b.fav, A_S * rng.uniform(0.8, 2), None))        # 조건형
            if b.br == "B2":
                b.saj.append(("link", b.link, A_S * rng.uniform(1, 2.5), None))
        elif rng.random() < 0.5:
            b.saj.append(("cat", rng.choice(CATS), A_S * rng.uniform(0.8, 2.5), None))
    dead = rng.choice([b for b in cast if b.root != "B"])                        # 기한형(납기 상인) 1인
    dead.saj.append(("cat", rng.choice(CATS), A_S * rng.uniform(1.2, 2.2), rng.randint(3, DAYS - 1)))


def simulate(runs, seed, sajeong_on, proxy_kind=None):
    rng = random.Random(seed)
    log = []                                  # 판별 레코드
    wallet_end = defaultdict(list)
    proxy_roi = []
    for _ in range(runs):
        proxy = Proxy(rng, proxy_kind) if proxy_kind else None
        cast = [Bot(rng, rng.choice(BRANCHES[r]), True, ITEMS_PER_DAY * A_S * 0.7) for r in "ABCD"]
        catalog = [make_item(rng, i) for i in range(DAYS * ITEMS_PER_DAY)]
        if sajeong_on: assign_sajeong(rng, cast, catalog)
        ratios, queue = [], list(catalog)
        cat_temp = defaultdict(lambda: 1.0); pass_streak = 0
        cat_left = defaultdict(int)
        for it in catalog: cat_left[it["cat"]] += 1
        for day in range(1, DAYS + 1):
            if proxy: proxy.tick(day)
            for b in cast:                                    # D 환금 도착
                b.pend, arrived = [(d, a) for d, a in b.pend if d > day], sum(a for d, a in b.pend if d <= day)
                b.W += arrived
            today, queue = queue[:ITEMS_PER_DAY], queue[ITEMS_PER_DAY:]
            r1, r2 = rng.sample(cast, 2)
            while r2.root == r1.root: r2 = rng.choice(cast)
            drift_root = rng.choice([r for r in "ABCD" if r not in (r1.root, r2.root)])
            drifter = Bot(rng, rng.choice(BRANCHES[drift_root]), False, ITEMS_PER_DAY * A_S * 0.35)
            if sajeong_on and rng.random() < 0.4:
                drifter.saj.append(("cat", rng.choice(CATS), A_S * rng.uniform(0.6, 1.8), None))
            seats = [r1, r2, drifter]
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
                    mp = b.plan(it, ctx, rng)
                    if mp >= floor: bids.append((mp, rng.random(), b))
                if proxy:
                    pmp = proxy.plan(it)
                    if pmp >= floor: bids.append((pmp, rng.random(), proxy))
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
                if isinstance(w, Proxy):
                    w.win(it, price, day)
                    ratios.append(price / max(it["pub"], 1))
                    cat_temp[it["cat"]] = max(0.8, min(1.3, 0.7 * cat_temp[it["cat"]] + 0.3 * price / max(it["pub"], 1)))
                    log.append(dict(V=it["V"], price=price, pub=it["pub"], nbid=len(bids), root="P",
                                    br="P", reg=False, tier=it["tier"], overV=price / it["V"]))
                    continue
                w.W -= price; w.spent += price; w.won += 1
                budget[id(w)] -= price; w.hold[it["cat"]] += 1
                if it["cat"] == w.fav: w.first_got = True
                if w.root == "D":
                    w.pend.append((day + D_DELAY[w.br],
                                   price * (1 + (0.30 if w.br == "D3" else D_MARGIN[w.br])) * rng.uniform(0.9, 1.15)))
                ratios.append(price / max(it["pub"], 1))
                cat_temp[it["cat"]] = max(0.8, min(1.3, 0.7 * cat_temp[it["cat"]] + 0.3 * price / max(it["pub"], 1)))
                log.append(dict(V=it["V"], price=price, pub=it["pub"], nbid=len(bids), root=w.root,
                                br=w.br, reg=w.regular, tier=it["tier"], overV=price / it["V"]))
        for b in cast:
            wallet_end[b.root].append((b.W - sum(a for _, a in b.pend)) / (ITEMS_PER_DAY * A_S * 0.7))
        if proxy: proxy_roi.append((proxy.wealth() - proxy.W0) / proxy.W0)
    return log, wallet_end, proxy_roi


def pearson(xs, ys):
    n = len(xs); mx, my = sum(xs) / n, sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = math.sqrt(sum((x - mx) ** 2 for x in xs)); vy = math.sqrt(sum((y - my) ** 2 for y in ys))
    return cov / (vx * vy) if vx and vy else 0.0


def report(tag, log, wend):
    total = len(log)
    print(f"\n===== {tag} : 낙찰 {total}건 =====")
    by = defaultdict(list)
    for r in log: by[r["root"]].append(r)
    print("뿌리  승수   승률    평균 낙찰가/실가치   평균 경합자")
    for r in "ABCD":
        g = by[r]
        if not g: continue
        print(f"  {r}   {len(g):4d}  {len(g)/total:5.1%}      {sum(x['overV'] for x in g)/len(g):5.2f}            "
              f"{sum(x['nbid'] for x in g)/len(g):4.2f}")
    ov = [r["overV"] for r in log]
    ov.sort()
    print(f"전체 낙찰가/실가치: 평균 {sum(ov)/total:.2f} / 중앙 {ov[total//2]:.2f} / "
          f"실가치 미만 낙찰 비율 {sum(1 for x in ov if x < 1)/total:.1%}")
    cont = [r for r in log if r["nbid"] >= 2]
    print(f"경합(2인 이상) 비율 {len(cont)/total:.1%} | "
          f"원시 상관 corr(낙찰가, 실가치) 전체 {pearson([r['price'] for r in log],[r['V'] for r in log]):.3f} / "
          f"경합만 {pearson([r['price'] for r in cont],[r['V'] for r in cont]):.3f}")
    # 진짜 누설 = 공개 정보(공시 중앙 pub)를 통제한 뒤에도 남는 상관.
    # 유저는 pub을 이미 보므로, 봇 행동이 pub 이상으로 실가치를 드러내는 만큼만 누설이다.
    resid = pearson([r["price"] / r["pub"] for r in cont], [r["V"] / r["pub"] for r in cont])
    print(f"공시 통제 누설 상관 corr(낙찰가/공시, 실가치/공시) 경합만: {resid:.3f}")
    print("런 종료 지갑/초기 (뿌리별 평균, D는 환금 미도착 제외):",
          " ".join(f"{r}={sum(w)/len(w):.2f}" for r, w in sorted(wend.items())))
    brs = defaultdict(list)
    for r in log: brs[r["br"]].append(r["overV"])
    print("브랜치 승수:", " ".join(f"{b}:{len(v)}" for b, v in sorted(brs.items())))
    print(f"단골 승률 {sum(1 for r in log if r['reg'])/total:.1%} (좌석 2/3 기준 기대 66.7%)")


def proxy_line(kind, log, roi):
    p = [r for r in log if r["root"] == "P"]
    bots = [r for r in log if r["root"] != "P"]
    avg = lambda xs: sum(xs) / len(xs) if xs else float("nan")
    print(f"  {kind:6s} | ROI {avg(roi):+7.1%} | 낙찰 {len(p):3d}건 ({len(p)/len(log):5.1%}) "
          f"| 평균 매입가/실가치 {avg([r['overV'] for r in p]):5.2f} "
          f"| 봇 낙찰가/실가치 {avg([r['overV'] for r in bots]):5.2f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=12)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--mode", choices=["base", "proxy", "sweep"], default="base")
    ap.add_argument("--floor", type=float); ap.add_argument("--uplift", type=float); ap.add_argument("--k", type=float)
    ap.add_argument("--resale", type=float)
    a = ap.parse_args()
    for name in ("floor", "uplift", "k", "resale"):
        if getattr(a, name) is not None: P[name] = getattr(a, name)
    print(f"설정: {a.runs}런 × {DAYS}일 × {ITEMS_PER_DAY}물건 = 출품 {a.runs*DAYS*ITEMS_PER_DAY}건 | 노브 {P}")

    if a.mode == "base":
        for tag, on in [("사정축 ON (2축 가치)", True), ("사정축 OFF (est 앵커만 — 대조군)", False)]:
            log, wend, _ = simulate(a.runs, a.seed, on)
            report(tag, log, wend)
    elif a.mode == "proxy":
        print("유저 전략 프록시 (4번째 좌석, 낙찰품은 실가치×0.95 환금):")
        for kind in ("blind", "fair", "sniper"):
            log, _, roi = simulate(a.runs, a.seed, True, kind)
            proxy_line(kind, log, roi)
    else:  # sweep
        print("노브 스윕 (봇만, 사정축 ON) — 목표: 봇 낙찰가/실가치 0.85~0.95")
        print("floor uplift  k    | 평균P/V  실가치미만%  유찰재출품비  D승률")
        for fl in (0.35, 0.5, 0.6):
            for up in (1.0, 1.15, 1.3):
                P.update(floor=fl, uplift=up)
                log, _, _ = simulate(a.runs, a.seed, True)
                pv = sum(r["overV"] for r in log) / len(log)
                under = sum(1 for r in log if r["overV"] < 1) / len(log)
                dsh = sum(1 for r in log if r["root"] == "D") / len(log)
                fail = 1 - len(log) / (a.runs * DAYS * ITEMS_PER_DAY)
                print(f" {fl:.2f}  {up:.2f}  {P['k']:.2f} |  {pv:5.2f}    {under:5.1%}      {fail:5.1%}    {dsh:5.1%}")
