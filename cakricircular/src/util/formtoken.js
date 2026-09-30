'use strict';
/** Stateless, signed form tokens for public/cached forms (report, login). */
const crypto = require('crypto');
const config = require('../config');

function sign(ts) { return crypto.createHmac('sha256', config.get().secret).update(`ft:${ts}`).digest('hex').slice(0, 24); }
function create() { const ts = Date.now().toString(36); return `${ts}.${sign(ts)}`; }
function verify(t, { minAgeMs = 0, maxAgeMs = 2 * 86400000 } = {}) {
  const [ts, sig] = String(t || '').split('.');
  if (!ts || !sig || sig.length !== 24) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sign(ts)), Buffer.from(sig))) return false;
  const age = Date.now() - parseInt(ts, 36);
  return age >= minAgeMs && age < maxAgeMs;
}
module.exports = { create, verify };
