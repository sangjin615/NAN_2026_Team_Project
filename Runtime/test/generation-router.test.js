import assert from 'node:assert/strict';
import test from 'node:test';
import { createHandler, deterministicFallback } from '../aws/generation-router.mjs';
import { validateOutput } from '../generation-server.js';

const dailyRequest = {
  schemaVersion: '1.0', mode: 'daily-content', runSeed: 'router-test', day: 1,
  lots: ['CER', 'CLK', 'PNT', 'BOK', 'MET', 'JEW', 'CER', 'BOK'].map((category, index) => ({
    lotId: `lot-${index + 1}`, baseName: `시험 물품 ${index + 1}`, category, grade: 'COMMON', setId: `set-${index + 1}`,
  })),
};

const blueprintRequest = {
  schemaVersion: '1.0', mode: 'run-blueprint', runSeed: 'router-blueprint',
  marketSignals: Array.from({ length: 12 }, (_, index) => ({ day: index + 1, leadingCategory: 'CER', direction: '상승' })),
  sets: Array.from({ length: 12 }, (_, index) => ({
    setId: `set-${index + 1}`,
    members: [{ baseName: `물품 ${index + 1}A` }, { baseName: `물품 ${index + 1}B` }],
  })),
};

const event = (request) => ({ body: JSON.stringify(request), requestContext: { http: { method: 'POST' } } });
const jsonResponse = (payload, status = 200) => ({ ok: status < 400, status, statusText: '', json: async () => payload });
const openAiPayload = (output) => ({ output_text: JSON.stringify(output) });
const groqPayload = (output) => ({ choices: [{ message: { content: JSON.stringify(output) } }] });

test('deterministic fallback satisfies daily and blueprint contracts', () => {
  for (const request of [dailyRequest, blueprintRequest]) validateOutput(request, deterministicFallback(request));
});

test('uses Groq first and stops after a valid result', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return jsonResponse(groqPayload(deterministicFallback(dailyRequest))); };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-generation-source'], 'groq:openai/gpt-oss-120b');
  assert.equal(calls.length, 1);
});

test('falls through Groq to gpt-4o-mini, then stops', async () => {
  const bodies = [];
  const fetchImpl = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    if (url.includes('groq.com')) return jsonResponse({ error: { message: 'rate limited' } }, 429);
    return jsonResponse(openAiPayload(deterministicFallback(dailyRequest)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-4o-mini');
  assert.deepEqual(bodies.map(({ model }) => model), ['openai/gpt-oss-120b', 'gpt-4o-mini']);
});

test('uses Luna after two invalid candidates', async () => {
  const models = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body); models.push(body.model);
    if (models.length < 3) return url.includes('groq.com') ? jsonResponse(groqPayload({ bad: true })) : jsonResponse(openAiPayload({ bad: true }));
    return jsonResponse(openAiPayload(deterministicFallback(dailyRequest)));
  };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'openai:gpt-5.6-luna');
  assert.deepEqual(models, ['openai/gpt-oss-120b', 'gpt-4o-mini', 'gpt-5.6-luna']);
});

test('returns validated static content when every provider fails', async () => {
  const fetchImpl = async () => { throw new Error('offline'); };
  const response = await createHandler({ env: { LIVE_GENERATION_ENABLED: 'true', GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl, logger: {} })(event(dailyRequest));
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-generation-source'], 'static');
  validateOutput(dailyRequest, JSON.parse(response.body));
});

test('rejects malformed requests without contacting a provider', async () => {
  let called = false;
  const response = await createHandler({ env: { GROQ_API_KEY: 'test' }, fetchImpl: async () => { called = true; }, logger: {} })({ body: '{}' });
  assert.equal(response.statusCode, 400);
  assert.equal(called, false);
});

test('keeps live providers disabled until explicitly enabled', async () => {
  let called = false;
  const response = await createHandler({ env: { GROQ_API_KEY: 'test', OPENAI_API_KEY: 'test' }, fetchImpl: async () => { called = true; }, logger: {} })(event(dailyRequest));
  assert.equal(response.headers['x-generation-source'], 'static');
  assert.equal(called, false);
});
