// Small HTTP helpers shared by the routers.
import rateLimit from 'express-rate-limit';
import { ApiError } from './errors.js';

/** Express 4 does not catch rejected promises; route errors to the error handler. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Parses `input` with a zod schema. On failure throws VALIDATION_FAILED with
 * details.fields = { "path": "message" }. Submitted values are never echoed back.
 */
export function parse(schema, input) {
  const r = schema.safeParse(input ?? {});
  if (r.success) return r.data;
  const fields = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  throw new ApiError('VALIDATION_FAILED', { details: { fields } });
}

/**
 * Rate limiter returning RATE_LIMITED with details.retry_after_s. Each call creates its own counter store,
 * so login attempts do not use up the verify-code allowance. Keyed by client IP by default (kept in memory
 * only, never stored or logged).
 */
export function limiter({ windowMs, limit, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res, next) => {
      const reset = req.rateLimit?.resetTime;
      const retry = reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : Math.ceil(windowMs / 1000);
      next(new ApiError('RATE_LIMITED', { details: { retry_after_s: retry } }));
    },
  });
}
