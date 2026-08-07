import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';

const runtimeRoot = path.resolve(import.meta.dirname, '..');
const outputRoot = path.join(runtimeRoot, 'dist', 'generation-lambda');
await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const contract = await readFile(path.join(runtimeRoot, 'contracts', 'compact-generation-contract.txt'), 'utf8');
await build({
  entryPoints: [path.join(runtimeRoot, 'aws', 'generation-router.mjs')],
  outfile: path.join(outputRoot, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: false,
  define: { __BUNDLED_GENERATION_CONTRACT__: JSON.stringify(contract) },
});
console.log(outputRoot);
