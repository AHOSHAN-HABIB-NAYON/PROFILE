'use strict';
/** Small, dependency-free input validation helpers. */
const { E } = require('./errors');

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,189}\.[A-Za-z]{2,24}$/;

function str(v, { name = 'value', min = 0, max = 255, required = false, trim = true, pattern } = {}) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') throw E.badRequest(`${name} is invalid`);
  let s = String(v);
  if (trim) s = s.trim();
  if (required && !s) throw E.badRequest(`${name} is required`);
  if (s && s.length < min) throw E.badRequest(`${name} must be at least ${min} characters`);
  if (s.length > max) throw E.badRequest(`${name} must be at most ${max} characters`);
  if (s && pattern && !pattern.test(s)) throw E.badRequest(`${name} is invalid`);
  return s;
}

function email(v, { required = true } = {}) {
  const s = str(v, { name: 'Email', max: 190, required }).toLowerCase();
  if (s && !EMAIL_RE.test(s)) throw E.badRequest('Please enter a valid email address');
  return s;
}

function password(v, { name = 'Password' } = {}) {
  const s = str(v, { name, min: 8, max: 128, required: true, trim: false });
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) throw E.badRequest(`${name} must contain letters and numbers`);
  return s;
}

function int(v, { name = 'value', min = -Infinity, max = Infinity, def } = {}) {
  if ((v === undefined || v === null || v === '') && def !== undefined) return def;
  const n = Number(v);
  if (!Number.isInteger(n)) throw E.badRequest(`${name} must be a whole number`);
  if (n < min || n > max) throw E.badRequest(`${name} must be between ${min} and ${max}`);
  return n;
}

function oneOf(v, list, { name = 'value', def } = {}) {
  if ((v === undefined || v === null || v === '') && def !== undefined) return def;
  if (!list.includes(v)) throw E.badRequest(`${name} is invalid`);
  return v;
}

function bool(v) {
  return v === true || v === 1 || v === '1' || v === 'true' || v === 'on';
}

function id(v, name = 'id') {
  return int(v, { name, min: 1, max: Number.MAX_SAFE_INTEGER });
}

function color(v, def) {
  const s = String(v || '').trim();
  if (!s) return def;
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw E.badRequest('Colors must be hex values like #2563eb');
  return s.toLowerCase();
}

function url(v, { name = 'URL', required = false, allowRelative = true } = {}) {
  const s = str(v, { name, max: 500, required });
  if (!s) return s;
  if (allowRelative && s.startsWith('/') && !s.startsWith('//')) return s;
  try {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
    return u.toString();
  } catch {
    throw E.badRequest(`${name} must be a valid http(s) URL`);
  }
}

function json(v, { name = 'JSON', def = null } = {}) {
  if (v === undefined || v === null || v === '') return def;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { throw E.badRequest(`${name} must be valid JSON`); }
}

module.exports = { str, email, password, int, oneOf, bool, id, color, url, json, EMAIL_RE };
