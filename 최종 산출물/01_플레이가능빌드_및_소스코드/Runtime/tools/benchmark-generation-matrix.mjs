import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateOutput } from '../generation-server.js';

const runtimeRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const reportRoot = path.join(runtimeRoot, 'reports', 'model-benchmark');
const skillRoot = path.join(process.env.USERPROFILE, '.codex', 'skills', 'generate-auction-content');
const endpoint = process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434';
const requestedModels = (process.env.BENCHMARK_MODELS || 'qwen3:4b,qwen3:8b,qwen3:14b,llama3.1:8b,qwen2.5-coder:7b,qwen2.5-coder:14b').split(',').filter(Boolean);
const requestedProfiles = (process.env.BENCHMARK_PROFILES || 'skill-incompatible-schema,skill-compatible-schema,runtime-schema,runtime-json').split(',').filter(Boolean);
const trials = Math.max(1, Number(process.env.BENCHMARK_TRIALS || 1));
const mode = process.env.BENCHMARK_MODE || 'daily-content';
const runId = process.env.BENCHMARK_RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
const requestTimeoutMs = Math.max(1000, Number(process.env.BENCHMARK_TIMEOUT_MS || 120000));
const skillValidator = path.join(skillRoot, 'scripts', 'validate-output.mjs');

const text = { type: 'string', minLength: 1 };
const boundedText = (maxLength) => ({ type: 'string', minLength: 1, maxLength });
const fixedObject = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const outputSchema = (request) => request.mode === 'run-blueprint'
  ? fixedObject({
    schemaVersion: { const: '1.0' }, runSeed: { const: request.runSeed }, premise: text,
    marketArc: { type: 'array', minItems: 12, maxItems: 12, items: fixedObject({ day: { type: 'integer' }, headline: text, mood: text }) },
    sets: { type: 'array', prefixItems: request.sets.map(({ setId }) => fixedObject({
      setId: { const: setId }, title: text, sharedSecret: text, revealHint: text,
      incidentTitle: text, incidentSummary: text, newspaperLead: text,
    })), minItems: request.sets.length, maxItems: request.sets.length },
  })
  : fixedObject({
    schemaVersion: { const: '1.0' }, day: { const: request.day }, marketHeadline: text,
    lots: { type: 'array', prefixItems: request.lots.map(({ lotId }) => fixedObject({
      lotId: { const: lotId }, displayName: boundedText(20), description: boundedText(70), rumor: boundedText(45), setHint: boundedText(25), npcReaction: boundedText(45),
    })), minItems: request.lots.length, maxItems: request.lots.length },
  });

const profileDefinitions = {
  'skill-incompatible-schema': {
    contract: path.join(skillRoot, 'assets', 'compact-contract.txt'),
    structuredOutput: true,
    preflightCompatible: false,
    preflightIssue: 'skill template requires fields omitted by the Runtime response schema',
    description: 'unaltered skill template + Runtime JSON Schema (negative control)',
  },
  'skill-compatible-schema': {
    contract: path.join(runtimeRoot, 'contracts', 'compact-generation-skill-compatible.txt'),
    structuredOutput: true,
    preflightCompatible: true,
    description: 'skill template adapted only to the Runtime response shape + exact JSON Schema',
  },
  'runtime-schema': {
    contract: path.join(runtimeRoot, 'contracts', 'compact-generation-contract.txt'),
    structuredOutput: true,
    preflightCompatible: true,
    description: 'Runtime quality template + exact JSON Schema',
  },
  'runtime-json': {
    contract: path.join(runtimeRoot, 'contracts', 'compact-generation-contract.txt'),
    structuredOutput: false,
    preflightCompatible: true,
    description: 'Runtime quality template + JSON-only mode',
  },
};

function classifyErrors(errors) {
  const text = errors.join(' ');
  if (/JSON|Unexpected token|unterminated/i.test(text)) return 'harness-json';
  if (/shape|mismatch|IDs|schemaVersion|missing/i.test(text)) return 'contract-compliance';
  if (/copy quality|description|phrase|category|Korean|incident/i.test(text)) return 'narrative-quality';
  if (/HTTP|fetch|abort|timeout/i.test(text)) return 'provider-runtime';
  return errors.length ? 'unknown' : 'pass';
}

const requestFile = mode === 'run-blueprint' ? 'run-start-request.json' : 'day-1-request.json';
const requestPath = path.join(runtimeRoot, 'reports', 'local-model-experiment', requestFile);
const request = JSON.parse(await readFile(requestPath, 'utf8'));
if (request.mode !== mode) throw new Error(`request mode ${request.mode} does not match ${mode}`);

const tagsResponse = await fetch(`${endpoint}/api/tags`);
if (!tagsResponse.ok) throw new Error(`Ollama tags HTTP ${tagsResponse.status}`);
const installed = new Map((await tagsResponse.json()).models.map((entry) => [entry.name, entry]));
const models = requestedModels.filter((model) => installed.has(model));
if (!models.length) throw new Error('none of the requested Ollama models are installed');

await mkdir(reportRoot, { recursive: true });
const observations = [];
const capabilityProbes = [];

for (const model of models) {
  const ids = ['probe-a', 'probe-b', 'probe-c'];
  const probeSchema = fixedObject({
    ids: { type: 'array', prefixItems: ids.map((id) => ({ const: id })), minItems: ids.length, maxItems: ids.length },
    labels: { type: 'array', minItems: ids.length, maxItems: ids.length, items: text },
  });
  const startedAt = Date.now();
  let passed = false; let error = null; let raw;
  try {
    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt: `Return JSON only. Copy these IDs in order and write one Korean noun for each: ${JSON.stringify(ids)}`, stream: false, think: false, format: probeSchema, options: { temperature: 0 } }),
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
    raw = await response.json();
    const output = JSON.parse(raw.response);
    if (JSON.stringify(output.ids) !== JSON.stringify(ids)) throw new Error('probe ID order mismatch');
    if (!output.labels.every((label) => /[가-힣]/.test(label))) throw new Error('probe Korean generation failed');
    passed = true;
  } catch (caught) { error = caught.message; }
  capabilityProbes.push({ model, passed, error, latencyMs: Date.now() - startedAt, promptEvalCount: raw?.prompt_eval_count ?? null, evalCount: raw?.eval_count ?? null });
  process.stdout.write(`${model} capability probe: ${passed ? 'PASS' : `FAIL (${error})`}\n`);
}

for (const model of models) {
  for (const profileName of requestedProfiles) {
    const profile = profileDefinitions[profileName];
    if (!profile) throw new Error(`unknown profile: ${profileName}`);
    if (profile.preflightCompatible === false) {
      observations.push({
        model, modelBytes: installed.get(model).size, profile: profileName, profileDescription: profile.description,
        trial: 0, passed: false, fallbackRequired: false, attempts: [], totalLatencyMs: 0, totalEvalCount: 0,
        diagnosis: 'template-harness-incompatible', preflightIssue: profile.preflightIssue,
      });
      process.stdout.write(`${model} ${profileName}: SKIP (${profile.preflightIssue})\n`);
      continue;
    }
    const contract = await readFile(profile.contract, 'utf8');
    for (let trial = 1; trial <= trials; trial += 1) {
      const attempts = [];
      let passed = false;
      let lastErrors = [];
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const feedback = attempt === 2 ? `\nRETRY_ERRORS:\n${lastErrors.join('; ')}` : '';
        const prompt = `${contract}${feedback}\nINPUT:\n${JSON.stringify(request)}`;
        const startedAt = Date.now();
        let output;
        let raw;
        const errors = [];
        try {
          const response = await fetch(`${endpoint}/api/generate`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              model, prompt, stream: false, think: false,
              format: profile.structuredOutput ? outputSchema(request) : 'json',
              options: { temperature: attempt === 1 ? 0.3 : 0.1 },
            }),
            signal: AbortSignal.timeout(requestTimeoutMs),
          });
          if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
          raw = await response.json();
          output = JSON.parse(raw.response);
          validateOutput(request, output);
          passed = true;
        } catch (error) {
          errors.push(error.message);
        }
        const artifact = {
          runId, mode, model, profile: profileName, trial, attempt,
          temperature: attempt === 1 ? 0.3 : 0.1,
          latencyMs: Date.now() - startedAt,
          promptChars: prompt.length,
          promptEvalCount: raw?.prompt_eval_count ?? null,
          evalCount: raw?.eval_count ?? null,
          errors,
          output: output ?? raw?.response ?? null,
        };
        const artifactName = `${runId}-${mode}-${model.replace(/[:/]/g, '-')}-${profileName}-t${trial}-a${attempt}.json`;
        const artifactPath = path.join(reportRoot, artifactName);
        await writeFile(artifactPath, JSON.stringify(artifact, null, 2));
        const skillCheck = spawnSync(process.execPath, [skillValidator, requestPath, artifactPath], { encoding: 'utf8' });
        artifact.skillValidator = {
          passed: skillCheck.status === 0,
          result: skillCheck.stdout.trim() || skillCheck.stderr.trim(),
        };
        await writeFile(artifactPath, JSON.stringify(artifact, null, 2));
        attempts.push({ ...artifact, output: undefined, artifact: artifactName, diagnosis: classifyErrors(errors) });
        lastErrors = errors;
        if (passed) break;
      }
      observations.push({
        model, modelBytes: installed.get(model).size, profile: profileName, profileDescription: profile.description,
        trial, passed, fallbackRequired: !passed, attempts,
        totalLatencyMs: attempts.reduce((sum, item) => sum + item.latencyMs, 0),
        totalEvalCount: attempts.reduce((sum, item) => sum + (item.evalCount || 0), 0),
        diagnosis: passed ? 'pass' : attempts.at(-1)?.diagnosis,
      });
      process.stdout.write(`${model} ${profileName} trial ${trial}: ${passed ? 'PASS' : 'FALLBACK'} (${observations.at(-1).totalLatencyMs}ms)\n`);
    }
  }
}

const combinations = [];
for (const model of models) {
  for (const profile of requestedProfiles) {
    const rows = observations.filter((item) => item.model === model && item.profile === profile);
    const executableRows = rows.filter((item) => item.trial > 0);
    if (!executableRows.length) {
      combinations.push({ model, modelBytes: installed.get(model).size, profile, trials: 0, passes: 0, passRate: null, diagnosis: rows[0]?.diagnosis, preflightIssue: rows[0]?.preflightIssue });
      continue;
    }
    const passes = executableRows.filter((item) => item.passed).length;
    combinations.push({
      model, modelBytes: installed.get(model).size, profile,
      trials: executableRows.length, passes, passRate: passes / executableRows.length,
      firstPasses: executableRows.filter((item) => item.passed && item.attempts.length === 1).length,
      fallbackCount: executableRows.filter((item) => item.fallbackRequired).length,
      averageLatencyMs: Math.round(executableRows.reduce((sum, item) => sum + item.totalLatencyMs, 0) / executableRows.length),
      averageEvalCount: Math.round(executableRows.reduce((sum, item) => sum + item.totalEvalCount, 0) / executableRows.length),
      diagnoses: [...new Set(executableRows.map((item) => item.diagnosis))],
    });
  }
}

const summary = {
  runId, measuredAt: new Date().toISOString(), mode, trials,
  rules: { attempts: 2, temperatures: [0.3, 0.1], requestTimeoutMs, fallbackAfterFailure: true, validators: ['generate-auction-content validate-output.mjs', 'Runtime generation-server validateOutput'] },
  models, profiles: Object.fromEntries(requestedProfiles.map((name) => [name, profileDefinitions[name]])),
  capabilityProbes, combinations, observations,
};
const summaryPath = path.join(reportRoot, `${runId}-${mode}-summary.json`);
await writeFile(summaryPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ summaryPath, combinations }, null, 2));
