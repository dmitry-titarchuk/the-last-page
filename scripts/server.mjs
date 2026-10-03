import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assets, legalFiles } from './site-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT ?? 5173);
const hostFlag = process.argv.indexOf('--host');
const host = hostFlag === -1 ? '127.0.0.1' : (process.argv[hostFlag + 1] ?? '0.0.0.0');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.ico': 'image/x-icon', '.png': 'image/png', '.webmanifest': 'application/manifest+json; charset=utf-8' };
const allowed = new Set([...assets, 'sw.js']);
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname === '/models' ? 'models.html' : pathname.slice(1);
    // Сервер отдаёт те же ресурсы, которые входят в сборку и офлайн-кеш.
    if (!allowed.has(relative)) {
      response.writeHead(404).end('Not found');
      return;
    }
    const contents = await readFile(path.join(root, relative));
    response.writeHead(200, { 'Content-Type': legalFiles.includes(relative) ? 'text/plain; charset=utf-8' : types[path.extname(relative)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(contents);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.on('error', (error) => {
  console.error(`Не удалось запустить сервер: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, host, () => console.log(`Игра: http://${host}:${server.address().port}`));
