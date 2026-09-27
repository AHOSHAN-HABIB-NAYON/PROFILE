import { Router } from 'express';
import { z } from 'zod';
import { h } from '../../http/async';
import { body } from '../../http/middleware/validate';
import { Errors } from '../../http/errors';
import { isInstalled } from '../../config/env';
import { passwordSchema } from '../auth/passwords';
import { otpauthUrl } from '../auth/totp';
import { verifySmtp } from '../../infrastructure/mailer';
import * as svc from './install.service';

/**
 * Installer API. Mounted only while not installed; additionally every handler re-checks the lock
 * so a request racing the end of installation cannot reach it.
 */
export function installRouter(activate: () => Promise<void>) {
  const r = Router();
  r.use((_req, _res, next) => (isInstalled() ? next(Errors.notFound()) : next()));

  const attempts = new Map<string, { n: number; at: number }>();
  const tokenGuard = (token: string | undefined, ip: string) => {
    const a = attempts.get(ip) ?? { n: 0, at: Date.now() };
    if (Date.now() - a.at > 600_000) Object.assign(a, { n: 0, at: Date.now() });
    if (a.n >= 10) throw Errors.tooMany('Too many attempts', 600);
    if (!svc.checkToken(token)) {
      a.n++;
      attempts.set(ip, a);
      throw Errors.unauthorized(
        'Invalid setup token. It is printed in the server log and stored in storage/install-token.txt',
      );
    }
  };

  r.get('/status', (_req, res) => {
    svc.ensureSetupToken();
    res.json({ installed: false, requirements: svc.requirements() });
  });

  r.post(
    '/verify-token',
    body(z.object({ token: z.string().max(100) })),
    h(async (req, res) => {
      tokenGuard(req.body.token, req.ip ?? '');
      res.json({ ok: true });
    }),
  );

  const dbSchema = z.object({
    host: z.string().min(1).max(255),
    port: z.number().int().min(1).max(65535).default(3306),
    database: z.string().regex(/^[A-Za-z0-9_]{1,64}$/),
    user: z.string().min(1).max(64),
    password: z.string().max(256),
  });

  r.post(
    '/check-db',
    body(z.object({ token: z.string(), db: dbSchema })),
    h(async (req, res) => {
      tokenGuard(req.body.token, req.ip ?? '');
      try {
        res.json(await svc.checkDatabase(req.body.db));
      } catch (e) {
        res.json({ ok: false, error: (e as Error).message });
      }
    }),
  );

  r.post(
    '/check-redis',
    body(
      z.object({
        token: z.string(),
        url: z
          .string()
          .regex(/^rediss?:\/\//)
          .max(500),
      }),
    ),
    h(async (req, res) => {
      tokenGuard(req.body.token, req.ip ?? '');
      try {
        res.json(await svc.checkRedis(req.body.url));
      } catch (e) {
        res.json({ ok: false, error: (e as Error).message });
      }
    }),
  );

  r.post(
    '/check-smtp',
    body(
      z.object({
        token: z.string(),
        smtp: z.object({
          host: z.string().min(1),
          port: z.number().int(),
          secure: z.boolean(),
          user: z.string().optional(),
          password: z.string().optional(),
        }),
      }),
    ),
    h(async (req, res) => {
      tokenGuard(req.body.token, req.ip ?? '');
      try {
        await verifySmtp(req.body.smtp);
        res.json({ ok: true });
      } catch (e) {
        res.json({ ok: false, error: (e as Error).message });
      }
    }),
  );

  r.post(
    '/admin-totp',
    body(z.object({ token: z.string(), email: z.string().email() })),
    h(async (req, res) => {
      tokenGuard(req.body.token, req.ip ?? '');
      const secret = svc.beginAdminTotp(req.body.token);
      res.json({ secret, otpauthUrl: otpauthUrl(secret, req.body.email, 'TradeTeam Admin') });
    }),
  );

  const installSchema = z.object({
    token: z.string(),
    appUrl: z
      .string()
      .url()
      .refine((u) => /^https?:\/\//.test(u)),
    db: dbSchema,
    redisUrl: z
      .string()
      .regex(/^rediss?:\/\//)
      .max(500),
    admin: z.object({
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().toLowerCase().email(),
      password: passwordSchema,
      totpCode: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
    }),
    app: z.object({
      siteName: z.string().trim().min(1).max(60),
      logoUrl: z.string().url().or(z.literal('')).optional(),
      currency: z.string().min(2).max(10),
      timezone: z.string().max(64),
    }),
    services: z.object({
      smtp: z
        .object({
          host: z.string().max(200),
          port: z.number().int(),
          secure: z.boolean(),
          user: z.string().max(200).optional(),
          password: z.string().max(500).optional(),
          from: z.string().max(200),
        })
        .optional(),
      google: z.object({ clientId: z.string().max(200), clientSecret: z.string().max(200) }).optional(),
      market: z.object({
        provider: z.enum(['binance', 'internal']),
        restUrl: z.string().url().optional(),
        wsUrl: z.string().url().optional(),
        defaultEngine: z.enum(['internal', 'external']),
      }),
      ws: z.object({
        maxChannelsPerSocket: z.number().int().min(10).max(1000).default(200),
        compressionThreshold: z.number().int().min(0).max(1_000_000).default(1024),
      }),
      exchange: z.object({ apiKey: z.string().max(200), apiSecret: z.string().max(200) }).optional(),
    }),
  });

  r.post(
    '/run',
    body(installSchema),
    h(async (req, res) => {
      tokenGuard(req.body.token, req.ip ?? '');
      try {
        const log = await svc.runInstall(req.body, activate);
        res.json({ ok: true, log });
      } catch (e) {
        res
          .status(400)
          .json({ ok: false, error: (e as Error).message, log: (e as { log?: unknown }).log ?? [] });
      }
    }),
  );

  return r;
}
