'use strict';
/** Password, 2FA (TOTP + email), recovery codes, passkeys, sessions/devices. All re-verified server-side. */
const express = require('express');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { rateLimit } = require('express-rate-limit');
const { generateRegistrationOptions, verifyRegistrationResponse } = require('@simplewebauthn/server');
const db = require('../../db');
const { ah, ok, err, clientIp } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const { encrypt, decrypt } = require('../../lib/crypto');
const totp = require('../../lib/totp');
const auth = require('../../services/auth');
const settings = require('../../services/settings');
const logs = require('../../services/logs');
const { notify } = require('../../services/notify');
const webauthn = require('../../services/webauthn');

const r = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60e3, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ ok: false, error: { code: 'rate_limited', message: 'Too many attempts. Please wait.' } }) });

/**
 * Step-up verification for sensitive actions: password, or current TOTP code,
 * or (password-less accounts) a session that signed in within the last 15 minutes.
 */
async function reauth(req, body) {
  const u = await db.one('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
  if (body.password && u.password_hash) {
    if (await auth.verifyPassword(u.password_hash, String(body.password))) return true;
    await logs.security(req, req.user.id, 'reauth_failed', null, 'warning');
    throw err(401, 'invalid_password', 'Incorrect password');
  }
  if (body.code) {
    const t = await db.one('SELECT totp_secret_enc, totp_enabled_at FROM two_factor WHERE user_id=?', [req.user.id]);
    if (t?.totp_enabled_at && totp.verify(decrypt(t.totp_secret_enc), body.code) > 0) return true;
    throw err(401, 'invalid_code', 'That code is not valid');
  }
  if (!u.password_hash && Date.now() - new Date(req.session.created_at).getTime() < 15 * 60e3) return true;
  throw err(401, 'reauth_required', u.password_hash ? 'Enter your password to continue' : 'Please sign in again to continue');
}

const secNotify = (req, titleKey, bodyKey, template, vars = {}) => notify(req.user.id, {
  type: 'security', titleKey, bodyKey, vars, security: true, link: '/app/settings/security',
  email: { template, vars: { time: new Date().toUTCString(), ip: clientIp(req), ...vars }, cta: { link: settings.siteUrl(req) + '/app/settings/security', labelKey: 'email.review_activity' } },
}).catch(() => {});

r.get('/', ah(async (req, res) => {
  const uid = req.user.id;
  const [u, tf, rc, pks, sessions, events] = await Promise.all([
    db.one('SELECT password_hash IS NOT NULL has_password, google_id IS NOT NULL google, password_changed_at, email_verified_at FROM users WHERE id=?', [uid]),
    db.one('SELECT totp_enabled_at, email_enabled_at FROM two_factor WHERE user_id=?', [uid]),
    db.one('SELECT COUNT(*) n FROM recovery_codes WHERE user_id=? AND used_at IS NULL', [uid]),
    db.q('SELECT id, name, device_type, backed_up, created_at, last_used_at FROM passkeys WHERE user_id=? ORDER BY created_at DESC', [uid]),
    db.q(`SELECT s.id, s.ip, s.auth_method, s.created_at, s.last_seen_at, d.name device FROM sessions s LEFT JOIN devices d ON d.id=s.device_id
      WHERE s.user_id=? AND s.revoked_at IS NULL AND s.mfa_pending=0 AND s.expires_at > NOW() ORDER BY s.last_seen_at DESC LIMIT 20`, [uid]),
    db.q('SELECT event, severity, ip, created_at FROM security_logs WHERE user_id=? ORDER BY id DESC LIMIT 15', [uid]),
  ]);
  ok(res, {
    hasPassword: !!u.has_password, google: !!u.google, passwordChangedAt: u.password_changed_at, emailVerified: !!u.email_verified_at,
    twoFactor: { available: settings.bool('auth_2fa_enabled'), totp: !!tf?.totp_enabled_at, email: !!tf?.email_enabled_at, recoveryRemaining: Number(rc.n) },
    passkeysEnabled: settings.bool('auth_passkey_enabled'),
    passkeys: pks.map((p) => ({ ...p, backed_up: !!p.backed_up })),
    sessions: sessions.map((s) => ({ ...s, current: s.id === req.session.id })),
    events,
  });
}));

r.post('/password', limiter, ah(async (req, res) => {
  const b = validate(req.body, { current: ['str', { max: 200, optional: true }], password: ['password'] });
  const u = await db.one('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
  if (u.password_hash) {
    if (!(await auth.verifyPassword(u.password_hash, b.current || ''))) { await logs.security(req, req.user.id, 'password_change_failed', null, 'warning'); throw err(401, 'invalid_password', 'Current password is incorrect'); }
  } else await reauth(req, req.body || {});
  await db.q('UPDATE users SET password_hash=?, password_changed_at=NOW() WHERE id=?', [await auth.hashPassword(b.password), req.user.id]);
  await auth.revokeAllSessions(req.user.id, req.session.id);
  await logs.security(req, req.user.id, u.password_hash ? 'password_changed' : 'password_set', null, 'warning');
  secNotify(req, 'notif.password_changed.title', 'notif.password_changed.body', 'password_changed');
  ok(res, { changed: true });
}));

/* ---- TOTP authenticator ---- */
r.post('/2fa/totp/setup', limiter, ah(async (req, res) => {
  if (!settings.bool('auth_2fa_enabled')) throw err(403, 'feature_disabled', '2FA is disabled by the administrator');
  const cur = await db.one('SELECT totp_enabled_at FROM two_factor WHERE user_id=?', [req.user.id]);
  if (cur?.totp_enabled_at) throw err(409, 'already_enabled', 'Authenticator already enabled');
  const secret = totp.generateSecret();
  await db.q('INSERT INTO two_factor (user_id, totp_secret_enc) VALUES (?,?) ON DUPLICATE KEY UPDATE totp_secret_enc=VALUES(totp_secret_enc)', [req.user.id, encrypt(secret)]);
  const uri = totp.uri(secret, req.user.email, settings.get('site_name'));
  ok(res, { secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: '#0F172A', light: '#FFFFFF' } }) });
}));

async function issueRecoveryCodes(userId) {
  const codes = [];
  await db.q('DELETE FROM recovery_codes WHERE user_id=?', [userId]);
  for (let i = 0; i < 10; i++) {
    const raw = crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 10); // 40 bits each
    codes.push(raw.slice(0, 5) + '-' + raw.slice(5));
    await db.q('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?,?)', [userId, await auth.hashPassword(raw)]);
  }
  return codes;
}

r.post('/2fa/totp/enable', limiter, ah(async (req, res) => {
  const b = validate(req.body, { code: ['str', { min: 6, max: 8 }] });
  const row = await db.one('SELECT totp_secret_enc, totp_enabled_at FROM two_factor WHERE user_id=?', [req.user.id]);
  if (!row?.totp_secret_enc) throw err(400, 'setup_required', 'Start setup first');
  if (row.totp_enabled_at) throw err(409, 'already_enabled', 'Authenticator already enabled');
  const step = totp.verify(decrypt(row.totp_secret_enc), b.code);
  if (step < 0) throw err(401, 'invalid_code', 'That code is not valid — check your device time');
  await db.q('UPDATE two_factor SET totp_enabled_at=NOW(), totp_last_step=? WHERE user_id=?', [step, req.user.id]);
  const rc = await db.one('SELECT COUNT(*) n FROM recovery_codes WHERE user_id=? AND used_at IS NULL', [req.user.id]);
  const codes = Number(rc.n) ? null : await issueRecoveryCodes(req.user.id);
  await logs.security(req, req.user.id, '2fa_enabled', { method: 'totp' }, 'warning');
  secNotify(req, 'notif.2fa_changed.title', 'notif.2fa_enabled.body', 'twofa_changed', { action: 'enabled (authenticator)' });
  ok(res, { enabled: true, recoveryCodes: codes });
}));

r.post('/2fa/totp/disable', limiter, ah(async (req, res) => {
  await reauth(req, req.body || {});
  await db.q('UPDATE two_factor SET totp_enabled_at=NULL, totp_secret_enc=NULL, totp_last_step=NULL WHERE user_id=?', [req.user.id]);
  await cleanupRecovery(req.user.id);
  await logs.security(req, req.user.id, '2fa_disabled', { method: 'totp' }, 'critical');
  secNotify(req, 'notif.2fa_changed.title', 'notif.2fa_disabled.body', 'twofa_changed', { action: 'disabled (authenticator)' });
  ok(res, { disabled: true });
}));

r.post('/2fa/email/enable', limiter, ah(async (req, res) => {
  if (!settings.bool('auth_2fa_enabled')) throw err(403, 'feature_disabled', '2FA is disabled by the administrator');
  await reauth(req, req.body || {});
  if (!require('../../services/mailer').enabled()) throw err(503, 'email_unavailable', 'Email is not configured on this server');
  await db.q('INSERT INTO two_factor (user_id, email_enabled_at) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE email_enabled_at=NOW()', [req.user.id]);
  const rc = await db.one('SELECT COUNT(*) n FROM recovery_codes WHERE user_id=? AND used_at IS NULL', [req.user.id]);
  const codes = Number(rc.n) ? null : await issueRecoveryCodes(req.user.id);
  await logs.security(req, req.user.id, '2fa_enabled', { method: 'email' }, 'warning');
  secNotify(req, 'notif.2fa_changed.title', 'notif.2fa_enabled.body', 'twofa_changed', { action: 'enabled (email codes)' });
  ok(res, { enabled: true, recoveryCodes: codes });
}));

r.post('/2fa/email/disable', limiter, ah(async (req, res) => {
  await reauth(req, req.body || {});
  await db.q('UPDATE two_factor SET email_enabled_at=NULL WHERE user_id=?', [req.user.id]);
  await cleanupRecovery(req.user.id);
  await logs.security(req, req.user.id, '2fa_disabled', { method: 'email' }, 'critical');
  secNotify(req, 'notif.2fa_changed.title', 'notif.2fa_disabled.body', 'twofa_changed', { action: 'disabled (email codes)' });
  ok(res, { disabled: true });
}));

async function cleanupRecovery(uid) {
  const t = await db.one('SELECT totp_enabled_at, email_enabled_at FROM two_factor WHERE user_id=?', [uid]);
  if (!t?.totp_enabled_at && !t?.email_enabled_at) await db.q('DELETE FROM recovery_codes WHERE user_id=?', [uid]);
}

r.post('/recovery-codes', limiter, ah(async (req, res) => {
  await reauth(req, req.body || {});
  const t = await db.one('SELECT totp_enabled_at, email_enabled_at FROM two_factor WHERE user_id=?', [req.user.id]);
  if (!t?.totp_enabled_at && !t?.email_enabled_at) throw err(400, 'twofa_required', 'Enable two-step verification first');
  const codes = await issueRecoveryCodes(req.user.id);
  await logs.security(req, req.user.id, 'recovery_codes_regenerated', null, 'warning');
  secNotify(req, 'notif.2fa_changed.title', 'notif.recovery_regenerated.body', 'twofa_changed', { action: 'recovery codes regenerated' });
  ok(res, { recoveryCodes: codes });
}));

/* ---- Passkeys ---- */
r.post('/passkeys/options', limiter, ah(async (req, res) => {
  if (!settings.bool('auth_passkey_enabled')) throw err(403, 'passkeys_disabled', 'Passkeys are disabled');
  const { rpID, rpName } = webauthn.rp(req);
  const existing = await db.q('SELECT credential_id, transports FROM passkeys WHERE user_id=?', [req.user.id]);
  const options = await generateRegistrationOptions({
    rpName, rpID, userName: req.user.email, userDisplayName: req.user.name,
    userID: new TextEncoder().encode(req.user.uuid),
    attestationType: 'none',
    excludeCredentials: existing.map((p) => ({ id: p.credential_id, transports: p.transports ? p.transports.split(',') : undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  const cid = await webauthn.saveChallenge(req.user.id, 'register', options.challenge);
  res.cookie('lt_chal', cid, { httpOnly: true, sameSite: 'strict', secure: req.secure, maxAge: 5 * 60e3, path: '/api' });
  ok(res, options);
}));

r.post('/passkeys/verify', limiter, ah(async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80) || 'Passkey';
  const response = req.body?.response;
  if (!response || typeof response !== 'object') throw err(400, 'invalid_request', 'Invalid passkey response');
  const ch = await webauthn.takeChallenge(req.cookies.lt_chal, 'register', req.user.id);
  res.clearCookie('lt_chal', { path: '/api' });
  if (!ch) throw err(400, 'challenge_expired', 'Passkey request expired, please try again');
  const { rpID, origin } = webauthn.rp(req);
  let v;
  try { v = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false }); }
  catch (e) { throw err(400, 'passkey_failed', 'Passkey registration failed: ' + e.message); }
  if (!v.verified || !v.registrationInfo) throw err(400, 'passkey_failed', 'Passkey registration failed');
  const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
  try {
    await db.q('INSERT INTO passkeys (user_id, credential_id, public_key, counter, transports, device_type, backed_up, name) VALUES (?,?,?,?,?,?,?,?)',
      [req.user.id, credential.id, Buffer.from(credential.publicKey), credential.counter || 0, (credential.transports || response.response?.transports || []).join(',').slice(0, 120), credentialDeviceType, credentialBackedUp ? 1 : 0, name]);
  } catch (e) { if (e.code === 'ER_DUP_ENTRY') throw err(409, 'passkey_exists', 'This passkey is already registered'); throw e; }
  await logs.security(req, req.user.id, 'passkey_added', { name }, 'warning');
  secNotify(req, 'notif.passkey_changed.title', 'notif.passkey_added.body', 'passkey_changed', { action: 'added', passkey: name });
  ok(res, { added: true }, 201);
}));

r.patch('/passkeys/:id', ah(async (req, res) => {
  const b = validate(req.body, { name: ['str', { min: 1, max: 80 }] });
  const out = await db.q('UPDATE passkeys SET name=? WHERE id=? AND user_id=?', [b.name, Number(req.params.id) || 0, req.user.id]);
  if (!out.affectedRows) throw err(404, 'not_found', 'Passkey not found');
  ok(res, { renamed: true });
}));

r.post('/passkeys/:id/delete', limiter, ah(async (req, res) => {
  await reauth(req, req.body || {});
  const pk = await db.one('SELECT id, name FROM passkeys WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]);
  if (!pk) throw err(404, 'not_found', 'Passkey not found');
  const u = await db.one('SELECT password_hash IS NOT NULL hp, google_id IS NOT NULL g FROM users WHERE id=?', [req.user.id]);
  const count = await db.one('SELECT COUNT(*) n FROM passkeys WHERE user_id=?', [req.user.id]);
  if (!u.hp && !u.g && Number(count.n) <= 1) throw err(409, 'last_login_method', 'Set a password before removing your only passkey');
  await db.q('DELETE FROM passkeys WHERE id=? AND user_id=?', [pk.id, req.user.id]);
  await logs.security(req, req.user.id, 'passkey_removed', { name: pk.name }, 'warning');
  secNotify(req, 'notif.passkey_changed.title', 'notif.passkey_removed.body', 'passkey_changed', { action: 'removed', passkey: pk.name });
  ok(res, { removed: true });
}));

/* ---- Sessions / devices ---- */
r.post('/sessions/:id/revoke', ah(async (req, res) => {
  const id = Number(req.params.id) || 0;
  const out = await db.q('UPDATE sessions SET revoked_at=NOW() WHERE id=? AND user_id=? AND revoked_at IS NULL', [id, req.user.id]);
  if (!out.affectedRows) throw err(404, 'not_found', 'Session not found');
  await logs.security(req, req.user.id, 'session_revoked', { session: id });
  ok(res, { revoked: true, current: id === req.session.id });
}));

r.post('/sessions/revoke-others', ah(async (req, res) => {
  await auth.revokeAllSessions(req.user.id, req.session.id);
  await logs.security(req, req.user.id, 'sessions_revoked_all', null, 'warning');
  ok(res, { revoked: true });
}));

module.exports = r;
