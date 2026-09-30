'use strict';
const db = require('../db');
const settings = require('../settings');
const { token, parseCookies, clientIp, safeEqual } = require('../util/security');

const COOKIE = 'cc_admin';
const TTL_DAYS = 14;

const PERMISSIONS = {
  posts: 'পোস্ট', categories: 'ক্যাটাগরি', banners: 'ব্যানার', ads: 'বিজ্ঞাপন', notices: 'নোটিশ', reports: 'রিপোর্ট',
  analytics: 'অ্যানালিটিক্স', automation: 'অটোমেশন', pages: 'পেজ ও টিম', subscribers: 'সাবস্ক্রাইবার', users: 'ইউজার', settings: 'সেটিংস',
};
const ROLES = { admin: 'এডমিন', admin2: '২য় এডমিন', moderator: 'মডারেটর' };

const memo = new Map();

async function loadSession(req) {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (!sid || !/^[a-f0-9]{64}$/.test(sid)) return null;
  const hit = memo.get(sid);
  if (hit && hit.exp > Date.now()) return hit.value;
  const row = await db.one(
    `SELECT s.id AS sid, s.csrf, u.id, u.username, u.email, u.name, u.role, u.permissions, u.avatar
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > NOW() AND u.active = 1`, [sid],
  );
  const value = row ? { ...row, perms: parsePerms(row) } : null;
  memo.set(sid, { value, exp: Date.now() + 30000 });
  if (memo.size > 500) memo.clear();
  return value;
}

function parsePerms(u) {
  if (u.role === 'admin') return new Set(Object.keys(PERMISSIONS));
  if (u.role === 'admin2') return new Set(Object.keys(PERMISSIONS).filter((p) => p !== 'users'));
  try { return new Set(JSON.parse(u.permissions || '[]')); } catch (_) { return new Set(); }
}

function isSecure(req) { return req.secure || String(req.headers['x-forwarded-proto'] || '').startsWith('https'); }

function cookie(req, value, maxAge) {
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (isSecure(req)) parts.push('Secure');
  return parts.join('; ');
}

async function createSession(req, res, userId) {
  const sid = token(32);
  await db.insert('sessions', {
    id: sid, user_id: userId, csrf: token(32), ip: clientIp(req).slice(0, 64), ua: String(req.headers['user-agent'] || '').slice(0, 255),
    expires_at: new Date(Date.now() + TTL_DAYS * 86400000),
  });
  await db.query('UPDATE users SET last_login = NOW() WHERE id = ?', [userId]);
  res.setHeader('Set-Cookie', cookie(req, sid, TTL_DAYS * 86400));
}
async function destroySession(req, res) {
  const sid = parseCookies(req.headers.cookie)[COOKIE];
  if (sid) { await db.query('DELETE FROM sessions WHERE id = ?', [sid]); memo.delete(sid); }
  res.setHeader('Set-Cookie', cookie(req, '', 0));
}
function forgetUser(userId) {
  for (const [k, v] of memo) if (v.value && v.value.id === userId) memo.delete(k);
}

/* ----- login rate limit (persisted so restarts don't reset it) ----- */
async function loginAllowed(ip) {
  const row = await db.one('SELECT attempts, locked_until FROM login_attempts WHERE ip = ?', [ip]);
  if (row && row.locked_until && new Date(row.locked_until) > new Date()) {
    return { ok: false, wait: Math.ceil((new Date(row.locked_until) - Date.now()) / 60000) };
  }
  return { ok: true };
}
async function loginFailed(ip) {
  await db.query(
    `INSERT INTO login_attempts (ip, attempts, updated_at) VALUES (?, 1, NOW())
     ON DUPLICATE KEY UPDATE attempts = IF(updated_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE), 1, attempts + 1), updated_at = NOW()`, [ip],
  );
  const row = await db.one('SELECT attempts FROM login_attempts WHERE ip = ?', [ip]);
  if (row && row.attempts >= 5) {
    const mins = Math.min(60, 5 * 2 ** Math.floor((row.attempts - 5) / 5));
    await db.query('UPDATE login_attempts SET locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE ip = ?', [mins, ip]);
    return mins;
  }
  return 0;
}
async function loginSucceeded(ip) { await db.query('DELETE FROM login_attempts WHERE ip = ?', [ip]); }

/* ----- middleware ----- */
function requireAuth(req, res, next) {
  if (req.admin) return next();
  const base = settings.adminPath();
  if (req.method === 'GET' && !req.xhr) return res.redirect(`${base}/login?next=${encodeURIComponent(req.originalUrl)}`);
  return res.status(401).json({ ok: false, error: 'সেশন শেষ হয়ে গেছে, আবার লগইন করুন।' });
}
function can(perm) {
  return (req, res, next) => {
    if (req.admin && req.admin.perms.has(perm)) return next();
    if (req.method === 'GET') return res.status(403).send(require('../views/admin/layout').denied(req));
    return res.status(403).json({ ok: false, error: 'এই কাজের অনুমতি আপনার নেই।' });
  };
}
function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const t = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  if (req.admin && safeEqual(t, req.admin.csrf)) return next();
  return res.status(403).json({ ok: false, error: 'নিরাপত্তা টোকেন মেলেনি — পেজ রিফ্রেশ করে আবার চেষ্টা করুন।' });
}

module.exports = {
  loadSession, createSession, destroySession, forgetUser, loginAllowed, loginFailed, loginSucceeded,
  requireAuth, can, csrf, PERMISSIONS, ROLES, COOKIE,
};
