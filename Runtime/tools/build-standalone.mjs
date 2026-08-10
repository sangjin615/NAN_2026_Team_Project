// 독립 실행본을 만든다.
//
//   node tools/build-standalone.mjs
//
// audit 도 이 파일의 buildStandalone() 을 그대로 불러 결과를 커밋본과 대조한다.
// 빌드 규칙을 두 곳에 두면 갈라지므로 함수 하나만 둔다.
import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPublicGenerationConfig } from '../src/generation-api-config.js';

const runtimeDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(runtimeDir, path), 'utf8');

export const STANDALONE_FILE = '미지의_경매장_서버없이_실행.html';

export async function buildStandalone() {
  const [indexHtml, styles, fixes, contract, apiConfig, balance, catalog, audioMap] = await Promise.all([
    read('index.html'),
    read('styles.css'),
    read('runtime-fixes.css'),
    read('contracts/vsl-map.template.json'),
    read('data/api-config.json'),
    read('data/balance.json'),
    read('assets/items/catalog.json'),
    read('data/audio-map.json'),
  ]);

  const bundle = await build({
    entryPoints: [resolve(runtimeDir, 'src/app.js')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    write: false,
    minify: false,
    target: ['chrome100', 'edge100'],
  });

  const embedded = {
    './contracts/vsl-map.template.json': JSON.parse(contract),
    './data/api-config.json': assertPublicGenerationConfig(JSON.parse(apiConfig)),
    './data/balance.json': JSON.parse(balance),
    './assets/items/catalog.json': JSON.parse(catalog),
    './data/audio-map.json': JSON.parse(audioMap),
  };

  const fetchBridge = `
<script>
  (() => {
    const embedded = ${JSON.stringify(embedded).replaceAll('</script>', '<\\/script>')};
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const key = typeof input === 'string' ? input : input?.url;
      if (Object.prototype.hasOwnProperty.call(embedded, key)) {
        return Promise.resolve(new Response(JSON.stringify(embedded[key]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }));
      }
      return nativeFetch(input, init);
    };
  })();
</script>`;

  return indexHtml
    .replace(/\s*<base href="\/Runtime\/">/, '')
    .replace(/\s*<link rel="stylesheet" href="\.\/styles\.css">/, `\n<style>${styles}</style>`)
    .replace(/\s*<link rel="stylesheet" href="\.\/runtime-fixes\.css">/, `\n<style>${fixes}</style>`)
    .replace(
      '<script type="module" src="./src/app.js"></script>',
      `${fetchBridge}\n<script>${bundle.outputFiles[0].text.replaceAll('</script>', '<\\/script>')}</script>`,
    );
}

// 커밋된 독립 실행본이 현재 소스와 같은지 본다. 다르면 누군가 src 나 data 를
// 고치고 다시 만들지 않은 것이다. 그 상태로 두면 서버 없이 실행하는 사람이 옛
// 빌드를 본다. 실제로 한 번의 UI 작업에서 세 번 빠졌다.
export async function standaloneIsCurrent() {
  const [expected, actual] = await Promise.all([
    buildStandalone(),
    read(STANDALONE_FILE).catch(() => null),
  ]);
  // 줄바꿈만 다른 것은 문제가 아니다. git 이 CRLF 로 바꿔 저장할 수 있다.
  const normalize = (value) => String(value ?? '').replaceAll('\r\n', '\n');
  return { current: actual !== null && normalize(expected) === normalize(actual), missing: actual === null };
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  await writeFile(resolve(runtimeDir, STANDALONE_FILE), await buildStandalone(), 'utf8');
  console.log(`Built Runtime/${STANDALONE_FILE}`);
}
