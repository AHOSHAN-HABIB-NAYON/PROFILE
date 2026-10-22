// Offline support. App files are fetched fresh first (so updates show up right away) and the
// cached copy is only used when offline. API calls and live data are never cached.
const VERSION = 'ox-v3';
const SHELL = ['/', '/index.html', '/css/app.css?v=3', '/js/app.js', '/icons/logo.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/files/') || url.pathname.startsWith('/uploads/')) return;
  // Big libraries, models, logos and fonts: cache first (they rarely change).
  if (/^\/(vendor|coins|icons|fonts)\//.test(url.pathname)) {
    e.respondWith(caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok && !url.pathname.includes('/model/')) cache.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  // App files: network first. cache: 'no-cache' makes the browser revalidate with the server, so a
  // stale HTTP cache left by older versions (served with max-age=7d) can never return old JS/CSS.
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request)));
});
