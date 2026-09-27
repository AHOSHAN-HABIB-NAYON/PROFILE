import { Router } from 'express';
import { z } from 'zod';
import { h } from '../../http/async';
import { body } from '../../http/middleware/validate';
import { rateLimit, consume } from '../../http/middleware/rate-limit';
import { Errors, AppError } from '../../http/errors';
import { exec, one } from '../../infrastructure/db';
import { verifyPassword, dummyVerify, hashPassword, passwordSchema } from '../auth/passwords';
import {
  createSession,
  revokeSession,
  clearSessionCookie,
  markSessionMfa,
  rotateSession,
} from '../auth/sessions';
import * as mfa from '../auth/mfa';
import * as wa from '../auth/webauthn';
import { loginAttempt, securityEvent, audit } from '../auth/security-log';
import { requireAdmin } from './admin.middleware';

export const adminAuthRouter = Router();
const ipLimit = rateLimit('admin-auth-ip', 20, 300);

interface AdminRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  status: string;
  failed_login_count: number;
  locked_until: Date | null;
}

adminAuthRouter.post(
  '/login',
  ipLimit,
  body(z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(128) })),
  h(async (req, res) => {
    await consume('admin-login-email', req.body.email, 5, 900);
    const a = await one<AdminRow>(
      'SELECT id, email, name, password_hash, status, failed_login_count, locked_until FROM admin_users WHERE email = ?',
      [req.body.email],
    );
    if (!a) {
      await dummyVerify(req.body.password);
      await loginAttempt('admin', null, req.body.email, 'password', false, 'unknown_account', req);
      throw Errors.unauthorized('Incorrect email or password');
    }
    if (a.status !== 'active') throw Errors.forbidden('Account disabled');
    if (a.locked_until && a.locked_until.getTime() > Date.now())
      throw new AppError(423, 'account_locked', 'Account temporarily locked');
    if (!(await verifyPassword(a.password_hash, req.body.password))) {
      await exec(
        'UPDATE admin_users SET locked_until = IF(failed_login_count + 1 >= 5, DATE_ADD(NOW(3), INTERVAL 30 MINUTE), locked_until), failed_login_count = failed_login_count + 1 WHERE id = ?',
        [a.id],
      );
      await loginAttempt('admin', a.id, a.email, 'password', false, 'bad_password', req);
      throw Errors.unauthorized('Incorrect email or password');
    }
    const methods = await mfa.methodsFor('admin', a.id);
    if (methods.totp || methods.passkey) {
      const mfaToken = await mfa.createMfaChallenge('admin', a.id, 'password');
      return res.json({ status: 'mfa_required', mfaToken, methods });
    }
    // No second factor yet: limited session that can only enrol one.
    await createSession(req, res, 'admin', a.id, 'password', { mfa: false });
    await exec(
      'UPDATE admin_users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW(3) WHERE id = ?',
      [a.id],
    );
    await loginAttempt('admin', a.id, a.email, 'password', true, 'setup_required', req);
    res.json({ status: 'setup_required' });
  }),
);

adminAuthRouter.post(
  '/2fa/passkey/options',
  ipLimit,
  body(z.object({ mfaToken: z.string().min(10).max(100) })),
  h(async (req, res) => {
    const ch = await mfa.getMfaChallenge(req.body.mfaToken);
    if (!ch || ch.pt !== 'admin') throw Errors.unauthorized('Verification expired');
    res.json(await wa.authenticationOptions({ pt: 'admin', pid: ch.pid }));
  }),
);

adminAuthRouter.post(
  '/2fa/verify',
  ipLimit,
  body(
    z.object({
      mfaToken: z.string().min(10).max(100),
      method: z.enum(['totp', 'backup', 'passkey']),
      code: z.string().max(20).optional(),
      challengeId: z.string().max(100).optional(),
      response: z.any().optional(),
    }),
  ),
  h(async (req, res) => {
    const ch = await mfa.getMfaChallenge(req.body.mfaToken);
    if (!ch || ch.pt !== 'admin') throw Errors.unauthorized('Verification expired');
    let ok = false;
    if (req.body.method === 'totp') ok = await mfa.checkTotp('admin', ch.pid, req.body.code ?? '');
    else if (req.body.method === 'backup') ok = await mfa.useBackupCode('admin', ch.pid, req.body.code ?? '');
    else {
      try {
        const r = await wa.verifyAuthentication(req.body.challengeId ?? '', req.body.response);
        ok = r.pt === 'admin' && r.pid === ch.pid;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      await mfa.bumpMfaChallenge(req.body.mfaToken, ch);
      await loginAttempt('admin', ch.pid, null, `2fa_${req.body.method}`, false, 'bad_code', req);
      throw Errors.unauthorized('Invalid verification');
    }
    await mfa.consumeMfaChallenge(req.body.mfaToken);
    await createSession(req, res, 'admin', ch.pid, `password+${req.body.method}`, { mfa: true });
    await exec(
      'UPDATE admin_users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW(3) WHERE id = ?',
      [ch.pid],
    );
    await loginAttempt('admin', ch.pid, null, `password+${req.body.method}`, true, null, req);
    await audit(ch.pid, 'admin.login', { type: 'admin', id: ch.pid }, req);
    res.json({ status: 'ok' });
  }),
);

adminAuthRouter.get('/me', (req, res) => {
  if (!req.admin) return res.json({ admin: null });
  res.json({
    admin: {
      id: String(req.admin.id),
      email: req.admin.email,
      name: req.admin.name,
      role: req.admin.role,
      permissions: [...req.admin.permissions],
      mfa: Boolean(req.auth?.mfaAt),
    },
  });
});

adminAuthRouter.post(
  '/logout',
  h(async (req, res) => {
    if (req.auth?.type === 'admin') await revokeSession(req.auth.sessionId, 'logout');
    clearSessionCookie(res, 'admin');
    res.json({ ok: true });
  }),
);

adminAuthRouter.post(
  '/2fa/setup',
  requireAdmin,
  h(async (req, res) => {
    try {
      res.json(await mfa.beginTotp('admin', req.admin!.id, req.admin!.email));
    } catch (e) {
      throw Errors.conflict((e as Error).message);
    }
  }),
);

adminAuthRouter.post(
  '/2fa/enable',
  requireAdmin,
  body(z.object({ code: z.string().regex(/^\d{6}$/) })),
  h(async (req, res) => {
    const codes = await mfa.confirmTotp('admin', req.admin!.id, req.body.code);
    if (!codes) throw Errors.badRequest('Invalid code');
    await securityEvent('admin', req.admin!.id, '2fa_enabled', req);
    await audit(req.admin!.id, 'admin.2fa_enabled', { type: 'admin', id: req.admin!.id }, req);
    await rotateSession(req, res, req.auth!, '2fa_enabled', true);
    res.json({ backupCodes: codes });
  }),
);

adminAuthRouter.post(
  '/passkey/register/options',
  requireAdmin,
  h(async (req, res) =>
    res.json(await wa.registrationOptions('admin', req.admin!.id, req.admin!.email, req.admin!.name)),
  ),
);

adminAuthRouter.post(
  '/passkey/register',
  requireAdmin,
  body(
    z.object({
      challengeId: z.string().min(10).max(100),
      response: z.any(),
      name: z.string().trim().min(1).max(100).default('Admin passkey'),
    }),
  ),
  h(async (req, res) => {
    try {
      const r = await wa.verifyRegistration(
        'admin',
        req.admin!.id,
        req.body.challengeId,
        req.body.response,
        req.body.name,
        req,
      );
      await audit(req.admin!.id, 'admin.passkey_added', { type: 'passkey', id: r.id }, req);
      await markSessionMfa(req.auth!.sessionId);
      res.status(201).json({ id: String(r.id) });
    } catch (e) {
      throw Errors.badRequest((e as Error).message);
    }
  }),
);

adminAuthRouter.get(
  '/security',
  requireAdmin,
  h(async (req, res) => {
    res.json({
      twoFactor: await mfa.totpStatus('admin', req.admin!.id),
      passkeys: (await mfa.listPasskeys('admin', req.admin!.id)).map((p) => ({ ...p, id: String(p.id) })),
    });
  }),
);

adminAuthRouter.delete(
  '/passkeys/:id',
  requireAdmin,
  h(async (req, res) => {
    const methods = await mfa.methodsFor('admin', req.admin!.id);
    if (!methods.totp && (await mfa.passkeyCount('admin', req.admin!.id)) <= 1)
      throw Errors.badRequest('Keep at least one second factor');
    await exec("DELETE FROM passkeys WHERE id = ? AND principal_type = 'admin' AND principal_id = ?", [
      Number(req.params.id),
      req.admin!.id,
    ]);
    await audit(req.admin!.id, 'admin.passkey_removed', { type: 'passkey', id: String(req.params.id) }, req);
    res.json({ ok: true });
  }),
);

adminAuthRouter.post(
  '/password',
  requireAdmin,
  body(z.object({ currentPassword: z.string().max(128), newPassword: passwordSchema })),
  h(async (req, res) => {
    const a = await one<{ password_hash: string }>('SELECT password_hash FROM admin_users WHERE id = ?', [
      req.admin!.id,
    ]);
    if (!(await verifyPassword(a!.password_hash, req.body.currentPassword)))
      throw Errors.badRequest('Current password is incorrect');
    await exec('UPDATE admin_users SET password_hash = ? WHERE id = ?', [
      await hashPassword(req.body.newPassword),
      req.admin!.id,
    ]);
    await audit(req.admin!.id, 'admin.password_changed', { type: 'admin', id: req.admin!.id }, req);
    await rotateSession(req, res, req.auth!, 'password_change', true);
    res.json({ ok: true });
  }),
);
