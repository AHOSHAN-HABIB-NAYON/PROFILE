import type { Request, Response, NextFunction } from 'express';
import { resolveSession, sessionCookieName, clientIp } from '../auth/sessions';
import { Errors } from '../../http/errors';
import { one, query } from '../../infrastructure/db';
import { getSetting } from '../settings/settings.service';
import type { Permission } from './permissions';

function ipAllowed(ip: string) {
  const list = getSetting('admin.ip_allowlist');
  if (!list.length) return true;
  return list.some((entry) => {
    if (entry.includes('/')) return cidrMatch(ip, entry);
    return entry === ip;
  });
}

/** IPv4 CIDR match (IPv6 entries must be listed as exact addresses). */
export function cidrMatch(ip: string, cidr: string) {
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const toInt = (v: string) => v.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
  if (
    !/^\d+\.\d+\.\d+\.\d+$/.test(ip) ||
    !/^\d+\.\d+\.\d+\.\d+$/.test(range ?? '') ||
    !(bits >= 0 && bits <= 32)
  )
    return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(range!) & mask);
}

export function adminIpGuard(req: Request, _res: Response, next: NextFunction) {
  if (!ipAllowed(clientIp(req))) return next(Errors.forbidden('Access from this IP address is not allowed'));
  next();
}

/** Paths an admin may reach before completing mandatory second-factor enrolment. */
const SETUP_PATHS = [
  '/auth/me',
  '/auth/logout',
  '/auth/2fa/setup',
  '/auth/2fa/enable',
  '/auth/passkey/register/options',
  '/auth/passkey/register',
];

export async function loadAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const ctx = await resolveSession('admin', req.cookies?.[sessionCookieName('admin')]);
    if (!ctx) return next();
    const a = await one<{ id: number; email: string; name: string; status: string; role: string }>(
      'SELECT u.id, u.email, u.name, u.status, r.name AS role FROM admin_users u JOIN admin_roles r ON r.id = u.role_id WHERE u.id = ?',
      [ctx.id],
    );
    if (!a || a.status !== 'active') return next();
    const perms = await query<{ code: string }>(
      'SELECT p.code FROM admin_permissions p JOIN admin_role_permissions rp ON rp.permission_id = p.id JOIN admin_users u ON u.role_id = rp.role_id WHERE u.id = ?',
      [a.id],
    );
    req.auth = ctx;
    req.admin = {
      id: Number(a.id),
      email: a.email,
      name: a.name,
      role: a.role,
      permissions: new Set(perms.map((p) => p.code)),
    };
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.admin || req.auth?.type !== 'admin')
    return next(Errors.unauthorized('Admin authentication required'));
  // Admin sessions must have passed a second factor; before enrolment only setup endpoints work.
  const rel = (req.baseUrl + req.path).replace(/^.*?\/admin(?=\/)/, '');
  if (!req.auth.mfaAt && !SETUP_PATHS.includes(rel))
    return next(Errors.forbidden('Set up two-factor authentication or a passkey to continue'));
  next();
}

export function can(...perms: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const a = req.admin;
    if (!a) return next(Errors.unauthorized());
    if (a.role === 'super_admin' || perms.every((p) => a.permissions.has(p))) return next();
    next(Errors.forbidden('You do not have permission for this action'));
  };
}
