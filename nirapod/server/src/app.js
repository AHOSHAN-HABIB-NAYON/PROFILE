import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError, errorBody } from './errors.js';
import { serializeError } from './logger.js';
import { healthRouter } from './routes/health.js';
import { appConfigRouter } from './routes/app-config.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { familiesRouter } from './routes/families.js';
import { familyManageRouter } from './routes/family-manage.js';
import { locationsRouter } from './routes/locations.js';
import { nearbyRouter, googlePlacesFetcher } from './routes/nearby.js';
import { placesRouter } from './routes/places.js';
import { safetyRouter } from './routes/safety.js';
import { notificationsRouter } from './routes/notifications.js';
import { billingRouter } from './routes/billing.js';
import { dataRightsRouter } from './routes/data-rights.js';
import { chatRouter } from './routes/chat.js';
import { adminRouter } from './routes/admin.js';
import { publicAssistantRouter } from './routes/public-assistant.js';
import { createPusher } from './push/fcm.js';
import { getSecret } from './settings.js';
import { createRealtimeHub } from './realtime.js';
import { geoRouter, createGeoLookup } from './geo/hint.js';
import { systemClock } from './clock.js';
import { createTokenService } from './auth/tokens.js';
import { createSessionService } from './auth/sessions.js';
import { createCodeService, createSendThrottle } from './auth/codes.js';
import { createGoogleVerifier } from './auth/google.js';
import { requireAuth } from './auth/middleware.js';
import { createMailer } from './email/mailer.js';
import { avatarDir } from './media/avatars.js';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const pkgVersion = process.env.npm_package_version || '0.1.0';

// Used only when JWT_ACCESS_SECRET is unset outside production (config refuses to start production without it).
let ephemeralSecret;

/**
 * @param {{cfg: object, db: import('knex').Knex, adminDb?: import('knex').Knex, logger: import('pino').Logger,
 *   clock?: {now: () => Date}, mailTransport?: object, googleVerifier?: Function, geoLookup?: Function}} deps
 *   mailTransport, googleVerifier and geoLookup are injectable for tests.
 */
export function createApp({ cfg, db, adminDb, logger, clock = systemClock, mailTransport, googleVerifier, geoLookup, placesFetcher, realtime, fcmTransport, pusher, playTransport, aiProvider }) {
  const app = express();
  let secret = cfg.JWT_ACCESS_SECRET;
  if (!secret) {
    ephemeralSecret ??= crypto.randomBytes(48).toString('base64');
    secret = ephemeralSecret;
    logger.warn('JWT_ACCESS_SECRET not set: using a random secret for this process (dev only).');
  }
  const codeKey = cfg.MASTER_KEY || secret;
  const tokens = createTokenService({ secret, ttlS: cfg.JWT_ACCESS_TTL_S, clock });
  const sessions = createSessionService({ db, cfg, clock, tokens });
  const ctx = {
    db, adminDb: adminDb ?? db, cfg, clock, logger, tokens, sessions,
    codes: createCodeService({ db, clock, key: codeKey }),
    throttle: createSendThrottle({ clock, key: codeKey }),
    mailer: createMailer({ cfg, db, logger, clock, transport: mailTransport }),
    google: googleVerifier ?? createGoogleVerifier(cfg.GOOGLE_OAUTH_CLIENT_IDS),
    requireAuth: requireAuth({ tokens, sessions, clock }),
    realtime: realtime ?? createRealtimeHub(),
    // Places API key: admin setting (encrypted) first, then env.
    placesFetcher: placesFetcher ?? googlePlacesFetcher(async () => (await getSecret(db, cfg, 'google_places_api_key')) || cfg.GOOGLE_PLACES_API_KEY),
  };
  ctx.pusher = pusher ?? createPusher({ db, cfg, logger, clock, transport: fcmTransport });
  ctx.playTransport = playTransport;
  ctx.aiProvider = aiProvider;
  app.locals.ctx = ctx;
  app.disable('x-powered-by');
  if (cfg.TRUST_PROXY) app.set('trust proxy', 1);

  app.use((req, res, next) => {
    const given = req.get('x-request-id');
    req.id = given && /^[A-Za-z0-9._-]{1,64}$/.test(given) ? given : crypto.randomUUID();
    res.set('x-request-id', req.id);
    next();
  });
  // pino-http does not use the logger's own serializers: set them here so request logs hold only
  // method, path (no query) and status - never headers (x-forwarded-for, user-agent), IPs or bodies.
  app.use(pinoHttp({
    logger,
    genReqId: (req) => req.id,
    quietReqLogger: true,
    serializers: {
      // pino-http hands serializers a wrapped object; the real one is at .raw
      req: (req) => ({ method: req.method, path: String(req.raw?.originalUrl ?? req.url ?? '').split('?')[0] }),
      res: (res) => ({ statusCode: res.raw?.statusCode ?? res.statusCode }),
      err: serializeError,
    },
  }));

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
  // Auth and code endpoints add their own stricter per-endpoint limiters (src/http.js limiter()).

  const v1 = express.Router();
  v1.use(healthRouter({ db, version: pkgVersion }));
  v1.use(appConfigRouter({ db }));
  v1.use(geoRouter({ geoLookup: geoLookup ?? createGeoLookup({ path: cfg.GEOIP_DB_PATH, logger }) }));
  v1.use(authRouter(ctx));
  v1.use(meRouter(ctx));
  v1.use(familiesRouter(ctx));
  v1.use(familyManageRouter(ctx));
  v1.use(locationsRouter(ctx));
  v1.use(nearbyRouter(ctx));
  v1.use(placesRouter(ctx));
  v1.use(safetyRouter(ctx));
  v1.use(notificationsRouter(ctx));
  v1.use(billingRouter(ctx));
  v1.use(dataRightsRouter(ctx));
  v1.use(chatRouter(ctx));
  v1.use(adminRouter(ctx));
  v1.use(publicAssistantRouter(ctx));
  v1.use((req, res, next) => next(new ApiError('NOT_FOUND')));

  app.use('/api/v1', apiLimiter, v1);
  // Unversioned or unknown API versions
  app.use('/api', (req, res, next) => next(new ApiError('NOT_FOUND', { message: 'Use /api/v1.' })));

  // Profile photos: random names, re-encoded JPEG only, read-only, nosniff (helmet), no directory listing.
  const avatars = avatarDir(cfg.UPLOAD_DIR);
  fs.mkdirSync(avatars, { recursive: true });
  app.use('/media/avatars', express.static(avatars, {
    index: false, dotfiles: 'deny', redirect: false, fallthrough: false, immutable: true, maxAge: '30d',
    setHeaders: (res) => res.set({ 'x-content-type-options': 'nosniff', 'content-disposition': 'inline' }),
  }));

  app.use('/media/banner', express.static(path.resolve(cfg.UPLOAD_DIR, 'banner'), {
    index: false, dotfiles: 'deny', redirect: false, fallthrough: false, maxAge: '7d',
    setHeaders: (res) => res.set({ 'x-content-type-options': 'nosniff' }),
  }));

  // Admin panel and landing page are served by the same server.
  app.use('/admin', express.static(path.join(ROOT, 'admin/public'), { index: 'index.html', maxAge: '1h' }));
  app.use('/', express.static(path.join(ROOT, 'landing/public'), { index: 'index.html', maxAge: '1h' }));
  app.use('/shared/web', express.static(path.join(ROOT, 'shared/web'), { maxAge: '1h' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let e = err;
    if (err?.type === 'entity.parse.failed') e = new ApiError('BAD_REQUEST', { message: 'Invalid JSON.' });
    else if (err?.type === 'entity.too.large') e = new ApiError('PAYLOAD_TOO_LARGE');
    else if (err?.status === 404 || err?.statusCode === 404) e = new ApiError('NOT_FOUND');
    else if (err?.status === 403 && err?.expose) e = new ApiError('FORBIDDEN');
    else if (err?.code === 'ER_DUP_ENTRY') e = new ApiError('CONFLICT');
    else if (!(err instanceof ApiError)) {
      req.log?.error({ err }, 'unhandled error');
      e = new ApiError('INTERNAL');
    }
    res.status(e.status).json(errorBody(e, req.id));
  });

  return app;
}
