import type { Request, Response } from 'express';
import { UAParser } from 'ua-parser-js';
import { exec, one, query } from '../../infrastructure/db';
import { redis } from '../../infrastructure/redis';
import { hmac, randomToken, sha256 } from '../../infrastructure/crypto';
import { loadEnv } from '../../config/env';
import { getSetting } from '../settings/settings.service';
import { publishSessionRevoked } from '../../websocket/bus';
import type { AuthContext, PrincipalType } from './principal';

/**
 * Opaque, server-side sessions. The browser holds a random 256-bit token in an HttpOnly cookie;
 * only its SHA-256 is stored (DB + Redis cache), so a database leak does not yield usable tokens.
 * Sessions have both an idle timeout (sliding) and an absolute lifetime; tokens are rotated on
 * login and on privilege changes (password change, 2FA toggles).
 */
export const DEVICE_COOKIE = 'tt_did';
const CACHE_TTL = 300;

export function isSecureCookies() {
  return loadEnv().APP_URL.startsWith('https://');
}

export function sessionCookieName(pt: PrincipalType) {
  const base = pt === 'admin' ? 'tt_asid' : 'tt_sid';
  return isSecureCookies() ? `__Host-${base}` : base;
}

export function csrfCookieName() {
  return isSecureCookies() ? '__Host-tt_csrf' : 'tt_csrf';
}

interface CachedSession {
  id: number;
  pt: PrincipalType;
  pid: number;
  mfaAt: number | null;
  method: string;
  exp: number;
  idle: number;
  touched: number;
}

export function clientIp(req: Request): string {
  return (req.ip ?? req.socket.remoteAddress ?? '').replace(/^::ffff:/, '').slice(0, 45);
}

export function userAgent(req: Request): string {
  return String(req.headers['user-agent'] ?? '').slice(0, 512);
}

/** Long-lived random device identifier cookie → device record for "new device" detection. */
export function ensureDeviceCookie(req: Request, res: Response): string {
  let did = req.cookies?.[DEVICE_COOKIE] as string | undefined;
  if (!did || !/^[A-Za-z0-9_-]{32,64}$/.test(did)) {
    did = randomToken(24);
    res.cookie(DEVICE_COOKIE, did, {
      httpOnly: true,
      secure: isSecureCookies(),
      sameSite: 'lax',
      maxAge: 400 * 86_400_000,
      path: '/',
    });
  }
  return did;
}

export async function upsertDevice(pt: PrincipalType, pid: number, did: string, req: Request) {
  const ua = new UAParser(userAgent(req)).getResult();
  // Keyed hash: device identifiers in the database are useless without the server secret.
  const fp = hmac(loadEnv().SESSION_SECRET ?? '', did);
  const existing = await one<{ id: number }>(
    'SELECT id FROM user_devices WHERE principal_type = ? AND principal_id = ? AND fingerprint = ?',
    [pt, pid, fp],
  );
  if (existing) {
    await exec('UPDATE user_devices SET last_seen_at = NOW(3), last_ip = ? WHERE id = ?', [
      clientIp(req),
      existing.id,
    ]);
    return { id: existing.id, isNew: false };
  }
  const r = await exec(
    'INSERT INTO user_devices (principal_type, principal_id, fingerprint, browser, os, device_type, last_ip) VALUES (?,?,?,?,?,?,?)',
    [
      pt,
      pid,
      fp,
      [ua.browser.name, ua.browser.major].filter(Boolean).join(' ') || null,
      [ua.os.name, ua.os.version].filter(Boolean).join(' ') || null,
      ua.device.type ?? 'desktop',
      clientIp(req),
    ],
  );
  const count = await one<{ n: number }>(
    'SELECT COUNT(*) AS n FROM user_devices WHERE principal_type = ? AND principal_id = ?',
    [pt, pid],
  );
  return { id: r.insertId, isNew: Number(count?.n ?? 0) > 1 };
}

export async function createSession(
  req: Request,
  res: Response,
  pt: PrincipalType,
  pid: number,
  method: string,
  opts: { mfa?: boolean } = {},
) {
  const did = ensureDeviceCookie(req, res);
  const device = await upsertDevice(pt, pid, did, req);
  const token = randomToken(32);
  const hash = sha256(token);
  const days = pt === 'admin' ? 1 : getSetting('auth.session_days');
  const idleHours = pt === 'admin' ? 2 : getSetting('auth.session_idle_hours');
  const now = Date.now();
  const exp = now + days * 86_400_000;
  const idle = Math.min(exp, now + idleHours * 3_600_000);
  const r = await exec(
    `INSERT INTO user_sessions (principal_type, principal_id, token_hash, device_id, ip, user_agent, auth_method, mfa_at, idle_expires_at, expires_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      pt,
      pid,
      hash,
      device.id,
      clientIp(req),
      userAgent(req),
      method,
      opts.mfa ? new Date(now) : null,
      new Date(idle),
      new Date(exp),
    ],
  );
  setSessionCookie(res, pt, token, exp);
  issueCsrf(res);
  return { sessionId: r.insertId, device };
}

export function setSessionCookie(res: Response, pt: PrincipalType, token: string, exp: number) {
  res.cookie(sessionCookieName(pt), token, {
    httpOnly: true,
    secure: isSecureCookies(),
    sameSite: pt === 'admin' ? 'strict' : 'lax',
    path: '/',
    expires: new Date(exp),
  });
}

export function issueCsrf(res: Response) {
  const t = randomToken(24);
  res.cookie(csrfCookieName(), t, { httpOnly: false, secure: isSecureCookies(), sameSite: 'lax', path: '/' });
  return t;
}

export async function resolveSession(
  pt: PrincipalType,
  token: string | undefined,
): Promise<AuthContext | null> {
  if (!token || token.length > 128) return null;
  const hash = sha256(token);
  const key = `sess:${hash}`;
  const now = Date.now();
  let s: CachedSession | null = null;
  const cached = await redis().get(key);
  if (cached) s = JSON.parse(cached) as CachedSession;
  else {
    const row = await one<{
      id: number;
      principal_type: PrincipalType;
      principal_id: number;
      mfa_at: Date | null;
      auth_method: string;
      expires_at: Date;
      idle_expires_at: Date;
      revoked_at: Date | null;
    }>(
      'SELECT id, principal_type, principal_id, mfa_at, auth_method, expires_at, idle_expires_at, revoked_at FROM user_sessions WHERE token_hash = ?',
      [hash],
    );
    if (!row || row.revoked_at || row.principal_type !== pt) return null;
    s = {
      id: Number(row.id),
      pt: row.principal_type,
      pid: Number(row.principal_id),
      mfaAt: row.mfa_at ? row.mfa_at.getTime() : null,
      method: row.auth_method,
      exp: row.expires_at.getTime(),
      idle: row.idle_expires_at.getTime(),
      touched: 0,
    };
  }
  if (s.pt !== pt || s.exp < now || s.idle < now) {
    await redis().del(key);
    return null;
  }
  // Slide idle expiry at most once per minute to keep writes low.
  if (now - s.touched > 60_000) {
    const idleHours = pt === 'admin' ? 2 : getSetting('auth.session_idle_hours');
    s.idle = Math.min(s.exp, now + idleHours * 3_600_000);
    s.touched = now;
    await exec(
      'UPDATE user_sessions SET last_seen_at = NOW(3), idle_expires_at = ? WHERE id = ? AND revoked_at IS NULL',
      [new Date(s.idle), s.id],
    );
  }
  await redis().set(key, JSON.stringify(s), 'EX', CACHE_TTL);
  return { type: s.pt, id: s.pid, sessionId: s.id, mfaAt: s.mfaAt, method: s.method };
}

async function dropCache(ids: number[]) {
  if (!ids.length) return;
  const rows = await query<{ token_hash: string }>(
    `SELECT token_hash FROM user_sessions WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
  if (rows.length) await redis().del(...rows.map((r) => `sess:${r.token_hash}`));
  ids.forEach((id) => publishSessionRevoked(id));
}

export async function revokeSession(sessionId: number, reason: string) {
  await exec(
    'UPDATE user_sessions SET revoked_at = NOW(3), revoke_reason = ? WHERE id = ? AND revoked_at IS NULL',
    [reason, sessionId],
  );
  await dropCache([sessionId]);
}

export async function revokeAllSessions(
  pt: PrincipalType,
  pid: number,
  reason: string,
  exceptSessionId?: number,
) {
  const rows = await query<{ id: number }>(
    'SELECT id FROM user_sessions WHERE principal_type = ? AND principal_id = ? AND revoked_at IS NULL AND id <> ?',
    [pt, pid, exceptSessionId ?? 0],
  );
  const ids = rows.map((r) => Number(r.id));
  if (!ids.length) return 0;
  await exec(
    `UPDATE user_sessions SET revoked_at = NOW(3), revoke_reason = ? WHERE id IN (${ids.map(() => '?').join(',')})`,
    [reason, ...ids],
  );
  await dropCache(ids);
  return ids.length;
}

/** Session rotation: new token, same principal; old session revoked. Used after privilege changes. */
export async function rotateSession(
  req: Request,
  res: Response,
  ctx: AuthContext,
  reason: string,
  mfa = false,
) {
  await revokeSession(ctx.sessionId, `rotated:${reason}`);
  return createSession(req, res, ctx.type, ctx.id, ctx.method, { mfa: mfa || ctx.mfaAt !== null });
}

export async function markSessionMfa(sessionId: number) {
  await exec('UPDATE user_sessions SET mfa_at = NOW(3) WHERE id = ?', [sessionId]);
  const row = await one<{ token_hash: string }>('SELECT token_hash FROM user_sessions WHERE id = ?', [
    sessionId,
  ]);
  if (row) await redis().del(`sess:${row.token_hash}`);
}

export function clearSessionCookie(res: Response, pt: PrincipalType) {
  res.clearCookie(sessionCookieName(pt), { path: '/', secure: isSecureCookies(), httpOnly: true });
}
