'use strict';
const crypto = require('crypto');
const config = require('../config');

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const uuid = () => crypto.randomUUID();

function key() {
  const k = config.get().appKey;
  if (!k) throw new Error('APP_KEY missing');
  return crypto.createHash('sha256').update(k).digest(); // 32 bytes
}

/** AES-256-GCM encrypt for secrets at rest (TOTP secrets, SMTP password, service keys). */
function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return '';
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64');
}
function decrypt(blob) {
  if (!blob) return '';
  if (!String(blob).startsWith('v1:')) return '';
  const raw = Buffer.from(blob.slice(3), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** 6-digit numeric code */
const numericCode = (len = 6) => String(crypto.randomInt(0, 10 ** len)).padStart(len, '0');

module.exports = { randomToken, sha256, uuid, encrypt, decrypt, safeEqual, numericCode };
