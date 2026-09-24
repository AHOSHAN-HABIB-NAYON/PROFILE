'use strict';
/**
 * Synchronizer-token CSRF protection. A random token lives in the session;
 * every state-changing request must echo it in the `X-CSRF-Token` header
 * (or `_csrf` body field for plain form posts).
 */
const { randomToken, safeEqual } = require('../utils/crypto');
const { E } = require('../utils/errors');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function ensureToken(req) {
  if (!req.session) return null;
  if (!req.session.csrfToken) req.session.csrfToken = randomToken(24);
  return req.session.csrfToken;
}

function csrfProtection(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const expected = req.session?.csrfToken;
  const sent = req.get('x-csrf-token') || req.body?._csrf;
  if (!expected || !sent || !safeEqual(expected, sent)) {
    return next(E.forbidden('Your session has expired. Please refresh the page and try again.', { code: 'CSRF' }));
  }
  next();
}

module.exports = { csrfProtection, ensureToken };
