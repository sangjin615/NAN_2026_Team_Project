import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { outputSchema, validateOutput } from '../generation-server.js';

const runtimeRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const requestPath = path.resolve(process.argv[2] || path.join(runtimeRoot, 'reports/local-model-experiment/day-1-request.json'));
const model = process.argv[3] || 'gpt-5.6-luna';
const label = String(process.argv[4] || `codex-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
const contractPath = path.join(runtimeRoot, 'contracts', 'compact-generation-contract.txt');
const reportRoot = path.join(runtimeRoot, 'reports', 'local-model-experiment');
const codexCommand = process.platform === 'win32'
  ? path.join(process.env.APPDATA, 'npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
  : 'codex';

const requestText = await readFile(requestPath, 'utf8');
const request = JSON.parse(requestText);
const contract = await readFile(contractPath, 'utf8');
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'unknown-auction-codex-'));
const schemaPath = path.join(temporaryRoot, 'output-schema.json');

function codexCompatibleSchema(value) {
  if (Array.isArray(value)) return value.map(codexCompatibleSchema);
  if (!value || typeof value !== 'object') return value;
  const converted = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, codexCompatibleSchema(child)]));
  if ('const' in converted && !converted.type) {
    converted.type = Number.isInteger(converted.const) ? 'integer' : typeof converted.const;
  }
  if (converted.prefixItems) {
    const stripDynamicConst = (item) => {
      if (Array.isArray(item)) return item.map(stripDynamicConst);
      if (!item || typeof item !== 'object') return item;
      const normalized = Object.fromEntries(Object.entries(item).map(([key, child]) => [key, stripDynamicConst(child)]));
      if ('const' in normalized) delete normalized.const;
      return normalized;
    };
    converted.items = stripDynamicConst(converted.prefixItems[0] || {});
    delete converted.prefixItems;
  }
  return converted;
}

await writeFile(schemaPath, JSON.stringify(codexCompatibleSchema(outputSchema(request))), 'utf8');

let lastError;
try {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const rawPath = path.join(reportRoot, `${label}-${request.mode}-attempt-${attempt}.raw.json`);
    const feedback = attempt === 2 ? `\nRETRY_ERRORS:\n${lastError.message}` : '';
    const prompt = `${contract}${feedback}\nINPUT:\n${requestText}`;
    const startedAt = Date.now();
    const codexArgs = [
      'exec', '--ephemeral', '--ignore-rules', '--skip-git-repo-check',
      '-s', 'read-only', '-m', model, '--output-schema', schemaPath,
      '-C', runtimeRoot, '-o', rawPath, '-',
    ];
    const executable = process.platform === 'win32' ? process.execPath : codexCommand;
    const executableArgs = process.platform === 'win32'
      ? [codexCommand, ...codexArgs]
      : codexArgs;
    const result = spawnSync(executable, executableArgs, {
      cwd: runtimeRoot,
      input: prompt,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    const latencyMs = Date.now() - startedAt;
    if (result.status !== 0) {
      lastError = new Error(`Codex CLI exited ${result.status}: ${(result.stderr || result.stdout || '').trim().slice(-1000)}`);
      await writeFile(path.join(reportRoot, `${label}-${request.mode}-attempt-${attempt}.error.json`), JSON.stringify({ model, attempt, latencyMs, error: lastError.message }, null, 2), 'utf8');
      continue;
    }
    try {
      const output = JSON.parse(await readFile(rawPath, 'utf8'));
      validateOutput(request, output);
      const artifact = { valid: true, model, attempt, latencyMs, requestPath, output };
      const artifactPath = path.join(reportRoot, `${label}-${request.mode}-valid.json`);
      await writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');
      console.log(JSON.stringify({ valid: true, model, attempt, latencyMs, artifactPath }));
      process.exitCode = 0;
      break;
    } catch (error) {
      lastError = error;
      await writeFile(path.join(reportRoot, `${label}-${request.mode}-attempt-${attempt}.error.json`), JSON.stringify({ model, attempt, latencyMs, error: error.message, rawPath }, null, 2), 'utf8');
    }
  }
  if (lastError && process.exitCode !== 0) {
    console.error(JSON.stringify({ valid: false, model, error: lastError.message, fallback: 'local-template' }));
    process.exitCode = 1;
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
