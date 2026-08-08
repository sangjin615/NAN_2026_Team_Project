// 인쇄용 HTML을 PDF로 뽑는다. build-print.mjs 를 먼저 돌린 뒤 이어서 쓴다.
//
//   node Docs/NAN-2026-SUBMISSION-FINAL/build-print.mjs
//   node Docs/NAN-2026-SUBMISSION-FINAL/build-pdf.mjs
//
// 설치된 Chrome 을 헤드리스로 부른다. 별도 의존성이 없다.
//
// **별도 프로필을 쓴다.** 평소 쓰는 Chrome 이 떠 있으면 기본 프로필이 잠겨
// 아무 메시지 없이 실패한다 — 파일이 안 생기는데 종료 코드도 비어 있어서
// 원인을 찾기 어렵다.
//
// 배경 음영은 CSS 의 print-color-adjust 로 강제한다. 헤드리스 인쇄는 기본적으로
// 배경을 빼고 찍어서 표 머리와 코드블록이 흰 칸으로 나온다.
import { readdir, mkdir, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const run = promisify(execFile);
const here = import.meta.dirname;
const printDir = path.join(here, 'print');
const pdfDir = path.join(here, 'pdf');

const candidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const browser = candidates.find((p) => existsSync(p));
if (!browser) {
  console.error('Chrome 이나 Edge 를 찾지 못했다. 아래 경로 중 하나에 있어야 한다:');
  candidates.forEach((p) => console.error('  ' + p));
  process.exit(1);
}

if (!existsSync(printDir)) {
  console.error('print/ 가 없다. 먼저 build-print.mjs 를 돌린다.');
  process.exit(1);
}

await mkdir(pdfDir, { recursive: true });
const profile = path.join(os.tmpdir(), 'chrome-pdf-profile');
const sources = (await readdir(printDir)).filter((n) => n.endsWith('.html')).sort();

console.log(path.basename(browser) + ' 로 뽑는다\n');
let failed = 0;

for (const name of sources) {
  const src = path.join(printDir, name);
  const out = path.join(pdfDir, name.replace(/\.html$/, '.pdf'));
  try {
    await run(browser, [
      '--headless=new', '--disable-gpu', '--no-first-run',
      '--user-data-dir=' + profile,
      '--no-pdf-header-footer',
      '--print-to-pdf=' + out,
      pathToFileURL(src).href,
    ], { timeout: 120000 });
  } catch {
    // 헤드리스는 성공해도 0이 아닌 코드를 내는 경우가 있다. 파일로 판정한다.
  }

  if (!existsSync(out)) { console.log(name + '  실패'); failed += 1; continue; }

  const { size } = await stat(out);
  const raw = (await readFile(out)).toString('latin1');
  const counts = [...raw.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  const pages = counts.length ? Math.max(...counts) : 0;
  const korean = /MalgunGothic|Batang|Gulim|NotoSans/.test(raw);
  console.log(
    path.basename(out).padEnd(26)
    + String(pages).padStart(3) + '쪽'
    + (size / 1024).toFixed(0).padStart(7) + 'KB'
    + (korean ? '  한글 폰트 내장' : '  [경고] 한글 폰트가 안 보인다'),
  );
}

console.log('\npdf/ 에 저장했다.');
if (failed) { console.error(failed + '개 실패 — Chrome 이 이미 떠 있으면 닫고 다시 돌린다.'); process.exit(1); }
