// API 연결 전후로 조용히 깨질 수 있는 연결 지점을 점검한다.
// 실행: node tools/audit-runtime.mjs  (npm run audit)
// API 없이 항상 동작한다. 문제가 있으면 종료 코드 1.
import { readFile, readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(runtimeRoot, path), 'utf8');

const findings = [];
const add = (severity, area, message, detail = '') => findings.push({ severity, area, message, detail });

// ---------------------------------------------------------------- 자료 적재
const indexHtml = await read('index.html');
const template = JSON.parse(await read('contracts/vsl-map.template.json'));
const balance = JSON.parse(await read('data/balance.json'));
const audioMap = JSON.parse(await read('data/audio-map.json'));
const fixesCss = await read('runtime-fixes.css');
const contractText = await read('contracts/compact-generation-contract.txt');
const generationServer = await read('generation-server.js');

const srcNames = (await readdir(resolve(runtimeRoot, 'src'))).filter((name) => name.endsWith('.js'));
const srcFiles = Object.fromEntries(await Promise.all(srcNames.map(async (name) => [name, await read(`src/${name}`)])));
const allSource = indexHtml + Object.values(srcFiles).join('\n');

// ------------------------------------------------- 1) VSL 템플릿 바인딩 점검
// 템플릿은 셀렉터로 런타임 DOM 을 찾아 data-vsl-* 를 붙인다. 셀렉터가 빗나가도
// querySelectorAll 은 조용히 0개를 돌려주므로 런타임에는 아무 신호가 없다.
function selectorTokens(selector) {
  const id = selector.match(/^#([\w-]+)$/);
  if (id) return { kind: 'id', probes: [`id="${id[1]}"`] };
  const attrValue = selector.match(/^\[([\w-]+)=["']?([^\]"']+)["']?\]$/);
  if (attrValue) return { kind: 'attr=value', probes: [`${attrValue[1]}="${attrValue[2]}"`, `${attrValue[1]}='${attrValue[2]}'`] };
  const attr = selector.match(/^\[([\w-]+)\]$/);
  if (attr) return { kind: 'attr', probes: [`${attr[1]}=`] };
  const cls = selector.match(/^\.([\w-]+)$/);
  if (cls) return { kind: 'class', probes: [cls[1]] };
  return { kind: 'unsupported', probes: [] };
}

const declaredScenes = [...indexHtml.matchAll(/data-scene="([\w-]+)"/g)].map((m) => m[1]);
let bindingCount = 0;
for (const scene of template.scenes || []) {
  if (!declaredScenes.includes(scene.runtimeSceneId)) {
    add('error', '템플릿', `씬 "${scene.runtimeSceneId}" 이(가) index.html 에 없다`, `vslSceneId=${scene.vslSceneId}`);
    continue;
  }
  for (const [label, list, idKey] of [['action', scene.actions || [], 'vslActionId'], ['dataBinding', scene.dataBindings || [], 'vslDataPath']]) {
    for (const entry of list) {
      bindingCount += 1;
      const { kind, probes } = selectorTokens(entry.selector);
      if (kind === 'unsupported') {
        add('warn', '템플릿', `셀렉터 형태를 검사하지 못했다: ${entry.selector}`, `${scene.runtimeSceneId} / ${entry[idKey]}`);
        continue;
      }
      // 정적 마크업과 app.js 가 만들어내는 마크업을 함께 본다.
      if (!probes.some((probe) => allSource.includes(probe))) {
        add('error', '템플릿', `${label} 셀렉터가 어디에도 없다: ${entry.selector}`,
          `${scene.runtimeSceneId} / ${entry[idKey]} · 이 바인딩은 조용히 무시된다`);
      }
    }
  }
}

// 템플릿이 선언한 해상도와 CSS 기준 해상도가 어긋나면 좌표 매핑이 틀어진다.
if (template.resolution?.width !== 1600 || template.resolution?.height !== 900) {
  add('warn', '템플릿', `템플릿 해상도가 1600x900 이 아니다: ${template.resolution?.width}x${template.resolution?.height}`);
}

// ------------------------------------------------------ 2) balance.json 정합성
// 코드가 읽는 키가 없으면 런타임에서 undefined 가 되고, 아무도 안 읽는 키는 잔재다.
const balanceReads = [];
for (const [name, text] of Object.entries(srcFiles)) {
  for (const match of text.matchAll(/\bbalance\s*\??\.\s*([A-Za-z_$][\w$]*)((?:\s*\??\.\s*[A-Za-z_$][\w$]*)*)/g)) {
    const path = (match[1] + match[2]).replace(/\s|\?/g, '');
    if (/^(json|js|mjs)(\.|$)/.test(path)) continue; // './data/balance.json' 같은 경로 문자열 제외
    balanceReads.push({ path, file: name });
  }
}

const lookup = (object, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), object);
const readTopLevel = new Set();
for (const entry of balanceReads) {
  const { path, file } = entry;
  readTopLevel.add(path.split('.')[0]);
  // 마지막 조각이 동적 인덱싱과 함께 쓰이는 경우가 있어 첫 두 단계까지만 확인한다.
  const probe = path.split('.').slice(0, 2).join('.');
  if (lookup(balance, probe) === undefined) {
    add('error', 'balance', `코드가 읽는 balance.${probe} 가 balance.json 에 없다`, `src/${file}`);
  }
}
const unreadBalanceKeys = Object.keys(balance).filter((key) => !readTopLevel.has(key));
if (unreadBalanceKeys.length) {
  add('info', 'balance', `읽는 코드가 없는 최상위 키 ${unreadBalanceKeys.length}개`,
    `${unreadBalanceKeys.join(', ')} — 대부분 설계 기록용이라 정상이다`);
}

// 상회 단계 파생값은 5칸(0~4단계) 배열이어야 한다.
for (const key of balance.shop?.derivedFromStage || []) {
  const value = balance.shop?.[key];
  if (!Array.isArray(value)) add('error', 'balance', `shop.derivedFromStage 에 있는 "${key}" 가 shop 에 배열로 없다`);
  else if (value.length !== 5) add('warn', 'balance', `shop.${key} 길이가 ${value.length} 다 (0~4단계면 5)`);
}

// ------------------------------------------------- 3) 생성 계약 ↔ 표시 용량
// 계약서 문구, 서버 강제값, 화면이 실제로 보여줄 수 있는 양이 서로 어긋나면
// API 를 붙이는 순간 잘린 문구나 fallback 이 쏟아진다.
const contractLimits = {};
const limitsLine = contractText.match(/Daily limits per item:([^\n]+)/);
if (limitsLine) {
  for (const m of limitsLine[1].matchAll(/(\w+)\s+(\d+)/g)) contractLimits[m[1]] = Number(m[2]);
} else {
  add('warn', '생성계약', '계약서에서 "Daily limits per item" 줄을 찾지 못했다');
}

const serverLimits = {};
const descMatch = generationServer.match(/description\.length\s*>\s*(\d+)/);
if (descMatch) serverLimits.description = Number(descMatch[1]);
// 길이 제한 쌍은 qualityErrors 의 배열 리터럴에만 나타난다.
for (const m of generationServer.matchAll(/\['(\w+)',\s*(\d+)\]/g)) serverLimits[m[1]] = Number(m[2]);

for (const [field, limit] of Object.entries(contractLimits)) {
  if (serverLimits[field] === undefined) add('warn', '생성계약', `계약서의 ${field} 상한(${limit})을 서버가 강제하지 않는다`);
  else if (serverLimits[field] !== limit) add('error', '생성계약', `${field} 상한 불일치 — 계약서 ${limit} vs 서버 ${serverLimits[field]}`);
}

// 경매 카드 설명문은 -webkit-line-clamp 로 잘린다. 아래 값은 1600x900 에서 실측했다
// (169px 폭 / 9px / line-height 1.2). CSS 를 바꾸면 다시 재보고 이 표를 갱신할 것.
const VERIFIED_DESCRIPTION_CLAMP = 4;
const VERIFIED_CHARS_PER_CLAMP_LINE = 22;
const clampMatch = fixesCss.match(/\[data-scene="auction"\][^{]*article > p\s*\{[^}]*-webkit-line-clamp:\s*(\d+)/s);
if (!clampMatch) {
  add('warn', '표시용량', '경매 설명문의 -webkit-line-clamp 규칙을 찾지 못했다');
} else {
  const clamp = Number(clampMatch[1]);
  const capacity = clamp * VERIFIED_CHARS_PER_CLAMP_LINE;
  if (clamp !== VERIFIED_DESCRIPTION_CLAMP) {
    add('warn', '표시용량', `설명문 clamp 가 ${clamp} 줄로 바뀌었다 (검증된 값 ${VERIFIED_DESCRIPTION_CLAMP})`, '실측을 다시 하고 이 스크립트의 상수를 갱신할 것');
  }
  if (contractLimits.description && contractLimits.description > capacity) {
    add('error', '표시용량', `계약 상한 ${contractLimits.description}자가 경매 카드 표시 용량 약 ${capacity}자를 넘는다`,
      `${clamp}줄 x 약 ${VERIFIED_CHARS_PER_CLAMP_LINE}자 — 생성문이 잘린다`);
  }
}

// ------------------------------------------------------- 4) 오디오 맵 정합성
const playedSfx = new Set([...allSource.matchAll(/playSfx\(['"]([\w-]+)['"]\)/g)].map((m) => m[1]));
const playedBgm = new Set([...allSource.matchAll(/playBgm\(['"]([\w-]+)['"]\)/g)].map((m) => m[1]));
for (const id of playedSfx) if (!audioMap.sfx?.[id]) add('error', '오디오', `playSfx('${id}') 가 audio-map.json 에 없다`);
for (const id of playedBgm) if (!audioMap.bgm?.[id]) add('error', '오디오', `playBgm('${id}') 가 audio-map.json 에 없다`);
for (const id of Object.keys(audioMap.sfx || {})) if (!playedSfx.has(id)) add('info', '오디오', `sfx "${id}" 를 재생하는 코드가 없다`, '잔재 후보');
for (const id of Object.keys(audioMap.bgm || {})) if (!playedBgm.has(id)) add('info', '오디오', `bgm "${id}" 를 재생하는 코드가 없다`, '잔재 후보');

// ----------------------------------------------------------------- 결과 출력
const order = { error: 0, warn: 1, info: 2 };
const mark = { error: 'ERROR', warn: 'WARN ', info: 'INFO ' };
findings.sort((a, b) => order[a.severity] - order[b.severity] || a.area.localeCompare(b.area));

const counts = { error: 0, warn: 0, info: 0 };
for (const finding of findings) counts[finding.severity] += 1;

console.log(`런타임 연결 점검 — 템플릿 바인딩 ${bindingCount}건 · 씬 ${template.scenes?.length || 0}개\n`);
for (const { severity, area, message, detail } of findings) {
  console.log(`[${mark[severity]}] (${area}) ${message}`);
  if (detail) console.log(`          ${detail}`);
}
if (!findings.length) console.log('문제 없음');
console.log(`\n오류 ${counts.error} · 경고 ${counts.warn} · 참고 ${counts.info}`);

process.exit(counts.error > 0 ? 1 : 0);
