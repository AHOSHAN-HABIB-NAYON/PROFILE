import { redis, redisSub } from '../../infrastructure/redis';
import { Redis } from 'ioredis';
import { redisUrl, isMemoryRedis } from '../../infrastructure/redis';
import { randomToken } from '../../infrastructure/crypto';
import { logger } from '../../infrastructure/logger';
import type { MatchingEngine } from './engine';
import { getOrder, type OrderRow } from './orders.repo';

/**
 * Routes engine commands. In the engine process calls are direct (zero hop). Other API instances
 * push commands onto a Redis Stream consumed by the engine and wait for the reply on pub/sub.
 * Commands are idempotent (the engine re-reads order state), so redelivery is safe.
 */
const STREAM = 'engine:cmd';
const GROUP = 'engine';
let local: MatchingEngine | null = null;
const waiters = new Map<string, (ok: boolean, err?: string) => void>();
let listening = false;

export function setLocalEngine(e: MatchingEngine | null) {
  local = e;
}

export function localEngine() {
  return local;
}

async function listenReplies() {
  if (listening) return;
  listening = true;
  await redisSub().subscribe('engine:reply');
  redisSub().on('message', (ch, msg) => {
    if (ch !== 'engine:reply') return;
    const r = JSON.parse(msg) as { id: string; ok: boolean; err?: string };
    waiters.get(r.id)?.(r.ok, r.err);
  });
}

async function remote(op: 'submit' | 'cancel', orderId: string, reason?: string): Promise<OrderRow> {
  await listenReplies();
  const id = randomToken(12);
  const done = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      waiters.delete(id);
      resolve(); // the command stays queued; caller returns current state
    }, 5000);
    waiters.set(id, (ok, err) => {
      clearTimeout(t);
      waiters.delete(id);
      if (ok) resolve();
      else reject(new Error(err ?? 'engine error'));
    });
  });
  await redis().xadd(STREAM, '*', 'id', id, 'op', op, 'order', orderId, 'reason', reason ?? 'user');
  await done;
  return (await getOrder(orderId))!;
}

export function submitToEngine(orderId: string) {
  return local ? local.submit(orderId) : remote('submit', orderId);
}

export function cancelInEngine(orderId: string, reason = 'user') {
  return local ? local.cancel(orderId, reason) : remote('cancel', orderId, reason);
}

/** Engine side: consume commands from other instances. */
export async function startCommandConsumer(engine: MatchingEngine, consumer: string) {
  // Single-process memory mode: every command is local, no cross-process stream needed.
  if (isMemoryRedis()) return async () => undefined;
  const r = new Redis(redisUrl(), { maxRetriesPerRequest: null });
  try {
    await r.xgroup('CREATE', STREAM, GROUP, '$', 'MKSTREAM');
  } catch (e) {
    if (!String((e as Error).message).includes('BUSYGROUP')) throw e;
  }
  let stopped = false;
  (async () => {
    while (!stopped) {
      try {
        const res = (await r.xreadgroup(
          'GROUP',
          GROUP,
          consumer,
          'COUNT',
          50,
          'BLOCK',
          5000,
          'STREAMS',
          STREAM,
          '>',
        )) as [string, [string, string[]][]][] | null;
        if (!res) continue;
        for (const [, entries] of res) {
          for (const [entryId, fields] of entries) {
            const f: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) f[fields[i]!] = fields[i + 1]!;
            let ok = true;
            let err: string | undefined;
            try {
              if (f.op === 'submit') await engine.submit(f.order!);
              else if (f.op === 'cancel') await engine.cancel(f.order!, f.reason);
            } catch (e) {
              ok = false;
              err = (e as Error).message;
            }
            await r.xack(STREAM, GROUP, entryId);
            await redis().publish('engine:reply', JSON.stringify({ id: f.id, ok, err }));
          }
        }
      } catch (e) {
        if (!stopped) {
          logger.error({ err: (e as Error).message }, 'engine consumer error');
          await new Promise((res) => setTimeout(res, 1000));
        }
      }
    }
  })();
  return async () => {
    stopped = true;
    r.disconnect();
  };
}
