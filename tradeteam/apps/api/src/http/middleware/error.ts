import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors';
import { logger } from '../../infrastructure/logger';

export function notFound(req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.status === 429 && (err.details as { retryAfter?: number })?.retryAfter) {
      res.setHeader('Retry-After', String((err.details as { retryAfter: number }).retryAfter));
    }
    return res
      .status(err.status)
      .json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  const e = err as { type?: string; status?: number; message?: string };
  if (e?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'bad_json', message: 'Malformed JSON body' } });
  }
  if (e?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'too_large', message: 'Request body too large' } });
  }
  logger.error({ err, path: req.path, method: req.method }, 'unhandled error');
  // Never leak internals (SQL, stack traces, config) to clients.
  res
    .status(500)
    .json({ error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } });
}
