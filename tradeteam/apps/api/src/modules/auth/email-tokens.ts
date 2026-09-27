import { exec, one } from '../../infrastructure/db';
import { numericCode, randomToken, safeEqual, sha256 } from '../../infrastructure/crypto';

export type EmailPurpose = 'verify_email' | 'reset_password' | 'email_otp' | 'withdrawal';

/**
 * Single-use email tokens. Each issue invalidates earlier unused tokens of the same purpose.
 * Both a 6-digit code (typed in-app) and a long link token (clicked in the email) are supported;
 * only their SHA-256 hashes are stored. Codes allow at most 5 attempts.
 */
export async function issueEmailToken(userId: number, purpose: EmailPurpose, ttlMinutes: number) {
  const code = numericCode(6);
  const token = randomToken(32);
  await exec(
    'UPDATE email_tokens SET used_at = NOW(3) WHERE user_id = ? AND purpose = ? AND used_at IS NULL',
    [userId, purpose],
  );
  await exec(
    'INSERT INTO email_tokens (user_id, purpose, token_hash, code_hash, expires_at) VALUES (?,?,?,?,?)',
    [userId, purpose, sha256(token), sha256(`${userId}:${code}`), new Date(Date.now() + ttlMinutes * 60_000)],
  );
  return { code, token };
}

export async function consumeEmailCode(
  userId: number,
  purpose: EmailPurpose,
  code: string,
): Promise<boolean> {
  const row = await one<{ id: number; code_hash: string; attempts: number }>(
    'SELECT id, code_hash, attempts FROM email_tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL AND expires_at > NOW(3) ORDER BY id DESC LIMIT 1',
    [userId, purpose],
  );
  if (!row) return false;
  if (row.attempts >= 5) {
    await exec('UPDATE email_tokens SET used_at = NOW(3) WHERE id = ?', [row.id]);
    return false;
  }
  if (!safeEqual(row.code_hash, sha256(`${userId}:${code}`))) {
    await exec('UPDATE email_tokens SET attempts = attempts + 1 WHERE id = ?', [row.id]);
    return false;
  }
  const r = await exec('UPDATE email_tokens SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL', [row.id]);
  return r.affectedRows === 1;
}

export async function consumeEmailLink(token: string, purpose: EmailPurpose): Promise<number | null> {
  const row = await one<{ id: number; user_id: number }>(
    'SELECT id, user_id FROM email_tokens WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > NOW(3)',
    [sha256(token), purpose],
  );
  if (!row) return null;
  const r = await exec('UPDATE email_tokens SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL', [row.id]);
  return r.affectedRows === 1 ? Number(row.user_id) : null;
}
