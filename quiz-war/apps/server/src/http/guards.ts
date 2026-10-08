import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError, forbidden, unauthorized } from '../lib/errors';
import type { AppContext } from '../context';
import type { AdminPrincipal } from '../modules/admin/admin.auth';
import { verifyAccessToken } from '../modules/auth/tokens';
import type { ClientMeta } from '../modules/auth/auth.service';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: number; sid: number };
    admin?: AdminPrincipal;
  }
}

function bearer(req: FastifyRequest) {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7) : null;
}

export function requireUser(ctx: AppContext) {
  return async (req: FastifyRequest) => {
    const token = bearer(req);
    if (!token) throw unauthorized();
    const c = await verifyAccessToken(ctx.env.JWT_SECRET, token);
    req.user = { id: c.sub, sid: c.sid };
  };
}

export function optionalUser(ctx: AppContext) {
  return async (req: FastifyRequest) => {
    const token = bearer(req);
    if (!token) return;
    try {
      const c = await verifyAccessToken(ctx.env.JWT_SECRET, token);
      req.user = { id: c.sub, sid: c.sid };
    } catch {
      /* anonymous */
    }
  };
}

export function requireAdmin(ctx: AppContext, ...perms: string[]) {
  return async (req: FastifyRequest) => {
    const token = bearer(req);
    if (!token) throw unauthorized();
    const admin = await ctx.adminAuth.authenticate(token);
    for (const p of perms) if (!admin.permissions.has(p)) throw forbidden();
    req.admin = admin;
  };
}

export function uid(req: FastifyRequest): number {
  if (!req.user) throw unauthorized();
  return req.user.id;
}

export function clientMeta(req: FastifyRequest): ClientMeta {
  const p = String(req.headers['x-client-platform'] ?? 'web');
  return {
    platform: p === 'android' || p === 'ios' ? p : p === 'web' ? 'web' : 'other',
    deviceName: (req.headers['x-device-name'] as string | undefined)?.slice(0, 120) ?? null,
    ip: req.ip,
    userAgent: req.headers['user-agent']?.slice(0, 300) ?? null,
  };
}

export const isNative = (req: FastifyRequest) => req.headers['x-client-platform'] === 'android' || req.headers['x-client-platform'] === 'ios';

/**
 * Cookie-authenticated endpoints (refresh/logout) require a custom header. Browsers can't send
 * custom headers cross-site without a CORS preflight, and CORS only allows our own origins —
 * this is the CSRF protection for the refresh cookie.
 */
export function requireCsrfHeader(req: FastifyRequest) {
  if (req.headers['x-requested-with'] !== 'QuizWar') throw new AppError(403, 'csrf', 'Missing request header');
}

export function setRefreshCookie(reply: FastifyReply, name: string, path: string, token: string, maxAgeSec: number, secure: boolean) {
  reply.setCookie(name, token, { httpOnly: true, secure, sameSite: 'strict', path, maxAge: maxAgeSec });
}

export function clearRefreshCookie(reply: FastifyReply, name: string, path: string, secure: boolean) {
  reply.clearCookie(name, { httpOnly: true, secure, sameSite: 'strict', path });
}
