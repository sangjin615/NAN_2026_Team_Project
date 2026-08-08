// 제출 문서(.md)에서 인쇄용 HTML을 만든다. 브라우저에서 열어 PDF로 저장한다.
//
//   node Docs/NAN-2026-SUBMISSION-FINAL/build-print.mjs
//   → print/*.html 이 생기고, 브라우저에서 Ctrl+P → PDF로 저장
//
// **원본은 .md 하나뿐이다.** 예전에는 같은 내용이 .md 와 .docx 에 따로 있었고
// 실제로 갈라졌다 — 2026-08-08 기준 .docx 가 하루 전 상태여서 그날 작업이
// 하나도 들어 있지 않았다. 이 프로젝트가 생성 계약에서 배운 것과 같은 문제라
// 같은 방식으로 푼다: 원본을 한 곳에만 두고 나머지는 뽑아낸다.
//
// 의존성을 쓰지 않는다. 문서가 쓰는 문법이 제목·표·코드블록·인용·목록·굵게·
// 링크·인라인코드로 한정되어 있어 그 범위만 처리한다. 범위 밖 문법을 쓰면
// 그대로 글자로 나오므로 결과를 보면 바로 안다.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const here = import.meta.dirname;
const outDir = path.join(here, 'print');

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 인라인 코드를 먼저 빼두고 나머지를 처리한 뒤 되돌린다.
//
// **자리표시자는 본문에 나올 수 없는 문자여야 한다.** 처음에는 " 0 " 처럼 숫자를
// 썼는데, 본문의 "하루 8 LOT" 같은 표현이 자리표시자로 오인되어 undefined 로
// 바뀌는 결함이 있었다. 사설 사용 영역 문자를 쓰면 충돌이 불가능하다.
const MARK = String.fromCharCode(0xE000);
const MARK_RE = new RegExp(MARK + '(\\d+)' + MARK, 'g');

function inline(text) {
  const codes = [];
  let out = String(text).replace(/`([^`]+)`/g, (_, code) => MARK + (codes.push(code) - 1) + MARK);
  out = escape(out);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2">');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return out.replace(MARK_RE, (_, i) => '<code>' + escape(codes[Number(i)]) + '</code>');
}

const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isDivider = (line) => /^\s*\|[\s:|-]+\|\s*$/.test(line);
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
const BLOCK_START = /^#{1,6}\s|^```|^>|^\s*[-*]\s|^\s*\d+\.\s|^\s*\|/;

function render(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    if (/^```/.test(line)) {
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) { body.push(lines[i]); i += 1; }
      i += 1;
      html.push('<pre><code>' + escape(body.join('\n')) + '</code></pre>');
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      html.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
      i += 1;
      continue;
    }

    if (isTableRow(line) && isDivider(lines[i + 1] || '')) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i += 1; }
      html.push(
        '<table><thead><tr>'
        + head.map((c) => '<th>' + inline(c) + '</th>').join('')
        + '</tr></thead><tbody>'
        + rows.map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>').join('')
        + '</tbody></table>',
      );
      continue;
    }

    // 인용 — 안에 표가 들어가는 경우가 있어 내용을 다시 렌더한다
    if (/^>\s?/.test(line)) {
      const body = [];
      while (i < lines.length) {
        if (/^>/.test(lines[i])) { body.push(lines[i].replace(/^>\s?/, '')); i += 1; continue; }
        if (!lines[i].trim() && /^>/.test(lines[i + 1] || '')) { body.push(''); i += 1; continue; }
        break;
      }
      while (body.length && !body.at(-1).trim()) body.pop();
      html.push('<blockquote>' + render(body.join('\n')) + '</blockquote>');
      continue;
    }

    const bullet = /^\s*[-*]\s+/;
    const numbered = /^\s*\d+\.\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const marker = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length && marker.test(lines[i])) {
        const item = [lines[i].replace(marker, '')];
        i += 1;
        while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) {
          item.push(lines[i].trim());
          i += 1;
        }
        items.push(item.join(' '));
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push('<' + tag + '>' + items.map((t) => '<li>' + inline(t) + '</li>').join('') + '</' + tag + '>');
      continue;
    }

    const para = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    html.push('<p>' + inline(para.join(' ')) + '</p>');
  }

  return html.join('\n');
}

// 인쇄 서식. 한글은 시스템 폰트를 쓴다 — 웹폰트를 넣으면 오프라인 인쇄에서
// 오히려 깨질 수 있고, 제출 체크리스트가 "PDF 폰트 깨짐·잘림 확인" 을 요구한다.
const style = [
  '@page { size: A4; margin: 18mm 16mm 16mm; }',
  ':root { --line: #c9c2b4; --ink: #1b1815; --muted: #5a5148; }',
  '* { box-sizing: border-box; }',
  'body { margin: 0; color: var(--ink); background: #fff;',
  '  font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;',
  '  font-size: 10.5pt; line-height: 1.7; word-break: keep-all; overflow-wrap: anywhere; }',
  'h1 { font-size: 19pt; margin: 0 0 4mm; padding-bottom: 3mm; border-bottom: 2px solid var(--ink); }',
  'h2 { font-size: 14pt; margin: 9mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 1px solid var(--line); break-after: avoid; }',
  'h3 { font-size: 12pt; margin: 6mm 0 2mm; break-after: avoid; }',
  'h4 { font-size: 11pt; margin: 5mm 0 2mm; color: var(--muted); break-after: avoid; }',
  'p { margin: 0 0 3mm; }',
  'ul, ol { margin: 0 0 3mm; padding-left: 6mm; }',
  'li { margin: 0 0 1.2mm; }',
  'del { color: var(--muted); }',
  'code { font-family: Consolas, "D2Coding", monospace; font-size: 9.2pt; background: #f2efe9; padding: 0.4mm 1mm; border-radius: 2px; }',
  'pre { background: #f7f5f0; border: 1px solid var(--line); border-left: 3px solid var(--muted);',
  '  padding: 3mm 4mm; margin: 0 0 4mm; break-inside: avoid; }',
  'pre code { background: none; padding: 0; font-size: 8.8pt; line-height: 1.55; white-space: pre-wrap; }',
  'blockquote { margin: 0 0 4mm; padding: 2mm 0 2mm 4mm; border-left: 3px solid var(--line); color: var(--muted); }',
  'blockquote > *:last-child { margin-bottom: 0; }',
  'table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9.5pt; break-inside: avoid; }',
  'th, td { border: 1px solid var(--line); padding: 1.8mm 2.2mm; text-align: left; vertical-align: top; }',
  'th { background: #efece5; font-weight: 700; }',
  'a { color: inherit; text-decoration: underline; }',
  'img { max-width: 100%; }',
  '@media screen { body { max-width: 190mm; margin: 0 auto; padding: 12mm; }',
  '  .hint { position: fixed; right: 8px; top: 8px; background: #1b1815; color: #fff;',
  '    font-size: 11px; padding: 6px 10px; border-radius: 4px; } }',
  '@media print { .hint { display: none; } }',
].join('\n  ');

const page = (title, body) => [
  '<!doctype html>',
  '<html lang="ko"><head><meta charset="utf-8"><title>' + escape(title) + '</title>',
  '<style>\n  ' + style + '\n</style></head>',
  '<body><div class="hint">Ctrl+P → 대상을 "PDF로 저장", 배경 그래픽 켜기</div>',
  body,
  '</body></html>',
].join('\n');

await mkdir(outDir, { recursive: true });
const sources = (await readdir(here)).filter((n) => n.endsWith('.md')).sort();
if (!sources.length) { console.error('.md 파일이 없다'); process.exit(1); }

for (const name of sources) {
  const markdown = await readFile(path.join(here, name), 'utf8');
  const title = markdown.match(/^#\s+(.*)$/m)?.[1] || name.replace(/\.md$/, '');
  const outName = name.replace(/\.md$/, '.html');
  const rendered = page(title, render(markdown));
  await writeFile(path.join(outDir, outName), rendered, 'utf8');
  const leftover = (rendered.match(new RegExp(MARK, 'g')) || []).length;
  console.log(name + '  →  print/' + outName + (leftover ? '  [경고] 자리표시자 ' + leftover + '개 남음' : ''));
}
console.log('\n브라우저에서 print/*.html 을 열고 Ctrl+P → "PDF로 저장".');
console.log('인쇄 대화상자에서 "배경 그래픽" 을 켜야 표 머리와 코드블록 음영이 나온다.');
