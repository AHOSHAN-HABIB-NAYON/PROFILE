import { EventEmitter } from 'node:events';

/**
 * In-process stand-in for the subset of Redis the platform uses, for single-server hosting
 * without a Redis service (e.g. Node.js web hosting that only provides MySQL).
 *
 * All instances share one keyspace and one pub/sub bus, exactly like several connections to one
 * Redis server — but only inside this process. Durable data always lives in MySQL; everything kept
 * here (caches, session cache, market snapshots, rate-limit counters) is safe to lose on restart.
 * Multi-instance deployments must use a real Redis.
 */
type Val = string | Map<string, string> | string[] | Set<string>;
const store = new Map<string, { v: Val; exp: number | null }>();
const bus = new EventEmitter();
bus.setMaxListeners(0);

function live(key: string) {
  const e = store.get(key);
  if (!e) return null;
  if (e.exp !== null && e.exp <= Date.now()) {
    store.delete(key);
    return null;
  }
  return e;
}

function globToRe(p: string) {
  return new RegExp(
    '^' +
      p
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.') +
      '$',
  );
}

// Periodic sweep so expired keys do not accumulate.
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of store) if (e.exp !== null && e.exp <= now) store.delete(k);
}, 30_000).unref();

export class MemoryRedis extends EventEmitter {
  private channels = new Set<string>();
  private onBus = (ch: string, msg: string) => {
    if (this.channels.has(ch)) this.emit('message', ch, msg);
  };

  constructor() {
    super();
    this.setMaxListeners(0);
    bus.on('msg', this.onBus);
  }

  async ping() {
    return 'PONG';
  }
  async info() {
    return 'redis_version:memory\r\n';
  }
  async get(k: string) {
    const e = live(k);
    return e && typeof e.v === 'string' ? e.v : null;
  }
  async set(k: string, v: string, ...opts: (string | number)[]) {
    let exp: number | null = null;
    let nx = false;
    let keepTtl = false;
    for (let i = 0; i < opts.length; i++) {
      const o = String(opts[i]).toUpperCase();
      if (o === 'EX') exp = Date.now() + Number(opts[++i]) * 1000;
      else if (o === 'PX') exp = Date.now() + Number(opts[++i]);
      else if (o === 'NX') nx = true;
      else if (o === 'KEEPTTL') keepTtl = true;
    }
    const cur = live(k);
    if (nx && cur) return null;
    if (keepTtl && cur) exp = cur.exp;
    store.set(k, { v: String(v), exp });
    return 'OK';
  }
  async getdel(k: string) {
    const v = await this.get(k);
    store.delete(k);
    return v;
  }
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys.flat()) if (store.delete(k)) n++;
    return n;
  }
  async expire(k: string, sec: number) {
    const e = live(k);
    if (!e) return 0;
    e.exp = Date.now() + sec * 1000;
    return 1;
  }
  async flushdb() {
    store.clear();
    return 'OK';
  }
  private hash(k: string, create: boolean) {
    const e = live(k);
    if (e && e.v instanceof Map) return e.v;
    if (!create) return null;
    const m = new Map<string, string>();
    store.set(k, { v: m, exp: e?.exp ?? null });
    return m;
  }
  async hset(k: string, f: string, v: string) {
    const m = this.hash(k, true)!;
    const added = m.has(f) ? 0 : 1;
    m.set(f, String(v));
    return added;
  }
  async hget(k: string, f: string) {
    return this.hash(k, false)?.get(f) ?? null;
  }
  async hgetall(k: string) {
    return Object.fromEntries(this.hash(k, false) ?? []);
  }
  private list(k: string, create: boolean) {
    const e = live(k);
    if (e && Array.isArray(e.v)) return e.v;
    if (!create) return null;
    const l: string[] = [];
    store.set(k, { v: l, exp: e?.exp ?? null });
    return l;
  }
  async lpush(k: string, ...vals: string[]) {
    const l = this.list(k, true)!;
    for (const v of vals) l.unshift(String(v));
    return l.length;
  }
  private range(len: number, start: number, stop: number) {
    const s = start < 0 ? Math.max(0, len + start) : start;
    const e = stop < 0 ? len + stop : Math.min(stop, len - 1);
    return [s, e] as const;
  }
  async ltrim(k: string, start: number, stop: number) {
    const l = this.list(k, false);
    if (!l) return 'OK';
    const [s, e] = this.range(l.length, start, stop);
    const kept = e >= s ? l.slice(s, e + 1) : [];
    l.length = 0;
    l.push(...kept);
    return 'OK';
  }
  async lrange(k: string, start: number, stop: number) {
    const l = this.list(k, false);
    if (!l) return [];
    const [s, e] = this.range(l.length, start, stop);
    return e >= s ? l.slice(s, e + 1) : [];
  }
  private set_(k: string, create: boolean) {
    const e = live(k);
    if (e && e.v instanceof Set) return e.v;
    if (!create) return null;
    const s = new Set<string>();
    store.set(k, { v: s, exp: e?.exp ?? null });
    return s;
  }
  async sadd(k: string, ...m: string[]) {
    const s = this.set_(k, true)!;
    let n = 0;
    for (const x of m) {
      if (s.has(x)) continue;
      s.add(x);
      n++;
    }
    return n;
  }
  async srem(k: string, ...m: string[]) {
    const s = this.set_(k, false);
    let n = 0;
    for (const x of m) if (s?.delete(x)) n++;
    return n;
  }
  async smembers(k: string) {
    return [...(this.set_(k, false) ?? [])];
  }
  async sunion(...keys: string[]) {
    const out = new Set<string>();
    for (const k of keys) for (const x of this.set_(k, false) ?? []) out.add(x);
    return [...out];
  }
  async scan(_cursor: string, ...args: (string | number)[]) {
    const i = args.findIndex((a) => String(a).toUpperCase() === 'MATCH');
    const re = globToRe(i >= 0 ? String(args[i + 1]) : '*');
    return ['0', [...store.keys()].filter((k) => live(k) && re.test(k))] as [string, string[]];
  }
  async publish(ch: string, msg: string) {
    const n = bus.listenerCount('msg');
    queueMicrotask(() => bus.emit('msg', ch, msg));
    return n;
  }
  async subscribe(...chs: string[]) {
    chs.forEach((c) => this.channels.add(c));
    return this.channels.size;
  }
  async unsubscribe(...chs: string[]) {
    chs.forEach((c) => this.channels.delete(c));
    return this.channels.size;
  }
  /** Chainable pipeline; commands run in order on exec(). */
  pipeline() {
    const ops: (() => Promise<unknown>)[] = [];
    const proxy: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_t, prop: string) => {
          if (prop === 'exec')
            return async () =>
              Promise.all(
                ops.map((op) =>
                  op()
                    .then((r) => [null, r] as [null, unknown])
                    .catch((e) => [e, null]),
                ),
              );
          return (...args: unknown[]) => {
            const fn = (this as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop];
            if (typeof fn !== 'function') throw new Error(`memory redis: unsupported command ${prop}`);
            ops.push(() => fn.apply(this, args));
            return proxy;
          };
        },
      },
    ) as Record<string, unknown>;
    return proxy;
  }
  async quit() {
    bus.off('msg', this.onBus);
    return 'OK';
  }
  disconnect() {
    bus.off('msg', this.onBus);
  }
}
