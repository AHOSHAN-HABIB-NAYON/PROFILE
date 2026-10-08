import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import type { AppContext } from './context';
import { AppError } from './lib/errors';
import { loggerOptions } from './lib/logger';
import { adminRoutes } from './routes/admin.routes';
import { authRoutes } from './routes/auth.routes';
import { gameRoutes } from './routes/game.routes';
import { publicRoutes } from './routes/public.routes';
import { registerStaticWeb } from './static-web';
import { socialRoutes } from './routes/social.routes';
import { userRoutes } from './routes/user.routes';

/** Configured origins plus the Android app's WebView origins (https://localhost, capacitor://localhost). */
export function corsOrigins(list: string) {
  return [...new Set([...list.split(',').map((s) => s.trim()).filter(Boolean), 'https://localhost', 'capacitor://localhost'])];
}

export async function buildApp(ctx: AppContext, opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const { env } = ctx;
  const app = Fastify({
    logger: opts.logger === false ? false : loggerOptions(env.LOG_LEVEL, env.NODE_ENV === 'development'),
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 256 * 1024,
    disableRequestLogging: env.NODE_ENV === 'production',
  });

  const origins = corsOrigins(env.CORS_ORIGINS);
  await app.register(helmet, {
    // The API serves JSON (and a tiny share page); a strict CSP is applied by the web host.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Client-Platform', 'X-Device-Name', 'X-App-Version-Code'],
    maxAge: 600,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // Automated tests bypass limits unless a test opts in (never active outside NODE_ENV=test).
    allowList: (req) => env.NODE_ENV === 'test' && req.headers['x-test-rate-limit'] !== 'on',
    ...(ctx.redis ? { redis: ctx.redis, nameSpace: 'qw-rl:' } : {}),
    errorResponseBuilder: (_req, c) => ({ statusCode: 429, error: { code: 'rate_limited', message: `Too many requests. Try again in ${Math.ceil(c.ttl / 1000)}s.` } }),
  });
  await app.register(multipart, { limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1, fields: 5 } });

  if (env.STORAGE_DRIVER === 'local') {
    const dir = path.resolve(env.STORAGE_LOCAL_DIR);
    mkdirSync(dir, { recursive: true });
    await app.register(fastifyStatic, {
      root: dir,
      prefix: '/media/',
      decorateReply: false,
      immutable: true,
      maxAge: '30d',
      setHeaders: (res) => {
        res.header('X-Content-Type-Options', 'nosniff');
        res.header('Content-Security-Policy', "default-src 'none'; img-src 'self'");
      },
    });
  }

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: { code: 'invalid_request', message: err.issues[0]?.message ?? 'Invalid request' } });
    }
    const status = (err as any).statusCode ?? 500;
    if (status === 429) return reply.status(429).send({ error: { code: 'rate_limited', message: 'Too many requests, please slow down' } });
    if (status === 413) return reply.status(413).send({ error: { code: 'payload_too_large', message: 'The upload is too large' } });
    if (status >= 400 && status < 500) {
      return reply.status(status).send({ error: { code: (err as any).code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' ? 'unsupported_media_type' : 'invalid_request', message: 'Invalid request' } });
    }
    req.log.error({ err }, 'unhandled error');
    // Never leak stack traces or internals to clients.
    return reply.status(500).send({ error: { code: 'server_error', message: 'Something went wrong. Please try again.' } });
  });
  let spaFallback: ((req: any, reply: any) => unknown) | undefined;
  app.setNotFoundHandler((req, reply) => {
    const r = spaFallback?.(req, reply);
    if (r) return r;
    return reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } });
  });

  // Maintenance mode + force update gate for the player API (admin, config and health stay up).
  app.addHook('onRequest', async (req, reply) => {
    const url = req.url;
    if (!url.startsWith('/api/v1/') || url.startsWith('/api/v1/admin') || url.startsWith('/api/v1/config')) return;
    const a = ctx.settings.app();
    if (a.maintenanceMode) {
      return reply.status(503).send({ error: { code: 'maintenance', message: a.maintenanceMessage } });
    }
    const vc = Number(req.headers['x-app-version-code'] ?? 0);
    if (req.headers['x-client-platform'] === 'android' && a.forceUpdate && vc > 0 && vc < a.minAppVersionCode) {
      return reply.status(426).send({ error: { code: 'update_required', message: 'Please update QUIZ WAR to continue playing.' } });
    }
  });

  const staticWeb = await registerStaticWeb(app);
  if (staticWeb.web || 'spaFallback' in staticWeb) spaFallback = (staticWeb as any).spaFallback;
  await app.register(async (pub) => publicRoutes(pub, ctx, staticWeb));
  await app.register(async (api) => {
    await authRoutes(api, ctx);
    await userRoutes(api, ctx);
    await socialRoutes(api, ctx);
    await gameRoutes(api, ctx);
  }, { prefix: '/api/v1' });
  await app.register(async (admin) => adminRoutes(admin, ctx), { prefix: '/api/v1/admin' });

  return app;
}
