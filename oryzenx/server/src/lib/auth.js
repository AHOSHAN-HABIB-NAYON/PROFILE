const jwt = require('jsonwebtoken');
const config = require('../config');
const { one } = require('../db');
const { HttpError } = require('./util');

const COOKIE = 'ox_session';
const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

function setSession(res, user) {
  const token = jwt.sign({ uid: user.id, tv: user.token_version }, config.jwtSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: MAX_AGE_MS, path: '/',
  });
}

function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

// Where the user is in onboarding. Data pages need 'ready'.
// Members go through KYC (ID card + live face check) and admin review. Admins are exempt so the
// group can never lock itself out.
function stageOf(u) {
  if (u.status === 'disabled') return 'disabled';
  if (!u.email_verified_at) return 'verify_email';
  if (u.role === 'user') {
    if (u.kyc_status === 'none' || u.kyc_status === 'resubmit') return 'kyc';
    if (u.kyc_status === 'submitted' || u.kyc_status === 'review') return 'kyc_pending';
    if (u.kyc_status === 'rejected') return 'kyc_rejected';
    if (u.reverify_reason) return u.status === 'restricted' ? 'reverify_locked' : 'reverify';
  }
  if (u.status === 'pending') return 'pending_approval';
  if (!u.privacy_accepted_at) return 'privacy';
  return 'ready';
}

const isAdmin = (u) => u && (u.role === 'admin' || u.role === 'super_admin');

// Loads the user on every request so role/status changes apply immediately.
async function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();
  try {
    const { uid, tv } = jwt.verify(token, config.jwtSecret);
    const u = await one('SELECT * FROM users WHERE id = ?', [uid]);
    if (u && u.token_version === tv) req.user = u;
  } catch { /* invalid or expired token: treat as logged out */ }
  next();
}

function requireLogin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please log in'));
  if (req.user.status === 'disabled') return next(new HttpError(403, 'This account is disabled'));
  next();
}

function requireReady(req, res, next) {
  requireLogin(req, res, (err) => {
    if (err) return next(err);
    const stage = stageOf(req.user);
    if (stage !== 'ready') return next(new HttpError(403, `Finish account setup first (${stage})`));
    next();
  });
}

function requireAdmin(req, res, next) {
  requireReady(req, res, (err) => {
    if (err) return next(err);
    if (!isAdmin(req.user)) return next(new HttpError(403, 'Admins only'));
    next();
  });
}

function requireSuperAdmin(req, res, next) {
  requireReady(req, res, (err) => {
    if (err) return next(err);
    if (req.user.role !== 'super_admin') return next(new HttpError(403, 'Super Admin only'));
    next();
  });
}

// Fields anyone in the group may see about a member.
function publicUser(u) {
  return {
    id: u.id, name: u.name, role: u.role, status: u.status, avatar_url: u.avatar_url,
    deposit_amount: u.deposit_amount, deposit_date: u.deposit_date, deposit_received_at: u.deposit_received_at,
    salary: u.salary, member_since: u.created_at,
  };
}

// Adds private fields: only for the user themself and admins.
function privateUser(u) {
  return {
    ...publicUser(u), email: u.email, phone: u.phone, address: u.address,
    email_verified: !!u.email_verified_at, privacy_accepted_at: u.privacy_accepted_at,
    reminder_emails: !!u.reminder_emails, has_password: !!u.password_hash, google_linked: !!u.google_sub,
    kyc_status: u.kyc_status, kyc_note: u.kyc_note, kyc_fail_count: u.kyc_fail_count, kyc_consent_at: u.kyc_consent_at,
    reverify_reason: u.reverify_reason, totp_enabled: !!u.totp_enabled,
  };
}

module.exports = {
  setSession, clearSession, stageOf, isAdmin, loadUser, requireLogin, requireReady, requireAdmin, requireSuperAdmin,
  publicUser, privateUser,
};
