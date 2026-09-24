'use strict';
/** TOTP 2FA (RFC 6238) via otplib + one-time recovery codes. */
const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const db = require('../config/database');
const { encrypt, decrypt, sha256 } = require('../utils/crypto');

authenticator.options = { window: 1, step: 30, digits: 6 };

async function row(userId) {
  return db.one('SELECT * FROM two_factor_auth WHERE user_id = ?', [userId]);
}

async function isEnabled(userId) {
  const r = await row(userId);
  return !!r?.enabled;
}

async function beginSetup(user, issuer) {
  const secret = authenticator.generateSecret(20);
  await db.run(
    `INSERT INTO two_factor_auth (user_id, secret_encrypted, enabled) VALUES (?,?,0)
     ON DUPLICATE KEY UPDATE secret_encrypted = IF(enabled = 1, secret_encrypted, VALUES(secret_encrypted))`,
    [user.id, encrypt(secret)],
  );
  const r = await row(user.id);
  if (r.enabled) return { alreadyEnabled: true };
  const otpauth = authenticator.keyuri(user.email, issuer, secret);
  const qr = await QRCode.toDataURL(otpauth, { margin: 1, width: 220 });
  return { secret, qr, otpauth };
}

function generateRecoveryCodes() {
  return Array.from({ length: 8 }, () => {
    const s = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

function verifyToken(secret, token) {
  const t = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(t)) return false;
  try { return authenticator.check(t, secret); } catch { return false; }
}

async function confirm(userId, token) {
  const r = await row(userId);
  if (!r) return { ok: false };
  if (!verifyToken(decrypt(r.secret_encrypted), token)) return { ok: false };
  const codes = generateRecoveryCodes();
  await db.run('UPDATE two_factor_auth SET enabled = 1, confirmed_at = UTC_TIMESTAMP(), recovery_codes = ? WHERE user_id = ?',
    [JSON.stringify(codes.map((c) => sha256(c))), userId]);
  return { ok: true, recoveryCodes: codes };
}

/** Verify a login code: TOTP (replay-protected) or a one-time recovery code. */
async function verifyLogin(userId, input) {
  const r = await row(userId);
  if (!r?.enabled) return { ok: true };
  const code = String(input || '').trim().toUpperCase();
  if (/^\d{6}$/.test(code)) {
    const secret = decrypt(r.secret_encrypted);
    if (!verifyToken(secret, code)) return { ok: false };
    const step = Math.floor(Date.now() / 30000);
    // The same 30-second step may not be used twice (replay protection).
    if (r.last_used_step && Number(r.last_used_step) === step) return { ok: false, replay: true };
    await db.run('UPDATE two_factor_auth SET last_used_step = ? WHERE user_id = ?', [step, userId]);
    return { ok: true };
  }
  const hashes = (typeof r.recovery_codes === 'string' ? JSON.parse(r.recovery_codes) : r.recovery_codes) || [];
  const h = sha256(code);
  const idx = hashes.indexOf(h);
  if (idx === -1) return { ok: false };
  hashes.splice(idx, 1);
  await db.run('UPDATE two_factor_auth SET recovery_codes = ? WHERE user_id = ?', [JSON.stringify(hashes), userId]);
  return { ok: true, usedRecovery: true, remaining: hashes.length };
}

async function disable(userId) {
  await db.run('DELETE FROM two_factor_auth WHERE user_id = ?', [userId]);
}

async function regenerateCodes(userId) {
  const codes = generateRecoveryCodes();
  await db.run('UPDATE two_factor_auth SET recovery_codes = ? WHERE user_id = ? AND enabled = 1', [JSON.stringify(codes.map((c) => sha256(c))), userId]);
  return codes;
}

async function remainingCodes(userId) {
  const r = await row(userId);
  if (!r?.recovery_codes) return 0;
  const list = typeof r.recovery_codes === 'string' ? JSON.parse(r.recovery_codes) : r.recovery_codes;
  return list.length;
}

module.exports = { isEnabled, beginSetup, confirm, verifyLogin, disable, regenerateCodes, remainingCodes, verifyToken, authenticator };
