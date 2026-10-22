// AES-256-GCM encryption for KYC data at rest.
// Key: KYC_KEY (64 hex characters) if set, otherwise derived from JWT_SECRET.
// Changing JWT_SECRET without setting KYC_KEY makes old KYC data unreadable.
const crypto = require('crypto');
const config = require('../config');

const KEY = process.env.KYC_KEY && /^[0-9a-f]{64}$/i.test(process.env.KYC_KEY)
  ? Buffer.from(process.env.KYC_KEY, 'hex')
  : Buffer.from(crypto.hkdfSync('sha256', config.jwtSecret, 'oryzenx-kyc-salt', 'oryzenx-kyc-v1', 32));

function encrypt(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const out = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), out]);
}

function decrypt(blob) {
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
}

const encryptJson = (v) => encrypt(Buffer.from(JSON.stringify(v)));
const decryptJson = (b) => (b ? JSON.parse(decrypt(b).toString('utf8')) : null);

module.exports = { encrypt, decrypt, encryptJson, decryptJson };
