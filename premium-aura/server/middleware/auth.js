'use strict';
const db = require('../config/database');
const { E } = require('../utils/errors');

const ACTIVE_TOUCH_MS = 60_000;

/** Attach req.user when a valid session exists. */
async function loadUser(req, res, next) {
  try {
    const uid = req.session?.userId;
    if (!uid || !db.isReady()) return next();
    const user = await db.one(
      `SELECT id, name, email, role, status, email_verified_at, theme, timezone, created_at, address, binance_uid
       FROM users WHERE id = ?`, [uid],
    );
    if (!user || user.status === 'suspended') {
      req.session.userId = null;
      return next();
    }
    req.user = user;
    const now = Date.now();
    if (!req.session.lastSeen || now - req.session.lastSeen > ACTIVE_TOUCH_MS) {
      req.session.lastSeen = now;
      db.run('UPDATE users SET last_active_at = UTC_TIMESTAMP() WHERE id = ?', [uid]).catch(() => {});
    }
    next();
  } catch (err) { next(err); }
}

function requireAuth(req, res, next) {
  if (!req.user) return next(E.unauthorized());
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return next(E.unauthorized());
  if (req.user.role !== 'admin') return next(E.forbidden('Administrator access required'));
  next();
}

module.exports = { loadUser, requireAuth, requireAdmin };
