'use strict';
const db = require('../config/database');
const config = require('../config/env');
const settings = require('../models/settings');
const User = require('../models/user');
const audit = require('../models/auditLog');
const notifications = require('../models/notification');
const twofa = require('../services/twofa');
const mailer = require('../services/mailer');
const v = require('../utils/validate');
const { E } = require('../utils/errors');
const { ensureToken } = require('../middleware/csrf');
const { randomToken, sha256 } = require('../utils/crypto');

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const REMEMBER_MS = 30 * 24 * 3600 * 1000;

let dummy = null;
async function dummyHash() {
  if (!dummy) dummy = await User.hashPassword(randomToken(8));
  return dummy;
}

function baseUrl(req) {
  return config.appUrl || `${req.protocol}://${req.get('host')}`;
}

function regenerate(req) {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

async function finalizeLogin(req, user, remember) {
  await regenerate(req); // prevent session fixation
  req.session.userId = user.id;
  req.session.meta = { ip: req.ip, ua: (req.get('user-agent') || '').slice(0, 255) };
  req.session.lastSeen = Date.now();
  req.session.cookie.maxAge = remember ? REMEMBER_MS : null; // null → browser-session cookie
  if (!remember) req.session.cookie.expires = false;
  ensureToken(req);
  await db.run(
    `UPDATE users SET last_login_at = UTC_TIMESTAMP(), last_login_ip = ?, last_active_at = UTC_TIMESTAMP() WHERE id = ?`, [req.ip, user.id],
  );
  await db.run('UPDATE user_security SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = ?', [user.id]);
  await audit.log(req, 'login.success', { category: 'auth', userId: user.id, targetType: 'user', targetId: user.id });
}

async function sendVerification(req, userId, email, name) {
  const token = randomToken(32);
  await db.run(
    `UPDATE user_security SET email_verify_token_hash = ?, email_verify_expires_at = UTC_TIMESTAMP() + INTERVAL 24 HOUR WHERE user_id = ?`,
    [sha256(token), userId],
  );
  const site = await settings.get('site_name');
  await mailer.send({
    to: email, subject: `Verify your ${site} account`, title: `Welcome, ${name}!`,
    text: 'Please confirm your email address to activate your account. This link expires in 24 hours.',
    cta: { url: `${baseUrl(req)}/verify-email?token=${token}`, label: 'Verify email' },
  });
}

exports.csrf = (req, res) => {
  res.json({ ok: true, csrfToken: ensureToken(req) });
};

exports.register = async (req, res) => {
  if (!(await settings.getBool('registration_enabled'))) throw E.forbidden('Registration is currently closed');
  const name = v.str(req.body.name, { name: 'Name', min: 2, max: 120, required: true });
  const email = v.email(req.body.email);
  const password = v.password(req.body.password);
  if (req.body.password_confirm !== undefined && req.body.password_confirm !== password) throw E.badRequest('Passwords do not match');
  const requireVerify = await settings.getBool('require_email_verification');
  const requireApproval = await settings.getBool('require_admin_approval');
  const id = await User.create({ name, email, password, verified: !requireVerify, status: requireApproval ? 'pending' : 'active' });
  await audit.log(req, 'register', { category: 'auth', userId: id, targetType: 'user', targetId: id });
  if (requireApproval) {
    notifications.notifyAdmins({ type: 'system', title: 'New account waiting for approval', body: `${name} · ${email}`, link: '/admin/users' }).catch(() => {});
  }
  if (requireVerify) {
    await sendVerification(req, id, email, name);
    return res.status(201).json({ ok: true, verify_required: true, message: 'Account created! Check your email to verify your address.' });
  }
  if (requireApproval) {
    return res.status(201).json({ ok: true, pending: true, contact: await contactInfo(), message: 'Account created! It is waiting for admin approval.' });
  }
  const user = await db.one('SELECT * FROM users WHERE id = ?', [id]);
  await finalizeLogin(req, user, false);
  res.status(201).json({ ok: true, verify_required: false, redirect: '/dashboard' });
};

exports.login = async (req, res) => {
  const email = v.email(req.body.email);
  const password = v.str(req.body.password, { name: 'Password', required: true, max: 128, trim: false });
  const remember = v.bool(req.body.remember);
  const user = await db.one('SELECT * FROM users WHERE email = ?', [email]);
  const invalid = () => E.unauthorized('Invalid email or password');
  if (!user) {
    await User.verifyPassword(password, await dummyHash()); // equalise timing for unknown emails
    throw invalid();
  }
  const sec = await User.security(user.id);
  if (sec.locked_until && new Date(sec.locked_until) > new Date()) {
    throw E.tooMany('Too many failed attempts. Your account is temporarily locked — try again later.', { code: 'LOCKED' });
  }
  if (!(await User.verifyPassword(password, user.password_hash))) {
    const attempts = sec.failed_login_attempts + 1;
    await db.run(
      `UPDATE user_security SET failed_login_attempts = ?, locked_until = IF(? >= ?, UTC_TIMESTAMP() + INTERVAL ? MINUTE, locked_until) WHERE user_id = ?`,
      [attempts, attempts, MAX_FAILED, LOCK_MINUTES, user.id],
    );
    await audit.log(req, 'login.failed', { category: 'security', userId: user.id, targetType: 'user', targetId: user.id, details: { attempts } });
    throw invalid();
  }
  if (user.status === 'suspended') throw E.forbidden('This account has been suspended. Please contact support.');
  if (!user.email_verified_at && (await settings.getBool('require_email_verification'))) {
    throw E.forbidden('Please verify your email address before signing in.', { code: 'EMAIL_UNVERIFIED' });
  }
  if (user.status === 'pending') {
    throw E.forbidden('Your account is waiting for admin approval.', { code: 'ACCOUNT_PENDING', contact: await contactInfo() });
  }

  if (await twofa.isEnabled(user.id)) {
    req.session.pending2fa = { userId: user.id, remember, at: Date.now() };
    return res.json({ ok: true, twofa: true });
  }
  await finalizeLogin(req, user, remember);
  res.json({ ok: true, redirect: user.role === 'admin' && req.body.next === '/admin' ? '/admin' : (safeNext(req.body.next) || '/dashboard') });
};

function safeNext(n) {
  if (typeof n !== 'string') return null;
  return /^\/(?!\/)[\w\-/?=&.%]*$/.test(n) && !n.startsWith('/login') ? n : null;
}

exports.twofa = async (req, res) => {
  const p = req.session.pending2fa;
  if (!p || Date.now() - p.at > 5 * 60_000) throw E.unauthorized('Your sign-in session expired. Please sign in again.');
  const code = v.str(req.body.code, { name: 'Code', required: true, max: 20 });
  const result = await twofa.verifyLogin(p.userId, code);
  if (!result.ok) {
    await audit.log(req, 'login.2fa_failed', { category: 'security', userId: p.userId, targetType: 'user', targetId: p.userId });
    p.tries = (p.tries || 0) + 1;
    if (p.tries >= 5) req.session.pending2fa = null;
    throw E.unauthorized('Invalid verification code');
  }
  const user = await db.one('SELECT * FROM users WHERE id = ?', [p.userId]);
  if (!user || user.status === 'suspended') throw E.forbidden('Account unavailable');
  await finalizeLogin(req, user, p.remember);
  res.json({ ok: true, redirect: '/dashboard', recovery_remaining: result.remaining });
};

exports.logout = async (req, res) => {
  const uid = req.user?.id;
  await new Promise((resolve) => req.session.destroy(() => resolve()));
  res.clearCookie('aura.sid');
  if (uid) await audit.log(req, 'logout', { category: 'auth', userId: uid });
  res.json({ ok: true, redirect: '/login' });
};

exports.verifyEmail = async (req, res) => {
  const token = String(req.query.token || '');
  if (!/^[a-f0-9]{64}$/.test(token)) return res.redirect('/login?verified=invalid');
  const sec = await db.one(
    'SELECT user_id FROM user_security WHERE email_verify_token_hash = ? AND email_verify_expires_at > UTC_TIMESTAMP()', [sha256(token)],
  );
  if (!sec) return res.redirect('/login?verified=invalid');
  await db.run('UPDATE users SET email_verified_at = UTC_TIMESTAMP() WHERE id = ? AND email_verified_at IS NULL', [sec.user_id]);
  await db.run('UPDATE user_security SET email_verify_token_hash = NULL, email_verify_expires_at = NULL WHERE user_id = ?', [sec.user_id]);
  await audit.log(req, 'email.verified', { category: 'auth', userId: sec.user_id });
  const u = await db.one('SELECT status FROM users WHERE id = ?', [sec.user_id]);
  res.redirect(u?.status === 'pending' ? '/login?verified=pending' : '/login?verified=1');
};

exports.resendVerification = async (req, res) => {
  const email = v.email(req.body.email);
  const user = await db.one('SELECT id, name, email, email_verified_at FROM users WHERE email = ?', [email]);
  if (user && !user.email_verified_at) await sendVerification(req, user.id, user.email, user.name);
  res.json({ ok: true, message: 'If that account needs verification, a new link has been sent.' });
};

exports.forgot = async (req, res) => {
  const email = v.email(req.body.email);
  const user = await db.one("SELECT id, name, email FROM users WHERE email = ? AND status = 'active'", [email]);
  if (user) {
    const token = randomToken(32);
    await User.security(user.id);
    await db.run(
      'UPDATE user_security SET password_reset_token_hash = ?, password_reset_expires_at = UTC_TIMESTAMP() + INTERVAL 1 HOUR WHERE user_id = ?',
      [sha256(token), user.id],
    );
    const site = await settings.get('site_name');
    await mailer.send({
      to: user.email, subject: `Reset your ${site} password`, title: 'Password reset request',
      text: 'We received a request to reset your password. This link is valid for 1 hour. If you did not request it, you can ignore this email.',
      cta: { url: `${baseUrl(req)}/reset-password?token=${token}`, label: 'Reset password' },
    });
    await audit.log(req, 'password.reset_requested', { category: 'security', userId: user.id });
  }
  res.json({ ok: true, message: 'If an account exists for that email, a reset link has been sent.' });
};

exports.reset = async (req, res) => {
  const token = v.str(req.body.token, { name: 'Token', required: true, max: 64, pattern: /^[a-f0-9]{64}$/ });
  const password = v.password(req.body.password);
  const sec = await db.one(
    'SELECT user_id FROM user_security WHERE password_reset_token_hash = ? AND password_reset_expires_at > UTC_TIMESTAMP()', [sha256(token)],
  );
  if (!sec) throw E.badRequest('This reset link is invalid or has expired');
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [await User.hashPassword(password), sec.user_id]);
  await db.run(
    `UPDATE user_security SET password_reset_token_hash = NULL, password_reset_expires_at = NULL, password_changed_at = UTC_TIMESTAMP(),
     failed_login_attempts = 0, locked_until = NULL WHERE user_id = ?`, [sec.user_id],
  );
  await db.run('DELETE FROM user_sessions WHERE user_id = ?', [sec.user_id]); // sign out everywhere
  const u = await db.one('SELECT email, name FROM users WHERE id = ?', [sec.user_id]);
  await mailer.send({ to: u.email, subject: 'Your password was changed', title: 'Password changed', text: 'Your password was just reset. If this was not you, contact support immediately.' });
  await audit.log(req, 'password.reset', { category: 'security', userId: sec.user_id });
  res.json({ ok: true, message: 'Password updated. You can now sign in.' });
};

async function contactInfo() {
  const s = await settings.loadAll();
  return { whatsapp: s.support_whatsapp || '', note: s.support_contact_note || '' };
}

exports.contact = async (req, res) => res.json({ ok: true, contact: await contactInfo() });

exports.finalizeLogin = finalizeLogin;
exports.sendVerification = sendVerification;
