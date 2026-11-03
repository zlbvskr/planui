/* PLANUI Service Worker — Static HTTPS & Offline Asset Cache (Stage 12, C21)
 *
 * Guarantees:
 * 1. Atomic Precache Staging (12.3): Fetches and verifies all required core assets
 *    before committing the new cache version. Interrupted asset updates reject
 *    install and never replace a working installation with an incomplete asset set.
 * 2. Strict Separation of Lifecycles (12.2, 12.3): Only manages CacheStorage keys
 *    prefixed with "planui-assets-". Never deletes or modifies IndexedDB (planui_db)
 *    or user local media blobs.
 * 3. Safe Update Activation (12.3): Does not force reload over dirty editors.
 *    Waits for explicit { type: 'SKIP_WAITING' } from the client when updating
 *    an existing controlled installation.
 */

const CACHE_PREFIX = 'planui-assets-';
const CACHE_VERSION = '__PLANUI_CACHE_VERSION__';
const EFFECTIVE_VERSION =
  CACHE_VERSION.indexOf('__PLANUI_') === 0 ? 'dev-v1' : CACHE_VERSION;
const CACHE_NAME = `${CACHE_PREFIX}${EFFECTIVE_VERSION}`;

const INJECTED_PRECACHE = ['__PLANUI_PRECACHE_MANIFEST__'];
const CORE_PRECACHE_URLS =
  INJECTED_PRECACHE.length === 1 &&
  INJECTED_PRECACHE[0].indexOf('__PLANUI_') === 0
    ? [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/icon.svg',
        '/apple-touch-icon.png',
        '/pwa-192x192.png',
        '/pwa-512x512.png',
        '/pwa-maskable-512x512.png',
      ]
    : INJECTED_PRECACHE;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const stagedEntries = [];
      for (const rawUrl of CORE_PRECACHE_URLS) {
        const req = new Request(rawUrl, { cache: 'reload' });
        const resp = await fetch(req);
        if (!resp || !resp.ok) {
          throw new Error(`Precache fetch failed for ${rawUrl}: ${resp ? resp.status : 'no response'}`);
        }
        stagedEntries.push([req, resp.clone()]);
      }

      const cache = await caches.open(CACHE_NAME);
      for (const [req, resp] of stagedEntries) {
        await cache.put(req, resp);
      }

      // If there is no active controller yet (first install), activate immediately.
      // Otherwise remain in waiting state until the UI confirms no editors are dirty.
      if (!self.registration || !self.registration.active) {
        await self.skipWaiting();
      }
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      for (const key of keys) {
        if (key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE_NAME) {
          await caches.delete(key);
        }
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    // External links require network and are outside offline guarantees (12.2 / C21)
    return;
  }

  // Ignore Vite HMR websocket/ping endpoints
  if (url.pathname.indexOf('/__vite') === 0) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const networkResp = await fetch(request);
          if (networkResp && networkResp.ok) {
            await cache.put('/index.html', networkResp.clone());
            return networkResp;
          }
        } catch {
          // Offline fallback to cached app shell
        }
        const cachedIndex =
          (await cache.match(request)) ||
          (await cache.match('/index.html')) ||
          (await cache.match('/'));
        if (cachedIndex) return cachedIndex;
        return Response.error();
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const isProductionVersioned = EFFECTIVE_VERSION !== 'dev-v1';

      if (isProductionVersioned) {
        const cached = await cache.match(request);
        if (cached) return cached;
      }

      try {
        const networkResp = await fetch(request);
        if (networkResp && networkResp.ok && networkResp.status === 200) {
          await cache.put(request, networkResp.clone());
        }
        return networkResp;
      } catch {
        const cached =
          (await cache.match(request)) ||
          (await cache.match(url.pathname));
        if (cached) return cached;
        return Response.error();
      }
    })()
  );
});
