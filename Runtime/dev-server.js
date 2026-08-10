import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(runtimeRoot);
const port = Number(process.env.PORT || 4173);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.wav', 'audio/wav'], ['.mp3', 'audio/mpeg']
]);

createServer(async (request, response) => {
  try {
    const urlPath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
    const relative = urlPath === '/' ? 'Runtime/index.html' : urlPath.replace(/^\/+/, '');
    const resolved = path.resolve(repositoryRoot, relative);
    if (!resolved.startsWith(repositoryRoot + path.sep)) throw new Error('outside repository');
    const info = await stat(resolved);
    const file = info.isDirectory() ? path.join(resolved, 'index.html') : resolved;
    response.writeHead(200, {
      'content-type': mime.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
}).listen(port, () => console.log(`Unknown Auction runtime: http://localhost:${port}/`));
