import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import multer from 'multer';
import { RedisStore } from 'rate-limit-redis';
import { ZodError } from 'zod';
import { getRedis } from './core/cache.js';
import { config } from './core/env.js';
import { HttpError } from './core/errors.js';
import { logger } from './core/logger.js';
import { CLIENT_DIST, UPLOADS_DIR } from './core/paths.js';
import './core/request.js';
import { isInstalledSync, maintenance } from './core/state.js';
import { CODE_VERSION } from './core/version.js';
import { hasDb, ping } from './db/index.js';
import { csrfProtection, loadSession, requireAdmin } from './middleware/auth.js';
import { catalogRouter } from './modules/admin/catalog.routes.js';
import { couriersRouter } from './modules/admin/couriers.routes.js';
import { customersRouter } from './modules/admin/customers.routes.js';
import { dashboardRouter } from './modules/admin/dashboard.routes.js';
import { fraudRouter } from './modules/admin/fraud.routes.js';
import { marketingRouter } from './modules/admin/marketing.routes.js';
import { ordersRouter } from './modules/admin/orders.routes.js';
import { productsRouter, reviewsRouter } from './modules/admin/products.routes.js';
import { settingsRouter } from './modules/admin/settings.routes.js';
import { systemRouter } from './modules/admin/system.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { installRouter } from './modules/install/install.routes.js';
import { renderShell, seoRouter } from './modules/seo/seo.js';
import { storeRouter } from './modules/store/store.routes.js';
import { escapeHtml } from './services/html.js';
import { settings } from './services/settings.js';

declare module 'express-serve-static-core' {
  interface Locals { nonce: string }
}

function limiterStore(prefix: string) {
  const redis = config.redisUrl ? getRedis() : null;
  if (!redis) return undefined;
  return new RedisStore({ prefix: `sg:rl:${prefix}:`, sendCommand: (command: string, ...args: string[]) => redis.call(command, ...args) as never });
}

function maintenancePage(title: string, message: string): string {
  return `<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#FBF5EF;color:#2b211b}
.card{max-width:420px;margin:24px;padding:40px 32px;border-radius:28px;background:#fff;box-shadow:0 20px 60px -20px rgba(242,107,58,.35);text-align:center}
.gear{width:72px;height:72px;margin:0 auto 20px;border-radius:24px;background:linear-gradient(135deg,#FF9A62,#F26B3A);display:grid;place-items:center;animation:spin 3s linear infinite}
.gear svg{width:38px;height:38px;fill:#fff}@keyframes spin{to{transform:rotate(360deg)}}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#7a6a5f;line-height:1.6}
.bar{height:6px;border-radius:6px;background:#f6e3d6;overflow:hidden;margin-top:24px}.bar i{display:block;height:100%;width:40%;background:#F26B3A;border-radius:6px;animation:load 1.4s ease-in-out infinite}
@keyframes load{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}@media (prefers-color-scheme:dark){body{background:#17120f;color:#f4ebe4}.card{background:#221b17}p{color:#b9a89c}.bar{background:#3a2c24}}</style>
<meta http-equiv="refresh" content="30"></head><body><div class="card"><div class="gear"><svg viewBox="0 0 24 24"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.3 7.3 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.3 7.3 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.3 7.3 0 0 0 1.7 1L11 21h4l.4-2.9a7.3 7.3 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5A3.5 3.5 0 1 1 13 8.5a3.5 3.5 0 0 1 0 7z"/></svg></div>
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><div class="bar"><i></i></div></div></body></html>`;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  const tp = config.trustProxy;
  app.set('trust proxy', /^\d+$/.test(tp) ? Number(tp) : tp === 'true' ? true : tp);

  // Per-request CSP nonce
  app.use((_req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'", (_req, res) => `'nonce-${(res as Response).locals.nonce}'`, 'https://connect.facebook.net', 'https://www.googletagmanager.com', 'https://www.google-analytics.com'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'", 'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://www.facebook.com'],
          'frame-src': ["'self'", 'https://www.google.com', 'https://maps.google.com', 'https://www.youtube.com', 'https://www.facebook.com'],
          'worker-src': ["'self'"],
          'manifest-src': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': ["'self'"],
          'object-src': ["'none'"],
          'base-uri': ["'self'"],
          'upgrade-insecure-requests': null,
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: false } : false,
    }),
  );
  app.use((req, res, next) => {
    // Only ask browsers to upgrade sub-resources when the site is actually served over HTTPS.
    if (req.secure) res.set('Content-Security-Policy', `${res.get('Content-Security-Policy')};upgrade-insecure-requests`);
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  });

  app.use(compression({ filter: (req, res) => !String(res.getHeader('Content-Type') ?? '').includes('text/event-stream') && !req.path.endsWith('/stream') && compression.filter(req, res) }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.text({ type: 'text/plain', limit: '16kb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // ---- static assets (long-lived, fingerprinted)
  app.use('/assets', express.static(path.join(CLIENT_DIST, 'assets'), { immutable: true, maxAge: '365d', index: false, fallthrough: false }));
  app.use(
    '/uploads',
    (req, res, next) => {
      if (!/\.(webp|avif|jpe?g|png)$/i.test(req.path)) { res.status(404).end(); return; }
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "default-src 'none'");
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(UPLOADS_DIR, { immutable: true, maxAge: '365d', index: false, dotfiles: 'deny', fallthrough: false }),
  );
  app.use(express.static(CLIENT_DIST, {
    index: false,
    maxAge: '1d',
    setHeaders: (res, file) => {
      if (/sw\.js$|\.webmanifest$/.test(file)) res.set('Cache-Control', 'no-cache');
    },
  }));

  // ---- health (for uptime monitors / updater)
  app.get('/api/health', async (_req, res) => {
    let db = false;
    if (hasDb()) { try { db = await ping(); } catch { db = false; } }
    res.status(isInstalledSync() && !db ? 503 : 200).json({ ok: true, installed: isInstalledSync(), db, version: CODE_VERSION, maintenance: maintenance().enabled });
  });

  app.use(seoRouter);

  // ---- installer (only functional before installation)
  app.use('/api/install', installRouter);

  // ---- installation gate
  app.use((req, res, next) => {
    if (isInstalledSync()) return next();
    if (req.path.startsWith('/api/')) { res.status(503).json({ code: 'NOT_INSTALLED', message: 'ShopiGo is not installed yet.' }); return; }
    if (req.method === 'GET' && !req.path.startsWith('/install')) { res.redirect(302, '/install'); return; }
    next();
  });

  // ---- maintenance gate (admins keep access)
  app.use(async (req, res, next) => {
    const m = maintenance();
    if (!m.enabled) return next();
    const p = req.path;
    if (p.startsWith('/admin') || p.startsWith('/api/admin') || p.startsWith('/api/auth') || p.startsWith('/install') || p.startsWith('/api/install')) return next();
    if (m.bypassToken && (req.query.preview === m.bypassToken || req.cookies?.sg_preview === m.bypassToken)) {
      if (req.query.preview) res.cookie('sg_preview', m.bypassToken, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 3600_000 });
      return next();
    }
    if (hasDb() && (await loadSession(req).catch(() => null))) return next();
    res.set('Retry-After', '120');
    if (p.startsWith('/api/')) { res.status(503).json({ code: 'MAINTENANCE', message: 'We are upgrading. Please try again in a moment.' }); return; }
    let title = "We're upgrading ShopiGo.";
    let message = 'Please wait a moment.';
    try { title = await settings.str('maintenance_title') || title; message = await settings.str('maintenance_message') || message; } catch { /* db may be migrating */ }
    res.status(503).type('html').send(maintenancePage(title, message));
  });

  // ---- API
  const apiLimiter = rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false, store: limiterStore('api'), message: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } });
  app.use('/api', apiLimiter);
  app.use('/api/public', storeRouter);
  app.use('/api/auth', authRouter);

  const admin = express.Router();
  admin.use(csrfProtection);
  admin.use(requireAdmin());
  admin.use('/dashboard', dashboardRouter);
  admin.use('/orders', ordersRouter);
  admin.use('/products', productsRouter);
  admin.use('/reviews', reviewsRouter);
  admin.use('/catalog', catalogRouter);
  admin.use('/marketing', marketingRouter);
  admin.use('/customers', customersRouter);
  admin.use('/couriers', couriersRouter);
  admin.use('/fraud', fraudRouter);
  admin.use('/settings', settingsRouter);
  admin.use('/system', systemRouter);
  app.use('/api/admin', admin);

  app.use('/api', (_req, res) => { res.status(404).json({ code: 'NOT_FOUND', message: 'Endpoint not found' }); });

  // ---- SPA shell with server-rendered SEO meta
  app.get(/^\/(?!api\/|assets\/|uploads\/).*/, async (req, res, next) => {
    try { await renderShell(req, res, res.locals.nonce); } catch (err) { next(err); }
  });

  // ---- errors: never leak stack traces or secrets
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    if (err instanceof HttpError) {
      res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ code: 'BAD_REQUEST', message: err.issues[0]?.message ?? 'Invalid input' });
      return;
    }
    if (err instanceof multer.MulterError) {
      res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ code: 'UPLOAD_ERROR', message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message });
      return;
    }
    const e = err as { type?: string; status?: number };
    if (e?.type === 'entity.parse.failed') { res.status(400).json({ code: 'BAD_JSON', message: 'Malformed JSON' }); return; }
    if (e?.type === 'entity.too.large') { res.status(413).json({ code: 'TOO_LARGE', message: 'Request is too large' }); return; }
    if (e?.status === 404 && req.path.startsWith('/assets')) { res.status(404).end(); return; }
    const id = crypto.randomUUID();
    logger.error({ err, id, path: req.path, method: req.method }, 'unhandled error');
    if (req.path.startsWith('/api/')) res.status(500).json({ code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.', errorId: id });
    else res.status(500).type('html').send(maintenancePage('Something went wrong', `Please refresh the page. (Error ${id.slice(0, 8)})`));
  });

  return app;
}

export function clientBuilt(): boolean {
  return fs.existsSync(path.join(CLIENT_DIST, 'index.html'));
}
