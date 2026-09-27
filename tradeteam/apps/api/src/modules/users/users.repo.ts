import crypto from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { exec, one, tx } from '../../infrastructure/db';

export interface UserRow {
  id: number;
  uid: string;
  email: string;
  email_verified_at: Date | null;
  password_hash: string | null;
  name: string;
  avatar_url: string | null;
  phone: string | null;
  google_sub: string | null;
  status: 'active' | 'suspended' | 'locked' | 'closed';
  failed_login_count: number;
  locked_until: Date | null;
  created_at: Date;
  last_login_at: Date | null;
}

const COLS =
  'id, uid, email, email_verified_at, password_hash, name, avatar_url, phone, google_sub, status, failed_login_count, locked_until, created_at, last_login_at';

export function normalizeEmail(e: string) {
  return e.trim().toLowerCase();
}

export async function findUserByEmail(email: string) {
  return one<UserRow>(`SELECT ${COLS} FROM users WHERE email = ? AND deleted_at IS NULL`, [
    normalizeEmail(email),
  ]);
}
export async function findUserById(id: number) {
  return one<UserRow>(`SELECT ${COLS} FROM users WHERE id = ? AND deleted_at IS NULL`, [id]);
}
export async function findUserByGoogle(sub: string) {
  return one<UserRow>(`SELECT ${COLS} FROM users WHERE google_sub = ? AND deleted_at IS NULL`, [sub]);
}
export async function findUserByUid(uid: string) {
  return one<UserRow>(`SELECT ${COLS} FROM users WHERE uid = ? AND deleted_at IS NULL`, [uid]);
}

function newUid() {
  return String(crypto.randomInt(100_000_000, 999_999_999));
}

export async function ensureWallet(userId: number, c?: PoolConnection) {
  await exec("INSERT IGNORE INTO wallets (user_id, type) VALUES (?, 'spot')", [userId], c);
  const w = await one<{ id: number }>(
    "SELECT id FROM wallets WHERE user_id = ? AND type = 'spot'",
    [userId],
    c,
  );
  return Number(w!.id);
}

export async function createUser(input: {
  email: string;
  name: string;
  passwordHash: string | null;
  googleSub?: string | null;
  avatarUrl?: string | null;
  emailVerified?: boolean;
  theme?: 'light' | 'dark';
}): Promise<number> {
  return tx(async (c) => {
    let id = 0;
    for (let i = 0; i < 5 && !id; i++) {
      try {
        const r = await exec(
          'INSERT INTO users (uid, email, email_verified_at, password_hash, name, avatar_url, google_sub) VALUES (?,?,?,?,?,?,?)',
          [
            newUid(),
            normalizeEmail(input.email),
            input.emailVerified ? new Date() : null,
            input.passwordHash,
            input.name,
            input.avatarUrl ?? null,
            input.googleSub ?? null,
          ],
          c,
        );
        id = r.insertId;
      } catch (e) {
        const msg = (e as Error).message;
        if ((e as { code?: string }).code === 'ER_DUP_ENTRY' && msg.includes('uq_users_uid')) continue;
        throw e;
      }
    }
    if (!id) throw new Error('Could not allocate user id');
    await exec('INSERT INTO user_profiles (user_id, theme) VALUES (?, ?)', [id, input.theme ?? 'light'], c);
    await ensureWallet(id, c);
    return id;
  });
}

export function publicUser(u: UserRow, extra: Record<string, unknown> = {}) {
  return {
    id: String(u.id),
    uid: u.uid,
    email: u.email,
    emailVerified: Boolean(u.email_verified_at),
    name: u.name,
    avatarUrl: u.avatar_url,
    phone: u.phone,
    googleLinked: Boolean(u.google_sub),
    hasPassword: Boolean(u.password_hash),
    status: u.status,
    createdAt: u.created_at,
    ...extra,
  };
}
