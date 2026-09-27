import fs from 'node:fs/promises';
import path from 'node:path';
import { exec, one, query } from '../../infrastructure/db';
import { randomToken } from '../../infrastructure/crypto';
import { UPLOADS_DIR } from '../../config/paths';
import { Errors } from '../../http/errors';

export async function getProfile(userId: number) {
  const p = await one<{
    timezone: string;
    currency: string;
    language: string;
    theme: string;
    notification_prefs: unknown;
    kyc_status: string;
  }>(
    'SELECT timezone, currency, language, theme, notification_prefs, kyc_status FROM user_profiles WHERE user_id = ?',
    [userId],
  );
  if (!p) return null;
  const prefs =
    typeof p.notification_prefs === 'string'
      ? JSON.parse(p.notification_prefs)
      : (p.notification_prefs ?? {});
  return {
    timezone: p.timezone,
    currency: p.currency,
    language: p.language,
    theme: p.theme,
    notificationPrefs: prefs,
    kycStatus: p.kyc_status,
  };
}

export async function updateProfile(
  userId: number,
  input: Partial<{
    name: string;
    phone: string | null;
    timezone: string;
    currency: string;
    language: string;
    theme: 'light' | 'dark';
    notificationPrefs: unknown;
  }>,
) {
  if (input.name !== undefined || input.phone !== undefined) {
    await exec('UPDATE users SET name = COALESCE(?, name), phone = IF(?, ?, phone) WHERE id = ?', [
      input.name ?? null,
      input.phone !== undefined ? 1 : 0,
      input.phone ?? null,
      userId,
    ]);
  }
  const sets: string[] = [];
  const vals: (string | null)[] = [];
  for (const [k, col] of [
    ['timezone', 'timezone'],
    ['currency', 'currency'],
    ['language', 'language'],
    ['theme', 'theme'],
  ] as const) {
    if (input[k] !== undefined) {
      sets.push(`${col} = ?`);
      vals.push(input[k] as string);
    }
  }
  if (input.notificationPrefs !== undefined) {
    sets.push('notification_prefs = ?');
    vals.push(JSON.stringify(input.notificationPrefs));
  }
  if (sets.length)
    await exec(`UPDATE user_profiles SET ${sets.join(', ')} WHERE user_id = ?`, [...vals, String(userId)]);
}

const MAGIC: [string, number[]][] = [
  ['png', [0x89, 0x50, 0x4e, 0x47]],
  ['jpg', [0xff, 0xd8, 0xff]],
  ['webp', [0x52, 0x49, 0x46, 0x46]],
];

/** Stores an avatar after verifying the real file type by magic bytes (not the declared MIME). */
export async function saveAvatar(userId: number, dataUrl: string) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw Errors.badRequest('Avatar must be a PNG, JPEG or WebP image');
  const buf = Buffer.from(m[2]!, 'base64');
  if (buf.length > 1_000_000) throw Errors.badRequest('Avatar must be under 1 MB');
  const kind = MAGIC.find(([, sig]) => sig.every((b, i) => buf[i] === b))?.[0];
  if (!kind || (kind === 'webp' && buf.subarray(8, 12).toString() !== 'WEBP'))
    throw Errors.badRequest('Unsupported image');
  const dir = path.join(UPLOADS_DIR, 'avatars');
  await fs.mkdir(dir, { recursive: true });
  const name = `${randomToken(16)}.${kind}`;
  await fs.writeFile(path.join(dir, name), buf, { mode: 0o600 });
  const prev = await one<{ avatar_url: string | null }>('SELECT avatar_url FROM users WHERE id = ?', [
    userId,
  ]);
  const url = `/api/uploads/avatars/${name}`;
  await exec('UPDATE users SET avatar_url = ? WHERE id = ?', [url, userId]);
  if (prev?.avatar_url?.startsWith('/api/uploads/avatars/')) {
    await fs.rm(path.join(dir, path.basename(prev.avatar_url)), { force: true });
  }
  return url;
}

export async function listSessions(userId: number, currentSessionId: number) {
  const rows = await query<{
    id: number;
    ip: string | null;
    user_agent: string | null;
    auth_method: string;
    created_at: Date;
    last_seen_at: Date;
    browser: string | null;
    os: string | null;
    device_type: string | null;
  }>(
    `SELECT s.id, s.ip, s.user_agent, s.auth_method, s.created_at, s.last_seen_at, d.browser, d.os, d.device_type
     FROM user_sessions s LEFT JOIN user_devices d ON d.id = s.device_id
     WHERE s.principal_type = 'user' AND s.principal_id = ? AND s.revoked_at IS NULL AND s.expires_at > NOW(3) AND s.idle_expires_at > NOW(3)
     ORDER BY s.last_seen_at DESC LIMIT 100`,
    [userId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    ip: r.ip,
    browser: r.browser,
    os: r.os,
    deviceType: r.device_type,
    method: r.auth_method,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    current: Number(r.id) === currentSessionId,
  }));
}

export async function listDevices(userId: number) {
  return query(
    "SELECT id, browser, os, device_type AS deviceType, last_ip AS lastIp, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt FROM user_devices WHERE principal_type = 'user' AND principal_id = ? ORDER BY last_seen_at DESC LIMIT 100",
    [userId],
  );
}

export async function loginHistory(userId: number) {
  return query(
    "SELECT id, ip, user_agent AS userAgent, method, success, reason, created_at AS createdAt FROM login_attempts WHERE principal_type = 'user' AND principal_id = ? ORDER BY id DESC LIMIT 100",
    [userId],
  );
}

export async function securityEvents(userId: number) {
  return query(
    "SELECT id, type, ip, meta, created_at AS createdAt FROM security_events WHERE principal_type = 'user' AND principal_id = ? ORDER BY id DESC LIMIT 100",
    [userId],
  );
}
