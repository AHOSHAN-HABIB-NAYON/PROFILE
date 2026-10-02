/* Service worker: offline fallback, static asset cache, public page cache,
 * Web Push display and update handling. Version comes from ?v= on register. */
const VERSION = new URL(self.location.href).searchParams.get('v') || '1';
const SCOPE = self.registration.scope; // ends with "/"
const STATIC = 'static-' + VERSION;
const PAGES = 'pages-v1';
const MEDIA = 'media-v1';
const OFFLINE = SCOPE + 'offline';
const PRECACHE = [SCOPE + 'assets/js/app.js', SCOPE + 'assets/icons/icon-192.png', SCOPE + 'assets/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(STATIC);
    await Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})));
    // offline page rendered as a guest (no cookies → no personal data cached)
    try {
      const r = await fetch(new Request(OFFLINE, { credentials: 'omit' }));
      if (r.ok) await c.put(OFFLINE, r);
    } catch {}
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = [STATIC, PAGES, MEDIA];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
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

  // Full page loads: network first, offline page as fallback (HTML is never cached: it is personalised)
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE)) || new Response('Offline', { status: 503 })));
    return;
  }

  if (url.origin === self.location.origin) {
    const path = url.pathname;
    // SPA page JSON: network first; only responses the server marks public are stored
    if (path.endsWith('/api/navigation')) {
      e.respondWith((async () => {
        try {
          const res = await fetch(req);
          if (res.ok && !req.headers.get('X-Prefetch')) {
            res.clone().json().then(async (d) => {
              if (d && d.cache && d.ok) { const c = await caches.open(PAGES); await c.put(req.url, new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } })); trim(PAGES, 40); }
            }).catch(() => {});
          }
          return res;
        } catch (err) {
          const hit = await caches.match(req.url, { cacheName: PAGES });
          if (hit) return hit;
          throw err;
        }
      })());
      return;
    }
    if (path.includes('/api/') || path.includes('/file/')) return; // never cache API/private files
    if (path.includes('/assets/uploads/')) {
      e.respondWith(caches.open(MEDIA).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) { c.put(req, res.clone()); trim(MEDIA, 120); }
        return res;
      }));
      return;
    }
    if (path.includes('/assets/')) {
      e.respondWith(caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }));
    }
    return;
  }

  // CDN fonts & icons: cache first
  if (/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.host)) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
  }
});

// ---------------------------------------------------------------------
// Web Push: payload-less "tickle" → fetch the newest notification
// ---------------------------------------------------------------------
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let n = null;
    try {
      const r = await fetch(SCOPE + 'api/notification?action=latest', { credentials: 'include', headers: { 'X-Requested-With': 'fetch' } });
      const j = await r.json();
      n = j && j.notification;
    } catch {}
    const title = (n && n.title) || 'New notification';
    await self.registration.showNotification(title, {
      body: (n && n.body) || '',
      icon: SCOPE + 'assets/icons/icon-192.png',
      badge: SCOPE + 'assets/icons/badge-72.png',
      tag: n ? 'n-' + n.id : 'general',
      renotify: true,
      data: { url: n && n.link ? n.link : SCOPE + 'notifications' },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data && e.notification.data.url || SCOPE, self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(SCOPE)) { await c.focus(); c.postMessage({ type: 'navigate', url: target }); return; }
    }
    await self.clients.openWindow(target);
  })());
});
