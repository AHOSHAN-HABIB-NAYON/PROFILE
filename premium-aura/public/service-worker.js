/* Premium Aura service worker — app-shell caching; API calls always go to the network. */
const VERSION = 'aura-v1.7.0';
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
  if (/^\/assets\//.test(url.pathname)) {
    // App code: network first (always the latest version), cache only as an offline fallback.
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch { return (await cache.match(req)) || Response.error(); }
    }));
    return;
  }
  if (/^\/(vendor|uploads\/public)\//.test(url.pathname)) {
    // Fonts, icons, uploaded images: stale-while-revalidate.
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || network;
    }));
  }
});

// ---- Browser push: show the notification, open the app on tap
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'Premium Aura', body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || 'Premium Aura', {
    body: d.body || '', icon: '/assets/icons/icon-192.png', badge: '/assets/icons/icon-192.png',
    tag: d.tag || undefined, renotify: !!d.tag, data: { link: d.link || '/' }, vibrate: [60, 40, 60],
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.link || '/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.startsWith(self.location.origin) && 'focus' in c) { c.navigate?.(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
