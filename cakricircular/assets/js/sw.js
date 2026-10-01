/* =========================================================
   CakriCircular Service Worker
   নিয়ম: HTML/ডেটা সবসময় নেটওয়ার্ক থেকে (পুরনো কনটেন্ট কখনো দেখাবে না)
          ছবি/ফন্ট/আইকন ক্যাশ থেকে (দ্রুত লোড)
   ========================================================= */
var SHELL = 'cc-shell-v3';
var MEDIA = 'cc-media-v3';

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== MEDIA) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('message', function (e) {
  if (e.data === 'clear') {
    caches.keys().then(function (keys) { keys.forEach(function (k) { caches.delete(k); }); });
  }
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== location.origin) return;               // CDN নিজের মতো চলুক
  if (url.pathname.indexOf('/api/') === 0) return;          // API কখনো ক্যাশ নয়

  var isMedia = /\.(jpg|jpeg|png|webp|gif|svg|ico|woff2?)$/i.test(url.pathname);

  if (isMedia) {                                            // ছবি: ক্যাশ আগে
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(MEDIA).then(function (c) { c.put(req, copy); });
          return res;
        });
      })
    );
    return;
  }

  /* HTML ও অন্য সব: নেটওয়ার্ক আগে, নেট না থাকলে শেষ কপি */
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200 && req.headers.get('X-SPA') !== '1') {
        var copy = res.clone();
        caches.open(SHELL).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || new Response(
          '<!doctype html><meta charset="utf-8"><title>অফলাইন</title>' +
          '<body style="margin:0;display:grid;place-items:center;height:100vh;font-family:system-ui;background:#f3f7f6;color:#13211f">' +
          '<div style="text-align:center;padding:24px"><div style="font-size:2.4rem">📶</div>' +
          '<h2 style="margin:10px 0 6px">ইন্টারনেট সংযোগ নেই</h2>' +
          '<p style="color:#64757a">সংযোগ ফিরে এলে পেজটি আবার লোড করুন।</p></div></body>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      });
    })
  );
});
