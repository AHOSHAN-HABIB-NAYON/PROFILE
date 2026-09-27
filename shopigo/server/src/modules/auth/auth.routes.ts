import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { z } from 'zod';
import { cache } from '../../core/cache.js';
import { decrypt, encrypt, randomToken, sha256 } from '../../core/crypto.js';
import { badRequest, forbidden, unauthorized, HttpError } from '../../core/errors.js';
import { parse } from '../../core/validate.js';
import { db, json } from '../../db/index.js';
import { SESSION_COOKIE, cookieOptions, csrfProtection, invalidateSessionCache, issueCsrf, loadSession, requireAdmin } from '../../middleware/auth.js';
import { audit } from '../../services/audit.js';
import { hashPassword, passwordProblems, verifyPassword } from '../../services/password.js';
import { settings } from '../../services/settings.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many sign-in attempts. Please wait 15 minutes.' } });

authRouter.get('/csrf', (req, res) => {
  res.json({ token: issueCsrf(req, res) });
});

authRouter.use(csrfProtection);

function rp(req: Request) {
  const host = req.hostname;
  return { rpID: host, origin: `${req.protocol}://${req.get('host')}` };
}

async function createSession(req: Request, res: Response, adminId: number, opts: { mfaPending: boolean; method: string }) {
  const token = randomToken(32);
  const hours = Math.min(720, Math.max(1, await settings.num('session_hours')));
  const expires = new Date(Date.now() + (opts.mfaPending ? 10 * 60_000 : hours * 3600_000));
  await db()
    .insertInto('admin_sessions')
    .values({ admin_id: adminId, token_hash: sha256(token), ip: req.ip ?? null, user_agent: req.get('user-agent')?.slice(0, 500) ?? null, mfa_pending: opts.mfaPending ? 1 : 0, auth_method: opts.method, last_seen_at: new Date(), expires_at: expires })
    .execute();
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(req), expires });
}

async function completeLogin(req: Request, adminId: number) {
  await db().updateTable('admins').set({ failed_attempts: 0, locked_until: null, last_login_at: new Date(), last_login_ip: req.ip ?? null }).where('id', '=', adminId).execute();
}

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email().max(190), password: z.string().min(1).max(200) });

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const admin = await db().selectFrom('admins').selectAll().where('email', '=', email).executeTakeFirst();
  const generic = unauthorized('Incorrect email or password');
  if (!admin) {
    await hashPassword(password); // equalise timing
    throw generic;
  }
  if (admin.status !== 'active') throw forbidden('This account is disabled');
  if (admin.locked_until && new Date(admin.locked_until).getTime() > Date.now()) {
    throw new HttpError(423, 'Account temporarily locked after failed attempts. Try again later.', 'LOCKED');
  }
  if (!(await verifyPassword(admin.password_hash, password))) {
    const max = await settings.num('login_max_attempts');
    const attempts = admin.failed_attempts + 1;
    const lock = attempts >= max ? new Date(Date.now() + (await settings.num('login_lock_minutes')) * 60_000) : null;
    await db().updateTable('admins').set({ failed_attempts: lock ? 0 : attempts, locked_until: lock }).where('id', '=', admin.id).execute();
    if (lock) await audit(req, { action: 'auth.locked', targetType: 'admin', targetId: admin.id });
    throw generic;
  }
  if (admin.totp_enabled) {
    await createSession(req, res, admin.id, { mfaPending: true, method: 'password' });
    res.json({ mfaRequired: true });
    return;
  }
  await createSession(req, res, admin.id, { mfaPending: false, method: 'password' });
  await completeLogin(req, admin.id);
  req.admin = { id: admin.id, name: admin.name } as never;
  await audit(req, { action: 'auth.login', targetType: 'admin', targetId: admin.id, newValue: { method: 'password' } });
  res.json({ ok: true });
});

authRouter.post('/2fa', loginLimiter, async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') }), req.body);
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) throw unauthorized();
  const session = await db().selectFrom('admin_sessions').selectAll().where('token_hash', '=', sha256(token)).where('revoked_at', 'is', null).executeTakeFirst();
  if (!session || !session.mfa_pending || new Date(session.expires_at).getTime() < Date.now()) throw unauthorized('Sign-in expired, please start again');
  const admin = await db().selectFrom('admins').selectAll().where('id', '=', session.admin_id).executeTakeFirstOrThrow();
  if (!admin.totp_secret || !verifyTotp(decrypt(admin.totp_secret), code)) {
    const attempts = admin.failed_attempts + 1;
    await db().updateTable('admins').set({ failed_attempts: attempts }).where('id', '=', admin.id).execute();
    if (attempts >= (await settings.num('login_max_attempts'))) {
      await db().updateTable('admin_sessions').set({ revoked_at: new Date() }).where('id', '=', session.id).execute();
      await db().updateTable('admins').set({ failed_attempts: 0, locked_until: new Date(Date.now() + (await settings.num('login_lock_minutes')) * 60_000) }).where('id', '=', admin.id).execute();
    }
    throw unauthorized('Invalid authentication code');
  }
  const hours = await settings.num('session_hours');
  await db().updateTable('admin_sessions').set({ mfa_pending: 0, auth_method: 'password+totp', expires_at: new Date(Date.now() + hours * 3600_000) }).where('id', '=', session.id).execute();
  await invalidateSessionCache(token);
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(req), expires: new Date(Date.now() + hours * 3600_000) });
  await completeLogin(req, admin.id);
  req.admin = { id: admin.id, name: admin.name } as never;
  await audit(req, { action: 'auth.login', targetType: 'admin', targetId: admin.id, newValue: { method: 'password+totp' } });
  res.json({ ok: true });
});

// ---------- Passkey sign-in (passwordless, discoverable credentials) ----------
const PK_COOKIE = 'sg_pk';

authRouter.post('/passkey/login/options', loginLimiter, async (req, res) => {
  if (!(await settings.bool('passkeys_enabled'))) throw forbidden('Passkey sign-in is disabled');
  const { rpID } = rp(req);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred', timeout: 60_000 });
  const handle = randomToken(18);
  await cache.set(`pk:auth:${handle}`, { challenge: options.challenge }, 300);
  res.cookie(PK_COOKIE, handle, { ...cookieOptions(req), maxAge: 300_000 });
  res.json(options);
});

authRouter.post('/passkey/login/verify', loginLimiter, async (req, res) => {
  const handle = req.cookies?.[PK_COOKIE];
  const stored = handle ? await cache.take<{ challenge: string }>(`pk:auth:${handle}`) : null;
  res.clearCookie(PK_COOKIE, { path: '/' });
  if (!stored) throw badRequest('Passkey request expired. Please try again.');
  const body = req.body as { id?: string };
  if (!body?.id || typeof body.id !== 'string') throw badRequest('Invalid passkey response');
  const passkey = await db().selectFrom('admin_passkeys').selectAll().where('credential_id', '=', body.id).executeTakeFirst();
  if (!passkey) throw unauthorized('This passkey is not registered');
  const admin = await db().selectFrom('admins').selectAll().where('id', '=', passkey.admin_id).executeTakeFirstOrThrow();
  if (admin.status !== 'active') throw forbidden('This account is disabled');
  const { rpID, origin } = rp(req);
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: stored.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: passkey.credential_id,
        publicKey: new Uint8Array(Buffer.from(passkey.public_key, 'base64url')),
        counter: Number(passkey.counter),
        transports: json.parse<AuthenticatorTransportFuture[]>(passkey.transports, []),
      },
      requireUserVerification: false,
    });
  } catch {
    throw unauthorized('Passkey verification failed');
  }
  if (!verification.verified) throw unauthorized('Passkey verification failed');
  await db().updateTable('admin_passkeys').set({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date() }).where('id', '=', passkey.id).execute();
  await createSession(req, res, admin.id, { mfaPending: false, method: 'passkey' });
  await completeLogin(req, admin.id);
  req.admin = { id: admin.id, name: admin.name } as never;
  await audit(req, { action: 'auth.login', targetType: 'admin', targetId: admin.id, newValue: { method: 'passkey', passkey: passkey.name } });
  res.json({ ok: true });
});

authRouter.post('/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) {
    await db().updateTable('admin_sessions').set({ revoked_at: new Date() }).where('token_hash', '=', sha256(token)).execute();
    await invalidateSessionCache(token);
  }
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

authRouter.get('/me', async (req, res) => {
  const s = await loadSession(req);
  if (!s) { res.json({ authenticated: false, passkeysEnabled: await settings.bool('passkeys_enabled') }); return; }
  if (s.mfaPending) { res.json({ authenticated: false, mfaRequired: true }); return; }
  res.json({
    authenticated: true,
    mustSetup2fa: s.mustSetup2fa,
    admin: { id: s.ctx.id, name: s.ctx.name, email: s.ctx.email, role: s.ctx.roleSlug, permissions: s.ctx.roleSlug === 'super_admin' ? ['*'] : [...s.ctx.permissions], authMethod: s.ctx.authMethod },
  });
});

// ---------- Account security (authenticated) ----------
const secured = Router();
secured.use(requireAdmin({ allowMfaSetup: true }));

function verifyTotp(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: 'SHA1' });
  return totp.validate({ token: code, window: 1 }) !== null;
}

secured.get('/security', async (req, res) => {
  const admin = await db().selectFrom('admins').select(['totp_enabled', 'email', 'name', 'phone']).where('id', '=', req.admin!.id).executeTakeFirstOrThrow();
  const passkeys = await db().selectFrom('admin_passkeys').select(['id', 'name', 'device_type', 'backed_up', 'created_at', 'last_used_at']).where('admin_id', '=', req.admin!.id).orderBy('id', 'desc').execute();
  const sessions = await db()
    .selectFrom('admin_sessions')
    .select(['id', 'ip', 'user_agent', 'auth_method', 'created_at', 'last_seen_at', 'expires_at'])
    .where('admin_id', '=', req.admin!.id)
    .where('revoked_at', 'is', null)
    .where('mfa_pending', '=', 0)
    .where('expires_at', '>', new Date())
    .orderBy('last_seen_at', 'desc')
    .execute();
  res.json({ totpEnabled: Boolean(admin.totp_enabled), passkeys, sessions: sessions.map((s) => ({ ...s, current: s.id === req.admin!.sessionId })), profile: { name: admin.name, email: admin.email, phone: admin.phone } });
});

secured.post('/totp/setup', async (req, res) => {
  const siteName = await settings.str('site_name');
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({ issuer: siteName, label: req.admin!.email, secret, digits: 6, period: 30, algorithm: 'SHA1' });
  const uri = totp.toString();
  await cache.set(`totp:setup:${req.admin!.id}`, { secret: encrypt(secret.base32) }, 900);
  res.json({ uri, secret: secret.base32, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
});

secured.post('/totp/enable', async (req, res) => {
  const { code } = parse(z.object({ code: z.string().trim().regex(/^\d{6}$/) }), req.body);
  const pending = await cache.get<{ secret: string }>(`totp:setup:${req.admin!.id}`);
  if (!pending) throw badRequest('Setup expired, please start again');
  if (!verifyTotp(decrypt(pending.secret), code)) throw badRequest('Invalid code — check your authenticator app time');
  await db().updateTable('admins').set({ totp_secret: pending.secret, totp_enabled: 1 }).where('id', '=', req.admin!.id).execute();
  await cache.del(`totp:setup:${req.admin!.id}`);
  await invalidateSessionCache();
  await audit(req, { action: 'auth.totp_enabled', targetType: 'admin', targetId: req.admin!.id });
  res.json({ ok: true });
});

secured.post('/totp/disable', async (req, res) => {
  const { password } = parse(z.object({ password: z.string().min(1) }), req.body);
  const admin = await db().selectFrom('admins').select('password_hash').where('id', '=', req.admin!.id).executeTakeFirstOrThrow();
  if (!(await verifyPassword(admin.password_hash, password))) throw badRequest('Incorrect password');
  await db().updateTable('admins').set({ totp_secret: null, totp_enabled: 0 }).where('id', '=', req.admin!.id).execute();
  await invalidateSessionCache();
  await audit(req, { action: 'auth.totp_disabled', targetType: 'admin', targetId: req.admin!.id });
  res.json({ ok: true });
});

secured.post('/passkey/register/options', async (req, res) => {
  if (!(await settings.bool('passkeys_enabled'))) throw forbidden('Passkeys are disabled in Security settings');
  const { rpID } = rp(req);
  const existing = await db().selectFrom('admin_passkeys').select(['credential_id', 'transports']).where('admin_id', '=', req.admin!.id).execute();
  const options = await generateRegistrationOptions({
    rpName: await settings.str('site_name'),
    rpID,
    userName: req.admin!.email,
    userDisplayName: req.admin!.name,
    userID: new TextEncoder().encode(`shopigo-admin-${req.admin!.id}`),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: json.parse<AuthenticatorTransportFuture[]>(c.transports, []) })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    timeout: 120_000,
  });
  await cache.set(`pk:reg:${req.admin!.id}`, { challenge: options.challenge }, 300);
  res.json(options);
});

secured.post('/passkey/register/verify', async (req, res) => {
  const { name, response } = parse(z.object({ name: z.string().trim().min(1).max(120).default('Passkey'), response: z.record(z.unknown()) }), req.body);
  const stored = await cache.take<{ challenge: string }>(`pk:reg:${req.admin!.id}`);
  if (!stored) throw badRequest('Registration expired, please try again');
  const { rpID, origin } = rp(req);
  let verification;
  try {
    verification = await verifyRegistrationResponse({ response: response as never, expectedChallenge: stored.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
  } catch (err) {
    throw badRequest(`Passkey registration failed: ${(err as Error).message}`);
  }
  if (!verification.verified || !verification.registrationInfo) throw badRequest('Passkey registration failed');
  const info = verification.registrationInfo;
  await db()
    .insertInto('admin_passkeys')
    .values({
      admin_id: req.admin!.id,
      credential_id: info.credential.id,
      public_key: Buffer.from(info.credential.publicKey).toString('base64url'),
      counter: info.credential.counter,
      transports: json.stringify(info.credential.transports ?? []),
      device_type: info.credentialDeviceType,
      backed_up: info.credentialBackedUp ? 1 : 0,
      name,
    })
    .execute();
  await invalidateSessionCache();
  await audit(req, { action: 'auth.passkey_added', targetType: 'admin', targetId: req.admin!.id, newValue: { name } });
  res.json({ ok: true });
});

secured.delete('/passkey/:id', async (req, res) => {
  const id = Number(req.params.id);
  const r = await db().deleteFrom('admin_passkeys').where('id', '=', id).where('admin_id', '=', req.admin!.id).executeTakeFirst();
  if (!Number(r.numDeletedRows)) throw badRequest('Passkey not found');
  await invalidateSessionCache();
  await audit(req, { action: 'auth.passkey_removed', targetType: 'admin', targetId: req.admin!.id, oldValue: { passkeyId: id } });
  res.json({ ok: true });
});

secured.post('/password', async (req, res) => {
  const { current, next } = parse(z.object({ current: z.string().min(1), next: z.string().min(10).max(200) }), req.body);
  const problem = passwordProblems(next);
  if (problem) throw badRequest(problem);
  const admin = await db().selectFrom('admins').select('password_hash').where('id', '=', req.admin!.id).executeTakeFirstOrThrow();
  if (!(await verifyPassword(admin.password_hash, current))) throw badRequest('Current password is incorrect');
  await db().updateTable('admins').set({ password_hash: await hashPassword(next) }).where('id', '=', req.admin!.id).execute();
  // Sign out every other session
  await db().updateTable('admin_sessions').set({ revoked_at: new Date() }).where('admin_id', '=', req.admin!.id).where('id', '!=', req.admin!.sessionId).where('revoked_at', 'is', null).execute();
  await invalidateSessionCache();
  await audit(req, { action: 'auth.password_changed', targetType: 'admin', targetId: req.admin!.id });
  res.json({ ok: true });
});

secured.delete('/sessions/:id', async (req, res) => {
  await db().updateTable('admin_sessions').set({ revoked_at: new Date() }).where('id', '=', Number(req.params.id)).where('admin_id', '=', req.admin!.id).execute();
  await invalidateSessionCache();
  res.json({ ok: true });
});

secured.post('/sessions/revoke-others', async (req, res) => {
  await db().updateTable('admin_sessions').set({ revoked_at: new Date() }).where('admin_id', '=', req.admin!.id).where('id', '!=', req.admin!.sessionId).where('revoked_at', 'is', null).execute();
  await invalidateSessionCache();
  await audit(req, { action: 'auth.sessions_revoked', targetType: 'admin', targetId: req.admin!.id });
  res.json({ ok: true });
});

authRouter.use(secured);
