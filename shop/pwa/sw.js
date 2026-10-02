/* Service worker — served at /sw.js by SystemController (version + precache list injected).
   Static assets: cache-first. Product/banner images: cache-first with a size cap.
   Pages: network-first with offline fallback. Admin, API, cart, checkout and order pages are NEVER cached. */
const VERSION = '__VERSION__';
const STATIC = 'static-' + VERSION;
const IMAGES = 'images-v1';
const PAGES = 'pages-' + VERSION;
const PRECACHE = __PRECACHE__;
const PRIVATE = /^\/(admin|api|cart|checkout|order-success|my-orders|install)(\/|$)/;
const MAX_IMAGES = 250;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![STATIC, IMAGES, PAGES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Third-party CSS/fonts (Font Awesome, Google Fonts): stale-while-revalidate.
  if (url.origin !== location.origin) {
    if (/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.host)) {
      e.respondWith(caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
        return hit || net;
      }));
    }
    return;
  }

  if (PRIVATE.test(url.pathname) || req.headers.get('X-SPA') === '1') return; // private/dynamic data: network only

  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(STATIC).then((c) => c.put(req, copy)); }
      return r;
    })));
    return;
  }

  if (url.pathname.startsWith('/uploads/')) {
    e.respondWith(caches.open(IMAGES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const r = await fetch(req);
      if (r.ok) { c.put(req, r.clone()); trim(IMAGES, MAX_IMAGES); }
      return r;
    }).catch(() => caches.match('/assets/images/placeholder.svg')));
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok && r.headers.get('content-type') && r.headers.get('content-type').includes('text/html') && !/no-store|private/.test(r.headers.get('cache-control') || '')) {
        const copy = r.clone();
        caches.open(PAGES).then((c) => { c.put(req, copy); trim(PAGES, 30); });
      }
      return r;
    }).catch(async () => (await caches.match(req)) || caches.match('/offline')));
  }
});
