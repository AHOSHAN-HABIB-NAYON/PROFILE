import { Router } from 'express';
import { z } from 'zod';
import { h } from '../../http/async';
import { body, parseQuery } from '../../http/middleware/validate';
import { requireUser, recentMfa } from '../../http/middleware/auth';
import { rateLimit, byPrincipal } from '../../http/middleware/rate-limit';
import { Errors } from '../../http/errors';
import { exec, one, query } from '../../infrastructure/db';
import * as users from './users.service';
import * as mfa from '../auth/mfa';
import { changePassword } from '../auth/auth.service';
import { passwordSchema } from '../auth/passwords';
import { revokeAllSessions, revokeSession, rotateSession } from '../auth/sessions';
import { securityEvent } from '../auth/security-log';
import { notify, savePushSubscription } from '../notifications/notifications.service';
import { findUserById, publicUser } from './users.repo';
import { loadEnv } from '../../config/env';

export const accountRouter = Router();
accountRouter.use(requireUser);

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,20}$/)
    .nullable()
    .optional(),
  timezone: z
    .string()
    .max(64)
    .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz) || tz === 'UTC', 'Unknown timezone')
    .optional(),
  currency: z.enum(['USD', 'EUR', 'GBP', 'USDT', 'BTC']).optional(),
  language: z.enum(['en', 'es', 'fr', 'de', 'bn', 'ar', 'zh', 'ja']).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  notificationPrefs: z
    .object({
      email: z.record(z.string(), z.boolean()).optional(),
      push: z.record(z.string(), z.boolean()).optional(),
      inapp: z.record(z.string(), z.boolean()).optional(),
    })
    .optional(),
});

accountRouter.get(
  '/profile',
  h(async (req, res) => {
    const u = await findUserById(req.auth!.id);
    res.json({ user: publicUser(u!), profile: await users.getProfile(req.auth!.id) });
  }),
);

accountRouter.patch(
  '/profile',
  body(profileSchema),
  h(async (req, res) => {
    await users.updateProfile(req.auth!.id, req.body);
    res.json({ profile: await users.getProfile(req.auth!.id) });
  }),
);

accountRouter.post(
  '/avatar',
  rateLimit('avatar', 10, 3600, byPrincipal),
  body(z.object({ dataUrl: z.string().max(1_500_000) })),
  h(async (req, res) => {
    res.json({ avatarUrl: await users.saveAvatar(req.auth!.id, req.body.dataUrl) });
  }),
);

accountRouter.post(
  '/password',
  rateLimit('pw-change', 5, 900, byPrincipal),
  body(
    z.object({
      currentPassword: z.string().max(128).optional(),
      newPassword: passwordSchema,
      signOutOthers: z.boolean().default(true),
    }),
  ),
  h(async (req, res) => {
    await changePassword(req, req.auth!.id, req.body.currentPassword, req.body.newPassword);
    const { sessionId } = await rotateSession(req, res, req.auth!, 'password_change');
    if (req.body.signOutOthers) await revokeAllSessions('user', req.auth!.id, 'password_change', sessionId);
    res.json({ ok: true });
  }),
);

// ───── security overview ─────
accountRouter.get(
  '/security',
  h(async (req, res) => {
    const id = req.auth!.id;
    const u = (await findUserById(id))!;
    res.json({
      twoFactor: await mfa.totpStatus('user', id),
      passkeys: (await mfa.listPasskeys('user', id)).map((p) => ({
        ...p,
        id: String(p.id),
        backedUp: Boolean(p.backed_up),
      })),
      googleLinked: Boolean(u.google_sub),
      hasPassword: Boolean(u.password_hash),
      emailVerified: Boolean(u.email_verified_at),
      mfaRecent: recentMfa(req),
    });
  }),
);

/** Changing security settings requires recent step-up when any second factor exists. */
async function requireStepUpIfEnrolled(req: Parameters<typeof recentMfa>[0]) {
  const m = await mfa.methodsFor('user', req.auth!.id);
  if ((m.totp || m.passkey) && !recentMfa(req)) throw Errors.mfaRequired({ methods: m });
}

accountRouter.post(
  '/2fa/setup',
  h(async (req, res) => {
    const u = (await findUserById(req.auth!.id))!;
    try {
      res.json(await mfa.beginTotp('user', u.id, u.email));
    } catch (e) {
      throw Errors.conflict((e as Error).message);
    }
  }),
);

accountRouter.post(
  '/2fa/enable',
  rateLimit('2fa-enable', 10, 900, byPrincipal),
  body(z.object({ code: z.string().regex(/^\d{6}$/) })),
  h(async (req, res) => {
    const codes = await mfa.confirmTotp('user', req.auth!.id, req.body.code);
    if (!codes) throw Errors.badRequest('Invalid code. Check your authenticator app time and try again.');
    await securityEvent('user', req.auth!.id, '2fa_enabled', req);
    await notify(
      req.auth!.id,
      '2fa_enabled',
      'Two-factor authentication enabled',
      'Your account is now protected with an authenticator app.',
      {},
      { email: true },
    );
    await rotateSession(req, res, req.auth!, '2fa_enabled', true);
    res.json({ backupCodes: codes });
  }),
);

accountRouter.post(
  '/2fa/disable',
  rateLimit('2fa-disable', 5, 900, byPrincipal),
  body(z.object({ code: z.string().min(6).max(20) })),
  h(async (req, res) => {
    const id = req.auth!.id;
    const ok = /^\d{6}$/.test(req.body.code)
      ? await mfa.checkTotp('user', id, req.body.code)
      : await mfa.useBackupCode('user', id, req.body.code);
    if (!ok) throw Errors.badRequest('Invalid code');
    await mfa.disableTotp('user', id);
    await securityEvent('user', id, '2fa_disabled', req);
    await notify(
      id,
      '2fa_disabled',
      'Two-factor authentication disabled',
      'Authenticator 2FA was removed from your account. If this was not you, contact support.',
      {},
      { email: true },
    );
    await rotateSession(req, res, req.auth!, '2fa_disabled');
    res.json({ ok: true });
  }),
);

accountRouter.post(
  '/2fa/backup-codes',
  body(z.object({ code: z.string().regex(/^\d{6}$/) })),
  h(async (req, res) => {
    if (!(await mfa.checkTotp('user', req.auth!.id, req.body.code))) throw Errors.badRequest('Invalid code');
    const codes = await mfa.regenerateBackupCodes('user', req.auth!.id);
    await securityEvent('user', req.auth!.id, 'backup_codes_regenerated', req);
    res.json({ backupCodes: codes });
  }),
);

accountRouter.patch(
  '/passkeys/:id',
  body(z.object({ name: z.string().trim().min(1).max(100) })),
  h(async (req, res) => {
    const r = await exec(
      "UPDATE passkeys SET name = ? WHERE id = ? AND principal_type = 'user' AND principal_id = ?",
      [req.body.name, Number(req.params.id), req.auth!.id],
    );
    if (!r.affectedRows) throw Errors.notFound('Passkey not found');
    res.json({ ok: true });
  }),
);

accountRouter.delete(
  '/passkeys/:id',
  h(async (req, res) => {
    await requireStepUpIfEnrolled(req);
    const pk = await one<{ name: string }>(
      "SELECT name FROM passkeys WHERE id = ? AND principal_type = 'user' AND principal_id = ?",
      [Number(req.params.id), req.auth!.id],
    );
    if (!pk) throw Errors.notFound('Passkey not found');
    const u = (await findUserById(req.auth!.id))!;
    const count = await mfa.passkeyCount('user', u.id);
    if (count === 1 && !u.password_hash && !u.google_sub)
      throw Errors.badRequest('You cannot remove your only sign-in method');
    await exec("DELETE FROM passkeys WHERE id = ? AND principal_type = 'user' AND principal_id = ?", [
      Number(req.params.id),
      u.id,
    ]);
    await securityEvent('user', u.id, 'passkey_removed', req, { name: pk.name });
    await notify(
      u.id,
      'passkey_removed',
      'Passkey removed',
      `The passkey "${pk.name}" was removed from your account.`,
      {},
      { email: true },
    );
    res.json({ ok: true });
  }),
);

accountRouter.delete(
  '/google',
  h(async (req, res) => {
    const u = (await findUserById(req.auth!.id))!;
    if (!u.password_hash && (await mfa.passkeyCount('user', u.id)) === 0)
      throw Errors.badRequest('Set a password or add a passkey before unlinking Google');
    await exec('UPDATE users SET google_sub = NULL WHERE id = ?', [u.id]);
    await securityEvent('user', u.id, 'google_unlinked', req);
    res.json({ ok: true });
  }),
);

// ───── sessions / devices / history ─────
accountRouter.get(
  '/sessions',
  h(async (req, res) => res.json({ items: await users.listSessions(req.auth!.id, req.auth!.sessionId) })),
);
accountRouter.delete(
  '/sessions/:id',
  h(async (req, res) => {
    const s = await one(
      "SELECT id FROM user_sessions WHERE id = ? AND principal_type = 'user' AND principal_id = ?",
      [Number(req.params.id), req.auth!.id],
    );
    if (!s) throw Errors.notFound('Session not found');
    await revokeSession(Number(req.params.id), 'user_revoked');
    await securityEvent('user', req.auth!.id, 'session_revoked', req, { sessionId: req.params.id });
    res.json({ ok: true });
  }),
);
accountRouter.post(
  '/sessions/revoke-others',
  h(async (req, res) => {
    const n = await revokeAllSessions('user', req.auth!.id, 'user_revoked_all', req.auth!.sessionId);
    await securityEvent('user', req.auth!.id, 'sessions_revoked', req, { count: n });
    res.json({ revoked: n });
  }),
);
accountRouter.get(
  '/devices',
  h(async (req, res) => res.json({ items: await users.listDevices(req.auth!.id) })),
);
accountRouter.get(
  '/login-history',
  h(async (req, res) => res.json({ items: await users.loginHistory(req.auth!.id) })),
);
accountRouter.get(
  '/security-events',
  h(async (req, res) => res.json({ items: await users.securityEvents(req.auth!.id) })),
);

// ───── notifications ─────
accountRouter.get(
  '/notifications',
  h(async (req, res) => {
    const q = parseQuery(
      z.object({
        before: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
        unread: z.coerce.boolean().optional(),
      }),
      req.query,
    );
    const rows = await query<{
      id: number;
      type: string;
      title: string;
      body: string;
      data: unknown;
      read_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, type, title, body, data, read_at, created_at FROM notifications WHERE user_id = ? ${q.before ? 'AND id < ?' : ''} ${q.unread ? 'AND read_at IS NULL' : ''} ORDER BY id DESC LIMIT ?`,
      q.before ? [req.auth!.id, q.before, q.limit] : [req.auth!.id, q.limit],
    );
    const unread = await one<{ n: number }>(
      'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
      [req.auth!.id],
    );
    res.json({
      items: rows.map((r) => ({
        id: String(r.id),
        type: r.type,
        title: r.title,
        body: r.body,
        data: r.data,
        readAt: r.read_at,
        createdAt: r.created_at,
      })),
      unread: Number(unread?.n ?? 0),
    });
  }),
);
accountRouter.post(
  '/notifications/read',
  body(
    z.object({
      ids: z.array(z.coerce.number().int().positive()).max(200).optional(),
      all: z.boolean().optional(),
    }),
  ),
  h(async (req, res) => {
    if (req.body.all)
      await exec('UPDATE notifications SET read_at = NOW(3) WHERE user_id = ? AND read_at IS NULL', [
        req.auth!.id,
      ]);
    else if (req.body.ids?.length)
      await exec(
        `UPDATE notifications SET read_at = NOW(3) WHERE user_id = ? AND id IN (${req.body.ids.map(() => '?').join(',')})`,
        [req.auth!.id, ...req.body.ids],
      );
    res.json({ ok: true });
  }),
);
accountRouter.get('/push/key', (_req, res) => res.json({ publicKey: loadEnv().VAPID_PUBLIC_KEY ?? null }));
accountRouter.post(
  '/push/subscribe',
  body(
    z.object({
      endpoint: z.string().url().max(700),
      keys: z.object({ p256dh: z.string().max(255), auth: z.string().max(255) }),
    }),
  ),
  h(async (req, res) => {
    // Only deliver to well-known browser push services (prevents SSRF via arbitrary endpoints).
    const host = new URL(req.body.endpoint).hostname;
    const allowed =
      /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/;
    if (!req.body.endpoint.startsWith('https://') || !allowed.test(host))
      throw Errors.badRequest('Unsupported push endpoint');
    await savePushSubscription(req.auth!.id, req.body);
    res.json({ ok: true });
  }),
);
