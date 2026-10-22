// Time-based one-time codes (RFC 6238), compatible with Google Authenticator, Authy, Microsoft Authenticator.
const crypto = require('crypto');

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32(buf) {
  let bits = 0; let value = 0; let out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHA[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHA[(value << (5 - bits)) & 31];
  return out;
}

function fromBase32(s) {
  const clean = s.replace(/=+$/, '').toUpperCase();
  let bits = 0; let value = 0; const out = [];
  for (const c of clean) {
    const i = ALPHA.indexOf(c);
    if (i < 0) continue;
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function code(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', fromBase32(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

const newSecret = () => base32(crypto.randomBytes(20));

// Accepts the current code and one step either side (clock drift).
function verify(secret, input) {
  const c = String(input || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  const now = Math.floor(Date.now() / 30000);
  return [-1, 0, 1].some((d) => crypto.timingSafeEqual(Buffer.from(code(secret, now + d)), Buffer.from(c)));
}

const uri = (secret, email) => `otpauth://totp/${encodeURIComponent(`OryzenX BD:${email}`)}?secret=${secret}&issuer=${encodeURIComponent('OryzenX BD')}&algorithm=SHA1&digits=6&period=30`;

module.exports = { newSecret, verify, uri, code };
