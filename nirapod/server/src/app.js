import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, errorBody } from './errors.js';
import { healthRouter } from './routes/health.js';
import { appConfigRouter } from './routes/app-config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const pkgVersion = process.env.npm_package_version || '0.1.0';

/**
 * @param {{cfg: object, db: import('knex').Knex, adminDb?: import('knex').Knex, logger: import('pino').Logger}} deps
 */
export function createApp({ cfg, db, logger }) {
  const app = express();
  app.disable('x-powered-by');
  if (cfg.TRUST_PROXY) app.set('trust proxy', 1);

  app.use((req, res, next) => {
    req.id = req.get('x-request-id')?.slice(0, 64) || crypto.randomUUID();
    res.set('x-request-id', req.id);
    next();
  });
  app.use(pinoHttp({ logger, genReqId: (req) => req.id, quietReqLogger: true }));

  if (cfg.FORCE_HTTPS) {
    app.use((req, res, next) => {
      if (req.secure) return next();
      if (req.method === 'GET') return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
      return next(new ApiError('BAD_REQUEST', { message: 'HTTPS is required.' }));
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'img-src': ["'self'", 'data:', 'https:'],
          'connect-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
        },
      },
      hsts: cfg.FORCE_HTTPS ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );

  // CORS: the Android app does not need CORS; browsers only from the allow-list.
  const allowed = new Set(cfg.corsOrigins);
  app.use(
    '/api',
    cors({
      origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
      credentials: false,
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '256kb' }));

  const apiLimiter = rateLimit({
    windowMs: cfg.RATE_LIMIT_WINDOW_MS,
    limit: cfg.RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) => next(new ApiError('RATE_LIMITED')),
  });
  // Stricter limiter exported for auth/code endpoints (mounted on those routers).
  app.locals.authLimiter = rateLimit({
    windowMs: cfg.RATE_LIMIT_WINDOW_MS,
    limit: cfg.AUTH_RATE_LIMIT_MAX,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, next) => next(new ApiError('RATE_LIMITED')),
  });

  const v1 = express.Router();
  v1.use(healthRouter({ db, version: pkgVersion }));
  v1.use(appConfigRouter({ db }));
  v1.use((req, res, next) => next(new ApiError('NOT_FOUND')));

  app.use('/api/v1', apiLimiter, v1);
  // Unversioned or unknown API versions
  app.use('/api', (req, res, next) => next(new ApiError('NOT_FOUND', { message: 'Use /api/v1.' })));

  // Admin panel and landing page are served by the same server.
  app.use('/admin', express.static(path.join(ROOT, 'admin/public'), { index: 'index.html', maxAge: '1h' }));
  app.use('/', express.static(path.join(ROOT, 'landing/public'), { index: 'index.html', maxAge: '1h' }));
  app.use('/shared/web', express.static(path.join(ROOT, 'shared/web'), { maxAge: '1h' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let e = err;
    if (err?.type === 'entity.parse.failed') e = new ApiError('BAD_REQUEST', { message: 'Invalid JSON.' });
    else if (err?.type === 'entity.too.large') e = new ApiError('PAYLOAD_TOO_LARGE');
    else if (!(err instanceof ApiError)) {
      req.log?.error({ err }, 'unhandled error');
      e = new ApiError('INTERNAL');
    }
    res.status(e.status).json(errorBody(e, req.id));
  });

  return app;
}
