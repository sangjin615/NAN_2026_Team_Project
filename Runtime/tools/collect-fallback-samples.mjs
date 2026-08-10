// 얇은 카테고리의 fallback 문장을 더 뽑는다.
//
// `build-fallback-bank.mjs` 는 reports/live-generation 에 쌓인 기록에서 걷는다.
// 그런데 실제 판에서는 카테고리가 골고루 섞여 나오므로, 적게 등장한 카테고리는
// 표본이 모자란다. PNT 가 그랬다 — 깨끗한 문장이 6개뿐이었다.
//
// 그래서 **그 카테고리만 8개인 하루**를 만들어 배포본에 보낸다. 한 번에 최대
// 8문장이 나온다. 결과는 기존 기록과 같은 모양으로 저장하므로 은행 만들기가
// 그대로 읽는다.
//
//   node tools/collect-fallback-samples.mjs PNT 8
//
// 실제 공급자를 부른다 — 돈이 나간다. 라운드 수를 넘기지 않으면 4판만 돈다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const runtimeRoot = path.resolve(import.meta.dirname, '..');
const ENDPOINT = 'https://8tjqzce89j.execute-api.us-east-1.amazonaws.com/generate';
const category = (process.argv[2] || 'PNT').toUpperCase();
const rounds = Number(process.argv[3] || 4);

const catalog = JSON.parse(await readFile(path.join(runtimeRoot, 'assets/items/catalog.json'), 'utf8'));
const items = catalog.items.filter((i) => i.category === category);
if (!items.length) { console.error(`카테고리 ${category} 품목이 없다`); process.exit(1); }

const grades = catalog.grade_order || ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'];
const reportDir = path.join(runtimeRoot, 'reports', 'live-generation');
await mkdir(reportDir, { recursive: true });

console.log(`${category} ${items.length}종으로 ${rounds}판 · 판마다 8 LOT\n`);
let ok = 0;
for (let round = 1; round <= rounds; round += 1) {
  const seed = `bank-${category.toLowerCase()}-${round}`;
  // 품목과 등급을 판마다 밀어 같은 조합이 반복되지 않게 한다.
  const request = {
    schemaVersion: '1.0', mode: 'daily-content', runSeed: seed, day: 1,
    lots: Array.from({ length: 8 }, (_, i) => {
      const item = items[(i + round) % items.length];
      return {
        lotId: `lot-${i + 1}`,
        baseName: item.item_name_ko,
        category,
        grade: grades[(i + round) % grades.length],
        setId: `set-${i + 1}`,
      };
    }),
  };

  const startedAt = Date.now();
  let response, output;
  try {
    response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
    output = await response.json();
  } catch (error) {
    console.log(`${round}. 실패 ${String(error).slice(0, 60)}`);
    continue;
  }
  const latencyMs = Date.now() - startedAt;
  const source = response.headers.get('x-generation-source') || '(없음)';
  const generated = source !== 'static';
  if (generated) ok += 1;
  console.log(`${round}. ${(latencyMs / 1000).toFixed(1)}초 · ${source}${generated ? '' : ' — static 이라 저장하지 않는다'}`);
  if (!generated) continue;

  // 기존 기록과 같은 모양. build-fallback-bank.mjs 가 request/output 을 본다.
  await writeFile(
    path.join(reportDir, `${seed}-daily-content-d1-attempt-1.json`),
    JSON.stringify({ valid: true, model: source, latencyMs, request, output }, null, 1),
    'utf8',
  );
  console.log(`   ${output.lots?.[0]?.description || ''}`);
}
console.log(`\n생성 성공 ${ok}/${rounds}판 · reports/live-generation 에 저장`);
console.log('다음: npm run build:fallback-bank');
