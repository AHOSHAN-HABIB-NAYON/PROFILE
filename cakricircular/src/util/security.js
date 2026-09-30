'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function token(bytes = 32) { return crypto.randomBytes(bytes).toString('hex'); }
function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

/** Supports legacy PHP password_hash() output ($2y$) as well as $2a$/$2b$. */
async function verifyPassword(plain, hash) {
  if (!hash || !plain) return false;
  const h = String(hash).replace(/^\$2y\$/, '$2a$');
  try { return await bcrypt.compare(String(plain), h); } catch (_) { return false; }
}
function hashPassword(plain) { return bcrypt.hash(String(plain), 11); }

function safeEqual(a, b) {
  const A = Buffer.from(String(a || '')); const B = Buffer.from(String(b || ''));
  return A.length === B.length && A.length > 0 && crypto.timingSafeEqual(A, B);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k || out[k] !== undefined) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (_) { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}

function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return String(cf);
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '';
}

/** Fixed-window in-memory rate limiter (single process ⇒ accurate). */
const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.count++;
  if (buckets.size > 20000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  return { ok: b.count <= limit, remaining: Math.max(0, limit - b.count), retryAfter: Math.ceil((b.reset - now) / 1000) };
}

module.exports = { token, sha256, verifyPassword, hashPassword, safeEqual, parseCookies, clientIp, rateLimit };
