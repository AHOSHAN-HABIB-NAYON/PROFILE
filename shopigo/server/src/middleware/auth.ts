import type { NextFunction, Request, Response } from 'express';
import { cache } from '../core/cache.js';
import { randomToken, safeEqual, sha256 } from '../core/crypto.js';
import { forbidden, unauthorized, HttpError } from '../core/errors.js';
import { db } from '../db/index.js';
import { settings } from '../services/settings.js';
import type { AdminContext } from '../core/request.js';

export const SESSION_COOKIE = 'sg_admin';
export const CSRF_COOKIE = 'sg_csrf';

export function cookieOptions(req: Request, httpOnly = true) {
  return { httpOnly, secure: req.secure, sameSite: 'strict' as const, path: '/' };
}

export interface LoadedSession { ctx: AdminContext; mfaPending: boolean; mustSetup2fa: boolean }

export async function loadSession(req: Request): Promise<LoadedSession | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const hash = sha256(token);
  const cached = await cache.get<{ ctx: Omit<AdminContext, 'permissions'> & { permissions: string[] }; mfaPending: boolean; mustSetup2fa: boolean; expires: number }>(`sess:${hash}`);
  if (cached && cached.expires > Date.now()) {
    return { ctx: { ...cached.ctx, permissions: new Set(cached.ctx.permissions) }, mfaPending: cached.mfaPending, mustSetup2fa: cached.mustSetup2fa };
  }
  const row = await db()
    .selectFrom('admin_sessions as s')
    .innerJoin('admins as a', 'a.id', 's.admin_id')
    .innerJoin('roles as r', 'r.id', 'a.role_id')
    .select(['s.id as sid', 's.mfa_pending', 's.expires_at', 's.last_seen_at', 's.auth_method', 'a.id', 'a.name', 'a.email', 'a.status', 'a.totp_enabled', 'a.role_id', 'r.slug as role_slug'])
    .where('s.token_hash', '=', hash)
    .where('s.revoked_at', 'is', null)
    .executeTakeFirst();
  if (!row || row.status !== 'active' || new Date(row.expires_at).getTime() < Date.now()) return null;
  const perms = await db()
    .selectFrom('role_permissions as rp')
    .innerJoin('permissions as p', 'p.id', 'rp.permission_id')
    .select('p.slug')
    .where('rp.role_id', '=', row.role_id)
    .execute();
  let mustSetup2fa = false;
  if ((await settings.bool('admin_2fa_required')) && row.auth_method !== 'passkey' && !row.totp_enabled) {
    const pk = await db().selectFrom('admin_passkeys').select('id').where('admin_id', '=', row.id).executeTakeFirst();
    mustSetup2fa = !pk;
  }
  const ctx: AdminContext = {
    id: row.id,
    name: row.name,
    email: row.email,
    roleId: row.role_id,
    roleSlug: row.role_slug,
    permissions: new Set(perms.map((p) => p.slug)),
    sessionId: row.sid,
    authMethod: row.auth_method,
  };
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    await db().updateTable('admin_sessions').set({ last_seen_at: new Date(), ip: req.ip ?? null }).where('id', '=', row.sid).execute();
  }
  await cache.set(`sess:${hash}`, { ctx: { ...ctx, permissions: [...ctx.permissions] }, mfaPending: Boolean(row.mfa_pending), mustSetup2fa, expires: Math.min(Date.now() + 30_000, new Date(row.expires_at).getTime()) }, 30);
  return { ctx, mfaPending: Boolean(row.mfa_pending), mustSetup2fa };
}

export async function invalidateSessionCache(token?: string) {
  if (token) await cache.del(`sess:${sha256(token)}`);
  else await cache.del('sess:');
}

/** Requires a fully authenticated admin (MFA completed). */
export function requireAdmin(opts: { allowMfaSetup?: boolean } = {}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const s = await loadSession(req);
    if (!s || s.mfaPending) throw unauthorized();
    if (s.mustSetup2fa && !opts.allowMfaSetup) throw new HttpError(403, 'Two-factor authentication must be set up before continuing', 'MFA_SETUP_REQUIRED');
    req.admin = s.ctx;
    next();
  };
}

export function can(req: Request, perm: string): boolean {
  const a = req.admin;
  return Boolean(a && (a.roleSlug === 'super_admin' || a.permissions.has(perm)));
}

export function requirePermission(...perms: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.admin) throw unauthorized();
    if (!perms.some((p) => can(req, p))) throw forbidden();
    next();
  };
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.admin?.roleSlug !== 'super_admin') throw forbidden('Only a Super Admin can do this');
  next();
}

/** Double-submit CSRF token for cookie-authenticated state-changing requests. */
export function issueCsrf(req: Request, res: Response): string {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token || typeof token !== 'string' || token.length < 20) {
    token = randomToken(24);
    res.cookie(CSRF_COOKIE, token, { ...cookieOptions(req, false), maxAge: 7 * 24 * 3600_000 });
  }
  return token;
}

export function csrfProtection(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || !safeEqual(String(cookie), String(header))) throw new HttpError(403, 'Security token expired. Please refresh the page.', 'CSRF');
  next();
}
