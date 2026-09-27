/* LifeTrack service worker — app-shell caching, offline fallback, push notifications. Version: __VERSION__ */
const VERSION = '__VERSION__';
const SHELL = `lt-shell-${VERSION}`;
const RUNTIME = `lt-runtime-${VERSION}`;
const PRECACHE = [
  '/app', '/css/base.css?v=' + VERSION, '/css/app.css?v=' + VERSION, '/js/boot.js?v=' + VERSION, '/js/app.js', '/js/core.js',
  '/js/charts.js', '/js/forms.js', '/js/push.js', '/js/outbox.js', '/js/views/home.js', '/js/views/auth.js', '/js/views/accounts.js', '/js/views/transactions.js',
  '/js/views/goals.js', '/js/views/more.js', '/js/views/reports.js', '/js/views/calendar.js', '/js/views/settings.js', '/js/views/misc.js', '/js/views/loans.js', '/js/views/mood.js',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/favicon.svg', '/offline.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('lt-') && k !== SHELL && k !== RUNTIME).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) {
    // Google fonts: cache-first
    if (req.method === 'GET' && /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(cacheFirst(req));
    return;
  }
  // Never cache API calls or private uploads — financial data must come from the server.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin') || url.pathname === '/install') return;
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const pre = await e.preloadResponse; if (pre) return pre;
        const res = await fetch(req);
        if (url.pathname.startsWith('/app') && res.ok) { const c = await caches.open(SHELL); c.put('/app', res.clone()); }
        return res;
      } catch {
        const c = await caches.open(SHELL);
        if (url.pathname.startsWith('/app')) return (await c.match('/app')) || (await c.match('/offline.html'));
        return (await caches.match(req)) || (await c.match('/offline.html'));
      }
    })());
    return;
  }
  if (/\.(css|js|svg|png|webp|avif|jpg|jpeg|ico|woff2?|json)$/.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    e.respondWith(staleWhileRevalidate(req));
  }
});

async function cacheFirst(req) {
  const hit = await caches.match(req); if (hit) return hit;
  const res = await fetch(req); const c = await caches.open(RUNTIME); c.put(req, res.clone()); return res;
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(RUNTIME);
  const hit = (await caches.match(req, { ignoreSearch: false })) || (await caches.match(req, { ignoreSearch: true }));
  const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || new Response('', { status: 504 });
}

/* ---------- Push (Web Push + FCM payloads) ---------- */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'LifeTrack', body: e.data && e.data.text() }; }
  const n = d.notification || d; const data = d.data || {};
  const title = n.title || 'LifeTrack';
  const opts = { body: n.body || '', icon: '/icons/icon-192.png', badge: '/icons/badge-72.png', tag: n.tag || data.tag || 'lifetrack', renotify: true,
    data: { link: n.link || data.link || (d.fcmOptions && d.fcmOptions.link) || '/app/notifications' }, vibrate: [60, 40, 60] };
  e.waitUntil((async () => {
    await self.registration.showNotification(title, opts);
    const cl = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    cl.forEach((c) => c.postMessage({ type: 'push' }));
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = (e.notification.data && e.notification.data.link) || '/app';
  e.waitUntil((async () => {
    const cl = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of cl) { if (new URL(c.url).origin === location.origin) { await c.focus(); c.postMessage({ type: 'navigate', url: link }); return; } }
    await self.clients.openWindow(link);
  })());
});
