# 채운 계약이 실제로 닫혔는지 잰다. 채운 것과 맞는 것은 다르다. 판정은 exit code 다.
import io, json, sys, os
sys.stdout.reconfigure(encoding='utf-8')

ROOT = sys.argv[1]
flow = json.load(io.open(os.path.join(ROOT, 'flow.json'), encoding='utf-8'))

fail = 0
def check(name, ok, detail=''):
    global fail
    if not ok: fail += 1
    print('  %s  %-52s %s' % ('PASS' if ok else 'FAIL', name, detail))

paths = {d['path'] for d in flow['dataPaths']}
actions = {a['id'] for a in flow['actions']}
scenes = {n['id'] for n in flow['nodes']}
systems = {s['id'] for s in flow['contracts']['systems']}
types = {t['id'] for t in flow['contracts']['types']}

print('\n== 1. 빈 곳이 남았는가 ==')
check('모든 데이터 경로에 타입이 있다',
      all(d.get('typeRef') for d in flow['dataPaths']),
      '%d/%d' % (sum(1 for d in flow['dataPaths'] if d.get('typeRef')), len(paths)))
check('모든 데이터 경로에 소유 시스템이 있다',
      all(d.get('ownerSystemRef') for d in flow['dataPaths']))
check('모든 행동에 읽기·쓰기 필드가 있다',
      all('readRefs' in a and 'writeRefs' in a for a in flow['actions']))
pins = [(n['id'], a) for n in flow['nodes'] for a in n.get('annotations', [])]
pins += [(u['id'], a) for u in flow.get('uiStates', []) for a in u.get('annotations', [])]
# 행동이 아무 상태도 안 읽으면(나가기·돌아가기·탭 전환) 핀도 비는 것이 맞다.
# 그래서 "비었는가" 가 아니라 "행동이 읽는 것과 같은가" 를 잰다 - 이쪽이 더 강한 규칙이다.
byAct = {a['id']: a for a in flow['actions']}
mismatch = []
for o, a in pins:
    act = byAct.get(a.get('actionRef') or '')
    if not act: continue
    if set(a.get('dataRefs') or []) != set(act.get('readRefs') or []):
        mismatch.append(o + '/' + a['id'])
check('핀의 데이터 참조가 그 행동이 읽는 것과 같다', not mismatch,
      ('어긋남: ' + ', '.join(mismatch[:4])) if mismatch else '핀 %d개' % len(pins))

print('\n== 2. 가리키는 것이 실제로 있는가 (fail-closed) ==')
badRef = [(a['id'], r) for a in flow['actions'] for r in a.get('readRefs', []) + a.get('writeRefs', []) if r not in paths]
check('행동의 읽기·쓰기가 전부 선언된 경로다', not badRef, ('없는 경로: ' + str(badRef[:3])) if badRef else 'ok')
badPin = [(o, a['id'], r) for o, a in pins for r in (a.get('dataRefs') or []) if r not in paths]
check('핀의 데이터 참조가 전부 선언된 경로다', not badPin, str(badPin[:3]) if badPin else 'ok')
badAct = [(o, a['id'], a['actionRef']) for o, a in pins if a.get('actionRef') and a['actionRef'] not in actions]
check('핀의 행동 참조가 전부 선언된 행동이다', not badAct, str(badAct[:3]) if badAct else 'ok')
badOwner = [d['path'] for d in flow['dataPaths'] if d.get('ownerSystemRef') not in systems]
check('소유 시스템이 전부 등록된 시스템이다', not badOwner, str(badOwner[:3]) if badOwner else 'ok')
badNav = [(o, a['id'], a['navTargetSceneId']) for o, a in pins
          if a.get('navTargetSceneId') and a['navTargetSceneId'] not in scenes]
check('이동 대상 씬이 전부 존재한다', not badNav, str(badNav[:3]) if badNav else 'ok')

print('\n== 3. 아무도 안 쓰는 것이 있는가 ==')
read = {r for a in flow['actions'] for r in a.get('readRefs', [])}
written = {w for a in flow['actions'] for w in a.get('writeRefs', [])}
pinRead = {r for _, a in pins for r in (a.get('dataRefs') or [])}
orphan = sorted(paths - read - written - pinRead)
check('아무 행동도 안 읽고 안 쓰는 경로가 없다', not orphan, ('고아: ' + ', '.join(orphan)) if orphan else '0개')
neverWritten = sorted(paths - written)
print('     (참고) 아무도 안 쓰는 경로 %d개: %s' % (len(neverWritten), ', '.join(neverWritten[:8])))
usedTypes = {d['typeRef'] for d in flow['dataPaths']}
unusedTypes = sorted(types - usedTypes)
print('     (참고) 어느 경로도 안 쓰는 타입 %d개: %s' % (len(unusedTypes), ', '.join(unusedTypes)))

print('\n== 4. 계약 등록소가 툴 형식에 맞는가 ==')
c = flow['contracts']
check('다섯 갈래가 다 있다', set(c) == {'systems', 'types', 'data', 'actions', 'apiJobs'}, ', '.join(sorted(c)))
check('데이터 항목 수가 경로 수와 같다', len(c['data']) == len(paths), '%d = %d' % (len(c['data']), len(paths)))
check('행동 항목 수가 행동 수와 같다', len(c['actions']) == len(actions))
check('모든 계약 항목에 id 가 있다',
      all(x.get('id') for k in c for x in c[k]))
check('행동의 소유 시스템이 전부 등록된 시스템이다',
      all(x['ownerSystemRef'] in systems for x in c['actions']))

print('\n== 5. 음성 시험 — 일부러 깨면 잡히는가 ==')
import copy
broken = copy.deepcopy(flow)
broken['actions'][0]['readRefs'] = ['없는.경로']
bad2 = [r for a in broken['actions'] for r in a.get('readRefs', []) + a.get('writeRefs', []) if r not in paths]
check('없는 경로를 넣으면 잡힌다', len(bad2) == 1, '잡힌 수 %d' % len(bad2))
broken2 = copy.deepcopy(flow)
broken2['dataPaths'][0]['ownerSystemRef'] = 'sys-없음'
bad3 = [d['path'] for d in broken2['dataPaths'] if d.get('ownerSystemRef') not in systems]
check('없는 시스템을 넣으면 잡힌다', len(bad3) == 1, '잡힌 수 %d' % len(bad3))

print('\n%s · 위반 %d\n' % ('PASS' if fail == 0 else 'FAIL', fail))
sys.exit(0 if fail == 0 else 1)
