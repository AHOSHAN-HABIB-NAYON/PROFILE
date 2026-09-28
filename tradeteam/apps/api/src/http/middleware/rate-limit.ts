import type { Request, Response, NextFunction } from 'express';
import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
  type RateLimiterAbstract,
} from 'rate-limiter-flexible';
import { redis, isMemoryRedis } from '../../infrastructure/redis';
import { Errors } from '../errors';
import { clientIp } from '../../modules/auth/sessions';

const limiters = new Map<string, RateLimiterAbstract>();

function limiter(name: string, points: number, duration: number, blockDuration = 0) {
  const key = `${name}:${points}:${duration}`;
  let l = limiters.get(key);
  if (!l) {
    l = isMemoryRedis()
      ? new RateLimiterMemory({ keyPrefix: `rl:${name}`, points, duration, blockDuration })
      : new RateLimiterRedis({
          storeClient: redis(),
          keyPrefix: `rl:${name}`,
          points,
          duration,
          blockDuration,
        });
    limiters.set(key, l);
  }
  return l;
}

/** Consume a point; throws 429 AppError when exhausted. */
export async function consume(
  name: string,
  key: string,
  points: number,
  duration: number,
  blockDuration = 0,
) {
  try {
    await limiter(name, points, duration, blockDuration).consume(key);
  } catch (e) {
    if (e instanceof RateLimiterRes)
      throw Errors.tooMany('Too many requests. Please slow down.', Math.ceil(e.msBeforeNext / 1000));
    throw e;
  }
}

export async function resetLimit(name: string, key: string, points: number, duration: number) {
  await limiter(name, points, duration).delete(key);
}

type KeyFn = (req: Request) => string;
const byIp: KeyFn = (req) => clientIp(req);

export function rateLimit(
  name: string,
  points: number,
  duration: number,
  keyFn: KeyFn = byIp,
  blockDuration = 0,
) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await consume(name, keyFn(req), points, duration, blockDuration);
      next();
    } catch (e) {
      next(e);
    }
  };
}

export const byPrincipal: KeyFn = (req) => (req.auth ? `${req.auth.type}:${req.auth.id}` : clientIp(req));
