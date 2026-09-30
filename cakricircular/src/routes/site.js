'use strict';
const express = require('express');
const db = require('../db');
const data = require('../data');
const cache = require('../cache');
const settings = require('../settings');
const analytics = require('../analytics');
const push = require('../util/push');
const mailer = require('../util/mailer');
const uploads = require('../util/uploads');
const { rateLimit, clientIp, token } = require('../util/security');
const { strip, truncate, esc, html } = require('../util/html');
const { bnDate, bnCount } = require('../util/bn');
const { asset } = require('../assets');
const L = require('../views/site/layout');
const V = require('../views/site/pages');
const C = require('../views/site/components');

const router = express.Router();

const formtoken = require('../util/formtoken');
const formToken = formtoken.create;
const checkFormToken = (t) => formtoken.verify(t, { minAgeMs: 1500 });
function sameOrigin(req) {
  const o = req.headers.origin || req.headers.referer;
  if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch (_) { return false; }
}

/* ---------- rendering with page cache ---------- */
const isPartial = (req) => req.headers['x-partial'] === '1';

function cacheKey(req) { return (isPartial(req) ? 'P:' : 'F:') + req.originalUrl; }

function sendEntry(req, res, entry) {
  res.status(entry.status);
  for (const [k, v] of Object.entries(entry.headers)) res.setHeader(k, v);
  res.setHeader('ETag', entry.etag);
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Vary', 'X-Partial');
  if (entry.status === 200 && req.headers['if-none-match'] === entry.etag) return res.status(304).end();
  res.send(entry.body);
}

function cached(handler, ttl) {
  return async (req, res, next) => {
    try {
      req.cacheable = (req.method === 'GET' || req.method === 'HEAD') && !Object.keys(req.query).some((k) => k.startsWith('_'));
      if (req.cacheable) {
        const hit = cache.getPage(cacheKey(req));
        if (hit) { res.setHeader('X-Cache', 'HIT'); return sendEntry(req, res, hit); }
      }
      const page = await handler(req, res, next);
      if (!page || res.headersSent) return undefined;
      return output(req, res, page, ttl);
    } catch (e) { return next(e); }
  };
}

async function output(req, res, page, ttl = 120000) {
  const status = page.status || 200;
  let body; let headers;
  if (isPartial(req)) {
    body = JSON.stringify({ title: page.title ? `${page.title} | ${settings.get('site_name')}` : settings.get('meta_title'), body: String(page.body), nav: page.nav || '', bodyClass: page.bodyClass || '', status });
    headers = { 'Content-Type': 'application/json; charset=utf-8' };
  } else {
    body = L.document(req, await L.shared(), page);
    headers = { 'Content-Type': 'text/html; charset=utf-8' };
  }
  const entry = req.cacheable && (status === 200 || status === 404) && page.cache !== false
    ? cache.setPage(cacheKey(req), body, { ttl, status, headers })
    : { body, status, headers, etag: `W/"${Date.now()}"` };
  res.setHeader('X-Cache', 'MISS');
  return sendEntry(req, res, entry);
}

function pageNum(req) { const n = parseInt(req.query.page, 10); return Number.isFinite(n) && n > 0 && n < 5000 ? n : 1; }

async function sideCtx() {
  const [notices, trending, ads] = await Promise.all([data.notices(8), data.trending(8), data.ads()]);
  return { notices, trending, ads };
}

/* ---------- pages ---------- */
router.get('/', cached(async (req) => {
  const [latestRaw, promos, banners, cats, total, today, side] = await Promise.all([
    data.latest({ page: 1 }), data.premium(10), data.banners(), data.categories(), data.totalPosts(), data.todayPosts(), sideCtx(),
  ]);
  const latest = { ...latestRaw, rows: data.weavePremium(latestRaw.rows, promos) };
  const base = L.origin(req);
  return {
    body: V.home({ latest, banners, cats, total, today, ...side }), nav: 'home', bodyClass: 'is-home', canonical: '/',
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'Organization', name: settings.get('site_name'), url: base, logo: base + L.logoUrl().split('?')[0], email: settings.get('contact_email'), sameAs: ['social_facebook', 'social_youtube', 'social_x', 'social_telegram', 'social_linkedin'].map((k) => settings.get(k)).filter(Boolean) },
      { '@context': 'https://schema.org', '@type': 'WebSite', name: settings.get('site_name'), url: base, inLanguage: 'bn-BD', potentialAction: { '@type': 'SearchAction', target: `${base}/search?q={search_term_string}`, 'query-input': 'required name=search_term_string' } },
    ],
  };
}));

router.get('/api/posts', async (req, res, next) => {
  try {
    const page = pageNum(req);
    const cat = parseInt(req.query.cat, 10) || null;
    const r = await data.latest({ page, categoryId: cat });
    const ads = (await data.ads()).home_feed || [];
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ html: String(C.cardList(r.rows, { ads, adEvery: 6 })), hasMore: r.hasMore, next: r.hasMore ? `/api/posts?page=${page + 1}${cat ? `&cat=${cat}` : ''}` : null });
  } catch (e) { next(e); }
});

router.get('/categories', cached(async () => ({
  title: 'ক্যাটাগরি সমূহ', body: V.categoriesPage(await data.categories()), nav: 'cats', desc: 'সরকারি চাকরি, বেসরকারি চাকরি, ভর্তি, রেজাল্ট, নোটিশ ও স্কলারশিপ — সব ক্যাটাগরি এক জায়গায়।',
})));

router.get('/category/:slug', cached(async (req) => {
  const cat = await data.categoryBySlug(req.params.slug);
  if (!cat) return notFoundPage();
  const page = pageNum(req);
  const [r, side] = await Promise.all([data.latest({ page, categoryId: cat.id }), sideCtx()]);
  const base = L.origin(req);
  const path = `/category/${encodeURIComponent(cat.slug)}`;
  return {
    title: cat.meta_title || (page > 1 ? `${cat.name} — পৃষ্ঠা ${page}` : cat.name),
    desc: cat.meta_desc || cat.description || `${cat.name} এর সর্বশেষ সার্কুলার ও আপডেট।`,
    canonical: path + (page > 1 ? `?page=${page}` : ''), nav: 'cats',
    body: V.listPage({ title: cat.name, rows: r.rows, page, hasMore: r.hasMore, base: path, ctx: side, total: r.total, crumbs: [{ name: 'হোম', url: '/' }, { name: 'ক্যাটাগরি', url: '/categories' }, { name: cat.name }] }),
    jsonld: [breadcrumb(base, [['হোম', '/'], ['ক্যাটাগরি', '/categories'], [cat.name, path]])],
  };
}));

router.get('/posts', cached(async (req) => {
  const page = pageNum(req);
  const [r, side] = await Promise.all([data.latest({ page }), sideCtx()]);
  return { title: page > 1 ? `সকল পোস্ট — পৃষ্ঠা ${page}` : 'সকল পোস্ট', canonical: '/posts' + (page > 1 ? `?page=${page}` : ''), nav: 'home', body: V.listPage({ title: 'সকল পোস্ট', rows: r.rows, page, hasMore: r.hasMore, base: '/posts', ctx: side, total: r.total }) };
}));

router.get('/trending', cached(async () => {
  const [rows, side] = await Promise.all([data.trending(30), sideCtx()]);
  return { title: 'ট্রেন্ডিং চাকরি', desc: 'এই সপ্তাহে সবচেয়ে বেশি দেখা চাকরির খবর।', nav: 'trending', body: V.listPage({ title: 'ট্রেন্ডিং চাকরি', sub: 'সবার বেশি দেখা হচ্ছে', rows, page: 1, hasMore: false, base: '/trending', ctx: side }) };
}));

router.get('/premium', cached(async () => {
  const [rows, side] = await Promise.all([data.premium(50), sideCtx()]);
  return { title: 'প্রিমিয়াম পোস্ট', nav: 'premium', body: V.listPage({ title: 'প্রিমিয়াম পোস্ট', sub: 'বিশেষ ও গুরুত্বপূর্ণ বিজ্ঞপ্তি', rows, page: 1, hasMore: false, base: '/premium', ctx: side }) };
}));

router.get('/post/:slug', cached(async (req, res) => {
  const found = await data.postBySlug(req.params.slug);
  if (!found) return notFoundPage();
  if (found.redirect) { res.redirect(301, `/post/${encodeURIComponent(found.redirect)}`); return null; }
  const p = found.post;
  const [related, side] = await Promise.all([data.related(p), sideCtx()]);
  const base = L.origin(req);
  const path = `/post/${encodeURIComponent(p.slug)}`;
  const desc = p.meta_desc || p.excerpt || truncate(strip(p.content), 160);
  return {
    title: p.meta_title || p.title, desc, keywords: p.keywords, canonical: path, type: 'article', nav: 'post',
    image: p.thumbnail ? uploads.url(p.thumbnail) : '',
    body: V.postDetail({ post: p, related, ...side }),
    jsonld: [structured(p, base, path, desc), breadcrumb(base, [['হোম', '/'], ...(p.cat_slug ? [[p.cat_name, `/category/${encodeURIComponent(p.cat_slug)}`]] : []), [p.title, path]])],
  };
}, 60000));

router.get('/search', cached(async (req) => {
  const q = String(req.query.q || '').slice(0, 100).trim();
  const catId = parseInt(req.query.cat, 10) || null;
  const division = V.DIVISIONS.includes(req.query.div) ? req.query.div : '';
  const page = pageNum(req);
  const [cats, top] = await Promise.all([data.categories(), data.topSearches(10)]);
  let r = { rows: [], total: 0, hasMore: false };
  if (q || catId || division) {
    r = await data.search({ q, categoryId: catId, division, page });
    if (q && page === 1) data.logSearch(q).catch(() => {});
  }
  return { title: q ? `“${q}” — খুঁজুন` : 'খুঁজুন', nav: 'search', noindex: !!q, body: V.searchPage({ q, rows: r.rows, total: r.total, page, hasMore: r.hasMore, cats, catId, division, top }) };
}, 60000));

router.get('/api/suggest', async (req, res, next) => {
  try {
    const rows = await data.suggestions(String(req.query.q || '').slice(0, 60));
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(rows.map((r) => ({ t: r.title, u: `/post/${encodeURIComponent(r.slug)}` })));
  } catch (e) { next(e); }
});

router.get('/notices', cached(async () => ({ title: 'নোটিশ', nav: 'notices', body: V.noticesPage(await data.notices()) })));
router.get('/api/notices/state', async (req, res, next) => {
  try { res.setHeader('Cache-Control', 'no-cache'); res.json({ ids: (await data.notices(20)).map((n) => n.id) }); } catch (e) { next(e); }
});

router.get('/report', async (req, res, next) => {
  try {
    const id = parseInt(req.query.post, 10);
    const post = id ? await db.one("SELECT id, title FROM posts WHERE id = ? AND status = 'published'", [id]) : null;
    await output(req, res, { title: 'রিপোর্ট করুন', nav: 'report', noindex: true, cache: false, body: V.reportPage({ post, csrf: formToken() }) });
  } catch (e) { next(e); }
});

router.post('/api/report', async (req, res) => {
  const b = req.body || {};
  if (!sameOrigin(req) || !checkFormToken(b._t) || b.website) return res.status(400).json({ ok: false, error: 'অনুরোধটি যাচাই করা যায়নি, পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।' });
  const ip = clientIp(req);
  const rl = rateLimit(`report:${ip}`, settings.int('report_limit_per_hour', 5), 3600000);
  if (!rl.ok) return res.status(429).json({ ok: false, error: `অনেক বেশি রিপোর্ট পাঠানো হয়েছে। ${Math.ceil(rl.retryAfter / 60)} মিনিট পর আবার চেষ্টা করুন।` });
  const type = V.REPORT_TYPES.includes(b.type) ? b.type : 'অন্যান্য';
  const message = strip(b.message).slice(0, 2000);
  if (message.length < 5) return res.status(400).json({ ok: false, error: 'বিস্তারিত একটু লিখুন।' });
  const postId = parseInt(b.post_id, 10) || null;
  await db.insert('reports', { post_id: postId, type, message, contact: strip(b.contact).slice(0, 150), url: String(req.headers.referer || '').slice(0, 500), ip });
  await db.insert('admin_notifications', { type: 'report', title: `নতুন রিপোর্ট: ${type}`, body: truncate(message, 200), link: '/reports' });
  res.json({ ok: true, message: 'ধন্যবাদ! আপনার রিপোর্ট পাঠানো হয়েছে।' });
});

router.get('/page/:slug', cached(async (req) => {
  const pg = await data.page(req.params.slug);
  if (!pg) return notFoundPage();
  return { title: pg.title, desc: truncate(strip(pg.content), 160), nav: 'page', body: V.infoPage(pg) };
}));

router.get('/saved', cached(async () => ({ title: 'সেভড জব', nav: 'saved', noindex: true, body: V.savedPage() })));
router.get('/api/saved', async (req, res, next) => {
  try {
    const ids = String(req.query.ids || '').split(',').slice(0, 100);
    const rows = await data.postsByIds(ids);
    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      html: String(C.cardList(rows)),
      items: rows.map((r) => ({ id: r.id, title: r.title, url: C.postUrl(r), deadline: r.deadline, deadlineText: r.deadline ? bnDate(r.deadline) : '' })),
    });
  } catch (e) { next(e); }
});
router.get('/offline', cached(async () => ({ title: 'অফলাইন', nav: '', noindex: true, body: V.offline() }), 3600000));

/* ---------- analytics beacon ---------- */
router.post('/api/hit', express.text({ type: '*/*', limit: '2kb' }), (req, res) => {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (_) { b = {}; } }
  b = b || {};
  const ip = clientIp(req);
  if (rateLimit(`hit:${ip}`, 120, 60000).ok) {
    analytics.hit({
      path: b.p, postId: parseInt(b.id, 10) || null, device: b.d, newSession: !!b.s,
      country: req.headers['cf-ipcountry'] ? analytics.countryName(req.headers['cf-ipcountry']) : '', ip, ua: req.headers['user-agent'],
    });
  }
  res.status(204).end();
});

/* ---------- push & email subscriptions ---------- */
router.get('/api/push/key', (req, res) => res.json({ key: settings.get('vapid_public') }));
router.post('/api/push/subscribe', async (req, res) => {
  if (!sameOrigin(req) || !rateLimit(`push:${clientIp(req)}`, 20, 3600000).ok) return res.status(429).json({ ok: false });
  try { await push.subscribe(req.body.sub, req.body.saved); res.json({ ok: true }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});
router.post('/api/push/unsubscribe', async (req, res) => {
  if (!sameOrigin(req)) return res.status(400).json({ ok: false });
  try { await push.unsubscribe(String(req.body.endpoint || '')); res.json({ ok: true }); } catch (e) { res.status(400).json({ ok: false }); }
});

router.post('/api/subscribe', async (req, res) => {
  const ip = clientIp(req);
  if (!sameOrigin(req) || !rateLimit(`sub:${ip}`, 5, 3600000).ok) return res.status(429).json({ ok: false, error: 'অনেকবার চেষ্টা করা হয়েছে, পরে আবার চেষ্টা করুন।' });
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 190) return res.status(400).json({ ok: false, error: 'সঠিক ইমেইল ঠিকানা দিন।' });
  const existing = await db.one('SELECT id, confirmed, token FROM email_subs WHERE email = ?', [email]);
  if (existing && existing.confirmed) return res.json({ ok: true, message: 'আপনি আগেই সাবস্ক্রাইব করেছেন।' });
  const tk = existing ? existing.token : token(20);
  if (!existing) await db.insert('email_subs', { email, token: tk });
  const base = L.origin(req);
  if (mailer.configured()) {
    mailer.send({
      to: email, subject: 'ইমেইল সাবস্ক্রিপশন নিশ্চিত করুন',
      html: `<p>দৈনিক চাকরির খবর পেতে নিচের বাটনে ক্লিক করে সাবস্ক্রিপশন নিশ্চিত করুন।</p><p><a href="${esc(base)}/subscribe/confirm?t=${tk}" style="display:inline-block;background:#15803d;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">নিশ্চিত করুন</a></p>`,
    }).catch((e) => console.error('[subscribe]', e.message));
    return res.json({ ok: true, message: 'আপনার ইমেইলে একটি নিশ্চিতকরণ লিংক পাঠানো হয়েছে।' });
  }
  await db.query('UPDATE email_subs SET confirmed = 1 WHERE email = ?', [email]);
  res.json({ ok: true, message: 'সাবস্ক্রাইব সম্পন্ন হয়েছে!' });
});
router.get('/subscribe/confirm', async (req, res, next) => {
  try {
    const n = await db.update('email_subs', { confirmed: 1 }, 'token = ?', [String(req.query.t || '')]);
    await output(req, res, { title: 'সাবস্ক্রিপশন', cache: false, noindex: true, body: html`<div class="wrap narrow state-page"><h1>${n ? 'সাবস্ক্রিপশন নিশ্চিত হয়েছে ✓' : 'লিংকটি সঠিক নয়'}</h1><p>${n ? 'এখন থেকে প্রতিদিন নতুন চাকরির সারসংক্ষেপ আপনার ইমেইলে পৌঁছে যাবে।' : 'লিংকটির মেয়াদ শেষ অথবা ভুল।'}</p><div class="state-actions"><a class="btn btn-blue" href="/">হোমে যান</a></div></div>` });
  } catch (e) { next(e); }
});
router.get('/unsubscribe', async (req, res, next) => {
  try {
    const n = await db.query('DELETE FROM email_subs WHERE token = ?', [String(req.query.t || '')]);
    await output(req, res, { title: 'আনসাবস্ক্রাইব', cache: false, noindex: true, body: html`<div class="wrap narrow state-page"><h1>${n.affectedRows ? 'আনসাবস্ক্রাইব করা হয়েছে' : 'লিংকটি সঠিক নয়'}</h1><p>আপনি আর দৈনিক ইমেইল পাবেন না।</p><div class="state-actions"><a class="btn btn-blue" href="/">হোমে যান</a></div></div>` });
  } catch (e) { next(e); }
});

/* ---------- SEO & PWA files ---------- */
router.get('/robots.txt', (req, res) => {
  const base = L.origin(req);
  res.type('text/plain').setHeader('Cache-Control', 'public, max-age=3600');
  res.send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /search?\nDisallow: /saved\nDisallow: /cron/\n\nSitemap: ${base}/sitemap.xml\n`);
});

const SITEMAP_SIZE = 1000;
router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const base = L.origin(req);
    const body = await cache.remember('sitemap-index', 30 * 60000, async () => {
      const count = Number(await db.val(`SELECT COUNT(*) FROM posts p WHERE ${data.LIVE}`));
      const pagesN = Math.max(1, Math.ceil(count / SITEMAP_SIZE));
      const items = [`<sitemap><loc>${base}/sitemap-pages.xml</loc></sitemap>`];
      for (let i = 1; i <= pagesN; i++) items.push(`<sitemap><loc>${base}/sitemap-posts-${i}.xml</loc></sitemap>`);
      return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join('')}</sitemapindex>`;
    });
    res.type('application/xml').send(body);
  } catch (e) { next(e); }
});
router.get('/sitemap-pages.xml', async (req, res, next) => {
  try {
    const base = L.origin(req);
    const [cats, pages] = await Promise.all([data.categories(), data.pages()]);
    const urls = ['/', '/categories', '/posts', '/trending', '/premium', '/notices', ...cats.map((c) => `/category/${encodeURIComponent(c.slug)}`), ...pages.map((p) => `/page/${encodeURIComponent(p.slug)}`)];
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${base}${u}</loc><changefreq>daily</changefreq></url>`).join('')}</urlset>`);
  } catch (e) { next(e); }
});
router.get(/^\/sitemap-posts-(\d+)\.xml$/, async (req, res, next) => {
  try {
    const n = Math.max(1, parseInt(req.params[0], 10));
    const base = L.origin(req);
    const body = await cache.remember(`sitemap-posts-${n}`, 30 * 60000, async () => {
      const rows = await db.query(`SELECT p.slug, p.updated_at, p.thumbnail FROM posts p WHERE ${data.LIVE} ORDER BY p.id DESC LIMIT ${SITEMAP_SIZE} OFFSET ${(n - 1) * SITEMAP_SIZE}`);
      return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${rows.map((r) => `<url><loc>${base}/post/${encodeURIComponent(r.slug)}</loc><lastmod>${new Date(r.updated_at).toISOString()}</lastmod>${r.thumbnail ? `<image:image><image:loc>${base}${esc(uploads.url(r.thumbnail))}</image:loc></image:image>` : ''}</url>`).join('')}</urlset>`;
    });
    res.type('application/xml').send(body);
  } catch (e) { next(e); }
});

router.get('/manifest.webmanifest', (req, res) => {
  const theme = settings.get('theme_color') || '#15803d';
  const icons = [48, 72, 96, 144, 192, 512].map((s) => ({ src: asset(`icons/icon-${s}.png`), sizes: `${s}x${s}`, type: 'image/png', purpose: 'any' }));
  icons.push({ src: asset('icons/maskable-512.png'), sizes: '512x512', type: 'image/png', purpose: 'maskable' });
  const manifest = {
    id: '/', name: settings.get('app_name') || settings.get('site_name'), short_name: truncate(settings.get('app_name') || settings.get('site_name'), 12),
    description: settings.get('meta_desc'), lang: 'bn', dir: 'ltr', start_url: '/?source=pwa', scope: '/', display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'], orientation: 'portrait-primary',
    background_color: '#ffffff', theme_color: theme, categories: ['news', 'education', 'business'], icons,
    screenshots: settings.bool('install_screenshots') ? [
      { src: asset('screenshots/mobile-home.png'), sizes: '540x1170', type: 'image/png', form_factor: 'narrow', label: 'হোম পেজ' },
      { src: asset('screenshots/mobile-post.png'), sizes: '540x1170', type: 'image/png', form_factor: 'narrow', label: 'পোস্ট ডিটেইল' },
      { src: asset('screenshots/mobile-search.png'), sizes: '540x1170', type: 'image/png', form_factor: 'narrow', label: 'খুঁজুন' },
      { src: asset('screenshots/desktop-home.png'), sizes: '1440x900', type: 'image/png', form_factor: 'wide', label: 'ডেস্কটপ হোম' },
    ] : [],
    shortcuts: [
      { name: 'সর্বশেষ চাকরি', url: '/posts', icons: [{ src: asset('icons/icon-96.png'), sizes: '96x96' }] },
      { name: 'খুঁজুন', url: '/search', icons: [{ src: asset('icons/icon-96.png'), sizes: '96x96' }] },
      { name: 'সেভড জব', url: '/saved', icons: [{ src: asset('icons/icon-96.png'), sizes: '96x96' }] },
    ],
    prefer_related_applications: false,
    launch_handler: { client_mode: 'navigate-existing' },
    edge_side_panel: { preferred_width: 420 },
  };
  res.type('application/manifest+json').setHeader('Cache-Control', 'public, max-age=3600');
  res.send(JSON.stringify(manifest));
});

/* ---------- helpers ---------- */
function breadcrumb(base, items) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: base + url })) };
}
function structured(p, base, path, desc) {
  const img = p.thumbnail ? base + uploads.url(p.thumbnail) : undefined;
  const isJob = !!(p.vacancies || p.job_type || (p.deadline && p.organization));
  if (isJob) {
    const job = {
      '@context': 'https://schema.org', '@type': 'JobPosting', title: p.title, description: p.content || desc,
      datePosted: new Date(p.published_at).toISOString(), url: base + path,
      hiringOrganization: { '@type': 'Organization', name: p.organization || settings.get('site_name'), ...(img ? { logo: img } : {}) },
      jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: p.district || p.division || 'ঢাকা', addressRegion: p.division || undefined, addressCountry: 'BD' } },
      employmentType: /খণ্ড|part/i.test(p.job_type || '') ? 'PART_TIME' : /চুক্তি|contract/i.test(p.job_type || '') ? 'CONTRACTOR' : 'FULL_TIME',
      directApply: false,
    };
    if (p.deadline) job.validThrough = new Date(p.deadline).toISOString();
    const vac = parseInt(String(p.vacancies || '').replace(/[^\d]/g, ''), 10);
    if (vac) job.totalJobOpenings = vac;
    return job;
  }
  return {
    '@context': 'https://schema.org', '@type': 'NewsArticle', headline: truncate(p.title, 110), description: desc,
    datePublished: new Date(p.published_at).toISOString(), dateModified: new Date(p.updated_at).toISOString(),
    mainEntityOfPage: base + path, ...(img ? { image: [img] } : {}),
    author: { '@type': 'Organization', name: settings.get('site_name'), url: base },
    publisher: { '@type': 'Organization', name: settings.get('site_name'), logo: { '@type': 'ImageObject', url: base + L.logoUrl().split('?')[0] } },
  };
}

function notFoundPage() {
  return { status: 404, title: 'পেজটি খুঁজে পাওয়া যায়নি', nav: '', noindex: true, body: V.notFound() };
}

router.use(cached(async () => notFoundPage()));

module.exports = { router, output, notFoundPage, bnCount };
