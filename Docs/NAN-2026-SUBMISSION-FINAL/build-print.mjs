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
  // 결과는 print/ 안에 생기므로 상대 경로 이미지는 한 단계 올려준다.
  // 이걸 빼먹으면 01 의 대표 화면 4장이 통째로 빠진 채 PDF 가 나온다.
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const target = /^(https?:|data:|\/)/.test(src) ? src : '../' + src;
    return '<img alt="' + alt + '" src="' + target + '">';
  });
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

// 제목에 id 를 붙이고 목차를 만든다. 인쇄물에서 링크는 못 눌러도 목차가 있으면
// 심사자가 문서 구조를 한눈에 본다.
function withToc(html) {
  const entries = [];
  const marked = html.replace(/<(h[23])>(.*?)<\/\1>/g, (_, tag, inner) => {
    const id = 'sec-' + (entries.length + 1);
    const text = inner.replace(/<[^>]+>/g, '');
    entries.push({ id, text, level: tag === 'h2' ? 2 : 3 });
    return '<' + tag + ' id="' + id + '">' + inner + '</' + tag + '>';
  });
  if (entries.length < 3) return { html: marked, toc: '' };
  const items = entries
    .map((e) => '<li class="lv' + e.level + '"><a href="#' + e.id + '">' + escape(e.text) + '</a></li>')
    .join('');
  return { html: marked, toc: '<nav class="toc"><h2 class="toc-title">차례</h2><ol>' + items + '</ol></nav>' };
}

// 인쇄 서식. 게임의 색을 종이에 옮긴다 — 어두운 패널은 인쇄에 맞지 않으므로
// 황동 금색 괘선과 양피지 톤만 가져오고 본문은 흰 종이에 검은 글씨로 둔다.
// 한글은 시스템 폰트를 쓴다. 웹폰트를 넣으면 오프라인 인쇄에서 오히려 깨질 수
// 있고, 제출 체크리스트가 "PDF 폰트 깨짐·잘림 확인" 을 요구한다.
const style = [
  '@page { size: A4; margin: 18mm 16mm 16mm; }',
  // 게임 팔레트에서 가져온 값. 황동(#9f6d21·#c38b3d), 금빛 강조(#d5a44e),',
  // 양피지(#efe8d8·#f7f3ea). 본문은 인쇄를 위해 흰 종이에 검은 글씨로 둔다.
  ':root { --brass: #9f6d21; --brass-soft: #c9a765; --gold: #b8873a;',
  '  --parch: #f7f3ea; --parch-deep: #efe8d8; --line: #d9cfba;',
  '  --ink: #1b1815; --muted: #5a5148; }',
  '* { box-sizing: border-box; }',
  // 헤드리스 인쇄는 기본적으로 배경을 빼고 찍는다. 표 머리와 코드블록 음영이
  // 사라지면 표가 읽기 어려워지므로 강제한다.
  '*, *::before, *::after { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
  'body { margin: 0; color: var(--ink); background: #fff;',
  '  font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;',
  '  font-size: 10.8pt; line-height: 1.7; word-break: keep-all; overflow-wrap: anywhere; }',
  // 표제는 게임 타이틀과 같은 명조 계열로 둔다.
  // 제목도 본문과 같은 폰트를 쓴다. 명조로 두면 브라우저 인쇄에서는 바탕이,
  // 헤드리스 인쇄에서는 고딕이 나와 같은 스크립트가 두 결과를 낸다. 굵기와
  // 크기로 구분하고, 게임 느낌은 황동·양피지 색이 맡는다.
  'h1, h2, h3, .toc-title { font-family: inherit; }',
  'h1 { font-size: 24pt; font-weight: 800; letter-spacing: .02em; margin: 0 0 2.5mm; text-align: center; }',
  'h1 + p { margin: 0 0 6mm; text-align: center; color: var(--muted); font-size: 10pt; }',
  '.rule { border: 0; border-top: 3px solid var(--brass); margin: 0 0 1.4mm; }',
  '.rule + .rule { border-top: 1.5px solid var(--brass-soft); margin: 0 0 7mm; }',
  '.mark { text-align: center; color: var(--gold); font-size: 15pt; margin: 0 0 2mm; letter-spacing: .4em; }',
  'h2 { font-size: 15.5pt; font-weight: 800; margin: 9mm 0 3.5mm; padding: 1.8mm 3mm 2mm;',
  '  background: var(--parch-deep); border-left: 4px solid var(--brass);',
  '  border-bottom: 2px solid var(--brass); break-after: avoid; }',
  'h3 { font-size: 12.5pt; font-weight: 700; margin: 6.5mm 0 2mm; color: #2e2417; break-after: avoid; }',
  'h3::before { content: "\\25C6"; color: var(--brass-soft); font-size: 8pt; margin-right: 2mm; vertical-align: 1.2mm; }',
  'h4 { font-size: 11pt; margin: 5mm 0 2mm; color: var(--muted); break-after: avoid; }',
  'p { margin: 0 0 3mm; }',
  'ul, ol { margin: 0 0 3mm; padding-left: 6mm; }',
  'li { margin: 0 0 1.2mm; }',
  'li::marker { color: var(--brass); }',
  'del { color: var(--muted); }',
  'code { font-family: Consolas, "D2Coding", monospace; font-size: 9.2pt;',
  '  background: var(--parch-deep); padding: 0.4mm 1mm; border-radius: 2px; }',
  'pre { background: var(--parch); border: 1px solid var(--line); border-left: 3px solid var(--brass);',
  '  padding: 3mm 4mm; margin: 0 0 4mm; break-inside: avoid; }',
  'pre code { background: none; padding: 0; font-size: 8.8pt; line-height: 1.55; white-space: pre-wrap; }',
  'blockquote { margin: 0 0 4mm; padding: 2mm 0 2mm 4mm; border-left: 3px solid var(--brass-soft); color: var(--muted); }',
  'blockquote > *:last-child { margin-bottom: 0; }',
  'table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9.5pt; break-inside: avoid; }',
  'th, td { border: 1px solid #cdbfa3; padding: 2mm 2.4mm; text-align: left; vertical-align: top; }',
  'th { background: #e7dcc4; font-weight: 800; border-bottom: 2px solid var(--brass); }',
  'tbody tr:nth-child(even) { background: #fbf9f5; }',
  'a { color: inherit; text-decoration: underline; text-decoration-color: var(--brass-soft); }',
  'img { max-width: 100%; border: 1px solid var(--line); }',
  // 차례
  '.toc { border: 1px solid var(--line); background: var(--parch); padding: 4mm 5mm 3mm;',
  '  margin: 0 0 8mm; break-inside: avoid; }',
  '.toc-title { font-size: 11.5pt; margin: 0 0 2.5mm; padding-bottom: 1.5mm;',
  '  border-bottom: 1px solid var(--brass-soft); }',
  '.toc ol { list-style: none; margin: 0; padding: 0; font-size: 9.8pt; }',
  '.toc li { margin: 0 0 1mm; }',
  '.toc li.lv3 { padding-left: 5mm; color: var(--muted); font-size: 9.2pt; }',
  '.toc a { text-decoration: none; }',
  '@media screen { body { max-width: 190mm; margin: 0 auto; padding: 12mm; }',
  '  .hint { position: fixed; right: 8px; top: 8px; background: #1b1815; color: var(--parch);',
  '    font-size: 11px; padding: 6px 10px; border-radius: 4px; } }',
  '@media print { .hint { display: none; } }',
].join('\n  ');

const page = (title, subtitle, toc, body) => [
  '<!doctype html>',
  '<html lang="ko"><head><meta charset="utf-8"><title>' + escape(title) + '</title>',
  '<style>\n  ' + style + '\n</style></head>',
  '<body><div class="hint">Ctrl+P → 대상을 "PDF로 저장", 배경 그래픽 켜기</div>',
  '<p class="mark">◆</p>',
  '<h1>' + escape(title) + '</h1>',
  subtitle ? '<p>' + inline(subtitle) + '</p>' : '',
  '<hr class="rule"><hr class="rule">',
  toc,
  body,
  '</body></html>',
].join('\n');

await mkdir(outDir, { recursive: true });
const sources = (await readdir(here)).filter((n) => n.endsWith('.md')).sort();
if (!sources.length) { console.error('.md 파일이 없다'); process.exit(1); }

for (const name of sources) {
  const markdown = await readFile(path.join(here, name), 'utf8');
  const outName = name.replace(/\.md$/, '.html');

  // 표제와 부제는 page() 가 따로 조판하므로 본문에서 뺀다.
  // 문서는 "# 제목" 다음에 "> 한 줄 요약" 이 오는 모양을 쓴다.
  const lines = markdown.split(/\r?\n/);
  const titleAt = lines.findIndex((l) => /^#\s+/.test(l));
  const title = titleAt >= 0 ? lines[titleAt].replace(/^#\s+/, '') : name.replace(/\.md$/, '');
  let subtitle = '';
  let bodyFrom = titleAt + 1;
  for (let k = titleAt + 1; k < lines.length; k += 1) {
    if (!lines[k].trim()) continue;
    if (/^>\s?/.test(lines[k])) { subtitle = lines[k].replace(/^>\s?/, ''); bodyFrom = k + 1; }
    break;
  }

  const { html, toc } = withToc(render(lines.slice(bodyFrom).join('\n')));
  const rendered = page(title, subtitle, toc, html);
  await writeFile(path.join(outDir, outName), rendered, 'utf8');

  const leftover = (rendered.match(new RegExp(MARK, 'g')) || []).length;
  const sections = (toc.match(/<li/g) || []).length;
  console.log(name + '  →  print/' + outName + '  차례 ' + sections + '항목'
    + (leftover ? '  [경고] 자리표시자 ' + leftover + '개 남음' : ''));
}
console.log('\n브라우저에서 print/*.html 을 열고 Ctrl+P → "PDF로 저장".');
console.log('인쇄 대화상자에서 "배경 그래픽" 을 켜야 표 머리와 코드블록 음영이 나온다.');
