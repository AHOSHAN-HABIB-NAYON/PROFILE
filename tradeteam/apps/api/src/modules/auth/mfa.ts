import { exec, one, query, tx } from '../../infrastructure/db';
import { decrypt, encrypt, randomToken, sha256 } from '../../infrastructure/crypto';
import { redis } from '../../infrastructure/redis';
import { generateSecret, verifyTotp, otpauthUrl } from './totp';
import { getSetting } from '../settings/settings.service';
import type { PrincipalType } from './principal';
import crypto from 'node:crypto';

const aad = (pt: PrincipalType, pid: number) => `totp:${pt}:${pid}`;

export async function totpStatus(pt: PrincipalType, pid: number) {
  const r = await one<{ enabled_at: Date | null }>(
    'SELECT enabled_at FROM two_factor_auth WHERE principal_type = ? AND principal_id = ?',
    [pt, pid],
  );
  const codes = await one<{ n: number }>(
    'SELECT COUNT(*) AS n FROM backup_codes WHERE principal_type = ? AND principal_id = ? AND used_at IS NULL',
    [pt, pid],
  );
  return {
    enabled: Boolean(r?.enabled_at),
    enabledAt: r?.enabled_at ?? null,
    backupCodesRemaining: Number(codes?.n ?? 0),
  };
}

/** Starts enrolment: stores an encrypted, not-yet-enabled secret and returns the otpauth URL. */
export async function beginTotp(pt: PrincipalType, pid: number, account: string) {
  const current = await totpStatus(pt, pid);
  if (current.enabled) throw new Error('2FA is already enabled');
  const secret = generateSecret();
  await exec(
    `INSERT INTO two_factor_auth (principal_type, principal_id, secret_enc, enabled_at, last_used_step) VALUES (?,?,?,NULL,0)
     ON DUPLICATE KEY UPDATE secret_enc = VALUES(secret_enc), enabled_at = NULL, last_used_step = 0`,
    [pt, pid, encrypt(secret, aad(pt, pid))],
  );
  return { secret, otpauthUrl: otpauthUrl(secret, account, getSetting('site.name')) };
}

export async function confirmTotp(pt: PrincipalType, pid: number, code: string): Promise<string[] | null> {
  const row = await one<{ secret_enc: string; enabled_at: Date | null }>(
    'SELECT secret_enc, enabled_at FROM two_factor_auth WHERE principal_type = ? AND principal_id = ?',
    [pt, pid],
  );
  if (!row || row.enabled_at) return null;
  const step = verifyTotp(decrypt(row.secret_enc, aad(pt, pid)), code);
  if (step === null) return null;
  const codes = await tx(async (c) => {
    await exec(
      'UPDATE two_factor_auth SET enabled_at = NOW(3), last_used_step = ? WHERE principal_type = ? AND principal_id = ?',
      [step, pt, pid],
      c,
    );
    return regenerateBackupCodes(pt, pid, c);
  });
  return codes;
}

export async function disableTotp(pt: PrincipalType, pid: number) {
  await exec('DELETE FROM two_factor_auth WHERE principal_type = ? AND principal_id = ?', [pt, pid]);
  await exec('DELETE FROM backup_codes WHERE principal_type = ? AND principal_id = ?', [pt, pid]);
}

/** Verifies a TOTP code with replay protection (atomic step advance). */
export async function checkTotp(pt: PrincipalType, pid: number, code: string): Promise<boolean> {
  const row = await one<{ secret_enc: string; enabled_at: Date | null; last_used_step: string }>(
    'SELECT secret_enc, enabled_at, last_used_step FROM two_factor_auth WHERE principal_type = ? AND principal_id = ?',
    [pt, pid],
  );
  if (!row?.enabled_at) return false;
  const step = verifyTotp(decrypt(row.secret_enc, aad(pt, pid)), code, Number(row.last_used_step));
  if (step === null) return false;
  const r = await exec(
    'UPDATE two_factor_auth SET last_used_step = ? WHERE principal_type = ? AND principal_id = ? AND last_used_step < ?',
    [step, pt, pid, step],
  );
  return r.affectedRows === 1;
}

type Conn = Parameters<typeof exec>[2];
export async function regenerateBackupCodes(pt: PrincipalType, pid: number, c?: Conn): Promise<string[]> {
  const codes = Array.from({ length: 10 }, () => {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  await exec('DELETE FROM backup_codes WHERE principal_type = ? AND principal_id = ?', [pt, pid], c);
  for (const code of codes) {
    await exec(
      'INSERT INTO backup_codes (principal_type, principal_id, code_hash) VALUES (?,?,?)',
      [pt, pid, sha256(code)],
      c,
    );
  }
  return codes;
}

export async function useBackupCode(pt: PrincipalType, pid: number, code: string): Promise<boolean> {
  const normalized = code.trim().toUpperCase().replace(/\s/g, '');
  const withDash = normalized.includes('-') ? normalized : `${normalized.slice(0, 5)}-${normalized.slice(5)}`;
  const r = await exec(
    'UPDATE backup_codes SET used_at = NOW(3) WHERE principal_type = ? AND principal_id = ? AND code_hash = ? AND used_at IS NULL LIMIT 1',
    [pt, pid, sha256(withDash)],
  );
  return r.affectedRows === 1;
}

export async function passkeyCount(pt: PrincipalType, pid: number) {
  const r = await one<{ n: number }>(
    'SELECT COUNT(*) AS n FROM passkeys WHERE principal_type = ? AND principal_id = ?',
    [pt, pid],
  );
  return Number(r?.n ?? 0);
}

/** Pending second-factor challenge after a correct first factor. Stored in Redis, 5 minutes. */
export interface MfaChallenge {
  pt: PrincipalType;
  pid: number;
  method: string;
  attempts: number;
}

export async function createMfaChallenge(pt: PrincipalType, pid: number, method: string) {
  const token = randomToken(24);
  await redis().set(`mfa:${sha256(token)}`, JSON.stringify({ pt, pid, method, attempts: 0 }), 'EX', 300);
  return token;
}

export async function getMfaChallenge(token: string): Promise<MfaChallenge | null> {
  const v = await redis().get(`mfa:${sha256(token)}`);
  return v ? (JSON.parse(v) as MfaChallenge) : null;
}

export async function bumpMfaChallenge(token: string, c: MfaChallenge) {
  c.attempts += 1;
  if (c.attempts >= 5) await redis().del(`mfa:${sha256(token)}`);
  else await redis().set(`mfa:${sha256(token)}`, JSON.stringify(c), 'KEEPTTL');
}

export async function consumeMfaChallenge(token: string) {
  await redis().del(`mfa:${sha256(token)}`);
}

export async function methodsFor(pt: PrincipalType, pid: number) {
  const t = await totpStatus(pt, pid);
  const pk = await passkeyCount(pt, pid);
  return { totp: t.enabled, backupCode: t.backupCodesRemaining > 0, passkey: pk > 0 };
}

export async function listPasskeys(pt: PrincipalType, pid: number) {
  return query<{
    id: number;
    name: string;
    device_type: string | null;
    backed_up: number;
    device_info: string | null;
    last_used_at: Date | null;
    created_at: Date;
  }>(
    'SELECT id, name, device_type, backed_up, device_info, last_used_at, created_at FROM passkeys WHERE principal_type = ? AND principal_id = ? ORDER BY created_at DESC',
    [pt, pid],
  );
}
