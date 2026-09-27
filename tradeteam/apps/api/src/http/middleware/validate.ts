import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
import { Errors } from '../errors';

/** Parses and replaces req.body / req.query with validated, typed data. */
export function body<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.body ?? {});
    if (!r.success)
      return next(
        Errors.validation(r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))),
      );
    req.body = r.data;
    next();
  };
}

export function parseQuery<T>(schema: ZodType<T>, q: unknown): T {
  const r = schema.safeParse(q ?? {});
  if (!r.success)
    throw Errors.validation(r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}
