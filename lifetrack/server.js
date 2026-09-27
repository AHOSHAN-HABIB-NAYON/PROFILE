'use strict';
/**
 * LifeTrack — Track Today • Build Tomorrow
 * Node.js + Express + MySQL PWA server.
 */
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');

const config = require('./src/config');
const db = require('./src/db');
const { HttpError } = require('./src/lib/http');

const cfg = config.load();
const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUB = path.join(__dirname, 'public');

app.disable('x-powered-by');
app.set('trust proxy', cfg.trustProxy !== undefined ? (isNaN(cfg.trustProxy) ? cfg.trustProxy : Number(cfg.trustProxy)) : 'loopback');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", 'https://www.gstatic.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://lh3.googleusercontent.com'],
      'connect-src': ["'self'", 'https://*.googleapis.com', 'https://www.gstatic.com'],
      'worker-src': ["'self'"],
      'manifest-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'", 'https://accounts.google.com'],
      'object-src': ["'none'"],
      'upgrade-insecure-requests': config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
}));
app.use((req, res, next) => { res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()'); next(); });
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '300kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// Static assets: long cache (URLs are versioned with ?v=hash); uploads/attachments are NOT public.
const staticOpts = { maxAge: config.isProd ? '30d' : 0, index: false, fallthrough: true };
app.use(express.static(PUB, { ...staticOpts, setHeaders: (res, p) => {
  // ES modules are imported by bare path → always revalidate (cheap 304s); versioned CSS/icons get long caching.
  if (p.endsWith('.js') || p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  else if (p.includes(`${path.sep}i18n${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=300');
} }));
for (const d of ['brand', 'avatars', 'goals']) app.use(`/uploads/${d}`, express.static(path.join(config.UPLOAD_DIR, d), { maxAge: '7d', index: false }));
app.use('/vendor/simplewebauthn-browser.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js'), { maxAge: '30d' }));

// Health check (load balancers / uptime monitors)
app.get('/healthz', async (req, res) => {
  if (!config.get().installed) return res.json({ status: 'install_required' });
  try { await db.q('SELECT 1'); res.json({ status: 'ok' }); } catch { res.status(503).json({ status: 'db_error' }); }
});

/* ---------- Installer mode ---------- */
const { csrf, loadSession, requireAuth } = require('./src/middleware/security');
const pages = require('./src/routes/pages');

app.use('/api/install', csrf, require('./src/routes/install'));
app.get('/install', csrf, (req, res) => {
  if (config.get().installed) return res.redirect('/');
  pages.html(res, pages.render('install.html', { v: pages.VERSION, sprite: pages.sprite() }));
});
app.use((req, res, next) => {
  if (config.get().installed) return next();
  if (req.path.startsWith('/api/')) return res.status(503).json({ ok: false, error: { code: 'install_required', message: 'LifeTrack is not installed yet' } });
  if (req.path === '/sw.js' || req.path === '/manifest.webmanifest') return next();
  return res.redirect('/install');
});

/* ---------- Installed app ---------- */
const settings = require('./src/services/settings');
const i18n = require('./src/services/i18n');
const scheduler = require('./src/services/scheduler');

const apiLimiter = rateLimit({ windowMs: 60e3, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ ok: false, error: { code: 'rate_limited', message: 'Too many requests — slow down a little' } }) });

app.use('/api', apiLimiter, csrf, loadSession);
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api', (req, res, next) => {
  // Maintenance mode: only staff and auth endpoints stay available
  if (!settings.bool('maintenance_mode') || req.path.startsWith('/auth') || req.path.startsWith('/public') || req.path.startsWith('/admin')) return next();
  if (req.user && ['support', 'admin', 'super_admin'].includes(req.user.role)) return next();
  res.status(503).json({ ok: false, error: { code: 'maintenance', message: 'LifeTrack is under maintenance. Please try again soon.' } });
});

app.use('/api/public', require('./src/routes/api/public'));
app.use('/api/auth', require('./src/routes/api/auth'));
app.use('/api/me', requireAuth, require('./src/routes/api/me'));
app.use('/api/security', requireAuth, require('./src/routes/api/security'));
app.use('/api/accounts', requireAuth, require('./src/routes/api/accounts'));
app.use('/api/categories', requireAuth, require('./src/routes/api/categories'));
app.use('/api/transactions', requireAuth, require('./src/routes/api/transactions'));
app.use('/api/loans', requireAuth, require('./src/routes/api/loans'));
app.use('/api/goals', requireAuth, require('./src/routes/api/goals'));
const misc = require('./src/routes/api/misc');
app.use('/api/investments', requireAuth, misc.investments);
app.use('/api/reminders', requireAuth, misc.rem);
app.use('/api/notifications', requireAuth, misc.notif);
app.use('/api/push', requireAuth, misc.pushR);
app.use('/api/moods', requireAuth, misc.moods);
app.use('/api/notes', requireAuth, misc.notes);
app.use('/api/insights', requireAuth, require('./src/routes/api/insights'));
app.use('/api/admin', require('./src/routes/admin/api'));
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: { code: 'not_found', message: 'Endpoint not found' } }));

app.use(pages.router);

app.use((req, res) => {
  res.status(404);
  pages.html(res, pages.render('landing.html', pages.vars(req, { path: req.path, title: 'Page not found' })));
});

// Central error handler — never leaks stack traces or SQL to clients
// eslint-disable-next-line no-unused-vars
app.use((e, req, res, next) => {
  if (e instanceof HttpError) return res.status(e.status).json({ ok: false, error: { code: e.code, message: e.message, ...(e.extra || {}) } });
  if (e.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: { code: 'bad_json', message: 'Malformed request' } });
  if (e.type === 'entity.too.large') return res.status(413).json({ ok: false, error: { code: 'too_large', message: 'Request too large' } });
  console.error('[error]', req.method, req.originalUrl, e);
  res.status(500).json({ ok: false, error: { code: 'server_error', message: 'Something went wrong. Please try again.' } });
});

async function boot() {
  const c = config.get();
  db.connect(c.db);
  const migrate = require('./src/migrate');
  await migrate.run();
  const seed = require('./src/services/seed');
  await seed.defaults();
  await seed.markInstalled();
  await settings.loadAll();
  await i18n.loadOverrides();
  scheduler.start();
}
app.locals.onInstalled = async () => { config.load(); config.markInstalled(); await boot(); console.log('[lifetrack] installation complete'); };

/**
 * The database itself remembers the installation (settings.installed_at). If DB credentials are known
 * (config file or DB_* env vars) and that marker exists, the app boots directly — the installer never
 * shows again, even after re-deploying fresh app files.
 */
async function detectInstalled() {
  const c = config.get();
  if (c.installed) return true;
  if (!c.db || !c.db.host || !c.appKey) return false;
  try {
    db.connect(c.db);
    const marker = await db.q("SELECT value FROM settings WHERE `key`='installed_at'").catch(() => []);
    let installed = marker.length > 0;
    if (!installed) { // installs made before the marker existed
      const admins = await db.q("SELECT id FROM users WHERE role='super_admin' LIMIT 1").catch(() => []);
      installed = admins.length > 0;
    }
    if (installed) { config.markInstalled(); console.log('[lifetrack] existing installation found in database'); }
    return installed;
  } catch (e) { console.warn('[lifetrack] database not reachable yet:', e.message); return false; }
}

function migrateOldUploads() {
  // Earlier versions stored uploads inside the app folder (lost on re-deploy) — copy them to the data dir once.
  const fs = require('fs');
  for (const [from, to] of [[path.join(__dirname, 'uploads'), config.UPLOAD_DIR], [path.join(__dirname, 'backups'), config.BACKUP_DIR]]) {
    try { if (fs.existsSync(from) && from !== to) fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false }); } catch {}
  }
}

(async () => {
  app.listen(PORT, () => console.log(`[lifetrack] listening on http://localhost:${PORT}`));
  migrateOldUploads();
  // Retry until the database is reachable (MySQL may start after the app on shared hosting)
  for (let attempt = 1; ; attempt++) {
    const hasDb = !!(config.get().db && config.get().db.host);
    if (config.get().installed || await detectInstalled()) {
      try { await boot(); break; } catch (e) { console.error(`[lifetrack] boot failed (attempt ${attempt}):`, e.message); }
    } else if (!hasDb) { console.log('[lifetrack] not installed — open /install in your browser'); break; }
    else if (attempt > 1 && !config.get().installed) {
      // DB reachable but empty → fresh install
      try { await db.q('SELECT 1'); console.log('[lifetrack] not installed — open /install in your browser'); break; } catch {}
    }
    await new Promise((r) => setTimeout(r, Math.min(30000, 3000 * attempt)));
  }
  console.log('[lifetrack] data directory:', config.DATA_DIR);
})();

process.on('unhandledRejection', (e) => console.error('[unhandledRejection]', e));
module.exports = app;
