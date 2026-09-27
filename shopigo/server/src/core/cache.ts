import { Redis } from 'ioredis';
import { config } from './env.js';
import { logger } from './logger.js';

/**
 * Small cache abstraction: Redis when REDIS_URL is configured, otherwise an
 * in-process TTL map (fine for single-process shared hosting).
 */
interface Entry { value: string; expires: number }

class MemoryStore {
  private map = new Map<string, Entry>();
  get(key: string): string | null {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.expires < Date.now()) { this.map.delete(key); return null; }
    return e.value;
  }
  set(key: string, value: string, ttlSec: number) {
    if (this.map.size > 20000) this.sweep();
    this.map.set(key, { value, expires: Date.now() + ttlSec * 1000 });
  }
  del(prefix: string) {
    for (const k of this.map.keys()) if (k.startsWith(prefix)) this.map.delete(k);
  }
  private sweep() {
    const now = Date.now();
    for (const [k, e] of this.map) if (e.expires < now) this.map.delete(k);
    if (this.map.size > 20000) this.map.clear();
  }
}

let redis: Redis | null = null;
const memory = new MemoryStore();

export function getRedis(): Redis | null {
  if (redis || !config.redisUrl) return redis;
  redis = new Redis(config.redisUrl, { maxRetriesPerRequest: 2, lazyConnect: false, enableOfflineQueue: false });
  redis.on('error', (err) => logger.warn({ err: err.message }, 'redis error'));
  return redis;
}

const PREFIX = 'sg:';

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const r = getRedis();
      const raw = r && r.status === 'ready' ? await r.get(PREFIX + key) : memory.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  },
  async set(key: string, value: unknown, ttlSec = 60): Promise<void> {
    const raw = JSON.stringify(value);
    try {
      const r = getRedis();
      if (r && r.status === 'ready') await r.set(PREFIX + key, raw, 'EX', ttlSec);
      else memory.set(key, raw, ttlSec);
    } catch { memory.set(key, raw, ttlSec); }
  },
  async del(prefix: string): Promise<void> {
    memory.del(prefix);
    try {
      const r = getRedis();
      if (r && r.status === 'ready') {
        let cursor = '0';
        do {
          const [next, keys] = await r.scan(cursor, 'MATCH', PREFIX + prefix + '*', 'COUNT', 200);
          cursor = next;
          if (keys.length) await r.del(...keys);
        } while (cursor !== '0');
      }
    } catch { /* ignore */ }
  },
  async take<T>(key: string): Promise<T | null> {
    const v = await this.get<T>(key);
    if (v !== null) await this.del(key);
    return v;
  },
  async remember<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await fn();
    await this.set(key, value, ttlSec);
    return value;
  },
};
