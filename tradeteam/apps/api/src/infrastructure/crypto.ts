import crypto from 'node:crypto';

/**
 * AES-256-GCM envelope for sensitive values at rest (TOTP secrets, SMTP password, OAuth secrets,
 * exchange API keys). Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
let KEY: Buffer | null = null;

export function setEncryptionKey(b64: string) {
  const k = Buffer.from(b64, 'base64');
  if (k.length !== 32) throw new Error('Encryption key must be 32 bytes');
  KEY = k;
}

function key(): Buffer {
  if (!KEY) throw new Error('Encryption key not initialised');
  return KEY;
}

export function encrypt(plain: string, aad = ''): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  if (aad) c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    c.getAuthTag().toString('base64url'),
    ct.toString('base64url'),
  ].join('.');
}

export function decrypt(payload: string, aad = ''): string {
  const [v, iv, tag, ct] = payload.split('.');
  if (v !== 'v1' || !iv || !tag || ct === undefined) throw new Error('Malformed ciphertext');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  if (aad) d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(v: string | Buffer): string {
  return crypto.createHash('sha256').update(v).digest('hex');
}

export function hmac(secret: string, v: string): string {
  return crypto.createHmac('sha256', secret).update(v).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Uniform random numeric code (no modulo bias). */
export function numericCode(digits = 6): string {
  let out = '';
  for (let i = 0; i < digits; i++) out += crypto.randomInt(0, 10).toString();
  return out;
}
