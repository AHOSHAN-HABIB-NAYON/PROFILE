import { Router } from 'express';
import { z } from 'zod';
import { h } from '../../http/async';
import { body } from '../../http/middleware/validate';
import { rateLimit, consume } from '../../http/middleware/rate-limit';
import { requireUser } from '../../http/middleware/auth';
import { Errors } from '../../http/errors';
import { getSetting } from '../settings/settings.service';
import { passwordSchema } from './passwords';
import * as svc from './auth.service';
import * as mfa from './mfa';
import * as wa from './webauthn';
import { googleAuthUrl, googleCallback, verifyIdToken } from './google';
import { consumeEmailCode, consumeEmailLink, issueEmailToken } from './email-tokens';
import { clearSessionCookie, issueCsrf, revokeSession, markSessionMfa, clientIp } from './sessions';
import { findUserByEmail, findUserById, publicUser } from '../users/users.repo';
import { sendTransactionalEmail, notify } from '../notifications/notifications.service';
import { securityEvent, loginAttempt } from './security-log';
import { logger } from '../../infrastructure/logger';

const email = z.string().trim().toLowerCase().email().max(254);
const ipLimit = rateLimit('auth-ip', 30, 60);

export const authRouter = Router();

authRouter.get('/csrf', (_req, res) => {
  res.json({ csrfToken: issueCsrf(res) });
});

authRouter.get(
  '/me',
  h(async (req, res) => {
    if (!req.auth) return res.json({ user: null });
    const u = await findUserById(req.auth.id);
    if (!u) return res.json({ user: null });
    const methods = await mfa.methodsFor('user', u.id);
    const profile = await import('../users/users.service').then((m) => m.getProfile(u.id));
    res.json({
      user: publicUser(u, {
        twoFactorEnabled: methods.totp,
        passkeys: methods.passkey,
        profile,
        mfaRecent: Boolean(req.auth.mfaAt && Date.now() - req.auth.mfaAt < 600_000),
      }),
    });
  }),
);

authRouter.post(
  '/register',
  ipLimit,
  rateLimit('register', 5, 3600),
  body(z.object({ email, password: passwordSchema, name: z.string().trim().min(1).max(100) })),
  h(async (req, res) => {
    const r = await svc.register(req, req.body);
    // Same response whether or not the email already exists (no account enumeration).
    res.status(201).json({ status: 'verification_sent', email: r.email });
  }),
);

authRouter.post(
  '/login',
  ipLimit,
  body(z.object({ email, password: z.string().min(1).max(128) })),
  h(async (req, res) => {
    res.json(await svc.passwordLogin(req, res, req.body.email, req.body.password));
  }),
);

authRouter.post(
  '/logout',
  h(async (req, res) => {
    if (req.auth) {
      await revokeSession(req.auth.sessionId, 'logout');
      await securityEvent('user', req.auth.id, 'logout', req);
    }
    clearSessionCookie(res, 'user');
    res.json({ ok: true });
  }),
);

// ───── email verification ─────
authRouter.post(
  '/verify-email',
  ipLimit,
  body(
    z.union([
      z.object({ token: z.string().min(10).max(200) }),
      z.object({ email, code: z.string().regex(/^\d{6}$/) }),
    ]),
  ),
  h(async (req, res) => {
    let userId: number | null = null;
    if ('token' in req.body) userId = await consumeEmailLink(req.body.token, 'verify_email');
    else {
      const u = await findUserByEmail(req.body.email);
      await consume('verify-code', req.body.email, 10, 900);
      if (u && (await consumeEmailCode(u.id, 'verify_email', req.body.code))) userId = u.id;
    }
    if (!userId) throw Errors.badRequest('Invalid or expired verification code');
    await svc.markEmailVerified(userId);
    await securityEvent('user', userId, 'email_verified', req);
    const u = (await findUserById(userId))!;
    // Verified the email from this browser → continue into the account (respecting 2FA).
    res.json(await svc.completeFirstFactor(req, res, u, 'email_otp'));
  }),
);

authRouter.post(
  '/verify-email/resend',
  rateLimit('verify-resend', 3, 600),
  body(z.object({ email })),
  h(async (req, res) => {
    const u = await findUserByEmail(req.body.email);
    if (u && !u.email_verified_at) await svc.sendVerificationEmail(u);
    res.json({ ok: true });
  }),
);

// ───── password reset ─────
authRouter.post(
  '/forgot-password',
  rateLimit('forgot', 5, 900),
  body(z.object({ email })),
  h(async (req, res) => {
    await svc.requestPasswordReset(req.body.email);
    res.json({ ok: true }); // never reveal whether the account exists
  }),
);

authRouter.post(
  '/reset-password',
  ipLimit,
  body(z.object({ token: z.string().min(10).max(200), password: passwordSchema })),
  h(async (req, res) => {
    const userId = await consumeEmailLink(req.body.token, 'reset_password');
    if (!userId) throw Errors.badRequest('This reset link is invalid or has expired');
    await svc.resetPassword(req, userId, req.body.password);
    res.json({ ok: true });
  }),
);

// ───── passwordless email OTP ─────
authRouter.post(
  '/email-otp/request',
  rateLimit('email-otp', 5, 900),
  body(z.object({ email })),
  h(async (req, res) => {
    const u = await findUserByEmail(req.body.email);
    if (u && u.status === 'active') {
      const { code } = await issueEmailToken(u.id, 'email_otp', 10);
      await sendTransactionalEmail(u.email, {
        title: 'Your sign-in code',
        body: 'Use this code to sign in. It expires in 10 minutes.',
        code,
      });
    }
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/email-otp/verify',
  ipLimit,
  body(z.object({ email, code: z.string().regex(/^\d{6}$/) })),
  h(async (req, res) => {
    await consume('email-otp-verify', req.body.email, 10, 900);
    const u = await findUserByEmail(req.body.email);
    if (!u || !(await consumeEmailCode(u.id, 'email_otp', req.body.code))) {
      await loginAttempt('user', u?.id ?? null, req.body.email, 'email_otp', false, 'bad_code', req);
      throw Errors.unauthorized('Invalid or expired code');
    }
    await svc.markEmailVerified(u.id);
    res.json(await svc.completeFirstFactor(req, res, u, 'email_otp'));
  }),
);

// ───── second factor ─────
authRouter.post(
  '/2fa/passkey/options',
  ipLimit,
  body(z.object({ mfaToken: z.string().min(10).max(100) })),
  h(async (req, res) => {
    const ch = await mfa.getMfaChallenge(req.body.mfaToken);
    if (!ch || ch.pt !== 'user') throw Errors.unauthorized('Verification expired. Sign in again.');
    res.json(await wa.authenticationOptions({ pt: 'user', pid: ch.pid }));
  }),
);

const verifySchema = z.discriminatedUnion('method', [
  z.object({
    mfaToken: z.string().min(10).max(100),
    method: z.literal('totp'),
    code: z.string().regex(/^\d{6}$/),
  }),
  z.object({
    mfaToken: z.string().min(10).max(100),
    method: z.literal('backup'),
    code: z.string().min(8).max(20),
  }),
  z.object({
    mfaToken: z.string().min(10).max(100),
    method: z.literal('passkey'),
    challengeId: z.string().min(10).max(100),
    response: z.any(),
  }),
]);

authRouter.post(
  '/2fa/verify',
  ipLimit,
  body(verifySchema),
  h(async (req, res) => {
    const b = req.body as z.infer<typeof verifySchema>;
    const ch = await mfa.getMfaChallenge(b.mfaToken);
    if (!ch || ch.pt !== 'user') throw Errors.unauthorized('Verification expired. Sign in again.');
    let ok = false;
    if (b.method === 'totp') ok = await mfa.checkTotp('user', ch.pid, b.code);
    else if (b.method === 'backup') ok = await mfa.useBackupCode('user', ch.pid, b.code);
    else {
      try {
        const r = await wa.verifyAuthentication(b.challengeId, b.response);
        ok = r.pt === 'user' && r.pid === ch.pid;
      } catch (e) {
        logger.info({ err: (e as Error).message }, 'passkey 2fa failed');
      }
    }
    const u = await svc.userForMfa(ch.pid);
    if (!ok) {
      await mfa.bumpMfaChallenge(b.mfaToken, ch);
      await loginAttempt('user', ch.pid, u.email, `2fa_${b.method}`, false, 'bad_code', req);
      throw Errors.unauthorized('Invalid verification code');
    }
    await mfa.consumeMfaChallenge(b.mfaToken);
    if (b.method === 'backup') {
      await securityEvent('user', ch.pid, 'backup_code_used', req);
      await notify(
        ch.pid,
        'security_alert',
        'Backup code used',
        'A backup recovery code was used to sign in. Generate new codes if you are running low.',
        {},
        { email: true },
      );
    }
    await svc.finishLogin(req, res, u, `${ch.method}+${b.method}`, true);
    res.json({ status: 'ok', user: publicUser((await findUserById(ch.pid))!) });
  }),
);

// ───── passkey login (usernameless / discoverable credentials) ─────
authRouter.post(
  '/passkey/authenticate/options',
  ipLimit,
  h(async (_req, res) => {
    if (!getSetting('auth.passkey_enabled')) throw Errors.forbidden('Passkeys are disabled');
    res.json(await wa.authenticationOptions({ pt: 'user' }));
  }),
);

authRouter.post(
  '/passkey/authenticate',
  ipLimit,
  body(z.object({ challengeId: z.string().min(10).max(100), response: z.any() })),
  h(async (req, res) => {
    if (!getSetting('auth.passkey_enabled')) throw Errors.forbidden('Passkeys are disabled');
    let r;
    try {
      r = await wa.verifyAuthentication(req.body.challengeId, req.body.response);
    } catch (e) {
      await loginAttempt('user', null, null, 'passkey', false, (e as Error).message.slice(0, 60), req);
      throw Errors.unauthorized('Passkey sign-in failed');
    }
    const u = await findUserById(r.pid);
    if (!u) throw Errors.unauthorized('Passkey sign-in failed');
    res.json(await svc.completeFirstFactor(req, res, u, 'passkey', { strongFactor: true }));
  }),
);

authRouter.post(
  '/passkey/register/options',
  requireUser,
  h(async (req, res) => {
    if (!getSetting('auth.passkey_enabled')) throw Errors.forbidden('Passkeys are disabled');
    const u = (await findUserById(req.auth!.id))!;
    res.json(await wa.registrationOptions('user', u.id, u.email, u.name));
  }),
);

authRouter.post(
  '/passkey/register',
  requireUser,
  body(
    z.object({
      challengeId: z.string().min(10).max(100),
      response: z.any(),
      name: z.string().trim().min(1).max(100).default('Passkey'),
    }),
  ),
  h(async (req, res) => {
    try {
      const r = await wa.verifyRegistration(
        'user',
        req.auth!.id,
        req.body.challengeId,
        req.body.response,
        req.body.name,
        req,
      );
      await securityEvent('user', req.auth!.id, 'passkey_added', req, { passkeyId: r.id });
      await notify(
        req.auth!.id,
        'passkey_added',
        'Passkey added',
        `A new passkey "${req.body.name}" was added to your account.`,
        {},
        { email: true },
      );
      res.status(201).json({ id: String(r.id) });
    } catch (e) {
      if ((e as { code?: string }).code === 'ER_DUP_ENTRY')
        throw Errors.conflict('This passkey is already registered');
      throw Errors.badRequest((e as Error).message);
    }
  }),
);

// ───── step-up verification for sensitive actions (withdrawals, security changes) ─────
authRouter.post(
  '/step-up/passkey/options',
  requireUser,
  h(async (req, res) => {
    res.json(await wa.authenticationOptions({ pt: 'user', pid: req.auth!.id }));
  }),
);

const stepUpSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('totp'), code: z.string().regex(/^\d{6}$/) }),
  z.object({ method: z.literal('backup'), code: z.string().min(8).max(20) }),
  z.object({ method: z.literal('passkey'), challengeId: z.string().min(10).max(100), response: z.any() }),
]);

authRouter.post(
  '/step-up',
  requireUser,
  body(stepUpSchema),
  h(async (req, res) => {
    const pid = req.auth!.id;
    await consume('step-up', String(pid), 10, 900);
    const b = req.body as z.infer<typeof stepUpSchema>;
    let ok = false;
    if (b.method === 'totp') ok = await mfa.checkTotp('user', pid, b.code);
    else if (b.method === 'backup') ok = await mfa.useBackupCode('user', pid, b.code);
    else {
      try {
        const r = await wa.verifyAuthentication(b.challengeId, b.response);
        ok = r.pt === 'user' && r.pid === pid;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      await securityEvent('user', pid, 'step_up_failed', req, { method: b.method });
      throw Errors.unauthorized('Verification failed');
    }
    await markSessionMfa(req.auth!.sessionId);
    await securityEvent('user', pid, 'step_up', req, { method: b.method });
    res.json({ ok: true, validForSeconds: 600 });
  }),
);

// ───── Google ─────
authRouter.get(
  '/google/start',
  rateLimit('google-start', 20, 60),
  h(async (req, res) => {
    const intent = req.query.intent === 'link' && req.auth ? 'link' : 'login';
    res.redirect(await googleAuthUrl(intent, req.auth?.id));
  }),
);

authRouter.get(
  '/google/callback',
  h(async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) return res.redirect('/login?error=google_cancelled');
    try {
      const { identity, intent, linkUserId } = await googleCallback(code, state);
      if (intent === 'link' && linkUserId) {
        if (req.auth?.id !== linkUserId) return res.redirect('/login?error=google_session');
        await svc.linkGoogle(req, linkUserId, identity);
        return res.redirect('/settings/security?linked=google');
      }
      const r = await svc.googleLogin(req, res, identity);
      if (r.status === 'mfa_required') {
        return res.redirect(
          `/login/verify?token=${encodeURIComponent(r.mfaToken)}&methods=${Object.entries(r.methods)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(',')}`,
        );
      }
      return res.redirect('/dashboard');
    } catch (e) {
      logger.warn({ err: (e as Error).message, ip: clientIp(req) }, 'google callback failed');
      const msg = e instanceof Error && 'code' in e ? String((e as { code: string }).code) : 'google_failed';
      return res.redirect(`/login?error=${encodeURIComponent(msg)}`);
    }
  }),
);

authRouter.post(
  '/google',
  ipLimit,
  body(z.object({ credential: z.string().min(20).max(4096) })),
  h(async (req, res) => {
    let identity;
    try {
      identity = await verifyIdToken(req.body.credential);
    } catch (e) {
      throw Errors.unauthorized((e as Error).message);
    }
    res.json(await svc.googleLogin(req, res, identity));
  }),
);
