'use strict';
/**
 * চাকরি সার্কুলার — single-process Node.js app (Hostinger-friendly).
 * Start: `npm start` (or point the hosting panel's "entry file" to server.js).
 */
process.env.TZ = process.env.TZ || 'Asia/Dhaka';

const path = require('path');
const express = require('express');
const compression = require('compression');

const config = require('./src/config');
const db = require('./src/db');
const migrate = require('./src/migrate');
const settings = require('./src/settings');
const cache = require('./src/cache');
const assets = require('./src/assets');
const { safeEqual } = require('./src/util/security');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.set('etag', false);

let booted = false;
let schedulerStarted = false;

/** Connect DB, run migrations, load settings. Safe to call again (installer calls it). */
async function boot() {
  const cfg = config.load();
  if (!cfg) { booted = false; return false; }
  db.connect(cfg.db);
  const applied = await migrate.run();
  if (applied) console.log(`[boot] ${applied} migration(s) applied`);
  await settings.load();
  if (cfg.installed) {
    await require('./src/util/push').ensureKeys();
    if (!settings.get('cron_key')) await settings.set({ cron_key: cfg.cronKey || config.randomSecret(16) });
  }
  cache.clear();
  assets.reset();
  booted = true;
  if (cfg.installed && !schedulerStarted && process.env.CC_NO_SCHEDULER !== '1') {
    require('./src/scheduler').start();
    schedulerStarted = true;
  }
  return true;
}
app.locals.boot = boot;

/* ---------- security headers ---------- */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (req.secure || String(req.headers['x-forwarded-proto'] || '').startsWith('https')) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});
app.use(compression({ threshold: 1024 }));

/* ---------- static files ---------- */
const PUBLIC = path.join(__dirname, 'public');
const staticOpts = {
  etag: true, lastModified: true, index: false, fallthrough: true,
  setHeaders(res, file) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (file.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
  },
};
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(PUBLIC, 'sw.js'));
});
app.use('/icons', (req, res, next) => (config.get() ? express.static(assets.customIconsDir(), staticOpts)(req, res, next) : next()));
for (const dir of ['css', 'js', 'img', 'icons', 'screenshots', 'fonts']) app.use(`/${dir}`, express.static(path.join(PUBLIC, dir), staticOpts));
app.get('/favicon.ico', (req, res) => res.redirect(301, assets.asset('icons/icon-48.png')));

/* uploads: only images & PDFs, never executed or rendered as HTML */
const UPLOAD_EXT = /\.(webp|jpe?g|png|gif|avif|pdf)$/i;
app.use('/uploads', (req, res, next) => {
  if (!config.get()) return res.status(404).end();
  if (!UPLOAD_EXT.test(req.path) || req.path.includes('..')) return res.status(403).end();
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return express.static(config.uploadsDir(), { ...staticOpts, dotfiles: 'deny' })(req, res, next);
});

/* ---------- body parsing ---------- */
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '512kb' }));

/* ---------- installer gate ---------- */
const installRouter = require('./src/routes/install');
app.use(installRouter);
app.use((req, res, next) => {
  if (config.isInstalled() && booted) return next();
  if (config.isInstalled()) {
    res.setHeader('Retry-After', '30');
    return res.status(503).send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:sans-serif;text-align:center;padding:60px 16px"><h2>সাইট চালু হচ্ছে…</h2><p>ডাটাবেজের সাথে সংযোগ করা যাচ্ছে না। কিছুক্ষণ পরে রিফ্রেশ করুন।</p></body>');
  }
  if (req.path === '/healthz') return res.json({ ok: true, installed: false });
  return res.redirect(302, '/install');
});

/* ---------- health & cron ---------- */
app.get('/healthz', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()), cache: cache.stats() }));
app.get('/cron/run', async (req, res) => {
  const key = String(req.query.key || '');
  if (!safeEqual(key, settings.get('cron_key'))) return res.status(403).json({ ok: false, error: 'invalid key' });
  const automation = require('./src/automation');
  await require('./src/scheduler').housekeeping().catch(() => {});
  const r = await automation.start('cron');
  res.json({ ok: r.ok, message: r.ok ? 'automation started' : r.error, runId: r.runId || null });
});

/* ---------- admin session (only when a cookie is present) ---------- */
const auth = require('./src/admin/auth');
app.use(async (req, res, next) => {
  if (req.headers.cookie && req.headers.cookie.includes(`${auth.COOKIE}=`)) {
    try { req.admin = await auth.loadSession(req); } catch (e) { return next(e); }
  }
  next();
});

/* ---------- admin panel on a secret, configurable path ---------- */
const adminRouter = require('./src/admin/routes');
app.use((req, res, next) => {
  const base = settings.adminPath();
  if (req.path === base || req.path.startsWith(`${base}/`)) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    req.url = req.url.slice(base.length) || '/';
    if (!req.url.startsWith('/')) req.url = `/${req.url}`;
    return adminRouter(req, res, next);
  }
  return next();
});

/* ---------- maintenance mode (logged-in admins see the real site) ---------- */
const sitePages = require('./src/views/site/pages');
app.use((req, res, next) => {
  if (!settings.bool('maintenance') || req.admin) return next();
  if (req.path.startsWith('/api/') || req.path === '/manifest.webmanifest' || req.path === '/robots.txt') return next();
  res.status(503).setHeader('Retry-After', '1800');
  res.setHeader('Cache-Control', 'no-store');
  return res.send(sitePages.maintenanceDoc());
});

/* ---------- public site ---------- */
app.use(require('./src/routes/site').router);

/* ---------- errors ---------- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.originalUrl, err && err.stack ? err.stack : err);
  if (res.headersSent) return;
  const status = err.status || err.statusCode || 500;
  if (req.xhr || (req.headers.accept || '').includes('application/json') || req.path.startsWith('/api/')) {
    return res.status(status).json({ ok: false, error: status === 413 ? 'ফাইল বা ডেটা অনেক বড়' : 'সার্ভারে সমস্যা হয়েছে, আবার চেষ্টা করুন।' });
  }
  res.status(status).send(`<!doctype html><html lang="bn"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>সমস্যা হয়েছে</title><body style="font-family:'Hind Siliguri',sans-serif;text-align:center;padding:60px 16px;color:#0f172a"><h1>দুঃখিত, একটি সমস্যা হয়েছে</h1><p>কিছুক্ষণ পরে আবার চেষ্টা করুন।</p><a href="/" style="color:#15803d">হোমে ফিরে যান</a></body></html>`);
});

/* ---------- start ---------- */
// PORT may be a number or (on some hosts) a unix socket path
const PORT = /^\d+$/.test(String(process.env.PORT || '')) ? Number(process.env.PORT) : (process.env.PORT || 3000);

let started = false;
async function main() {
  if (started) return;
  started = true;
  try {
    const ok = await boot();
    console.log(ok ? '[boot] ready' : '[boot] not installed — open /install');
  } catch (e) {
    console.error('[boot] failed:', e.message);
    // keep serving so the admin sees an error instead of a crash loop; retry in background
    setTimeout(() => boot().catch((err) => console.error('[boot] retry failed:', err.message)), 15000);
  }
  const server = app.listen(PORT, () => console.log(`[http] listening on :${PORT}`));
  server.keepAliveTimeout = 65000;
  const shutdown = async () => {
    try { await require('./src/analytics').flush(); } catch (_) { /* ignore */ }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Always start, even when loaded through a wrapper (Hostinger/LiteSpeed lsnode, Passenger, PM2),
// where require.main is not this file. Set CC_NO_AUTOSTART=1 to import without listening.
if (process.env.CC_NO_AUTOSTART !== '1') main();

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));

module.exports = { app, boot, main };
