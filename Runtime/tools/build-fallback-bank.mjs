// 지난 실제 생성물에서 fallback 문구 은행을 만든다.
//
// **검증 규칙을 복제하지 않는다.** 후보를 여덟씩 묶어 실제 `qualityErrors` 에
// 먹이고, 걸린 자리만 떨어뜨린다. 카테고리 어휘·어미·한 문장 규칙이 모두 그
// 함수에 있으므로 여기서 다시 적으면 갈라진다 (AGENTS.md).
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RT = path.resolve(import.meta.dirname, '..') + '/';
const RT_URL = pathToFileURL(RT).href;
const DIR = RT + 'reports/live-generation/';
const { qualityErrors } = await import(RT_URL + 'generation-server.js');

const ENDINGS = ['남아 있다.', '보인다.', '확인된다.', '이어진다.', '드러난다.'];
const LIMITS = { rumor: 45, setHint: 25, npcReaction: 45 };
const BANNED = /매우 특별하다|품질이 뛰어나다|고유한 디자인|세련된|돋보인다/;

const catalog = JSON.parse(await readFile(RT + 'assets/items/catalog.json', 'utf8'));
const itemNames = catalog.items.map((i) => i.item_name_ko).filter(Boolean).sort((a, b) => b.length - a.length);
// 품목 이름의 머리 명사. "청록 뚜껑 소금단지" → "소금단지".
const headNouns = [...new Set(itemNames.map((n) => n.trim().split(/\s+/).pop()))].sort((a, b) => b.length - a.length);
// 카탈로그에 없는데 특정 사물을 지칭하는 명사. 모델이 지어낸 것들이라 머리
// 명사 목록으로는 안 걸린다. 실측에서 청자 항아리에 "제비문이 **찻잔**의
// 손잡이에 새겨져 있고" 가 붙은 것을 보고 추가했다.
//
// 조사가 붙은 형태로만 본다. 그냥 포함으로 보면 `잔금`·`함께` 같은 말이 걸린다.
// 새로 발견되면 여기에 더한다 — 목록이 곧 지금까지 본 사례의 기록이다.
const strayObjectNouns = ['찻잔', '상자', '접시', '컵', '거울', '부채', '서랍', '신발', '모자', '우산'];
const strayNoun = new RegExp(`(?:${strayObjectNouns.join('|')})(?=[의에은는이가을를과와로도만\\s])`);

const namesItem = (t) => itemNames.some((n) => t.includes(n)) || strayNoun.test(t);
const stemOf = (t) => { const e = ENDINGS.find((x) => t.endsWith(x)); return e ? t.slice(0, -e.length).trim() : t; };

// --- 1. 걷기 ---
const raw = {};   // category -> { description:Map(stem->text), rumor:Set, ... }
const slot = (c) => (raw[c] ||= { description: new Map(), rumor: new Set(), setHint: new Set(), npcReaction: new Set() });
const files = (await readdir(DIR)).filter((n) => n.includes('daily-content') && n.endsWith('.json'));

const take = (cat, lot) => {
  const d = String(lot?.description || '').trim();
  if (!d || BANNED.test(d) || namesItem(d)) return;
  const s = slot(cat);
  const stem = stemOf(d);
  if (!s.description.has(stem)) s.description.set(stem, d);
  for (const f of ['rumor', 'setHint', 'npcReaction']) {
    const v = String(lot?.[f] || '').trim();
    if (v && v.length <= LIMITS[f] && !BANNED.test(v) && !namesItem(v)) s[f].add(v);
  }
};

for (const name of files) {
  let j; try { j = JSON.parse(await readFile(DIR + name, 'utf8')); } catch { continue; }
  const req = j.request, out = j.output;
  if (!req?.lots || !out) continue;
  if (Array.isArray(out.lots)) {
    const byId = new Map(req.lots.map((l) => [l.lotId, l.category]));
    for (const lot of out.lots) { const c = byId.get(lot.lotId); if (c) take(c, lot); }
    continue;
  }
  // LOT 단건. **id 로 정확히 찾지 못하면 버린다** — 카테고리를 잘못 붙이면
  // 어휘 검사에 걸리는 문장이 은행에 들어간다.
  const one = out.lots?.[0] || out;
  const id = j.lotId || one?.lotId;
  const cat = req.lots.find(({ lotId }) => lotId === id)?.category;
  if (cat && one?.description) take(cat, one);
}

// --- 2. 실제 검증기로 거르기 ---
const cats = ['CER', 'CLK', 'PNT', 'BOK', 'MET', 'JEW'];
const bank = {};
const stats = {};

for (const c of cats) {
  const candidates = [...(raw[c]?.description.values() || [])];
  const passed = [];
  for (let i = 0; i < candidates.length; i += 8) {
    const chunk = candidates.slice(i, i + 8);
    while (chunk.length < 8) chunk.push(chunk[0]);   // 8칸을 채워야 검증기가 돈다
    const request = {
      schemaVersion: '1.0', mode: 'daily-content', runSeed: 'bank-check', day: 1,
      lots: chunk.map((_, k) => ({ lotId: `lot-${k + 1}`, baseName: `표본 ${k + 1}`, category: c, grade: 'COMMON', setId: `set-${k + 1}` })),
    };
    const output = {
      schemaVersion: '1.0', day: 1, marketHeadline: '1일차 경매 물품 기록',
      lots: chunk.map((d, k) => ({ lotId: `lot-${k + 1}`, displayName: `표본 ${k + 1}`, description: d, rumor: '보관 장부 기록', setHint: '보관 표식', npcReaction: '기록원이 살핀다' })),
    };
    const errors = qualityErrors(request, output);
    // "lot N ..." 에서 걸린 자리만 뽑는다. 전역 중복 오류는 8칸 채우기 때문에
    // 나올 수 있으므로 자리 지정이 있는 것만 본다.
    const bad = new Set();
    for (const e of errors) { const m = e.match(/^lot (\d+) /); if (m) bad.add(Number(m[1]) - 1); }
    chunk.slice(0, Math.min(8, candidates.length - i)).forEach((d, k) => { if (!bad.has(k)) passed.push(d); });
  }
  // **다른 품목의 이름이 든 문장을 뒤로 뺀다.**
  //
  // 카탈로그 전체 이름으로만 걸렀더니 "소금단지의 뚜껑에…" 가 청자 항아리에,
  // "천연 종이로 만들어진 견본첩" 이 항해일지에 붙었다. 짧은 형태가 새어
  // 들어간 것이다. 그래서 품목 이름의 머리 명사 59종으로 한 번 더 가른다.
  //
  // 전부 버리지는 않는다. `시계`·`장식`처럼 머리 명사이면서 카테고리 필수
  // 어휘인 것이 있어서, 전부 막으면 은행이 너무 얇아진다. 대신 **깨끗한 것을
  // 앞에 두고 나머지는 예비로 돌린다.** 하루에 같은 카테고리가 최대 5개
  // (40시드 × 12일 실측)이고 깨끗한 것이 카테고리마다 6개 이상이므로,
  // 예비까지 내려가는 일은 사실상 없다.
  const uniq = [...new Set(passed)];
  const clean = uniq.filter((d) => !headNouns.some((h) => d.includes(h)));
  const spare = uniq.filter((d) => headNouns.some((h) => d.includes(h)));
  const tidy = (set) => [...set].filter((v) => !headNouns.some((h) => v.includes(h)));
  bank[c] = {
    description: clean,
    descriptionSpare: spare,
    rumor: tidy(raw[c]?.rumor || []),
    setHint: tidy(raw[c]?.setHint || []),
    npcReaction: tidy(raw[c]?.npcReaction || []),
  };
  stats[c] = { 후보: candidates.length, 통과: uniq.length };
  const dist = {};
  for (const d of clean) { const e = ENDINGS.find((x) => d.endsWith(x)) || '?'; dist[e] = (dist[e] || 0) + 1; }
  console.log(`${c}  후보 ${candidates.length} → 통과 ${uniq.length} · 깨끗 ${clean.length} · 예비 ${spare.length}`);
  console.log(`     rumor ${bank[c].rumor.length} · setHint ${bank[c].setHint.length} · npc ${bank[c].npcReaction.length} · 어미 ${JSON.stringify(dist)}`);
}

await writeFile(RT + 'data/fallback-copy.json', JSON.stringify(bank, null, 1), 'utf8');
console.log('\ndata/fallback-copy.json 저장');
