/* Premium Aura service worker — app-shell caching; API calls always go to the network. */
const VERSION = 'aura-v1.1.0';
const SHELL = [
  '/offline.html',
  '/assets/css/app.css',
  '/assets/js/core.js',
  '/assets/js/app.js',
  '/assets/js/theme-boot.js',
  '/assets/js/fit.js',
  '/assets/icons/favicon.svg',
  '/assets/icons/icon-192.png',
  '/vendor/fontawesome/css/all.min.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  // Never cache API, sockets, admin modules, private files or installer.
  if (/^\/(api|socket\.io|admin-assets|install)\b/.test(url.pathname)) return;

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
    return;
  }
  if (/^\/(assets|vendor|uploads\/public)\//.test(url.pathname)) {
    // stale-while-revalidate for static assets
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || network;
    }));
  }
});
