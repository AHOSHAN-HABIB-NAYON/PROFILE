'use strict';
/** HTTP-level rate limiters (per IP). Business limits live in services/quota.js. */
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const json = (message) => (req, res) => res.status(429).json({ ok: false, error: message });

const apiLimiter = rateLimit({
  windowMs: 60_000, limit: 600, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: json('Too many requests — please slow down'),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: json('Too many authentication attempts. Try again in a few minutes.'),
});

// Keyed by IP + email so one attacker cannot lock every account from one IP and vice-versa.
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.email || '').toLowerCase()}`,
  handler: json('Too many login attempts. Please wait 15 minutes and try again.'),
});

// Google sign-in redirects (browser navigations, so failures redirect back to /login).
const oauthLimiter = rateLimit({
  windowMs: 15 * 60_000, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => res.redirect('/login?google=busy'),
});

// Per signed-in user (falls back to IP) — payments, withdrawals, password & 2FA changes.
const sensitiveLimiter = rateLimit({
  windowMs: 60 * 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => (req.session?.userId ? `u:${req.session.userId}` : ipKeyGenerator(req.ip)),
  handler: json('Too many attempts. Please try again later.'),
});

module.exports = { apiLimiter, authLimiter, oauthLimiter, loginLimiter, sensitiveLimiter };
