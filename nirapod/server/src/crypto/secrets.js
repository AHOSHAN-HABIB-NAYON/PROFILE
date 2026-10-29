// Secrets at rest (OpenAI key, FCM service account, Play service account, redeem codes): AES-256-GCM with a
// key derived from MASTER_KEY. Format: v1:<iv b64>:<tag b64>:<ciphertext b64>. Never logged.
import crypto from 'node:crypto';

const keyOf = (master) => crypto.createHash('sha256').update(`nirapod-secrets:${master}`).digest();

export function encryptSecret(master, plain) {
  if (!master) throw new Error('MASTER_KEY is not set');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyOf(master), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(master, stored) {
  if (!stored || !master) return null;
  const [v, iv, tag, data] = String(stored).split(':');
  if (v !== 'v1') return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', keyOf(master), Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** "sk-…abcd" style mask for the admin UI. */
export const maskSecret = (s) => (!s ? null : s.length <= 8 ? '••••' : `${s.slice(0, 3)}…${s.slice(-4)}`);
