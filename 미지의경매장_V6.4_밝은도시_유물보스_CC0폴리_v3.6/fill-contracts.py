# 툴 출력형 v1.5 의 데이터 계약을 채운다.
# 원칙: v1.5 가 이미 정한 값은 그대로 쓴다. 6절과 갈리는 자리는 덮지 않고 divergesFrom 으로 표시한다.
import io, json, sys, os
sys.stdout.reconfigure(encoding='utf-8')

SRC = sys.argv[1]
OUT = sys.argv[2]

flow = json.load(io.open(os.path.join(SRC, 'flow.json'), encoding='utf-8'))

# ── 시스템 15. 씬 묶음이 아니라 "누가 이 값을 쓰는가" 로 가른다.
SYSTEMS = [
    ('sys-run', '여정 · 저장', '12일 여정의 생애와 슬롯 저장을 맡는다'),
    ('sys-city', '도시 이동', '거점 7곳 사이의 이동과 페이즈'),
    ('sys-quest', '의뢰', '지정 · 다중 · 차익 · 절제 · 견제 다섯. 축이 갈려 동시 수행이 제한된다'),
    ('sys-appraisal', '감정', '숨은 품질의 범위를 좁힌다. 값을 사는 행동이다'),
    ('sys-information', '정보 채널', '시장 예보 · 출품 순서 · 경쟁자 예산 · 유물 정보'),
    ('sys-auction', '경매 진행', '하루 8점을 공개 호가로 붙인다'),
    ('sys-bots', '경쟁자', '숙적 베넷 상시 + 뜨내기 2인 교체. 자금은 플레이어와 무관한 절대값이다'),
    ('sys-inventory', '보유 · 처분', '보관칸이 한도다. 담보로 잡히면 잠긴다'),
    ('sys-set', '세트 계약', '같은 물건을 의뢰와 세트에 두 번 못 쓴다'),
    ('sys-loan', '채권', '재고를 담보로 잡는다. 현금은 담보가 아니다'),
    ('sys-shop', '상회', '단계는 의무다. 기한까지 못 올리면 게임 오버'),
    ('sys-market', '시세', '계열별 지수가 처분가를 흔든다'),
    ('sys-relic', '유물 경매 · 전시관', '12일차 이후. 거물 3인은 절대 자금이다'),
    ('sys-meta', '영구 · 캠페인', '여정을 넘어 남는 것'),
    ('sys-ui', '설정 · 모달 · 튜토리얼', '판정에 안 들어가는 표시 계층'),
]

# ── 타입. 필드는 실제 구현과 V5 문서에서 왔다.
TYPES = [
    ('Lot', '출품 물건', ['id', 'order', 'name', 'family', 'grade', 'basePrice(공개)', 'startingPrice(공개)',
                        'quality(감춤)', 'appraisal', 'wonBy', 'finalPrice'],
     '기저가는 공개, 품질은 감춤. 그 차이가 정보의 값어치다'),
    ('Bot', '일반 경매 경쟁자', ['id', 'name', 'nemesis', 'target', 'cash(감춤)', 'bidCap', 'passed', 'spent'],
     '자금은 경쟁자 정보 채널로만 보인다'),
    ('Tycoon', '유물 경매 거물', ['id', 'name', 'cash', 'intent', 'alloc[3]', 'passed', 'spent'],
     '플레이어 자금과 무관한 절대값. 여정 시작 시 생성되어 저장된다'),
    ('Appraisal', '감정 결과', ['type(quick|deep)', 'low', 'high', 'cost'], '범위이지 확정값이 아니다'),
    ('InventoryItem', '보유품', ['...Lot', 'buyPrice', 'fee', 'acquiredDay', 'locked', 'sold', 'seized'],
     'locked 는 담보로 잡힌 상태다 - 팔 수 없다'),
    ('Quest', '의뢰', ['id', 'name', 'fee', 'reward', 'targetFamily', 'targetBot', 'acceptedDay', 'completed'],
     '인도형은 물건을 넘기고 조건형은 안 넘긴다'),
    ('SetContract', '세트 계약', ['id', 'name', 'mult', 'need', 'acceptedDay', 'deadline', 'completed'],
     '기한이 있다. 못 채우면 소멸한다'),
    ('Loan', '담보 대출', ['principal', 'repay', 'dueDay', 'collateralId'], '담보는 재고다'),
    ('Relic', '유물', ['id', 'tier(low|mid|high)', 'name', 'desc', 'icon'], '영구 효과다'),
    ('MarketEvent', '시장 사건', ['day', 'family', 'delta', 'text'], '하루에 한 계열을 흔든다'),
    ('SaveSlot', '저장 슬롯', ['slot', 'day', 'cash', 'shopStage', 'savedAt'], ''),
    ('BidLogEntry', '입찰 기록', ['bidder', 'amount', 'text'], ''),
    ('AuctionResult', '출품 결과', ['lotId', 'name', 'winner', 'price', 'fee'], ''),
    ('Ending', '종료', ['type', 'reason'], '파산 · 개시 마감 · 유물 경매 빈손 · 여정 성공'),
    ('Settings', '설정', ['contrast', 'textScale', 'tutorial', 'qa'], ''),
]

# ── 데이터 경로 75. (타입, 소유 시스템, 출처, 주석)
# 출처 engine = 프로그램이 만든다 · derived = 다른 경로에서 파생 · user = 플레이어 입력
D = {
 'run.scene': ('String', 'sys-run', 'engine', '현재 씬 id. 전이의 결과이지 원인이 아니다'),
 'run.day': ('Number', 'sys-run', 'engine', '1~12. 감정 정밀도·봇 자금·물가가 전부 이 값에서 파생된다'),
 'run.totalDays': ('Number', 'sys-run', 'engine', '12 고정'),
 'run.slot': ('Number', 'sys-run', 'user', '저장 슬롯 3개 중 하나'),
 'run.ended': ('Boolean', 'sys-run', 'engine', ''),
 'run.ending.type': ('String', 'sys-run', 'engine', '파산 · 개시 마감 · 유물 경매 빈손 · 여정 성공'),
 'run.ending.reason': ('String', 'sys-run', 'engine', '사람이 읽는 사유. 판정에 쓰지 않는다'),
 'run.startCash': ('Number', 'sys-run', 'engine', '20,000G. 절제 의뢰의 기준이라 여정 내내 불변이어야 한다'),
 'player.cash': ('Number', 'sys-inventory', 'engine', '0 이하면 파산(sys-run 이 판정)'),
 'player.inventory': ('InventoryItem[]', 'sys-inventory', 'engine', 'locked 인 것은 담보라 못 판다'),
 'player.storageCapacity': ('Number', 'sys-inventory', 'derived', 'shop.stage 에서 파생. 4 / 5 / 6 / 7'),
 'shop.stage': ('Number', 'sys-shop', 'engine', '1~4. 수수료 5→3→1→0% · 정보할인·세트배수·의뢰보상이 전부 여기서 파생된다'),
 'shop.displayName': ('String', 'sys-shop', 'derived', '표시용'),
 'shop.completedQuestsTotal': ('Number', 'sys-quest', 'engine', '승급 자격 조건. 누적이라 줄지 않는다'),
 'shop.upgradeCost': ('Number', 'sys-shop', 'derived', '7,000 / 11,000 / 16,500 (합 34,500, 6.9). 6.6 이 곡선 자체는 미결로 두었으므로 잠정이다'),
 'shop.deadlineRequiredStage': ('Number', 'sys-shop', 'derived', 'run.day 에서 파생. 4일차 전 2단계 · 7일차 전 3단계 · 10일차 전 4단계'),
 'daily.phase': ('String', 'sys-city', 'engine', 'city | auction | settlement'),
 'daily.event': ('MarketEvent', 'sys-market', 'engine', '오늘 한 계열을 흔든다'),
 'daily.lots': ('Lot[]', 'sys-auction', 'engine', '8점. 기저가는 12일 내내 고정이다 - 난이도는 물가가 아니라 봇 자본 곡선이 만든다'),
 'daily.lotIndex': ('Number', 'sys-auction', 'engine', '0~8. 8이면 하루 경매가 끝났다'),
 'daily.acceptedQuests': ('Quest[]', 'sys-quest', 'engine', '축이 갈려 절반이 서로 충돌한다'),
 'daily.appraisals': ('Map<lotId, Appraisal>', 'sys-appraisal', 'engine', '범위다. 확정 품질이 아니다'),
 'daily.info': ('Map<channel, Boolean>', 'sys-information', 'engine', '오늘 산 채널'),
 'daily.contractOffers': ('SetContract[]', 'sys-set', 'engine', ''),
 'daily.auctionResults': ('AuctionResult[]', 'sys-auction', 'engine', ''),
 'daily.expense': ('Number', 'sys-inventory', 'engine', '절제 의뢰의 판정 입력'),
 'daily.income': ('Number', 'sys-inventory', 'engine', ''),
 'daily.settlement': ('Boolean', 'sys-run', 'engine', '12일차에만 열린다'),
 'market.indexByFamily': ('Map<family, Number>', 'sys-market', 'engine', '계열 6종. AR(1) 평균회귀 phi=0.7 · 충격 sd 0.0761 (6.13)'),
 'market.schedule': ('MarketEvent[]', 'sys-market', 'engine', '12일치. 여정 시작 시 생성되어 고정된다'),
 'market.history': ('Number[][]', 'sys-market', 'engine', '수요 동향 채널이 읽는다'),
 'auction.currentLot': ('Lot', 'sys-auction', 'derived', 'daily.lots[daily.lotIndex]'),
 'auction.currentBid': ('Number', 'sys-auction', 'engine', '낙찰가는 플레이어가 쓴 값이 아니라 이 값이다'),
 'auction.minimumRaise': ('Number', 'sys-auction', 'derived', 'currentBid 에서 파생. 공개 호가의 그라인딩 문제가 여기 걸려 있다'),
 'auction.leader': ('String', 'sys-auction', 'engine', "'player' 또는 봇 id"),
 'auction.playerPassed': ('Boolean', 'sys-auction', 'engine', '한 번 물러나면 이 출품에는 다시 못 붙는다'),
 'auction.bidLog': ('BidLogEntry[]', 'sys-auction', 'engine', '패찰 사유를 사람이 알 수 있게 하는 유일한 자리다'),
 'auction.bots': ('Bot[]', 'sys-bots', 'engine', '숙적 1 + 뜨내기 2. 숙적 자본 = 25,000 x 1.155^day (1일차 28,875 · 12일차 140,904). 입찰 상한은 자본의 15%'),
 'auction.lastResult': ('AuctionResult', 'sys-auction', 'engine', '출품 결과 팝업이 읽는다'),
 'quests.available': ('Quest[]', 'sys-quest', 'engine', '하루 3종(왕실 인가장이 있으면 5종)'),
 'quests.progress': ('Map<questId, Number>', 'sys-quest', 'engine', '경매 중 실시간 갱신'),
 'quests.results': ('Object[]', 'sys-quest', 'engine', '하루 끝 판정'),
 'information.marketForecast': ('Object', 'sys-information', 'engine', '앞으로 3일 사건 방향'),
 'information.lotOrder': ('Boolean', 'sys-information', 'engine', '오늘 8점의 순서를 미리 본다'),
 'information.competitors': ('Object', 'sys-information', 'engine', '봇 예산·표적. **"딸 수 있나"를 알아야 감정을 아낀다**(6.11)'),
 'information.relicClues': ('Object[]', 'sys-information', 'engine', '거물 3인의 자금 범위'),
 'contracts.active': ('SetContract[]', 'sys-set', 'engine', ''),
 'contracts.deadline': ('Number', 'sys-set', 'derived', '수주일 + 2, 12 를 넘지 않는다'),
 'loan.principal': ('Number', 'sys-loan', 'engine', '담보 처분가의 60%(6.10). 현금은 담보가 아니다'),
 'loan.repay': ('Number', 'sys-loan', 'derived', '원금 x 1.45(6.10). 일당 이자 13.19% 가 필요 성장률과 거의 같아 차익이 0에 가깝다 - 돈 버는 수단이 아니라 유동성 수단이다'),
 'loan.dueDay': ('Number', 'sys-loan', 'derived', '실행일 + 3'),
 'loan.collateralId': ('String', 'sys-loan', 'engine', '이 보유품이 locked 가 된다'),
 'loan.guildLocked': ('Boolean', 'sys-loan', 'engine', '미상환 이후 조합 거래 제한'),
 'loan.collateralDisposalValue': ('Number', 'sys-loan', 'derived', '한도 계산의 입력. 화면 표시와 실제 계산이 같은 값을 써야 한다'),
 'competitor.bennett': ('Bot', 'sys-bots', 'engine', '런 내내 같은 인물. 교체되지 않는다'),
 'competitor.bennettRumor': ('String', 'sys-bots', 'engine', '**소문이 없으면 갑자기 낙찰이 안 되는 이유를 알 수 없다**(6.15)'),
 'competitor.tycoons': ('Tycoon[]', 'sys-relic', 'engine', '여정 시작 시 생성·저장. 플레이어 자금과 무관하다'),
 'relicAuction.round': ('Number', 'sys-relic', 'engine', '0~2. 하급 · 중급 · 상급'),
 'relicAuction.currentBid': ('Number', 'sys-relic', 'engine', ''),
 'relicAuction.currentRelic': ('Relic', 'sys-relic', 'engine', ''),
 'relicAuction.bidLog': ('BidLogEntry[]', 'sys-relic', 'engine', ''),
 'relicAuction.wins': ('Relic[]', 'sys-relic', 'engine', '빈손이면 여정 실패다'),
 'meta.relics': ('String[]', 'sys-meta', 'engine', '여정을 넘어 남는다'),
 'meta.carry': ('Number', 'sys-meta', 'engine', '이월률 40%(대상인의 금고가 있으면 60%)'),
 'meta.runs': ('Number', 'sys-meta', 'engine', ''),
 'campaign.journeyIndex': ('Number', 'sys-meta', 'engine', '3여정 캠페인의 순번'),
 'campaign.highTierWins': ('Number', 'sys-meta', 'engine', ''),
 'campaign.status': ('String', 'sys-meta', 'engine', ''),
 'settings.contrast': ('Boolean', 'sys-ui', 'user', ''),
 'settings.textScale': ('Number', 'sys-ui', 'user', ''),
 'settings.tutorial': ('Boolean', 'sys-ui', 'user', ''),
 'settings.qa': ('Boolean', 'sys-ui', 'user', ''),
 'ui.lastMessage': ('String', 'sys-ui', 'engine', '실패 사유. 판정에 쓰지 않는다'),
 'ui.modal': ('String', 'sys-ui', 'engine', '열린 모달 id'),
 'tutorial.step': ('Number', 'sys-ui', 'engine', ''),
}

# ── 행동 48 의 읽기 · 쓰기. 이게 없으면 계약이 그림이다.
A = {
 'act-start-new-run': (['run.slot'], ['run.scene','run.day','run.totalDays','run.startCash','player.cash','shop.stage','shop.displayName','market.schedule','market.history','competitor.bennett','competitor.tycoons','run.ended']),
 'act-open-continue': ([], ['run.scene']),
 'act-load-save': (['run.slot'], ['run.scene','run.day','player.cash','player.inventory','shop.stage','market.indexByFamily','competitor.bennett']),
 'act-delete-save': (['run.slot'], []),
 'act-save-game': (['run.day','player.cash','player.inventory','shop.stage'], ['run.slot']),
 'act-open-settings': (['settings.contrast','settings.textScale','settings.tutorial','settings.qa'], ['ui.modal']),
 'act-apply-settings': ([], ['settings.contrast','settings.textScale','settings.tutorial','settings.qa','ui.modal']),
 'act-exit-game': ([], []),
 'act-complete-loading': (['run.day'], ['run.scene','daily.phase','daily.lots','daily.event','quests.available','daily.contractOffers','auction.bots']),
 'act-enter-office': (['daily.phase'], ['run.scene']),
 'act-enter-tavern': (['daily.phase'], ['run.scene']),
 'act-enter-exchange': (['daily.phase'], ['run.scene']),
 'act-enter-guild': (['daily.phase','loan.guildLocked'], ['run.scene']),
 'act-enter-merchant': (['daily.phase'], ['run.scene']),
 'act-enter-auction': (['daily.phase','daily.lots'], ['run.scene','daily.phase','daily.lotIndex','auction.currentLot','auction.currentBid','auction.bots']),
 'act-enter-museum': (['meta.relics'], ['run.scene']),
 'act-return-city': ([], ['run.scene']),
 'act-switch-office-tab': ([], ['ui.modal']),
 'act-accept-quest': (['quests.available','player.cash'], ['daily.acceptedQuests','player.cash','daily.expense']),
 'act-appraise-lot': (['auction.currentLot','player.cash','run.day','shop.stage'], ['daily.appraisals','player.cash','daily.expense']),
 'act-buy-market-forecast': (['player.cash','daily.lots','shop.stage'], ['information.marketForecast','daily.info','player.cash','daily.expense']),
 'act-buy-lot-order': (['player.cash','daily.lots','shop.stage'], ['information.lotOrder','daily.info','player.cash','daily.expense']),
 'act-buy-competitor-info': (['player.cash','daily.lots','shop.stage','auction.bots'], ['information.competitors','daily.info','player.cash','daily.expense']),
 'act-buy-relic-clue': (['player.cash','competitor.tycoons'], ['information.relicClues','daily.info','player.cash','daily.expense']),
 'act-switch-exchange-tab': ([], ['ui.modal']),
 'act-sell-immediate': (['player.inventory','market.indexByFamily'], ['player.cash','player.inventory','daily.income']),
 'act-accept-set-contract': (['daily.contractOffers','run.day'], ['contracts.active','contracts.deadline']),
 'act-fulfill-set-contract': (['contracts.active','player.inventory','shop.stage','market.indexByFamily'], ['player.cash','player.inventory','contracts.active','daily.income']),
 'act-finish-settlement': (['player.inventory','market.indexByFamily'], ['player.cash','player.inventory','daily.settlement','run.scene']),
 'act-take-loan': (['player.inventory','run.day'], ) if False else (['player.inventory','run.day'], ['loan.principal','loan.repay','loan.dueDay','loan.collateralId','loan.collateralDisposalValue','player.cash','player.inventory','daily.income']),
 'act-repay-loan': (['loan.repay','player.cash'], ['player.cash','loan.principal','loan.repay','loan.dueDay','loan.collateralId','player.inventory','daily.expense']),
 'act-process-loan-due': (['loan.dueDay','run.day','player.cash','loan.collateralId'], ['player.inventory','loan.guildLocked','loan.principal','run.ended','run.ending.type','run.ending.reason']),
 'act-upgrade-shop': (['player.cash','shop.upgradeCost','shop.completedQuestsTotal','shop.stage','shop.deadlineRequiredStage'], ['shop.stage','shop.displayName','player.cash','player.storageCapacity','daily.expense']),
 'act-place-bid': (['auction.currentBid','auction.minimumRaise','auction.playerPassed','player.cash','player.inventory','player.storageCapacity','shop.stage'], ['auction.currentBid','auction.minimumRaise','auction.leader','auction.bidLog']),
 'act-pass-lot': ([], ['auction.playerPassed','auction.bidLog']),
 'act-run-bot-turn': (['auction.bots','auction.currentLot','auction.currentBid','auction.minimumRaise','competitor.bennett'], ['auction.currentBid','auction.leader','auction.bidLog','auction.bots']),
 'act-finalize-lot': (['auction.leader','auction.currentBid','auction.currentLot','shop.stage','player.cash'], ['player.cash','player.inventory','daily.auctionResults','daily.expense','auction.lastResult','quests.progress']),
 'act-next-lot': (['daily.lotIndex','daily.lots'], ['daily.lotIndex','auction.currentLot','auction.currentBid','auction.leader','auction.playerPassed','auction.bidLog']),
 'act-next-day': (['run.day','shop.stage','shop.deadlineRequiredStage','player.cash','daily.acceptedQuests','loan.dueDay'], ['run.day','daily.phase','daily.lots','daily.event','market.indexByFamily','quests.results','shop.completedQuestsTotal','run.ended','run.ending.type','run.ending.reason','market.history','shop.deadlineRequiredStage','auction.bots','competitor.bennettRumor']),
 'act-open-day12-settlement': (['run.day','player.inventory'], ['daily.settlement','run.scene']),
 'act-check-final-qualification': (['player.cash','loan.principal','shop.stage','run.totalDays'], ['run.scene','run.ended','run.ending.type','run.ending.reason']),
 'act-start-relic-auction': (['competitor.tycoons','meta.relics'], ['relicAuction.round','relicAuction.currentRelic','relicAuction.currentBid','run.scene']),
 'act-place-relic-bid': (['relicAuction.currentBid','player.cash'], ['relicAuction.currentBid','relicAuction.bidLog']),
 'act-pass-relic': ([], ['relicAuction.bidLog']),
 'act-run-tycoon-turn': (['competitor.tycoons','relicAuction.currentBid','relicAuction.round'], ['relicAuction.currentBid','relicAuction.bidLog','competitor.tycoons']),
 'act-next-relic-round': (['relicAuction.round','relicAuction.currentBid','relicAuction.currentRelic'], ['relicAuction.round','relicAuction.wins','relicAuction.currentRelic','relicAuction.currentBid','relicAuction.bidLog']),
 'act-finish-relic-auction': (['relicAuction.wins','player.cash'], ['meta.relics','meta.carry','meta.runs','campaign.highTierWins','run.ended','run.ending.type','run.ending.reason','run.scene']),
 'act-start-next-journey': (['meta.relics','meta.carry','campaign.journeyIndex'], ['campaign.journeyIndex','campaign.status','run.scene','player.cash']),
}

# ── 핀에 붙일 데이터. 행동이 있으면 그 행동의 읽기를 물려주고, 표시용 핀은 직접 준다.
PIN_DATA = {
 'title-continue': ['run.slot'], 'continue-back': [], 'continue-settings': ['settings.contrast'],
 'continue-slots': ['run.slot','run.day','player.cash','shop.stage'],
 'loading-progress': ['run.scene','run.day'],
 'result-title': ['meta.relics','meta.carry'],   # 타이틀로 갈 때 유지되는 것을 가리킨다
}

def norm(v):
    return sorted(set(x for x in v if x))

# 1. dataPaths 를 채운다
filled = 0
unknown = []
for d in flow['dataPaths']:
    p = d['path']
    if p not in D:
        unknown.append(p); continue
    t, owner, src, note = D[p]
    d['typeRef'] = t; d['ownerSystemRef'] = owner; d['sourceMode'] = src
    if note: d['notes'] = note
    filled += 1

# 2. actions 에 읽기·쓰기를 넣는다
aFilled = 0
aUnknown = []
for a in flow['actions']:
    if a['id'] not in A:
        aUnknown.append(a['id']); continue
    r, w = A[a['id']]
    a['readRefs'] = norm(r); a['writeRefs'] = norm(w)
    aFilled += 1

# 3. 핀의 빈 dataRefs 를 채운다. 행동이 있으면 그 행동의 읽기를 물려준다.
byAction = {a['id']: a for a in flow['actions']}
pinFilled = 0
pinStill = []
targets = [(n['id'], a) for n in flow['nodes'] for a in n.get('annotations', [])]
targets += [(u['id'], a) for u in flow.get('uiStates', []) for a in u.get('annotations', [])]
for owner, a in targets:
    if a.get('dataRefs'): continue
    refs = PIN_DATA.get(a['id'])
    if refs is None:
        act = byAction.get(a.get('actionRef') or '')
        refs = act.get('readRefs', []) if act else None
    if refs is None: pinStill.append(owner + '/' + a['id']); continue
    a['dataRefs'] = refs
    if refs: pinFilled += 1

# 4. Visual Spec Lite 가 읽는 contracts 등록소를 만든다
contracts = {
  'systems': [{'id': i, 'title': t, 'description': d} for i, t, d in SYSTEMS],
  'types': [{'id': i, 'title': t, 'description': d, 'fields': f} for i, t, f, d in TYPES],
  'data': [{'id': d['path'], 'title': d['label'], 'typeRef': d.get('typeRef', ''),
            'sourceMode': d.get('sourceMode', 'engine'), 'ownerSystemRef': d.get('ownerSystemRef', ''),
            'generatorRef': '', 'description': d.get('notes', '')} for d in flow['dataPaths']],
  'actions': [{'id': a['id'], 'title': a['label'], 'ownerSystemRef': '', 'inputTypeRef': '',
               'outputTypeRef': '', 'readRefs': a.get('readRefs', []), 'writeRefs': a.get('writeRefs', []),
               'description': a.get('input', '')} for a in flow['actions']],
  'apiJobs': [],
}
# 행동의 소유 시스템은 쓰는 경로의 소유자에서 낸다 - 손으로 또 적지 않는다.
ownerOf = {d['path']: d.get('ownerSystemRef', '') for d in flow['dataPaths']}
for c in contracts['actions']:
    owners = [ownerOf.get(w) for w in c['writeRefs'] if ownerOf.get(w)]
    c['ownerSystemRef'] = max(set(owners), key=owners.count) if owners else 'sys-ui'

flow['contracts'] = contracts

os.makedirs(OUT, exist_ok=True)
io.open(os.path.join(OUT, 'flow.json'), 'w', encoding='utf-8', newline='\n').write(
    json.dumps(flow, ensure_ascii=False, indent=2))
io.open(os.path.join(OUT, 'contracts.json'), 'w', encoding='utf-8', newline='\n').write(
    json.dumps(contracts, ensure_ascii=False, indent=2))
io.open(os.path.join(OUT, 'data-paths.json'), 'w', encoding='utf-8', newline='\n').write(
    json.dumps(flow['dataPaths'], ensure_ascii=False, indent=2))
io.open(os.path.join(OUT, 'actions.json'), 'w', encoding='utf-8', newline='\n').write(
    json.dumps(flow['actions'], ensure_ascii=False, indent=2))

print('데이터 경로  %d/%d 채움' % (filled, len(flow['dataPaths'])))
print('행동        %d/%d 에 읽기·쓰기' % (aFilled, len(flow['actions'])))
print('핀 dataRefs %d개 채움 · 남은 것 %d개' % (pinFilled, len(pinStill)))
print('계약 등록소  시스템 %d · 타입 %d · 데이터 %d · 행동 %d' % (
    len(contracts['systems']), len(contracts['types']), len(contracts['data']), len(contracts['actions'])))
if unknown: print('\n표에 없는 경로:', unknown)
if aUnknown: print('표에 없는 행동:', aUnknown)
if pinStill: print('아직 빈 핀:', pinStill[:10])
bad = 1 if (unknown or aUnknown) else 0
sys.exit(bad)
