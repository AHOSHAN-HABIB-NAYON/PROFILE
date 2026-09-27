/* TradeTeam service worker.
 * - Caches the static application shell (Next.js build assets, icons) for fast, installable loads.
 * - NEVER caches or replays API, WebSocket or authentication traffic: trading and financial
 *   operations cannot execute offline. Offline navigations get a static offline page.
 * - Receives Web Push notifications.
 */
const VERSION = 'tt-v1';
const SHELL = ['/offline.html', '/icons/icon-192.png', '/icons/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // mutations always go to the network
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return; // never cached
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    // immutable, content-hashed assets: cache-first
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
  }
});

self.addEventListener('push', (e) => {
  let data = { title: 'TradeTeam', body: '' };
  try {
    data = e.data ? e.data.json() : data;
  } catch (_) {
    /* ignore */
  }
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: data.data || {} }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('/notifications');
    }),
  );
});
