import { Redis } from 'ioredis';
import { logger } from './logger';

/**
 * Three Redis connections: commands, publisher, subscriber (a subscribed connection cannot run
 * regular commands). BullMQ creates its own connections from the same URL.
 */
let cmd: Redis | null = null;
let pub: Redis | null = null;
let sub: Redis | null = null;
let url = '';

function make(u: string, name: string): Redis {
  const r = new Redis(u, {
    connectionName: `tt-${name}`,
    maxRetriesPerRequest: null,
    enableAutoPipelining: true,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
  r.on('error', (e) => logger.error({ err: e.message, name }, 'redis error'));
  return r;
}

export function initRedis(u: string) {
  url = u;
  cmd = make(u, 'cmd');
  pub = make(u, 'pub');
  sub = make(u, 'sub');
}

export function redis(): Redis {
  if (!cmd) throw new Error('Redis not initialised');
  return cmd;
}
export function redisPub(): Redis {
  if (!pub) throw new Error('Redis not initialised');
  return pub;
}
export function redisSub(): Redis {
  if (!sub) throw new Error('Redis not initialised');
  return sub;
}
export function redisUrl(): string {
  return url;
}
export function hasRedis(): boolean {
  return cmd !== null;
}

export async function closeRedis() {
  await Promise.all([cmd, pub, sub].map((c) => c?.quit().catch(() => undefined)));
  cmd = pub = sub = null;
}

export async function pingRedis(): Promise<number> {
  const t = performance.now();
  await redis().ping();
  return Math.round((performance.now() - t) * 100) / 100;
}
