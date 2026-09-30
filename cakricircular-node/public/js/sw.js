/* ═══════════════════════════════════════════════
   চাকরি সার্কুলার — Service Worker (অফলাইন + পুশ)
   কৌশল: স্ট্যাটিক = cache-first · পেজ = network-first (অফলাইনে ক্যাশ/অফলাইন পেজ)
         ছবি = stale-while-revalidate · API = কখনো ক্যাশ নয়
   ═══════════════════════════════════════════════ */
const V = '__VERSION__';
const STATIC = 'cc-static-' + V, HTML = 'cc-html-v1', SPA = 'cc-spa-v1', IMG = 'cc-img-v1';
const SHELL = ['/css/fonts.css?v=' + V, '/css/app.css?v=' + V, '/js/app.js?v=' + V, '/fonts/hind-siliguri-bengali-400.woff2', '/fonts/hind-siliguri-bengali-600.woff2', '/fonts/hind-siliguri-latin-400.woff2', '/icons/icon-192.png'];
const PAGE_RE = /^\/($|page\/|category\/|post\/|search|trending|promoted|notices|report|about|privacy|team|saved|offline)/;
const MAX_PAGES = 70, MAX_IMG = 140;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(STATIC);
    await Promise.all(SHELL.map((u) => c.add(u).catch(() => {})));
    try { const h = await caches.open(HTML); await h.add('/offline'); const s = await caches.open(SPA); await s.put('/offline', await fetch('/offline', { headers: { 'X-SPA': '1' } })); } catch (_) {}
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('cc-static-') && k !== STATIC) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === 'skip-waiting') self.skipWaiting();
  if (d.type === 'cache-urls' && Array.isArray(d.urls)) e.waitUntil(cacheUrls(d.urls));
});

async function trim(name, max) { const c = await caches.open(name); const ks = await c.keys(); for (let i = 0; i < ks.length - max; i++) await c.delete(ks[i]); }
async function cacheUrls(urls) {
  for (const u of urls.slice(0, 30)) {
    try {
      const url = new URL(u, self.location.origin); if (!PAGE_RE.test(url.pathname)) continue;
      const [h, s] = await Promise.all([fetch(url), fetch(url, { headers: { 'X-SPA': '1' } })]);
      if (h.ok) (await caches.open(HTML)).put(url.pathname + url.search, h);
      if (s.ok) (await caches.open(SPA)).put(url.pathname + url.search, s);
    } catch (_) { /* অফলাইন */ }
  }
  trim(HTML, MAX_PAGES); trim(SPA, MAX_PAGES);
}

async function networkFirst(req, cacheName, key, timeout = 4500) {
  const cache = await caches.open(cacheName);
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    const res = await fetch(req, { signal: ctl.signal }); clearTimeout(t);
    if (res && res.ok) { cache.put(key, res.clone()); trim(cacheName, MAX_PAGES); }
    return res;
  } catch (_) {
    const hit = await cache.match(key); if (hit) return hit;
    throw _;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/notify/') || p === '/sw.js') return;

  /* স্ট্যাটিক */
  if (/^\/(css|js|fonts|icons|img|screenshots)\//.test(p)) {
    e.respondWith(caches.match(req, { ignoreSearch: false }).then((hit) => hit || fetch(req).then((res) => { if (res.ok) { const c = res.clone(); caches.open(STATIC).then((x) => x.put(req, c)); } return res; })));
    return;
  }
  /* আপলোড করা ছবি */
  if (p.startsWith('/uploads/') && /\.(jpe?g|png|webp|gif|avif)$/i.test(p)) {
    e.respondWith(caches.open(IMG).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((res) => { if (res.ok) { c.put(req, res.clone()); trim(IMG, MAX_IMG); } return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (!PAGE_RE.test(p)) return;
  const key = p + url.search;
  /* SPA (JSON) রিকোয়েস্ট */
  if (req.headers.get('X-SPA') === '1') {
    e.respondWith(networkFirst(req, SPA, key).catch(async () => (await (await caches.open(SPA)).match('/offline')) || new Response('{}', { status: 503 })));
    return;
  }
  /* সরাসরি পেজ নেভিগেশন */
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, HTML, key).catch(async () => (await (await caches.open(HTML)).match('/offline')) || new Response('ইন্টারনেট নেই', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
  }
});

/* ─── পুশ নোটিফিকেশন ─── */
self.addEventListener('push', (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: 'চাকরি সার্কুলার', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'চাকরি সার্কুলার', {
    body: d.body || '', icon: d.icon || '/icons/icon-192.png', badge: '/icons/icon-192.png', image: d.image || undefined,
    tag: d.tag || undefined, renotify: Boolean(d.tag), lang: 'bn', data: { url: d.url || '/' }, vibrate: [60, 40, 60],
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) { if ('focus' in c) { await c.focus(); c.postMessage({ type: 'go', url }); return; } }
    await self.clients.openWindow(url);
  })());
});
