import type { Request, Response, NextFunction } from 'express';
import { csrfCookieName } from '../../modules/auth/sessions';
import { safeEqual } from '../../infrastructure/crypto';
import { Errors } from '../errors';
import { loadEnv } from '../../config/env';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests:
 *  1. SameSite cookies (Lax for users, Strict for admins)
 *  2. Origin/Referer must match APP_URL for unsafe methods
 *  3. Double-submit token: X-CSRF-Token header must equal the tt_csrf cookie
 * Webhooks (HMAC-authenticated) are exempt and mounted before this middleware.
 */
export function csrf(req: Request, _res: Response, next: NextFunction) {
  if (SAFE.has(req.method)) return next();
  const env = loadEnv();
  const origin =
    req.headers.origin ?? (req.headers.referer ? new URL(req.headers.referer).origin : undefined);
  const allowed = new URL(env.APP_URL).origin;
  if (env.NODE_ENV === 'production' && origin !== allowed)
    return next(Errors.forbidden('Invalid request origin'));
  if (origin && origin !== allowed && env.NODE_ENV !== 'test' && !isDevOrigin(origin)) {
    return next(Errors.forbidden('Invalid request origin'));
  }
  const cookie = req.cookies?.[csrfCookieName()] as string | undefined;
  const header = req.headers['x-csrf-token'];
  if (!cookie || typeof header !== 'string' || !safeEqual(cookie, header)) {
    return next(Errors.forbidden('CSRF token missing or invalid. Refresh the page and try again.'));
  }
  next();
}

function isDevOrigin(o: string) {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
}
