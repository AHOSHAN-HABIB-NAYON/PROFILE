'use strict';
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const {
  generateAuthenticationOptions, verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const db = require('../../db');
const { ah, ok, err, clientIp, ua } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const { sha256, randomToken, numericCode, decrypt } = require('../../lib/crypto');
const totp = require('../../lib/totp');
const auth = require('../../services/auth');
const settings = require('../../services/settings');
const logs = require('../../services/logs');
const { notify } = require('../../services/notify');
const mailer = require('../../services/mailer');
const i18n = require('../../services/i18n');
const webauthn = require('../../services/webauthn');

const r = express.Router();

const strict = rateLimit({ windowMs: 15 * 60e3, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ ok: false, error: { code: 'rate_limited', message: 'Too many attempts. Please wait a few minutes.' } }) });
const medium = rateLimit({ windowMs: 5 * 60e3, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ ok: false, error: { code: 'rate_limited', message: 'Too many requests' } }) });

async function twoFactorMethods(userId) {
  if (!settings.bool('auth_2fa_enabled')) return [];
  const t = await db.one('SELECT totp_enabled_at, email_enabled_at FROM two_factor WHERE user_id=?', [userId]);
  const m = [];
  if (t?.totp_enabled_at) m.push('totp');
  if (t?.email_enabled_at) m.push('email');
  if (m.length) {
    const rc = await db.one('SELECT COUNT(*) n FROM recovery_codes WHERE user_id=? AND used_at IS NULL', [userId]);
    if (Number(rc.n) > 0) m.push('recovery');
  }
  return m;
}

async function sendEmailOtp(user, locale) {
  const code = numericCode(6);
  await db.q('UPDATE otp_codes SET used_at=NOW() WHERE user_id=? AND purpose=? AND used_at IS NULL', [user.id, 'login']);
  await db.q('INSERT INTO otp_codes (user_id, purpose, code_hash, expires_at) VALUES (?,?,?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))', [user.id, 'login', sha256(user.id + ':' + code)]);
  return mailer.send({ to: user.email, userId: user.id, template: 'twofa_code', locale, vars: { name: user.name, code, minutes: 10 } });
}

/** Common completion of a successful primary login */
async function finishLogin(req, res, user, method) {
  const methods = method === 'passkey' ? [] : await twoFactorMethods(user.id);
  if (methods.length) {
    await auth.createSession(req, res, user.id, { mfaPending: true, method });
    const prof = await db.one('SELECT language FROM user_profiles WHERE user_id=?', [user.id]);
    let emailSent = false;
    if (methods.includes('email') && !methods.includes('totp')) emailSent = (await sendEmailOtp(user, prof?.language || 'en')).sent;
    return { mfa: true, methods, emailSent };
  }
  const s = await auth.createSession(req, res, user.id, { method });
  await db.q('UPDATE users SET last_login_at=NOW(), last_login_ip=? WHERE id=?', [clientIp(req), user.id]);
  await logs.security(req, user.id, 'login_success', { method });
  if (s.isNewDevice) {
    const time = new Date().toUTCString();
    notify(user.id, {
      type: 'security', titleKey: 'notif.login_alert.title', bodyKey: 'notif.login_alert.body', vars: { device: s.deviceName, ip: clientIp(req) },
      link: '/app/settings/sessions', security: true,
      email: { template: 'login_alert', vars: { time, ip: clientIp(req), device: s.deviceName }, cta: { link: settings.siteUrl() + '/app/settings/sessions', labelKey: 'email.review_activity' } },
    }).catch(() => {});
  }
  return { mfa: false };
}

r.post('/register', strict, ah(async (req, res) => {
  if (!settings.bool('registration_enabled')) throw err(403, 'registration_closed', 'Registration is currently closed');
  const b = validate(req.body, {
    name: ['str', { min: 1, max: 120 }], email: ['email'], password: ['password'],
    language: ['enum', { values: i18n.LOCALES, optional: true }], theme: ['enum', { values: ['light', 'dark'], optional: true }],
    timezone: ['str', { max: 64, optional: true }],
  });
  const exists = await db.one('SELECT id FROM users WHERE email=?', [b.email]);
  if (exists) throw err(409, 'email_taken', 'An account with this email already exists');
  const { validTz } = require('../../lib/time');
  const id = await auth.createUser({ email: b.email, name: b.name, password: b.password, language: b.language, theme: b.theme, timezone: b.timezone && validTz(b.timezone) ? b.timezone : undefined });
  await logs.security(req, id, 'register', { method: 'password' });
  const token = await auth.createEmailVerification(id);
  const locale = b.language || 'en';
  mailer.send({ to: b.email, userId: id, template: 'verify_email', locale, vars: { name: b.name }, cta: { link: `${settings.siteUrl(req)}/app/verify-email?token=${token}`, labelKey: 'email.verify_cta' } }).catch(() => {});
  if (settings.bool('notify_welcome')) {
    await notify(id, { type: 'welcome', titleKey: 'notif.welcome.title', bodyKey: 'notif.welcome.body', link: '/app',
      email: { template: 'welcome', cta: { link: settings.siteUrl(req) + '/app' } } });
  }
  await auth.createSession(req, res, id, { method: 'password' });
  await db.q('UPDATE users SET last_login_at=NOW(), last_login_ip=? WHERE id=?', [clientIp(req), id]);
  ok(res, { registered: true }, 201);
}));

r.post('/login', strict, ah(async (req, res) => {
  const b = validate(req.body, { email: ['email'], password: ['str', { min: 1, max: 200 }] });
  const ip = clientIp(req);
  if (await auth.isLocked(b.email, ip)) {
    await logs.security(req, null, 'login_locked', { email: b.email }, 'warning');
    throw err(429, 'account_locked', 'Too many failed attempts. Try again later or reset your password.');
  }
  const user = await db.one('SELECT id, email, name, password_hash, status FROM users WHERE email=? AND deleted_at IS NULL', [b.email]);
  if (!user || !user.password_hash) { await auth.dummyVerify(b.password); await auth.recordAttempt(b.email, ip, false); throw err(401, 'invalid_credentials', 'Invalid email or password'); }
  const good = await auth.verifyPassword(user.password_hash, b.password);
  await auth.recordAttempt(b.email, ip, good);
  if (!good) { await logs.security(req, user.id, 'login_failed', null, 'warning'); throw err(401, 'invalid_credentials', 'Invalid email or password'); }
  if (user.status !== 'active') { await logs.security(req, user.id, 'login_blocked_suspended', null, 'warning'); throw err(403, 'account_suspended', 'This account has been suspended'); }
  ok(res, await finishLogin(req, res, user, 'password'));
}));

/** Complete 2-step verification for an mfa_pending session */
r.post('/2fa/verify', strict, ah(async (req, res) => {
  if (!req.user || !req.user.mfaPending) throw err(401, 'unauthenticated', 'Session expired, please sign in again');
  const b = validate(req.body, { method: ['enum', { values: ['totp', 'email', 'recovery'] }], code: ['str', { min: 4, max: 32 }] });
  const uid = req.user.id; const ip = clientIp(req);
  const methods = await twoFactorMethods(uid);
  if (!methods.includes(b.method)) throw err(400, 'method_unavailable', 'This verification method is not enabled');
  if (await auth.isLocked('2fa:' + uid, ip)) throw err(429, 'account_locked', 'Too many failed attempts. Try again later.');
  let good = false;
  if (b.method === 'totp') {
    const row = await db.one('SELECT totp_secret_enc, totp_last_step FROM two_factor WHERE user_id=?', [uid]);
    const step = totp.verify(decrypt(row.totp_secret_enc), b.code);
    if (step > 0 && step > Number(row.totp_last_step || 0)) { good = true; await db.q('UPDATE two_factor SET totp_last_step=? WHERE user_id=?', [step, uid]); }
  } else if (b.method === 'email') {
    const code = b.code.replace(/\D/g, '');
    const row = await db.one('SELECT id, code_hash, attempts FROM otp_codes WHERE user_id=? AND purpose=? AND used_at IS NULL AND expires_at > NOW() ORDER BY id DESC LIMIT 1', [uid, 'login']);
    if (row && row.attempts < 5) {
      if (row.code_hash === sha256(uid + ':' + code)) { good = true; await db.q('UPDATE otp_codes SET used_at=NOW() WHERE id=?', [row.id]); }
      else await db.q('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?', [row.id]);
    }
  } else {
    const code = b.code.replace(/[\s-]/g, '').toUpperCase();
    const rows = await db.q('SELECT id, code_hash FROM recovery_codes WHERE user_id=? AND used_at IS NULL', [uid]);
    for (const rc of rows) {
      if (await auth.verifyPassword(rc.code_hash, code)) {
        const claim = await db.q('UPDATE recovery_codes SET used_at=NOW() WHERE id=? AND used_at IS NULL', [rc.id]);
        good = claim.affectedRows === 1; break;
      }
    }
    if (good) {
      const left = await db.one('SELECT COUNT(*) n FROM recovery_codes WHERE user_id=? AND used_at IS NULL', [uid]);
      await logs.security(req, uid, 'recovery_code_used', { remaining: Number(left.n) }, 'warning');
      notify(uid, { type: 'security', titleKey: 'notif.recovery_used.title', bodyKey: 'notif.recovery_used.body', vars: { remaining: Number(left.n) }, security: true, link: '/app/settings/security',
        email: { template: 'recovery_used', vars: { time: new Date().toUTCString(), remaining: Number(left.n) } } }).catch(() => {});
    }
  }
  await auth.recordAttempt('2fa:' + uid, ip, good);
  if (!good) { await logs.security(req, uid, '2fa_failed', { method: b.method }, 'warning'); throw err(401, 'invalid_code', 'That code is not valid'); }
  const s = await auth.upgradeSession(req, res);
  await db.q('UPDATE users SET last_login_at=NOW(), last_login_ip=? WHERE id=?', [ip, uid]);
  await logs.security(req, uid, 'login_success', { method: req.session.auth_method, mfa: b.method });
  if (s.isNewDevice) {
    notify(uid, { type: 'security', titleKey: 'notif.login_alert.title', bodyKey: 'notif.login_alert.body', vars: { device: s.deviceName, ip }, link: '/app/settings/sessions', security: true,
      email: { template: 'login_alert', vars: { time: new Date().toUTCString(), ip, device: s.deviceName } } }).catch(() => {});
  }
  ok(res, { verified: true });
}));

r.post('/2fa/email-code', strict, ah(async (req, res) => {
  if (!req.user || !req.user.mfaPending) throw err(401, 'unauthenticated', 'Session expired, please sign in again');
  const methods = await twoFactorMethods(req.user.id);
  if (!methods.includes('email')) throw err(400, 'method_unavailable', 'Email verification is not enabled');
  const prof = await db.one('SELECT language FROM user_profiles WHERE user_id=?', [req.user.id]);
  const out = await sendEmailOtp(req.user, prof?.language || 'en');
  if (!out.sent) throw err(503, 'email_unavailable', 'Email could not be sent. Use another method.');
  ok(res, { sent: true });
}));

r.post('/logout', ah(async (req, res) => {
  if (req.user) await logs.security(req, req.user.id, 'logout');
  await auth.destroySession(req, res);
  ok(res, { loggedOut: true });
}));

r.post('/forgot', strict, ah(async (req, res) => {
  const b = validate(req.body, { email: ['email'] });
  const user = await db.one('SELECT u.id, u.name, u.email, u.status, p.language FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.email=? AND u.deleted_at IS NULL', [b.email]);
  if (user && user.status === 'active') {
    const recent = await db.one('SELECT COUNT(*) n FROM password_resets WHERE user_id=? AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)', [user.id]);
    if (Number(recent.n) < 3) {
      const token = randomToken(32);
      await db.q('UPDATE password_resets SET used_at=NOW() WHERE user_id=? AND used_at IS NULL', [user.id]); // invalidate older links
      await db.q('INSERT INTO password_resets (user_id, token_hash, ip, expires_at) VALUES (?,?,?, DATE_ADD(NOW(), INTERVAL 60 MINUTE))', [user.id, sha256(token), clientIp(req)]);
      await mailer.send({ to: user.email, userId: user.id, template: 'password_reset', locale: user.language || 'en', vars: { name: user.name, minutes: 60 },
        cta: { link: `${settings.siteUrl(req)}/app/reset-password?token=${token}`, labelKey: 'email.reset_cta' } });
      await logs.security(req, user.id, 'password_reset_requested');
    }
  }
  // Same response whether or not the account exists (no user enumeration)
  ok(res, { sent: true });
}));

r.post('/reset', strict, ah(async (req, res) => {
  const b = validate(req.body, { token: ['str', { min: 20, max: 100 }], password: ['password'] });
  const row = await db.one('SELECT id, user_id FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at > NOW()', [sha256(b.token)]);
  if (!row) throw err(400, 'invalid_token', 'This reset link is invalid or has expired');
  const hash = await auth.hashPassword(b.password);
  await db.tx(async (t) => {
    const claim = await t.q('UPDATE password_resets SET used_at=NOW() WHERE id=? AND used_at IS NULL', [row.id]);
    if (!claim.affectedRows) throw err(400, 'invalid_token', 'This reset link is invalid or has expired');
    await t.q('UPDATE password_resets SET used_at=NOW() WHERE user_id=? AND used_at IS NULL', [row.user_id]);
    await t.q('UPDATE users SET password_hash=?, password_changed_at=NOW(), email_verified_at=COALESCE(email_verified_at, NOW()) WHERE id=?', [hash, row.user_id]);
    await t.q('UPDATE sessions SET revoked_at=NOW() WHERE user_id=? AND revoked_at IS NULL', [row.user_id]);
  });
  await db.q("DELETE FROM login_attempts WHERE email=(SELECT email FROM users WHERE id=?)", [row.user_id]);
  await logs.security(req, row.user_id, 'password_reset', null, 'warning');
  await notify(row.user_id, { type: 'security', titleKey: 'notif.password_changed.title', bodyKey: 'notif.password_changed.body', security: true, link: '/app/settings/security',
    email: { template: 'password_changed', vars: { time: new Date().toUTCString(), ip: clientIp(req) } } });
  ok(res, { reset: true });
}));

r.post('/verify-email', medium, ah(async (req, res) => {
  const b = validate(req.body, { token: ['str', { min: 20, max: 100 }] });
  const row = await db.one('SELECT id, user_id FROM email_verifications WHERE token_hash=? AND used_at IS NULL AND expires_at > NOW()', [sha256(b.token)]);
  if (!row) throw err(400, 'invalid_token', 'This verification link is invalid or has expired');
  await db.q('UPDATE email_verifications SET used_at=NOW() WHERE id=?', [row.id]);
  await db.q('UPDATE users SET email_verified_at=COALESCE(email_verified_at, NOW()) WHERE id=?', [row.user_id]);
  await logs.security(req, row.user_id, 'email_verified');
  ok(res, { verified: true });
}));

r.post('/resend-verification', strict, ah(async (req, res) => {
  if (!req.user || req.user.mfaPending) throw err(401, 'unauthenticated', 'Please sign in');
  if (req.user.verified) return ok(res, { verified: true });
  const token = await auth.createEmailVerification(req.user.id);
  const p = await db.one('SELECT language FROM user_profiles WHERE user_id=?', [req.user.id]);
  const out = await mailer.send({ to: req.user.email, userId: req.user.id, template: 'verify_email', locale: p?.language || 'en', vars: { name: req.user.name },
    cta: { link: `${settings.siteUrl(req)}/app/verify-email?token=${token}`, labelKey: 'email.verify_cta' } });
  if (!out.sent) throw err(503, 'email_unavailable', 'Email service is not configured. Contact support.');
  ok(res, { sent: true });
}));

/* ---------------- Google OAuth 2.0 (authorization code flow) ---------------- */
function googleCfg() {
  return {
    id: process.env.GOOGLE_CLIENT_ID || settings.get('google_client_id'),
    secret: process.env.GOOGLE_CLIENT_SECRET || settings.get('google_client_secret'),
  };
}
const googleOn = () => settings.bool('auth_google_enabled') && !!googleCfg().id && !!googleCfg().secret;

r.get('/google', medium, (req, res) => {
  if (!googleOn()) return res.redirect('/app/login?error=google_disabled');
  const state = randomToken(24);
  res.cookie('lt_gstate', state, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 10 * 60e3, path: '/api/auth/google' });
  const p = new URLSearchParams({
    client_id: googleCfg().id, redirect_uri: settings.siteUrl(req) + '/api/auth/google/callback', response_type: 'code',
    scope: 'openid email profile', state, prompt: 'select_account', access_type: 'online',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
});

r.get('/google/callback', medium, ah(async (req, res) => {
  const fail = (code) => res.redirect('/app/login?error=' + code);
  if (!googleOn()) return fail('google_disabled');
  const { code, state } = req.query;
  const cookieState = req.cookies.lt_gstate;
  res.clearCookie('lt_gstate', { path: '/api/auth/google' });
  if (!code || !state || !cookieState || typeof state !== 'string' || state !== cookieState) return fail('google_state');
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: String(code), client_id: googleCfg().id, client_secret: googleCfg().secret, redirect_uri: settings.siteUrl(req) + '/api/auth/google/callback', grant_type: 'authorization_code' }),
  });
  const tok = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tok.id_token) return fail('google_failed');
  // Validate the ID token with Google (signature, expiry, audience)
  const infoRes = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tok.id_token));
  const info = await infoRes.json().catch(() => ({}));
  if (!infoRes.ok || info.aud !== googleCfg().id || !['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) return fail('google_failed');
  if (info.email_verified !== 'true' && info.email_verified !== true) return fail('google_unverified');
  const email = String(info.email).toLowerCase();
  let user = await db.one('SELECT id, email, name, status FROM users WHERE google_id=? AND deleted_at IS NULL', [info.sub]);
  if (!user) {
    user = await db.one('SELECT id, email, name, status, google_id FROM users WHERE email=? AND deleted_at IS NULL', [email]);
    if (user) {
      if (user.google_id && user.google_id !== info.sub) return fail('google_conflict');
      await db.q('UPDATE users SET google_id=?, email_verified_at=COALESCE(email_verified_at, NOW()), avatar_url=COALESCE(avatar_url, ?) WHERE id=?', [info.sub, info.picture || null, user.id]);
      await logs.security(req, user.id, 'google_linked');
    } else {
      if (!settings.bool('registration_enabled')) return fail('registration_closed');
      const id = await auth.createUser({ email, name: String(info.name || email.split('@')[0]).slice(0, 120), googleId: info.sub, avatar: info.picture || null, verified: true, language: ['en', 'bn', 'hi'].includes(info.locale) ? info.locale : undefined });
      await logs.security(req, id, 'register', { method: 'google' });
      if (settings.bool('notify_welcome')) await notify(id, { type: 'welcome', titleKey: 'notif.welcome.title', bodyKey: 'notif.welcome.body', link: '/app', email: { template: 'welcome', cta: { link: settings.siteUrl(req) + '/app' } } });
      user = { id, email, name: info.name, status: 'active' };
    }
  }
  if (user.status !== 'active') return fail('account_suspended');
  const out = await finishLogin(req, res, user, 'google');
  res.redirect(out.mfa ? '/app/login?mfa=1' : '/app');
}));

/* ---------------- Passkey (WebAuthn) sign-in ---------------- */
r.post('/passkey/options', medium, ah(async (req, res) => {
  if (!settings.bool('auth_passkey_enabled')) throw err(403, 'passkeys_disabled', 'Passkeys are disabled');
  const { rpID } = webauthn.rp(req);
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred', allowCredentials: [], timeout: 60000 });
  const cid = await webauthn.saveChallenge(null, 'login', options.challenge);
  res.cookie('lt_chal', cid, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 5 * 60e3, path: '/api' });
  ok(res, { ...options, challengeId: cid });
}));

r.post('/passkey/verify', strict, ah(async (req, res) => {
  if (!settings.bool('auth_passkey_enabled')) throw err(403, 'passkeys_disabled', 'Passkeys are disabled');
  const response = req.body?.response;
  if (!response || typeof response.id !== 'string' || response.id.length > 512) throw err(400, 'invalid_request', 'Invalid passkey response');
  const ch = await webauthn.takeChallenge(req.body?.challengeId || req.cookies.lt_chal, 'login');
  res.clearCookie('lt_chal', { path: '/api' });
  if (!ch) throw err(400, 'challenge_expired', 'Passkey request expired, please try again');
  const pk = await db.one('SELECT p.*, u.email, u.name, u.status FROM passkeys p JOIN users u ON u.id=p.user_id WHERE p.credential_id=? AND u.deleted_at IS NULL', [response.id]);
  if (!pk) { await logs.security(req, null, 'passkey_login_failed', { reason: 'unknown_credential' }, 'warning'); throw err(401, 'passkey_unknown', 'This passkey is not registered'); }
  const { rpID, origin } = webauthn.rp(req);
  let v;
  try {
    v = await verifyAuthenticationResponse({
      response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false,
      credential: { id: pk.credential_id, publicKey: new Uint8Array(pk.public_key), counter: Number(pk.counter), transports: pk.transports ? pk.transports.split(',') : undefined },
    });
  } catch (e) { await logs.security(req, pk.user_id, 'passkey_login_failed', { reason: e.message }, 'warning'); throw err(401, 'passkey_failed', 'Passkey verification failed'); }
  if (!v.verified) throw err(401, 'passkey_failed', 'Passkey verification failed');
  await db.q('UPDATE passkeys SET counter=?, last_used_at=NOW() WHERE id=?', [v.authenticationInfo.newCounter, pk.id]);
  if (pk.status !== 'active') throw err(403, 'account_suspended', 'This account has been suspended');
  ok(res, await finishLogin(req, res, { id: pk.user_id, email: pk.email, name: pk.name }, 'passkey'));
}));

module.exports = r;
