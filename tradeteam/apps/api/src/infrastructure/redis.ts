import { Redis } from 'ioredis';
import { logger } from './logger';
import { MemoryRedis } from './memory-redis';

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

let memory = false;

/** Empty URL → built-in in-memory mode (single server only; see memory-redis.ts). */
export function initRedis(u: string | undefined) {
  url = u ?? '';
  memory = !url;
  if (memory) {
    logger.warn('REDIS_URL not set: using built-in in-memory mode (single server only)');
    cmd = new MemoryRedis() as unknown as Redis;
    pub = new MemoryRedis() as unknown as Redis;
    sub = new MemoryRedis() as unknown as Redis;
    return;
  }
  cmd = make(url, 'cmd');
  pub = make(url, 'pub');
  sub = make(url, 'sub');
}

export function isMemoryRedis() {
  return memory;
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
