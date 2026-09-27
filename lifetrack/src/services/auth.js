'use strict';
const argon2 = require('argon2');
const db = require('../db');
const config = require('../config');
const settings = require('./settings');
const { randomToken, sha256, uuid } = require('../lib/crypto');
const { clientIp, ua } = require('../lib/http');

const SID = 'lt_sid';
const ARGON = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };

const hashPassword = (p) => argon2.hash(p, ARGON);
async function verifyPassword(hash, p) {
  if (!hash) return false;
  try { return await argon2.verify(hash, p); } catch { return false; }
}
// Constant-ish time for unknown users (prevents user enumeration by timing)
let dummyHash = null;
async function dummyVerify(p) { if (!dummyHash) dummyHash = await hashPassword('dummy-password-1'); await verifyPassword(dummyHash, p); }

function cookieSecure(req) {
  const c = config.get();
  if (typeof c.cookieSecure === 'boolean') return c.cookieSecure;
  return req.secure;
}
function cookieOpts(req, maxAgeMs) {
  return { httpOnly: true, secure: cookieSecure(req), sameSite: 'lax', path: '/', maxAge: maxAgeMs };
}

function deviceName(uaStr) {
  const s = uaStr || '';
  const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad|iOS/i.test(s) ? 'iOS' : /Windows/i.test(s) ? 'Windows' : /Mac OS X|Macintosh/i.test(s) ? 'macOS' : /Linux/i.test(s) ? 'Linux' : 'Unknown OS';
  const br = /Edg\//.test(s) ? 'Edge' : /OPR\//.test(s) ? 'Opera' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
}

/** Create a session; returns { isNewDevice }. mfaPending sessions can only complete 2FA. */
async function createSession(req, res, userId, { mfaPending = false, method = 'password' } = {}) {
  const token = randomToken(32);
  const days = Math.max(1, Number(settings.get('session_days')) || 30);
  const u = ua(req); const ip = clientIp(req);
  // Device tracking — fingerprint is a hash of UA + a per-browser cookie
  let did = req.cookies.lt_did;
  if (!did || !/^[A-Za-z0-9_-]{16,64}$/.test(did)) did = randomToken(18);
  res.cookie('lt_did', did, { ...cookieOpts(req, 400 * 864e5) });
  const fp = sha256(did + '|' + u);
  const existing = await db.one('SELECT id FROM devices WHERE user_id=? AND fingerprint=?', [userId, fp]);
  let deviceId;
  if (existing) { deviceId = existing.id; await db.q('UPDATE devices SET last_seen_at=NOW(), last_ip=? WHERE id=?', [ip, deviceId]); }
  else { deviceId = (await db.q('INSERT INTO devices (user_id, fingerprint, name, user_agent, last_ip) VALUES (?,?,?,?,?)', [userId, fp, deviceName(u), u, ip])).insertId; }

  const exp = mfaPending ? 10 * 60e3 : days * 864e5;
  await db.q('INSERT INTO sessions (user_id, token_hash, device_id, mfa_pending, auth_method, ip, user_agent, expires_at) VALUES (?,?,?,?,?,?,?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
    [userId, sha256(token), deviceId, mfaPending ? 1 : 0, method, ip, u, Math.floor(exp / 1000)]);
  res.cookie(SID, token, cookieOpts(req, exp));
  return { isNewDevice: !existing, deviceName: deviceName(u) };
}

async function upgradeSession(req, res) {
  // After 2FA succeeds: rotate the token (prevents fixation) and extend.
  await db.q('UPDATE sessions SET revoked_at=NOW() WHERE id=?', [req.session.id]);
  return createSession(req, res, req.session.user_id, { method: req.session.auth_method });
}

async function destroySession(req, res) {
  if (req.session) await db.q('UPDATE sessions SET revoked_at=NOW() WHERE id=?', [req.session.id]);
  res.clearCookie(SID, { path: '/' });
}

async function revokeAllSessions(userId, exceptId = 0) {
  await db.q('UPDATE sessions SET revoked_at=NOW() WHERE user_id=? AND id<>? AND revoked_at IS NULL', [userId, exceptId]);
}

/** Brute-force protection: per email and per IP lockout windows */
async function isLocked(email, ip) {
  const max = Number(settings.get('login_max_attempts')) || 5;
  const mins = Number(settings.get('login_lock_minutes')) || 15;
  const r = await db.one(`SELECT
      SUM(email=? AND success=0) AS by_email,
      SUM(ip=? AND success=0) AS by_ip
    FROM login_attempts WHERE created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE) AND (email=? OR ip=?)`, [email, ip, mins, email, ip]);
  return Number(r?.by_email || 0) >= max || Number(r?.by_ip || 0) >= max * 4;
}
async function recordAttempt(email, ip, success) {
  await db.q('INSERT INTO login_attempts (email, ip, success) VALUES (?,?,?)', [email.slice(0, 190), ip, success ? 1 : 0]);
  if (success) await db.q('DELETE FROM login_attempts WHERE email=? AND success=0', [email]);
}

const DEFAULT_CATEGORIES = [
  ['Salary', 'income', 'briefcase', '#16A34A'], ['Freelance', 'income', 'laptop', '#0EA5A0'], ['Business', 'income', 'store', '#2563EB'],
  ['Gift', 'income', 'gift', '#DB2777'], ['Interest', 'income', 'percent', '#7C3AED'], ['Other income', 'income', 'plus-circle', '#64748B'],
  ['Food & Dining', 'expense', 'utensils', '#F97316'], ['Transport', 'expense', 'car', '#3B82F6'], ['Shopping', 'expense', 'bag', '#EC4899'],
  ['Bills & Utilities', 'expense', 'bolt', '#EAB308'], ['Rent', 'expense', 'home', '#8B5CF6'], ['Health', 'expense', 'heart', '#EF4444'],
  ['Education', 'expense', 'book', '#0EA5E9'], ['Entertainment', 'expense', 'film', '#A855F7'], ['Mobile & Internet', 'expense', 'wifi', '#14B8A6'],
  ['Family', 'expense', 'users', '#F43F5E'], ['Travel', 'expense', 'plane', '#06B6D4'], ['Other expense', 'expense', 'dots', '#64748B'],
  ['Stocks', 'investment', 'trend-up', '#16A34A'], ['Savings / FDR', 'investment', 'vault', '#2563EB'], ['Crypto', 'investment', 'coin', '#F59E0B'],
  ['Gold', 'investment', 'gem', '#EAB308'], ['Business investment', 'investment', 'store', '#7C3AED'],
];

/** Create user + profile + starter data inside one DB transaction. */
async function createUser({ email, name, password = null, googleId = null, avatar = null, role = 'user', verified = false, language, currency, timezone, theme }) {
  const passwordHash = password ? await hashPassword(password) : null;
  return db.tx(async (t) => {
    const r = await t.q(`INSERT INTO users (uuid, email, name, password_hash, role, email_verified_at, google_id, avatar_url, password_changed_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, [uuid(), email, name, passwordHash, role, verified ? new Date() : null, googleId, avatar, passwordHash ? new Date() : null]);
    const id = r.insertId;
    await t.q('INSERT INTO user_profiles (user_id, language, currency, timezone, theme) VALUES (?,?,?,?,?)', [
      id, language || settings.get('default_language') || 'en', currency || settings.get('default_currency') || 'BDT',
      timezone || settings.get('default_timezone') || 'Asia/Dhaka', theme === 'dark' ? 'dark' : 'light']);
    const cur = currency || settings.get('default_currency') || 'BDT';
    await t.q('INSERT INTO accounts (user_id, name, type, currency, sort_order) VALUES (?,?,?,?,0),(?,?,?,?,1)', [id, 'Cash', 'cash', cur, id, 'bKash', 'bkash', cur]);
    const vals = []; const params = [];
    for (const [n, k, i, c] of DEFAULT_CATEGORIES) { vals.push('(?,?,?,?,?,?)'); params.push(id, n, n.toLowerCase().replace(/[^a-z]+/g, '-'), k, i, c); }
    await t.q(`INSERT INTO categories (user_id, name, slug, kind, icon, color) VALUES ${vals.join(',')}`, params);
    return id;
  });
}

async function createEmailVerification(userId) {
  const token = randomToken(32);
  await db.q('UPDATE email_verifications SET used_at=NOW() WHERE user_id=? AND used_at IS NULL', [userId]);
  await db.q('INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?,?, DATE_ADD(NOW(), INTERVAL 48 HOUR))', [userId, sha256(token)]);
  return token;
}

module.exports = { SID, hashPassword, verifyPassword, dummyVerify, createSession, upgradeSession, destroySession, revokeAllSessions, isLocked, recordAttempt, createUser, createEmailVerification, cookieOpts, deviceName };
