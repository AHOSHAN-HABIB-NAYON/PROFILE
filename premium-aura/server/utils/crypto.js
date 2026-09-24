'use strict';
/**
 * Symmetric encryption for secrets at rest (API credentials, SMTP password,
 * TOTP secrets) using AES-256-GCM with a key derived from ENCRYPTION_KEY.
 */
const crypto = require('crypto');
const config = require('../config/env');

function key() {
  if (!config.encryptionKey) throw new Error('ENCRYPTION_KEY / SESSION_SECRET is not configured');
  return crypto.createHash('sha256').update(`aura-enc:${config.encryptionKey}`).digest();
}

function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(payload) {
  if (!payload) return null;
  const [v, ivB, tagB, dataB] = String(payload).split(':');
  if (v !== 'v1') throw new Error('Unknown ciphertext version');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
}

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

module.exports = { encrypt, decrypt, sha256, randomToken, safeEqual };
