'use strict';
/**
 * Tiny declarative validator. Never trust client input: every API body goes
 * through a schema and only whitelisted, normalised fields reach the DB.
 */
const { err } = require('./http');

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,180}\.[^\s@]{2,}$/;
const AMOUNT_RE = /^\d{1,12}(\.\d{1,2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/;

const rules = {
  str: (v, o = {}) => {
    if (typeof v !== 'string') v = v === undefined || v === null ? '' : String(v);
    v = v.trim();
    if (o.max && v.length > o.max) throw 'too_long';
    if (o.min && v.length < o.min) throw o.min === 1 ? 'required' : 'too_short';
    if (o.pattern && v && !o.pattern.test(v)) throw 'invalid';
    return v;
  },
  email: (v) => {
    const s = String(v || '').trim().toLowerCase();
    if (!EMAIL_RE.test(s) || s.length > 190) throw 'invalid_email';
    return s;
  },
  password: (v) => {
    const s = String(v || '');
    if (s.length < 8) throw 'password_too_short';
    if (s.length > 200) throw 'too_long';
    if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) throw 'password_weak';
    return s;
  },
  /** Money: positive, max 2 decimals, returned as exact string */
  amount: (v, o = {}) => {
    let s = typeof v === 'number' ? v.toFixed(2) : String(v ?? '').trim().replace(/,/g, '');
    if (s.endsWith('.')) s = s.slice(0, -1);
    if (!AMOUNT_RE.test(s)) throw 'invalid_amount';
    const n = Number(s);
    if (!(n > 0) && !o.allowZero) throw 'invalid_amount';
    if (n > 999999999999) throw 'invalid_amount';
    return Number(s).toFixed(2);
  },
  signedAmount: (v) => {
    const s = String(v ?? '').trim();
    const neg = s.startsWith('-');
    const a = rules.amount(neg ? s.slice(1) : s, { allowZero: true });
    return neg ? '-' + a : a;
  },
  int: (v, o = {}) => {
    const n = Number(v);
    if (!Number.isInteger(n)) throw 'invalid';
    if (o.min !== undefined && n < o.min) throw 'invalid';
    if (o.max !== undefined && n > o.max) throw 'invalid';
    return n;
  },
  id: (v) => rules.int(v, { min: 1 }),
  bool: (v) => v === true || v === 1 || v === '1' || v === 'true' || v === 'on',
  enum: (v, o) => { if (!o.values.includes(v)) throw 'invalid'; return v; },
  date: (v) => { const s = String(v || '').slice(0, 10); if (!DATE_RE.test(s) || isNaN(Date.parse(s))) throw 'invalid_date'; return s; },
  datetime: (v) => {
    const s = String(v || '').replace('T', ' ');
    if (!DATETIME_RE.test(s) || isNaN(Date.parse(s.replace(' ', 'T')))) throw 'invalid_date';
    return s.length === 16 ? s + ':00' : s.slice(0, 19);
  },
  /** ISO-8601 instant from the browser (e.g. 2025-05-31T09:15:00.000Z) -> JS Date (UTC) */
  instant: (v) => {
    const d = new Date(String(v || ''));
    if (isNaN(d.getTime())) throw 'invalid_date';
    if (d.getUTCFullYear() < 1970 || d.getUTCFullYear() > 2200) throw 'invalid_date';
    return d;
  },
  color: (v) => { const s = String(v || ''); if (!/^#[0-9a-fA-F]{6}$/.test(s)) throw 'invalid'; return s; },
  currency: (v) => { const s = String(v || '').toUpperCase(); if (!/^[A-Z]{3}$/.test(s)) throw 'invalid'; return s; },
  tags: (v) => {
    const arr = Array.isArray(v) ? v : String(v || '').split(',');
    const tags = [...new Set(arr.map((t) => String(t).trim().toLowerCase().replace(/[^\p{L}\p{N}_-]/gu, '')).filter(Boolean))].slice(0, 10);
    return tags.join(',').slice(0, 255);
  },
};

/**
 * validate(body, { field: ['rule', opts?, {optional:true}] })
 * Unknown fields are dropped. Throws 422 with per-field codes.
 */
function validate(body, schema) {
  const out = {}; const errors = {};
  const src = body || {};
  for (const [field, spec] of Object.entries(schema)) {
    const [rule, opts = {}] = spec;
    const v = src[field];
    const empty = v === undefined || v === null || v === '';
    if (empty && opts.optional) { if ('default' in opts) out[field] = opts.default; else if (opts.nullable) out[field] = null; continue; }
    if (empty && rule !== 'bool' && rule !== 'str') { errors[field] = 'required'; continue; }
    try { out[field] = rules[rule](v, opts); } catch (e) { errors[field] = typeof e === 'string' ? e : 'invalid'; }
  }
  if (Object.keys(errors).length) throw err(422, 'validation_failed', 'Please check the highlighted fields', { fields: errors });
  return out;
}

module.exports = { validate, rules };
