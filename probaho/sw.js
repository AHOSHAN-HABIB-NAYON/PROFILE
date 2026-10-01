/* =====================================================================
   Probaho service worker — offline shell, asset cache, Web Push.
   Note: /manifest.json is served dynamically by PHP (static file is a fallback).
   ===================================================================== */
const VERSION = 'pb-v1';
const SCOPE = self.registration.scope;             // works at domain root or in a sub-folder
const OFFLINE_URL = SCOPE + 'offline';
const PRECACHE = [OFFLINE_URL, SCOPE + 'assets/css/app.css', SCOPE + 'assets/js/app.js', SCOPE + 'assets/images/logo.svg', SCOPE + 'assets/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const path = url.pathname;
  // Never cache APIs, admin, auth flows or SPA fragment requests (always fresh, user-specific).
  if (/\/(api|v2admin|auth|install)(\/|$)/.test(path) || req.headers.get('X-SPA') === '1') return;

  // Static assets: cache-first (they are versioned with ?v=hash).
  if (/\/(assets|uploads)\//.test(path)) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }
  // Navigations: network-first, offline page as fallback.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
  }
});

self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = { title: 'নতুন নোটিফিকেশন', body: e.data && e.data.text() }; }
  const title = data.title || 'Probaho';
  e.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || SCOPE + 'assets/icons/icon-192.png',
      badge: data.badge || SCOPE + 'assets/icons/badge-72.png',
      tag: data.tag || 'general',
      renotify: true,
      data: { url: data.url || SCOPE + 'notifications' },
      vibrate: [80, 40, 80],
    }),
    self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'push' }))),
  ]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || SCOPE;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if (c.url.startsWith(SCOPE) && 'focus' in c) {
          c.postMessage({ type: 'navigate', url: target });
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
