// ASSETS и VERSION генерируются scripts/build-pwa.mjs по содержимому файлов.
const BASE = self.registration.scope;
const BASE_PATH = new URL(BASE).pathname;
const CACHE_PREFIX = `lost-endings:${BASE}:`;
const CACHE = `${CACHE_PREFIX}${VERSION}`;
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map((asset) => new Request(new URL(asset, BASE), { cache: 'reload' })));
  })());
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE_PATH)) return;
  let asset = url.pathname.slice(BASE_PATH.length);
  if (asset === '') asset = 'index.html';
  if (asset === 'models') asset = 'models.html';
  if (!ASSETS.includes(asset)) return;
  // HTML, модули и Three.js всегда принадлежат одной версии.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(new URL(asset, BASE).href)) ?? fetch(event.request);
  })());
});
