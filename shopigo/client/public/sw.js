/* ShopiGo service worker — app-shell caching with safe strategies.
 *  - /assets/*   cache-first (fingerprinted, immutable)
 *  - /uploads/*  cache-first with a size cap (images are immutable per URL)
 *  - storefront GET APIs: stale-while-revalidate (instant repeat visits)
 *  - navigations: network-first, falling back to the cached shell / offline page
 * Admin, auth, checkout and order APIs are never cached.
 */
const VERSION = 'sg-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const IMAGES = `${VERSION}-images`;
const API = `${VERSION}-api`;
const PRECACHE = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.webmanifest'];
const API_CACHEABLE = /^\/api\/public\/(bootstrap|home|categories|brands|products|combos|geo|pages)/;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === 'basic') {
    cache.put(request, res.clone());
    if (max) trim(cacheName, max);
  }
  return res;
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request);
  const network = fetch(event.request).then((res) => {
    if (res.ok) cache.put(event.request, res.clone());
    return res;
  }).catch(() => hit);
  if (hit) { event.waitUntil(network); return hit; }
  return network;
}

async function navigation(request) {
  try {
    const res = await fetch(request);
    if (res.ok && !new URL(request.url).pathname.startsWith('/admin')) (await caches.open(SHELL)).put('/', res.clone());
    return res;
  } catch {
    return (await caches.match('/', { ignoreSearch: true })) || (await caches.match('/offline.html'));
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    if (url.pathname.startsWith('/install')) return;
    event.respondWith(navigation(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) { event.respondWith(cacheFirst(request, ASSETS, 400)); return; }
  if (url.pathname.startsWith('/uploads/')) { event.respondWith(cacheFirst(request, IMAGES, 600)); return; }
  if (API_CACHEABLE.test(url.pathname)) { event.respondWith(staleWhileRevalidate(event, API)); return; }
});
