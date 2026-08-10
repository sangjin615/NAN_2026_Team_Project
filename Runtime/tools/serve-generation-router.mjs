// AWS 라우터를 배포 없이 실제 게임에 붙인다.
//
//   LIVE_GENERATION_ENABLED=true OPENAI_API_KEY=... node tools/serve-generation-router.mjs
//
// `generation-server.js` 와 같은 자리(127.0.0.1:8787/generate)에 서므로
// `data/api-config.json` 을 고칠 필요가 없다. 둘 중 하나만 띄운다.
//
//   generation-server.js            로컬 ollama. 느리지만 키가 필요 없다
//   tools/serve-generation-router   배포될 라우터 코드 그대로. 실제 공급자를 쓴다
//
// 측정 도구(`measure-generation-router.mjs`)와 같은 핸들러를 쓴다. 다른 점은
// 요청을 게임이 보낸다는 것뿐이다 — 버퍼 선행 호출, 동시 3일, 취소 버튼처럼
// 도구로는 재현하지 않는 모양이 여기서 드러난다.
import { createServer } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHandler } from '../aws/generation-router.mjs';

const port = Number(process.env.GENERATION_PORT || 8787);
const env = process.env;

if (env.LIVE_GENERATION_ENABLED !== 'true') {
  console.warn('LIVE_GENERATION_ENABLED=true 가 없다. 공급자를 하나도 만들지 않고 static 대체 문구만 돌려준다.');
}

// 라우터가 실패할 때마다 남기는 사유를 한 줄로 접어 찍는다. 게임을 돌리는 동안
// 어느 공급자가 왜 떨어지는지 실시간으로 보인다.
//
// **요청마다 따로 모아야 한다.** GenerationBuffer 가 일자 3건을 동시에 부르므로
// 배열 하나를 공유하면 남의 실패가 내 요약에 붙는다. 실제로 그렇게 찍혀서
// `run-blueprint` 머리말 아래 일자 생성 실패가 나왔고, 그걸 보고 원인을 잘못
// 짚을 뻔했다.
const requestEvents = new AsyncLocalStorage();
const logger = {
  info() {},
  warn(name, detail = {}) { requestEvents.getStore()?.push({ name, ...detail }); },
};

const reasonOf = ({ error, errors, name }) => {
  if (error?.name || error?.message) return [error.name, error.message].filter(Boolean).join(': ');
  if (Array.isArray(errors)) return errors.join('; ');
  return String(error || errors || name);
};

const handler = createHandler({ env, logger });

const readBody = (request) => new Promise((resolve, reject) => {
  let body = '';
  request.on('data', (chunk) => { body += chunk; });
  request.on('end', () => resolve(body));
  request.on('error', reject);
});

createServer(async (request, response) => {
  // 게임은 4199 같은 다른 포트에서 뜬다. 프리플라이트를 받아줘야 붙는다.
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  };
  if (request.method === 'OPTIONS') {
    response.writeHead(204, cors);
    response.end();
    return;
  }
  if (request.method !== 'POST' || request.url !== '/generate') {
    response.writeHead(404, { ...cors, 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: false, error: 'not_found' }));
    return;
  }

  const body = await readBody(request);
  const startedAt = Date.now();
  const events = [];
  const result = await requestEvents.run(events, () => handler({ body, requestContext: { http: { method: 'POST' } } }));
  const elapsed = Date.now() - startedAt;

  let label = 'unknown';
  try {
    const parsed = JSON.parse(body);
    label = parsed.mode === 'run-blueprint' ? 'run-blueprint' : `day ${parsed.day}`;
  } catch { /* 잘못된 요청은 라우터가 400 으로 답한다 */ }

  const source = result.headers['x-generation-source'] || '(없음)';
  console.log(`${label.padEnd(14)} ${result.statusCode} · ${(elapsed / 1000).toFixed(1)}초 · ${source}`);
  // 같은 사유는 접어서 센다. LOT 8개가 같은 이유로 떨어지면 한 줄이다.
  const bucket = new Map();
  for (const event of events) {
    const key = `${event.model ? `${event.provider}:${event.model}` : event.provider || '-'} · ${event.name} · ${reasonOf(event).slice(0, 90)}`;
    bucket.set(key, (bucket.get(key) || 0) + 1);
  }
  for (const [key, count] of [...bucket].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(2)}회  ${key}`);
  }

  response.writeHead(result.statusCode, { ...result.headers, ...cors });
  response.end(result.body);
}).listen(port, '127.0.0.1', () => {
  console.log(`AWS 라우터를 로컬에 세웠다: http://127.0.0.1:${port}/generate`);
  console.log(`  GROQ_DAILY_ENABLED : ${env.GROQ_DAILY_ENABLED === 'true' ? 'true' : 'false — groq 는 빠진다'}`);
  console.log(`  daily              : ${env.FALLBACK_MODEL || 'gpt-5.6-luna'} → ${env.SECONDARY_MODEL || 'gpt-4o-mini'}`);
  console.log(`  blueprint          : ${env.SECONDARY_MODEL || 'gpt-4o-mini'} → ${env.FALLBACK_MODEL || 'gpt-5.6-luna'}`);
});
