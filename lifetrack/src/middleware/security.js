'use strict';
const db = require('../db');
const { sha256, randomToken, safeEqual } = require('../lib/crypto');
const { err } = require('../lib/http');
const auth = require('../services/auth');
const settings = require('../services/settings');

/** Loads the session (if any) from the HttpOnly cookie. Never trusts client-sent user ids. */
async function loadSession(req, res, next) {
  req.user = null; req.session = null;
  const token = req.cookies[auth.SID];
  if (!token || token.length > 100) return next();
  try {
    const s = await db.one(`SELECT s.*, u.id AS uid, u.uuid, u.email, u.name, u.role, u.status, u.email_verified_at, u.avatar_url, u.password_hash IS NOT NULL AS has_password
      FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at > NOW() AND u.deleted_at IS NULL`, [sha256(token)]);
    if (!s) { res.clearCookie(auth.SID, { path: '/' }); return next(); }
    if (s.status !== 'active') { await db.q('UPDATE sessions SET revoked_at=NOW() WHERE id=?', [s.id]); res.clearCookie(auth.SID, { path: '/' }); return next(); }
    req.session = s;
    req.user = { id: s.uid, uuid: s.uuid, email: s.email, name: s.name, role: s.role, verified: !!s.email_verified_at, avatar: s.avatar_url, hasPassword: !!s.has_password, mfaPending: !!s.mfa_pending };
    if (Date.now() - new Date(s.last_seen_at).getTime() > 5 * 60e3) {
      db.q('UPDATE sessions SET last_seen_at=NOW() WHERE id=?', [s.id]).catch(() => {});
    }
  } catch (e) { return next(e); }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return next(err(401, 'unauthenticated', 'Please sign in'));
  if (req.user.mfaPending) return next(err(401, 'mfa_required', 'Two-step verification required'));
  if (settings.bool('email_verification_required') && !req.user.verified && !req.path.startsWith('/me')) {
    return next(err(403, 'email_unverified', 'Please verify your email address'));
  }
  next();
}

/** Double-submit CSRF token + Origin check for every state-changing request. */
function csrf(req, res, next) {
  let token = req.cookies.lt_csrf;
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    token = randomToken(24);
    res.cookie('lt_csrf', token, { httpOnly: false, sameSite: 'lax', secure: req.secure, path: '/' });
    req.cookies.lt_csrf = token;
  }
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    const host = req.get('host');
    try { if (new URL(origin).host !== host) return next(err(403, 'bad_origin', 'Cross-site request blocked')); } catch { return next(err(403, 'bad_origin', 'Cross-site request blocked')); }
  }
  const header = req.get('x-csrf-token') || '';
  if (!header || !safeEqual(header, token)) return next(err(403, 'csrf_failed', 'Security token expired — please retry'));
  next();
}

/** Role based access control for the admin API */
const PERMISSIONS = {
  support: ['stats.view', 'users.view', 'tx.view', 'logs.security', 'emails.view', 'notifications.user'],
  admin: ['stats.view', 'users.view', 'users.manage', 'tx.view', 'logs.security', 'logs.audit', 'emails.view', 'emails.manage', 'notifications.user',
    'notifications.broadcast', 'categories.manage', 'translations.manage', 'content.manage', 'branding.manage', 'seo.manage', 'pwa.manage'],
  super_admin: ['*'],
};
const can = (role, perm) => { const p = PERMISSIONS[role] || []; return p.includes('*') || p.includes(perm); };
const requirePerm = (perm) => (req, res, next) => {
  if (!req.user || req.user.mfaPending) return next(err(401, 'unauthenticated', 'Please sign in'));
  if (!can(req.user.role, perm)) return next(err(403, 'forbidden', 'You do not have permission for this action'));
  next();
};
const requireStaff = (req, res, next) => {
  if (!req.user || req.user.mfaPending) return next(err(401, 'unauthenticated', 'Please sign in'));
  if (!['support', 'admin', 'super_admin'].includes(req.user.role)) return next(err(403, 'forbidden', 'Admin access only'));
  next();
};

module.exports = { loadSession, requireAuth, csrf, requirePerm, requireStaff, can, PERMISSIONS };
