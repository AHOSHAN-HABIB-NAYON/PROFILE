const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const bad = (msg) => new HttpError(400, msg);

// Wrap async route handlers so thrown errors reach the error middleware.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(v, { field, max = 255, required = false, min = 0 } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${field} is required`);
    return null;
  }
  const s = String(v).trim();
  if (s.length < min) throw bad(`${field} must be at least ${min} characters`);
  if (s.length > max) throw bad(`${field} must be at most ${max} characters`);
  return s;
}

function num(v, { field, required = false, min = -Infinity, max = Infinity } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`${field} is required`);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${field} must be a valid number`);
  return n;
}

function date(v, { field, required = false } = {}) {
  if (!v) { if (required) throw bad(`${field} is required`); return null; }
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw bad(`${field} must be a date (YYYY-MM-DD)`);
  return s;
}

function datetime(v, { field, required = false } = {}) {
  if (!v) { if (required) throw bad(`${field} is required`); return null; }
  const s = String(v).trim().replace('T', ' ');
  if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(s)) throw bad(`${field} must be a date and time`);
  return s.length === 10 ? `${s} 00:00:00` : s.length === 16 ? `${s}:00` : s;
}

function coin(v, field = 'Coin') {
  const s = str(v, { field, max: 20, required: true }).toUpperCase();
  if (!/^[A-Z0-9]{2,15}$/.test(s)) throw bad(`${field} must be a ticker like BTC or SOL`);
  return s;
}

function oneOf(v, list, field) {
  if (!list.includes(v)) throw bad(`${field} must be one of: ${list.join(', ')}`);
  return v;
}

function month(v, field = 'Month') {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''))) throw bad(`${field} must look like 2026-11`);
  return v;
}

function page(req, defLimit = 25) {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || defLimit));
  const p = Math.max(1, Number(req.query.page) || 1);
  return { limit, offset: (p - 1) * limit, page: p };
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const money = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

module.exports = {
  HttpError, bad, ah, sha256, randomToken, EMAIL_RE, str, num, date, datetime, coin, oneOf, month, page, escapeHtml, money,
};
