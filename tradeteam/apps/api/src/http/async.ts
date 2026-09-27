import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Express 5 forwards rejected promises automatically; this helper keeps handler typing tidy. */
export const h =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
