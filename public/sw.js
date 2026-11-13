/* PLANUI: cache only this registration's app assets. Never touch user storage.
 * New versions stage completely and wait for the existing explicit safe-update UI.
 */
const APP_URL = new URL(self.registration.scope);
const APP_BASE = APP_URL.pathname;
const CACHE_PREFIX = `planui-assets-${encodeURIComponent(APP_BASE)}-`;
const CACHE_VERSION = '__PLANUI_CACHE_VERSION__';
const EFFECTIVE_VERSION = CACHE_VERSION.startsWith('__PLANUI_') ? 'dev-v1' : CACHE_VERSION;
const CACHE_NAME = `${CACHE_PREFIX}${EFFECTIVE_VERSION}`;
const INJECTED_PRECACHE = ['__PLANUI_PRECACHE_MANIFEST__'];
const INJECTED_REVISIONS = '__PLANUI_PRECACHE_REVISIONS__';
const PRECACHE_REVISIONS = typeof INJECTED_REVISIONS === 'object' && INJECTED_REVISIONS !== null ? INJECTED_REVISIONS : {};
const CORE_PRECACHE_URLS = INJECTED_PRECACHE[0].startsWith('__PLANUI_')
  ? [APP_BASE, ...['index.html', 'manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'].map(file => `${APP_BASE}${file}`)]
  : INJECTED_PRECACHE;
const ASSET_URLS = new Set(CORE_PRECACHE_URLS.map(url => new URL(url, APP_URL).href));
const ASSET_PATHNAMES = new Set(CORE_PRECACHE_URLS.map(url => new URL(url, APP_URL).pathname));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Fetch everything before writing; an incomplete install must not replace the old worker.
    const staged = [];
    for (const url of CORE_PRECACHE_URLS) {
      const absolute = new URL(url, APP_URL);
      if (absolute.origin !== APP_URL.origin || !absolute.pathname.startsWith(APP_BASE)) throw new Error('Invalid precache scope');
      const request = new Request(absolute, {cache: 'reload'});
      const response = await fetch(request);
      if (!response.ok || response.redirected) throw new Error(`Precache failed: ${url}`);
      staged.push([request, response]);
    }
    try {
      const cache = await caches.open(CACHE_NAME);
      for (const [request, response] of staged) await cache.put(request, response);
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
    if (!self.registration.active) await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== APP_URL.origin || !url.pathname.startsWith(APP_BASE)) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      // Keep shell and hashed assets from one version until explicit update activation.
      return (
        (await cache.match(`${APP_BASE}index.html`, {ignoreSearch: true})) ||
        (await cache.match(APP_BASE, {ignoreSearch: true})) ||
        fetch(request)
      );
    })());
  } else if (ASSET_URLS.has(url.href) || ASSET_PATHNAMES.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return (
        (await cache.match(request, {ignoreSearch: true})) ||
        (await cache.match(url.pathname, {ignoreSearch: true})) ||
        fetch(request)
      );
    })());
  }
});
