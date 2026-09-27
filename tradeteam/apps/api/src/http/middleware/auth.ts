import type { Request, Response, NextFunction } from 'express';
import { resolveSession, sessionCookieName } from '../../modules/auth/sessions';
import { Errors } from '../errors';
import { one } from '../../infrastructure/db';
import { redis } from '../../infrastructure/redis';

/** Attaches req.auth for user sessions when a valid cookie is present (does not require it). */
export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const ctx = await resolveSession('user', req.cookies?.[sessionCookieName('user')]);
    if (ctx) {
      const status = await userStatus(ctx.id);
      if (status === 'active') req.auth = ctx;
    }
    next();
  } catch (e) {
    next(e);
  }
}

async function userStatus(id: number): Promise<string | null> {
  const key = `ustatus:${id}`;
  const c = await redis().get(key);
  if (c) return c;
  const r = await one<{ status: string; deleted_at: Date | null }>(
    'SELECT status, deleted_at FROM users WHERE id = ?',
    [id],
  );
  const s = !r || r.deleted_at ? 'missing' : r.status;
  await redis().set(key, s, 'EX', 30);
  return s;
}

export async function invalidateUserStatus(id: number) {
  await redis().del(`ustatus:${id}`);
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth || req.auth.type !== 'user') return next(Errors.unauthorized());
  next();
}

/** Step-up: sensitive actions require an MFA/passkey verification within the last `maxAgeSec`. */
export function recentMfa(req: Request, maxAgeSec = 600) {
  return Boolean(req.auth?.mfaAt && Date.now() - req.auth.mfaAt < maxAgeSec * 1000);
}
