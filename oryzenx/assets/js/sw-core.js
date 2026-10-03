/* Oryzenx service worker body. VERSION, BASE and PRECACHE are injected by /sw.js. */
/* global VERSION, BASE, PRECACHE */
const STATIC = 'static-' + VERSION;
const PAGES = 'pages-' + VERSION;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

const isPrivate = (p) => /^\/(admin|api|profile|payment|files|notifications|login|register|logout|auth|install)/.test(p);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const path = url.pathname.slice(BASE.length) || '/';

  // Static assets (same-origin /assets and CDN fonts/icons): stale-while-revalidate.
  if ((url.origin === location.origin && path.startsWith('/assets/') && !path.startsWith('/assets/uploads/'))
      || /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.host)) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // Full page navigations: network first, fall back to cache, then the offline page.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        if (r.ok && !isPrivate(path)) (await caches.open(PAGES)).put(req, r.clone());
        return r;
      } catch {
        return (await caches.match(req)) || (await caches.match(BASE + '/offline')) || Response.error();
      }
    })());
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: 'Notification', body: e.data && e.data.text() }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || 'Oryzenx', {
      body: d.body || '', icon: d.icon || BASE + '/icon-192.png', badge: BASE + '/icon-192.png',
      data: { url: d.url || BASE + '/notifications' }, tag: d.tag || undefined, renotify: !!d.tag,
      requireInteraction: d.priority === 'high', silent: false, vibrate: [120, 60, 120],
    }),
    // Tell open tabs so they can play the in-app sound and update the badge live.
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => all.forEach((c) => c.postMessage({ type: 'push', title: d.title, body: d.body }))),
  ]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = e.notification.data && e.notification.data.url;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { await c.focus(); if (target && 'navigate' in c) c.navigate(target); return; } }
    if (target) self.clients.openWindow(target);
  })());
});
