/* ─────────────────────────────────────────────
   পাবলিক রুট: পেজ, sitemap, robots, ম্যানিফেস্ট, SW, আইকন
   ───────────────────────────────────────────── */
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';
import { setting } from '../../core/settings.js';
import { pageCache } from '../../core/cache.js';
import { renderPage, asideHtml } from '../../ui/layout.js';
import { html } from '../../core/html.js';
import { all } from '../../db.js';
import { iso } from '../../core/bn.js';
import { countPostView, trackVisit } from '../track/track.js';
import { readSession, cookieName } from '../../core/auth.js';
import * as P from './pages.js';
import * as D from './data.js';
import * as PWA from '../pwa/pwa.js';
import { uploadUrl } from '../../ui/components.js';
import { fileExists } from '../../core/images.js';

const brotli = promisify(zlib.brotliCompress); const gzip = promisify(zlib.gzip);
/* পাতার সংকুচিত রূপ একবারই বানাই — বারবার কম্প্রেস করার CPU বাঁচে */
async function encoded(ent, acceptEnc) {
  const ae = String(acceptEnc || '');
  const kind = /\bbr\b/.test(ae) ? 'br' : /\bgzip\b/.test(ae) ? 'gzip' : '';
  if (!kind || ent.payload.length < 1024) return { body: ent.payload, kind: '' };
  ent.enc ||= {};
  if (!ent.enc[kind]) {
    const buf = Buffer.from(ent.payload);
    ent.enc[kind] = kind === 'br' ? await brotli(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } }) : await gzip(buf, { level: 6 });
  }
  return { body: ent.enc[kind], kind };
}

export function makeCtx(req) {
  const proto = config.baseUrl ? config.baseUrl.split(':')[0] : (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0];
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost').replace(/^www\./i, '');
  const base = config.baseUrl || `${proto}://${host}`;
  const pathname = req.url.split('?')[0];
  return { base, path: pathname, isAdmin: Boolean(readSession(req.cookies?.[cookieName])), hasFile: fileExists };
}

/** পাতা পাঠাই: ক্যাশ + ETag + SPA টুকরো (fragment) সমর্থন */
async function send(req, reply, ctx, builder, { cacheable = true } = {}) {
  const spa = req.headers['x-spa'] === '1';
  const key = `${ctx.base}|${spa ? 's' : 'f'}|${req.url}`;
  let ent = cacheable ? pageCache.get(key) : undefined;
  if (!ent) {
    const res = await builder();
    if (res.redirect) return reply.redirect(res.redirect, 301);
    if (P.isNotFound(res)) return send404(req, reply, ctx, spa);
    const status = res.status || 200;
    let payload; let type;
    if (spa) {
      type = 'application/json; charset=utf-8';
      payload = JSON.stringify({ title: res.title, desc: res.desc, canonical: res.canonical, robots: res.robots || '', nav: res.nav || '', page: res.page || '', catSlug: res.catSlug || '', fa: Boolean(res.fa), og: res.og || '', body: String(res.body), schema: res.schema || [], postId: res.postId || 0 });
    } else { type = 'text/html; charset=utf-8'; payload = await renderPage(ctx, res); }
    ent = { payload, type, status, etag: `"${crypto.createHash('md5').update(payload).digest('hex').slice(0, 20)}"`, postId: res.postId || 0 };
    if (cacheable && status === 200) pageCache.set(key, ent);
  }
  if (ent.postId) countPostView(req, reply, ent.postId, ctx.isAdmin);
  if (!spa || ent.status !== 200) { /* পেজভিউ ক্লায়েন্ট থেকে /api/track-এ যায় (SPA) — সরাসরি লোডে এখানে */ }
  if (!spa) trackVisit(req, reply, ctx.path);
  reply.header('Cache-Control', 'no-cache').header('Vary', 'Accept-Encoding, X-SPA').header('ETag', ent.etag);
  if (req.headers['if-none-match'] === ent.etag && ent.status === 200) return reply.code(304).send();
  const e = await encoded(ent, req.headers['accept-encoding']);
  if (e.kind) reply.header('Content-Encoding', e.kind);
  return reply.code(ent.status).type(ent.type).send(e.body);
}

async function send404(req, reply, ctx, spa) {
  const res = P.notFoundPage();
  if (spa) return reply.code(404).type('application/json').send(JSON.stringify({ ...res, body: String(res.body), schema: [] }));
  return reply.code(404).type('text/html; charset=utf-8').send(await renderPage(ctx, res));
}

const num = (v) => Math.max(1, parseInt(v, 10) || 1);

export async function siteRoutes(app) {
  /* মেইনটেন্যান্স মোড (লগইন করা এডমিন সবসময় আসল সাইট দেখে) */
  app.addHook('preHandler', async (req, reply) => {
    if (setting('maintenance', '0') !== '1') return;
    const u = req.url.split('?')[0];
    const adminSlug = setting('admin_slug', config.defaultAdminSlug);
    if (u.startsWith(`/${adminSlug}`) || u.startsWith('/api/') || u.startsWith('/css/') || u.startsWith('/js/') || u.startsWith('/fonts/') || u.startsWith('/img/') || u.startsWith('/icons/') || u.startsWith('/uploads/') || u === '/manifest.webmanifest' || u === '/sw.js') return;
    if (readSession(req.cookies?.[cookieName])) return;
    const { maintenancePage } = await import('./maintenance.js');
    return reply.code(503).header('Retry-After', '3600').header('Cache-Control', 'no-store').type('text/html; charset=utf-8').send(maintenancePage());
  });

  app.get('/', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, () => P.home(c, 1)); });
  app.get('/page/:n', (req, reply) => { const c = makeCtx(req); const n = num(req.params.n); if (n === 1) return reply.redirect('/', 301); return send(req, reply, c, () => P.home(c, n)); });
  app.get('/category/:slug', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, () => P.category(c, req.params.slug, 1)); });
  app.get('/category/:slug/page/:n', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, () => P.category(c, req.params.slug, num(req.params.n))); });
  app.get('/post/:slug', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, () => P.post(c, req.params.slug)); });
  app.get('/search', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, () => P.search(c, req.query), { cacheable: Boolean(req.query.q) === false && Object.keys(req.query).length === 0 }); });
  app.get('/trending', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, () => P.trending(c, 1)); });
  app.get('/trending/page/:n', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, () => P.trending(c, num(req.params.n))); });
  app.get('/promoted', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, () => P.promoted(c, 1)); });
  app.get('/promoted/page/:n', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, () => P.promoted(c, num(req.params.n))); });
  app.get('/notices', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, () => P.notices(c)); });
  app.get('/report', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, async () => P.report()); });
  app.get('/about', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, async () => P.info('about')); });
  app.get('/privacy', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, async () => P.info('privacy')); });
  app.get('/team', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, () => P.team()); });
  app.get('/saved', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, async () => P.saved()); });
  app.get('/offline', (req, reply) => { const c = makeCtx(req); return send(req, reply, c, async () => ({
    title: `ইন্টারনেট নেই | ${D.siteName()}`, desc: 'ইন্টারনেট সংযোগ নেই।', robots: 'noindex', nav: '', page: 'offline', noAside: true,
    body: html`<div class="card empty" style="padding:50px 20px"><svg class="i" aria-hidden="true"><use href="#i-wifioff"/></svg><h1 style="font-size:1.25rem">ইন্টারনেট সংযোগ নেই</h1><p style="color:var(--muted)">সংযোগ ফিরলে আবার চেষ্টা করুন। আপনার সেভ করা পোস্টগুলো এখনো দেখা যাবে।</p><div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a class="btn" href="/saved">সেভ করা পোস্ট</a><button class="btn ghost" onclick="location.reload()">আবার চেষ্টা করুন</button></div></div>` })); });

  /* ─── sitemap / robots ─── */
  app.get('/sitemap.xml', async (req, reply) => {
    const c = makeCtx(req);
    const key = `${c.base}|sitemap`;
    let xml = pageCache.get(key);
    if (!xml) {
      const posts = await all(`SELECT slug, published_at, updated_at, thumb, title FROM posts WHERE status = 1 AND deleted_at IS NULL ORDER BY published_at DESC LIMIT 5000`);
      const cats = await D.categories();
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`
        + `<url><loc>${c.base}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>\n`
        + cats.map((x) => `<url><loc>${c.base}/category/${encodeURI(x.slug)}</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>`).join('\n') + '\n'
        + ['about', 'privacy', 'notices', 'trending', 'promoted', 'team'].map((s) => `<url><loc>${c.base}/${s}</loc><changefreq>weekly</changefreq><priority>0.4</priority></url>`).join('\n') + '\n'
        + posts.map((p) => `<url><loc>${c.base}/post/${encodeURI(p.slug)}</loc><lastmod>${iso(p.updated_at || p.published_at)}</lastmod><changefreq>daily</changefreq><priority>0.7</priority>${p.thumb ? `<image:image><image:loc>${c.base}${encodeURI(uploadUrl(p.thumb))}</image:loc><image:title>${esc(p.title)}</image:title></image:image>` : ''}</url>`).join('\n')
        + '\n</urlset>';
      pageCache.set(key, xml, 600_000);
    }
    return reply.header('X-Robots-Tag', 'noindex').header('Cache-Control', 'public, max-age=600').type('application/xml; charset=utf-8').send(xml);
  });
  app.get('/robots.txt', async (req, reply) => {
    const c = makeCtx(req);
    /* এডমিনের ঠিকানা এখানে লিখি না — এডমিন পেজ নিজেই noindex পাঠায় */
    if (config.noindex) return reply.type('text/plain; charset=utf-8').send('User-agent: *\nDisallow: /\n');
    return reply.type('text/plain; charset=utf-8').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /search\nDisallow: /saved\n\nSitemap: ${c.base}/sitemap.xml\n`);
  });

  /* ─── PWA ─── */
  app.get('/manifest.webmanifest', async (req, reply) => reply.header('Cache-Control', 'no-cache').type('application/manifest+json; charset=utf-8').send(JSON.stringify(PWA.manifest(makeCtx(req).base))));
  app.get('/sw.js', async (req, reply) => reply.header('Service-Worker-Allowed', '/').header('Cache-Control', 'no-cache').type('application/javascript; charset=utf-8').send(PWA.swSource()));
  app.get('/.well-known/assetlinks.json', async (req, reply) => reply.header('Cache-Control', 'public, max-age=3600').type('application/json').send(JSON.stringify(PWA.assetLinks())));
  const iconRoute = (name, size, mask) => app.get(name, async (req, reply) => {
    const buf = await PWA.makeIcon(size, mask);
    if (!buf) return reply.code(404).send();
    return reply.header('Cache-Control', 'public, max-age=86400').type('image/png').send(buf);
  });
  iconRoute('/icons/icon-180.png', 180, false); iconRoute('/icons/icon-192.png', 192, false); iconRoute('/icons/icon-512.png', 512, false);
  iconRoute('/icons/maskable-192.png', 192, true); iconRoute('/icons/maskable-512.png', 512, true);
  app.get('/favicon.ico', async (req, reply) => { const buf = await PWA.makeIcon(48, false); return buf ? reply.header('Cache-Control', 'public, max-age=86400').type('image/png').send(buf) : reply.code(404).send(); });
  app.get('/healthz', async (req, reply) => reply.send({ ok: true, t: Date.now() }));
}
