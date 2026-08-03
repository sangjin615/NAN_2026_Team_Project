import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(runtimeDir, path), 'utf8');

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
  './data/api-config.json': JSON.parse(apiConfig),
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

const output = indexHtml
  .replace(/\s*<base href="\/Runtime\/">/, '')
  .replace(/\s*<link rel="stylesheet" href="\.\/styles\.css">/, `\n<style>${styles}</style>`)
  .replace(/\s*<link rel="stylesheet" href="\.\/runtime-fixes\.css">/, `\n<style>${fixes}</style>`)
  .replace(
    '<script type="module" src="./src/app.js"></script>',
    `${fetchBridge}\n<script>${bundle.outputFiles[0].text.replaceAll('</script>', '<\\/script>')}</script>`,
  );

await writeFile(resolve(runtimeDir, '미지의_경매장_서버없이_실행.html'), output, 'utf8');
console.log('Built Runtime/미지의_경매장_서버없이_실행.html');
