'use strict';
// RFC 6238 TOTP (SHA1, 30s, 6 digits) — compatible with Google Authenticator, Authy, 1Password…
const crypto = require('crypto');
const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPH[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPH[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const s = str.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0, value = 0; const out = [];
  for (const ch of s) {
    const i = ALPH.indexOf(ch); if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1e6).padStart(6, '0');
}
const generateSecret = () => base32Encode(crypto.randomBytes(20));
/** Returns the matched time-step (to block replay) or -1 */
function verify(secret, token, window = 1) {
  const t = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(t)) return -1;
  const step = Math.floor(Date.now() / 30000);
  for (let w = -window; w <= window; w++) {
    const c = hotp(secret, step + w);
    if (crypto.timingSafeEqual(Buffer.from(c), Buffer.from(t))) return step + w;
  }
  return -1;
}
const uri = (secret, label, issuer) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

module.exports = { generateSecret, verify, uri, hotp };
