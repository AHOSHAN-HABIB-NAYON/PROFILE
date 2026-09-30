/* চাকরি সার্কুলার — service worker (offline, fast repeat visits, push) */
const VERSION = 'cc-v2';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const IMAGES = `${VERSION}-img`;
const OFFLINE = '/offline';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll([OFFLINE, '/'])).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    if (url.host === 'fonts.gstatic.com' || url.host === 'fonts.googleapis.com') {
      e.respondWith(caches.open(STATIC).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { c.put(req, r.clone()); return r; })));
    }
    return;
  }
  const p = url.pathname;
  if (p.startsWith('/api/') || p.startsWith('/cron') || p.startsWith('/install') || url.searchParams.has('_')) return;
  // admin pages: never cache (path is secret/configurable, so detect by header)
  if (req.headers.get('X-Admin') === '1') return;

  // versioned static assets: cache first
  if (/^\/(css|js|img|icons|screenshots|fonts)\//.test(p)) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  // uploaded images: cache first, bounded
  if (p.startsWith('/uploads/') && /\.(webp|jpe?g|png|gif|avif)$/i.test(p)) {
    e.respondWith(caches.open(IMAGES).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) { c.put(req, res.clone()); trim(IMAGES, 250); }
        return res;
      } catch (_) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  // pages & partial page JSON: network first, fall back to cache, then offline page
  const isPage = req.mode === 'navigate' || req.headers.get('X-Partial') === '1';
  if (!isPage) return;
  e.respondWith((async () => {
    const cache = await caches.open(PAGES);
    try {
      const preload = req.mode === 'navigate' ? await e.preloadResponse : null;
      const res = preload || await fetch(req);
      const ct = res.headers.get('content-type') || '';
      const isAdminDoc = res.headers.get('x-robots-tag') && /nofollow/.test(res.headers.get('x-robots-tag'));
      if (res.ok && !isAdminDoc && (ct.includes('text/html') || ct.includes('application/json'))) {
        cache.put(req, res.clone()); trim(PAGES, 80);
      }
      return res;
    } catch (_) {
      const hit = await cache.match(req);
      if (hit) return hit;
      if (req.headers.get('X-Partial') === '1') {
        const off = await cache.match(OFFLINE, { ignoreVary: true });
        return new Response(JSON.stringify({ title: 'অফলাইন', body: off ? extractMain(await off.text()) : '<div class="wrap state-page"><h1>ইন্টারনেট সংযোগ নেই</h1></div>', nav: '' }), { headers: { 'Content-Type': 'application/json' } });
      }
      return (await cache.match(OFFLINE, { ignoreVary: true })) || new Response('<h1>অফলাইন</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
  })());
});

function extractMain(html) {
  const m = html.match(/<main[^>]*id="app"[^>]*>([\s\S]*?)<\/main>/);
  return m ? m[1] : html;
}

/* ---------------- push ---------------- */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { title: e.data && e.data.text() }; }
  const title = d.title || 'নতুন চাকরির খবর';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-96.png', image: d.image || undefined,
    tag: d.tag || undefined, renotify: !!d.tag, lang: 'bn', data: { url: d.url || '/' },
    actions: [{ action: 'open', title: 'বিস্তারিত দেখুন' }],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin) && 'focus' in c) { await c.navigate(url).catch(() => {}); return c.focus(); }
    }
    return self.clients.openWindow(url);
  })());
});
