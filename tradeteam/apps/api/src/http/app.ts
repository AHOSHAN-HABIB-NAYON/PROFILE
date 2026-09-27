import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { loadEnv, isInstalled } from '../config/env';
import { APP_VERSION, UPLOADS_DIR } from '../config/paths';
import { errorHandler, notFound } from './middleware/error';
import { csrf } from './middleware/csrf';
import { loadUser } from './middleware/auth';
import { rateLimit } from './middleware/rate-limit';
import { authRouter } from '../modules/auth/auth.routes';
import { accountRouter } from '../modules/users/users.routes';
import { marketsRouter } from '../modules/markets/markets.routes';
import { ordersRouter } from '../modules/trading/orders.routes';
import { walletsRouter, webhooksRouter } from '../modules/wallets/wallets.routes';
import { portfolioRouter } from '../modules/portfolio/portfolio.routes';
import { adminRouter } from '../modules/admin/admin.routes';
import { adminAuthRouter } from '../modules/admin/admin.auth.routes';
import { adminIpGuard, loadAdmin } from '../modules/admin/admin.middleware';
import { publicSettings } from '../modules/settings/settings.service';
import { installRouter } from '../modules/install/install.routes';
import { healthReport } from '../modules/system/health';
import { runtime } from '../modules/system/runtime';

/** The full application API (mounted once the platform is installed and services are up). */
export function buildAppApi(): express.Router {
  const api = express.Router();
  // Webhooks: HMAC-authenticated, no cookies → no CSRF, mounted first.
  api.use('/webhooks', webhooksRouter);
  api.use(csrf);
  api.use(rateLimit('api', 600, 60));

  api.get('/config/public', (_req, res) => {
    res.json({ installed: true, version: APP_VERSION, settings: publicSettings() });
  });

  // Admin area: separate cookie, IP allowlist, RBAC.
  api.use('/admin', adminIpGuard, loadAdmin);
  api.use('/admin/auth', adminAuthRouter);
  api.use('/admin', adminRouter);

  api.use(loadUser);
  api.use('/auth', authRouter);
  api.use('/account', accountRouter);
  api.use(marketsRouter);
  api.use(ordersRouter);
  api.use(walletsRouter);
  api.use(portfolioRouter);
  return api;
}

export function buildServer(opts: { activate: () => Promise<void>; nextHandler: RequestHandler | null }) {
  const env = loadEnv();
  const app = express();
  app.disable('x-powered-by');
  app.set(
    'trust proxy',
    env.TRUST_PROXY === 'true' ? true : env.TRUST_PROXY === 'false' ? false : env.TRUST_PROXY,
  );

  const dev = env.NODE_ENV !== 'production';
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            ...(dev ? ["'unsafe-eval'"] : []),
            'https://accounts.google.com/gsi/client',
          ],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'", 'ws:', 'wss:', 'https://accounts.google.com'],
          frameSrc: ['https://accounts.google.com'],
          workerSrc: ["'self'", 'blob:'],
          manifestSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'", 'https://accounts.google.com'],
          frameAncestors: ["'none'"],
          ...(dev ? {} : { upgradeInsecureRequests: [] }),
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      hsts: env.APP_URL.startsWith('https://') ? { maxAge: 31_536_000, includeSubDomains: true } : false,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.use(compression({ threshold: 1024 }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(
    express.json({
      limit: '2mb',
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    }),
  );
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.get('/health', async (_req, res) => {
    const h = await healthReport();
    const ok =
      runtime.mode === 'installer' || ((h.database as { ok: boolean }).ok && (h.redis as { ok: boolean }).ok);
    res.status(ok ? 200 : 503).json({ ok, mode: runtime.mode, version: APP_VERSION });
  });

  api.get('/uploads/avatars/:file', (req, res) => {
    const f = String(req.params.file);
    if (!/^[A-Za-z0-9_-]{16,40}\.(png|jpg|webp)$/.test(f)) return res.status(404).end();
    const p = path.join(UPLOADS_DIR, 'avatars', f);
    if (!fs.existsSync(p)) return res.status(404).end();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.sendFile(p);
  });

  // Installer while not installed; application API afterwards. Swapped atomically at activation.
  const installer = installRouter(opts.activate);
  let appApi: express.Router | null = null;
  api.use('/install', (req, res, next) => (isInstalled() ? notFound(req, res) : installer(req, res, next)));
  api.get('/config/public', (req, res, next) => {
    if (appApi) return next();
    res.json({
      installed: false,
      version: APP_VERSION,
      settings: { 'site.name': 'TradeTeam', 'site.default_theme': 'light' },
    });
  });
  api.use((req, res, next) => {
    if (appApi) return appApi(req, res, next);
    res
      .status(503)
      .json({ error: { code: 'not_installed', message: 'The platform has not been installed yet.' } });
  });
  api.use(notFound);
  api.use(errorHandler);
  app.use('/api', api);

  // Page routing guard: first visit → installer; after installation the installer never reappears.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const p = req.path;
    const asset =
      p.startsWith('/_next') ||
      p.startsWith('/icons') ||
      /\.(js|css|png|svg|ico|webmanifest|json|txt|woff2?)$/.test(p);
    if (asset) return next();
    if (!isInstalled() && !p.startsWith('/install')) return res.redirect(302, '/install');
    if (isInstalled() && p.startsWith('/install')) return res.redirect(302, '/login');
    next();
  });

  if (opts.nextHandler) app.use(opts.nextHandler);
  else app.use((_req, res) => res.status(404).send('Web frontend is served separately (SERVE_WEB=false).'));

  return {
    app,
    mountAppApi() {
      appApi = buildAppApi();
    },
  };
}
