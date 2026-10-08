/*!
 * Service worker — app-shell asset cache + offline fallback.
 * Never caches admin pages, API responses, cart/checkout/order pages or anything private.
 */
var VERSION = 'ns-v1';
var STATIC_CACHE = VERSION + '-static';
var PAGE_CACHE = VERSION + '-pages';
var SCOPE = self.registration ? new URL(self.registration.scope).pathname.replace(/\/$/, '') : '';
var OFFLINE_URL = SCOPE + '/offline';
var PRIVATE = /\/(admin|api|cart|checkout|order|orders|profile)(\/|$|\?)/;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(PAGE_CACHE)
      .then(function (cache) { return cache.add(new Request(OFFLINE_URL, { credentials: 'same-origin' })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf(VERSION) !== 0; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  // Versioned static assets (?v=mtime) and uploaded images: cache-first.
  if (url.origin === location.origin && /\/(assets|uploads)\//.test(url.pathname) && !PRIVATE.test(url.pathname)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(function (cache) {
        return cache.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res.ok && res.type === 'basic') cache.put(req, res.clone());
            return res;
          });
        });
      })
    );
    return;
  }

  // Full page navigations: network-first; offline → friendly Bengali page.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match(OFFLINE_URL).then(function (r) {
          return r || new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><h1 style="font-family:sans-serif;text-align:center;margin-top:30vh">ইন্টারনেট সংযোগ নেই</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        });
      })
    );
  }
});
