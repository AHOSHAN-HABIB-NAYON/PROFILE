import type { Request, Response } from 'express';
import { exec, one } from '../../infrastructure/db';
import { Errors, AppError } from '../../http/errors';
import { getSetting } from '../settings/settings.service';
import { hashPassword, verifyPassword, dummyVerify, needsRehash } from './passwords';
import { createSession, revokeAllSessions, clientIp } from './sessions';
import { createMfaChallenge, methodsFor } from './mfa';
import { securityEvent, loginAttempt } from './security-log';
import { notify, sendTransactionalEmail } from '../notifications/notifications.service';
import { issueEmailToken } from './email-tokens';
import {
  createUser,
  findUserByEmail,
  findUserByGoogle,
  findUserById,
  normalizeEmail,
  publicUser,
  type UserRow,
} from '../users/users.repo';
import { loadEnv } from '../../config/env';
import type { GoogleIdentity } from './google';
import { consume } from '../../http/middleware/rate-limit';
import { invalidateUserStatus } from '../../http/middleware/auth';

export type LoginResult =
  | { status: 'ok'; user: ReturnType<typeof publicUser> }
  | {
      status: 'mfa_required';
      mfaToken: string;
      methods: { totp: boolean; backupCode: boolean; passkey: boolean };
    }
  | { status: 'email_verification_required'; email: string };

export async function sendVerificationEmail(user: { id: number; email: string }) {
  const { code, token } = await issueEmailToken(user.id, 'verify_email', 30);
  await sendTransactionalEmail(user.email, {
    title: 'Verify your email',
    body: 'Enter this code in the app to verify your email address. It expires in 30 minutes.',
    code,
    cta: {
      label: 'Verify email',
      url: `${loadEnv().APP_URL}/verify-email?token=${encodeURIComponent(token)}`,
    },
  });
}

export async function register(req: Request, input: { email: string; password: string; name: string }) {
  if (!getSetting('auth.registration_enabled')) throw Errors.forbidden('Registration is currently closed');
  const email = normalizeEmail(input.email);
  const existing = await findUserByEmail(email);
  if (existing) {
    // Do not reveal whether the email exists: tell the owner by email instead.
    await sendTransactionalEmail(email, {
      title: 'Sign-in attempt',
      body: 'Someone tried to create an account with your email address. If this was you, sign in or reset your password instead.',
      cta: { label: 'Sign in', url: `${loadEnv().APP_URL}/login` },
    });
    return { email };
  }
  const id = await createUser({ email, name: input.name, passwordHash: await hashPassword(input.password) });
  await securityEvent('user', id, 'account_created', req, { method: 'password' });
  await notify(
    id,
    'welcome',
    `Welcome to ${getSetting('site.name')}`,
    'Your account is ready. Secure it with 2FA or a passkey.',
  );
  await sendVerificationEmail({ id, email });
  return { email };
}

async function registerFailure(u: UserRow) {
  const max = getSetting('auth.max_login_attempts');
  const r = await exec(
    // MySQL evaluates SET assignments left to right: compute the lock before incrementing.
    `UPDATE users SET locked_until = IF(failed_login_count + 1 >= ?, DATE_ADD(NOW(3), INTERVAL ? MINUTE), locked_until),
       failed_login_count = failed_login_count + 1
     WHERE id = ?`,
    [max, getSetting('auth.lockout_minutes'), u.id],
  );
  if (r.affectedRows && u.failed_login_count + 1 === max) {
    await securityEvent('user', u.id, 'account_temporarily_locked', null, {});
    await notify(
      u.id,
      'security_alert',
      'Too many failed sign-in attempts',
      'Sign-in to your account was temporarily locked after repeated failed attempts. If this was not you, reset your password.',
    );
  }
}

export function assertCanLogin(u: UserRow) {
  if (u.status === 'suspended' || u.status === 'closed')
    throw Errors.forbidden('This account is not available. Contact support.');
  if (u.locked_until && u.locked_until.getTime() > Date.now()) {
    throw new AppError(
      423,
      'account_locked',
      'Too many failed attempts. Try again later or reset your password.',
    );
  }
}

/** After any successful first factor. Decides between session creation and a 2FA challenge. */
export async function completeFirstFactor(
  req: Request,
  res: Response,
  u: UserRow,
  method: 'password' | 'google' | 'email_otp' | 'passkey',
  opts: { strongFactor?: boolean } = {},
): Promise<LoginResult> {
  assertCanLogin(u);
  if (getSetting('auth.email_verification_required') && !u.email_verified_at && method === 'password') {
    await sendVerificationEmail(u);
    return { status: 'email_verification_required', email: u.email };
  }
  const methods = await methodsFor('user', u.id);
  const needsMfa = !opts.strongFactor && (methods.totp || methods.passkey);
  if (needsMfa) {
    const mfaToken = await createMfaChallenge('user', u.id, method);
    await loginAttempt('user', u.id, u.email, method, true, 'mfa_pending', req);
    return { status: 'mfa_required', mfaToken, methods };
  }
  await finishLogin(req, res, u, method, opts.strongFactor === true);
  const fresh = (await findUserById(u.id))!;
  return { status: 'ok', user: publicUser(fresh) };
}

export async function finishLogin(req: Request, res: Response, u: UserRow, method: string, mfa: boolean) {
  const { device } = await createSession(req, res, 'user', u.id, method, { mfa });
  await exec(
    'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW(3) WHERE id = ?',
    [u.id],
  );
  await loginAttempt('user', u.id, u.email, method, true, null, req);
  await securityEvent('user', u.id, 'login', req, { method, mfa });
  if (device.isNew) {
    await notify(
      u.id,
      'new_device',
      'New device sign-in',
      `Your account was accessed from a new device (IP ${clientIp(req)}). If this wasn't you, secure your account immediately.`,
      { ip: clientIp(req) },
      { email: true },
    );
  } else {
    await notify(
      u.id,
      'login',
      'New sign-in',
      `Signed in via ${method} from ${clientIp(req)}.`,
      {},
      { email: false },
    );
  }
}

export async function passwordLogin(
  req: Request,
  res: Response,
  email: string,
  password: string,
): Promise<LoginResult> {
  const norm = normalizeEmail(email);
  await consume('login-email', norm, 10, 900); // per account, 10 per 15 min
  const u = await findUserByEmail(norm);
  if (!u) {
    await dummyVerify(password);
    await loginAttempt('user', null, norm, 'password', false, 'unknown_account', req);
    throw Errors.unauthorized('Incorrect email or password');
  }
  assertCanLogin(u);
  const ok = await verifyPassword(u.password_hash, password);
  if (!ok) {
    await registerFailure(u);
    await loginAttempt('user', u.id, norm, 'password', false, 'bad_password', req);
    throw Errors.unauthorized('Incorrect email or password');
  }
  if (u.password_hash && needsRehash(u.password_hash)) {
    await exec('UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(password), u.id]);
  }
  return completeFirstFactor(req, res, u, 'password');
}

/**
 * Google sign-in / account linking with duplicate-account prevention:
 *  - known google_sub → sign in
 *  - existing email → link only when Google asserts the email is verified; if the local account
 *    never verified its email (possible pre-hijacking), its password and sessions are revoked.
 *  - otherwise create a new, email-verified account.
 */
export async function googleLogin(req: Request, res: Response, g: GoogleIdentity): Promise<LoginResult> {
  let u = await findUserByGoogle(g.sub);
  if (!u) {
    if (!g.emailVerified) throw Errors.forbidden('Your Google email address is not verified');
    const byEmail = await findUserByEmail(g.email);
    if (byEmail) {
      if (byEmail.google_sub && byEmail.google_sub !== g.sub)
        throw Errors.conflict('Account is linked to a different Google account');
      const unverified = !byEmail.email_verified_at;
      await exec(
        `UPDATE users SET google_sub = ?, email_verified_at = COALESCE(email_verified_at, NOW(3)) ${unverified ? ', password_hash = NULL' : ''} WHERE id = ?`,
        [g.sub, byEmail.id],
      );
      if (unverified) await revokeAllSessions('user', byEmail.id, 'google_takeover_unverified');
      await securityEvent('user', byEmail.id, 'google_linked', req, { auto: true });
      u = await findUserById(byEmail.id);
    } else {
      if (!getSetting('auth.registration_enabled'))
        throw Errors.forbidden('Registration is currently closed');
      const id = await createUser({
        email: g.email,
        name: g.name.slice(0, 100),
        passwordHash: null,
        googleSub: g.sub,
        avatarUrl: g.picture,
        emailVerified: true,
      });
      await securityEvent('user', id, 'account_created', req, { method: 'google' });
      await notify(
        id,
        'welcome',
        `Welcome to ${getSetting('site.name')}`,
        'Your account is ready. Secure it with 2FA or a passkey.',
      );
      u = await findUserById(id);
    }
  }
  return completeFirstFactor(req, res, u!, 'google');
}

export async function linkGoogle(req: Request, userId: number, g: GoogleIdentity) {
  const other = await findUserByGoogle(g.sub);
  if (other && other.id !== userId)
    throw Errors.conflict('This Google account is already linked to another user');
  await exec('UPDATE users SET google_sub = ? WHERE id = ?', [g.sub, userId]);
  await securityEvent('user', userId, 'google_linked', req, {});
}

export async function changePassword(
  req: Request,
  userId: number,
  current: string | undefined,
  next: string,
) {
  const u = await findUserById(userId);
  if (!u) throw Errors.notFound();
  if (u.password_hash && !(await verifyPassword(u.password_hash, current ?? '')))
    throw Errors.badRequest('Current password is incorrect');
  await exec('UPDATE users SET password_hash = ?, password_changed_at = NOW(3) WHERE id = ?', [
    await hashPassword(next),
    userId,
  ]);
  await securityEvent('user', userId, 'password_changed', req);
  await notify(
    userId,
    'password_changed',
    'Password changed',
    'Your password was changed. If this was not you, contact support immediately.',
    {},
    { email: true },
  );
}

export async function requestPasswordReset(email: string) {
  const u = await findUserByEmail(email);
  if (!u || u.status === 'closed') return;
  const { token } = await issueEmailToken(u.id, 'reset_password', 30);
  await sendTransactionalEmail(u.email, {
    title: 'Reset your password',
    body: 'Use the button below to choose a new password. The link expires in 30 minutes and can be used once.',
    cta: {
      label: 'Reset password',
      url: `${loadEnv().APP_URL}/reset-password?token=${encodeURIComponent(token)}`,
    },
  });
}

export async function resetPassword(req: Request, userId: number, password: string) {
  await exec(
    'UPDATE users SET password_hash = ?, password_changed_at = NOW(3), failed_login_count = 0, locked_until = NULL WHERE id = ?',
    [await hashPassword(password), userId],
  );
  await revokeAllSessions('user', userId, 'password_reset');
  await invalidateUserStatus(userId);
  await securityEvent('user', userId, 'password_reset', req);
  await notify(
    userId,
    'password_changed',
    'Password reset',
    'Your password was reset and all sessions were signed out.',
    {},
    { email: true },
  );
}

export async function markEmailVerified(userId: number) {
  await exec('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW(3)) WHERE id = ?', [
    userId,
  ]);
}

export async function userForMfa(pid: number) {
  const u = await one<UserRow>('SELECT * FROM users WHERE id = ?', [pid]);
  if (!u) throw Errors.unauthorized();
  return u;
}
