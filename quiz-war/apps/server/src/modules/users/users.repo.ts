import type { MeUser, PublicUser } from '@quizwar/shared';
import { query, queryOne, type Conn } from '../../db/pool';

export const PUBLIC_USER_COLUMNS = `u.id, u.uid, p.username, p.avatar_url, p.avatar_thumb_url, p.level, p.rating, p.league, p.frame, p.title, p.verified_at`;

export interface PublicUserRow {
  id: number;
  uid: string;
  username: string | null;
  avatar_url: string | null;
  avatar_thumb_url: string | null;
  level: number;
  rating: number;
  league: string;
  frame: string | null;
  title: string | null;
  verified_at?: Date | null;
}

export function toPublicUser(r: PublicUserRow): PublicUser {
  return {
    id: Number(r.id),
    uid: r.uid,
    username: r.username ?? 'Player',
    avatarUrl: r.avatar_url,
    avatarThumbUrl: r.avatar_thumb_url,
    level: r.level,
    rating: r.rating,
    league: r.league,
    frame: r.frame,
    title: r.title,
    verified: !!r.verified_at,
  };
}

export async function getPublicUser(id: number, conn?: Conn): Promise<PublicUser | null> {
  const row = await queryOne<PublicUserRow>(
    `SELECT ${PUBLIC_USER_COLUMNS} FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.status <> 'deleted'`,
    [id],
    conn,
  );
  return row ? toPublicUser(row) : null;
}

export async function getPublicUsers(ids: number[]): Promise<Map<number, PublicUser>> {
  const map = new Map<number, PublicUser>();
  if (!ids.length) return map;
  const rows = await query<PublicUserRow>(
    `SELECT ${PUBLIC_USER_COLUMNS} FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id IN (?)`,
    [[...new Set(ids)]],
  );
  for (const r of rows) map.set(Number(r.id), toPublicUser(r));
  return map;
}

export async function getUserByUid(uid: string): Promise<PublicUser | null> {
  const row = await queryOne<PublicUserRow>(
    `SELECT ${PUBLIC_USER_COLUMNS} FROM users u JOIN user_profiles p ON p.user_id = u.id
     WHERE u.uid = ? AND u.status IN ('active','suspended') AND p.username IS NOT NULL`,
    [uid],
  );
  return row ? toPublicUser(row) : null;
}

export async function getMe(id: number): Promise<MeUser | null> {
  const r = await queryOne<any>(
    `SELECT ${PUBLIC_USER_COLUMNS}, u.email, u.email_verified_at, p.xp, p.coins, p.streak_days,
            p.available_for_battle, p.dnd, p.bio, p.onboarded_at, p.lang, p.email_activity, (u.password_hash IS NOT NULL) AS has_password, (u.google_sub IS NOT NULL) AS has_google
     FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.status <> 'deleted'`,
    [id],
  );
  if (!r) return null;
  return {
    ...toPublicUser(r),
    email: r.email,
    emailVerified: !!r.email_verified_at,
    needsOnboarding: !r.username || !r.onboarded_at,
    xp: Number(r.xp),
    coins: Number(r.coins),
    streakDays: r.streak_days,
    availableForBattle: !!r.available_for_battle,
    dnd: !!r.dnd,
    bio: r.bio,
    lang: r.lang === 'en' ? 'en' : 'bn',
    emailActivity: !!r.email_activity,
    hasPassword: !!r.has_password,
    hasGoogle: !!r.has_google,
  };
}

export interface UserAuthRow {
  id: number;
  uid: string;
  email: string | null;
  email_verified_at: Date | null;
  password_hash: string | null;
  google_sub: string | null;
  status: 'active' | 'suspended' | 'banned' | 'deleted';
  suspended_until: Date | null;
  moderation_reason: string | null;
  failed_login_count: number;
  locked_until: Date | null;
}

export const AUTH_COLUMNS = `id, uid, email, email_verified_at, password_hash, google_sub, status, suspended_until, moderation_reason, failed_login_count, locked_until`;
