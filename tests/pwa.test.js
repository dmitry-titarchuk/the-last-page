import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function worker({ scope = 'https://game.test/', addAll = async () => {}, match = async () => 'cached', keys = async () => [] } = {}) {
  const events = {};
  const removed = [];
  const requests = [];
  let claimed = false;
  let skipped = false;
  runInNewContext(readFileSync(new URL('../scripts/service-worker.js', import.meta.url), 'utf8'), {
    VERSION: 'current', ASSETS: ['index.html', 'src/app.js', 'models.html'],
    Request: class extends Request {
      constructor(input, options) { super(new URL(input, 'https://game.test'), options); }
    }, URL,
    self: { registration: { scope }, location: { origin: 'https://game.test' }, addEventListener: (name, handler) => { events[name] = handler; },
      clients: { claim: async () => { claimed = true; } }, skipWaiting: () => { skipped = true; } },
    caches: { open: async () => ({ addAll, match }), keys, delete: async (key) => { removed.push(key); } },
    fetch: async (request) => { requests.push(request); return 'network'; },
  });
  return { events, removed, requests, get claimed() { return claimed; }, get skipped() { return skipped; } };
}
test('failed precache rejects installation and cannot activate an incomplete offline version', async () => {
  const w = worker({ addAll: async () => { throw Error('missing module'); } });
  let installation;
  w.events.install({ waitUntil: (promise) => { installation = promise; } });
  await assert.rejects(installation, /missing module/);
  assert.equal(w.claimed, false);
  assert.equal(w.skipped, false);
});
test('offline navigation uses the app shell including query parameters; other sites and writes are untouched', async () => {
  const paths = [];
  const w = worker({ match: async (asset) => { paths.push(asset); return 'cached'; } });
  for (const [path, expected] of [['/?source=installed', '/index.html'], ['/models', '/models.html'], ['/src/app.js?v=1', '/src/app.js']]) {
    let response;
    w.events.fetch({ request: new Request(`https://game.test${path}`), respondWith: (promise) => { response = promise; } });
    assert.equal(await response, 'cached');
    assert.equal(paths.at(-1), `https://game.test${expected}`);
  }
  for (const request of [new Request('https://other.test/src/app.js'), new Request('https://game.test/src/app.js', { method: 'POST' }), new Request('https://game.test/unknown')]) {
    w.events.fetch({ request, respondWith: () => assert.fail('unrelated request intercepted') });
  }
  assert.equal(w.requests.length, 0);
});
test('updates wait for approval and activation only removes this app’s old caches', async () => {
  const w = worker({ keys: async () => ['lost-endings:https://game.test/:old', 'lost-endings:https://game.test/:current', 'lost-endings:https://game.test/another/:old', 'other-app'] });
  assert.equal(w.skipped, false);
  w.events.message({ data: { type: 'SKIP_WAITING' } });
  assert.equal(w.skipped, true);
  let activation;
  w.events.activate({ waitUntil: (promise) => { activation = promise; } });
  await activation;
  assert.deepEqual(w.removed, ['lost-endings:https://game.test/:old']);
  assert.equal(w.claimed, true);
});
test('a repository subpath controls precache URLs and offline routes', async () => {
  const urls = [];
  const w = worker({ scope: 'https://game.test/the-last-page/',
    addAll: async (requests) => { urls.push(...requests.map((request) => request.url)); },
    match: async (url) => url });
  let installation;
  w.events.install({ waitUntil: (promise) => { installation = promise; } });
  await installation;
  assert.deepEqual(urls, ['https://game.test/the-last-page/index.html', 'https://game.test/the-last-page/src/app.js', 'https://game.test/the-last-page/models.html']);
  for (const [path, expected] of [['/?installed=1', 'index.html'], ['/src/app.js', 'src/app.js'], ['/models.html', 'models.html']]) {
    let response;
    w.events.fetch({ request: new Request(`https://game.test/the-last-page${path}`), respondWith: (promise) => { response = promise; } });
    assert.equal(await response, `https://game.test/the-last-page/${expected}`);
  }
  w.events.fetch({ request: new Request('https://game.test/src/app.js'), respondWith: () => assert.fail('request outside repository intercepted') });
});
