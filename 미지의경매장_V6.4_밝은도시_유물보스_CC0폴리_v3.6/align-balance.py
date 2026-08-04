# data/balance.json 을 시뮬레이션이 실제로 쓴 값으로 맞춘다.
# 출처는 rules.js(6절 검산 15건 통과) 와 SIMULATION-STATUS 6절이다.
import io, json, sys, os
sys.stdout.reconfigure(encoding='utf-8')

ROOT = sys.argv[1]
p = os.path.join(ROOT, 'data', 'balance.json')
b = json.load(io.open(p, encoding='utf-8'))
changes = []

def setv(container, key, new, label):
    old = container.get(key)
    if old == new: return
    container[key] = new
    changes.append((label, old, new))

b['status'] = 'aligned-to-simulation'
b['source'] = 'docs/plan/SIMULATION-STATUS.md 6절 · rules.js (6절 검산 15건 통과)'
b['alignedAt'] = '2026-07-30'
b['decidedBy'] = '사용자 — "니가 시뮬레이션 할때 쓴거에 맞춰"'

# 물가. 시뮬레이션은 기저가가 12일 내내 고정이다.
setv(b['run'], 'growth', 1.0, 'run.growth (물가 상승)')
b['run']['growthNote'] = '시뮬레이션은 기저가가 고정이다. 난이도는 물가가 아니라 봇 자본 곡선이 만든다'

# 6.3 감정. 기저가의 3%.
setv(b['appraisal']['rate'], 'quick', 0.03, '감정 약식 비율')
setv(b['appraisal']['rate'], 'precise', 0.09, '감정 정밀 비율')
b['appraisal']['note'] = '6.3 — 약식이 기저가의 3%. 정밀은 3배 값에 오차 0.4배 (정밀 쪽은 6절이 안 정해 파생값이다)'

# 6.11 정보 채널 3종. 당일 총 기저가 대비.
setv(b['informationRate'], 'competitors', 0.010, '정보 · 경쟁자 예산')
setv(b['informationRate'], 'order', 0.005, '정보 · 출품 순서')
setv(b['informationRate'], 'forecast', 0.003, '정보 · 수요 동향')
b['informationRate']['note'] = '6.11 — 경쟁자 예산이 가장 값지다. "딸 수 있나" 를 알아야 감정을 아낀다'

# 6.10 채권.
setv(b['loan'], 'limitFromDisposalValue', 0.6, '채권 한도')
setv(b['loan'], 'repayMultiplier', 1.45, '채권 총상환')
b['loan']['note'] = '6.10 — x1.45 의 일당 이자 13.19% 가 필요 성장률과 거의 같다. 차익이 0에 가까워 "돈 버는 수단" 이 아니라 "유동성 수단" 이 된다'

# 6.6 / 6.9 승급비. 합 34,500.
setv(b['shop'], 'upgradeCost', [0, 7000, 11000, 16500], '승급비')
b['shop']['upgradeCostNote'] = '6.9 의 "승급비 34,500" 과 합이 같다. 6.6 은 곡선 자체를 미결로 두었으므로 이 셋은 잠정이다'

# 6.12 의뢰 5종. 인도형은 시세 배수를 기대 판매가로 환산, 조건형은 정액.
Q = {'designated': 1300, 'multi': 4700, 'bargain': 3000, 'restraint': 1900, 'block': 2500}
for k, v in Q.items():
    key = 'fixedReward' if 'fixedReward' in b['quests'][k] else 'reward'
    setv(b['quests'][k], key, v, '의뢰 보상 · ' + k)
b['quests']['note'] = '6.12 — 난이도비 1.00/1.33/1.67/2.00/3.00 순. 인도형(지정·견제·다중)은 시세 x1.20/1.37/1.70 을 기대 판매가 6,704 로 환산했고 조건형(절제·차익)은 정액이다'

# 6.7 / 6.15 봇. 팩에 없던 항목이라 새로 넣는다.
b['bots'] = {
    'nemesisInitial': 25000, 'growthPerDay': 1.155,
    'capitalFormula': '25000 * 1.155^day  (day 는 1..12. 1일차 28,875 · 12일차 140,904)',
    'bidCapRatio': 0.15, 'drifterRatio': 0.4, 'drifterCount': 2,
    'note': '6.7 · 6.15 — 자본은 플레이어와 무관한 절대값이다. 입찰 상한이 자본의 15% 라 한 물건에 다 못 건다',
}
# 6.13 시세 모형.
b['market'] = {
    'expectedDemand': 1.05, 'indexSd': 0.1065, 'idiosyncraticSd': 0.0870,
    'shockSd': 0.0761, 'phi': 0.7,
    'formula': 'M = 1.05 + beta(등급) * (계열지수 - 1) + N(0, 0.0870)',
    'note': '6.13 — 계열 지수는 AR(1) 평균회귀(phi=0.7)라 런 안에서 E[M]=1.05 가 안 깨진다',
}
# 6.14 손익분기선.
b['breakeven'] = {
    'line': 'basePrice', 'value': 1.0050,
    'formula': 'E[k] x E[M] x (1 - 수수료) = 1.0075 x 1.05 x 0.95',
    'note': '6.14 — 기준가에 사면 본전이다',
}
b['quality']['note'] = '6.2 — 기대값 1.0075 · 표준편차 0.2585. 가중치를 바꿔도 기대값은 1.00 ±0.02 안에 둔다'
b['gradeBetaNote'] = '6.13 — 같은 계열 지수라도 등급이 높을수록 시세가 크게 흔들린다'

io.open(p, 'w', encoding='utf-8', newline='\n').write(json.dumps(b, ensure_ascii=False, indent=2) + '\n')

print('balance.json 을 시뮬레이션 값으로 맞췄다 — 바뀐 것 %d개\n' % len(changes))
for label, old, new in changes:
    print('  %-26s %s  ->  %s' % (label, json.dumps(old, ensure_ascii=False), json.dumps(new, ensure_ascii=False)))
print('\n  새로 넣은 절: bots · market · breakeven')
