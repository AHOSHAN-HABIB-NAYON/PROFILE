import { Queue, Worker, type Processor, type JobsOptions } from 'bullmq';
import { redisUrl, isMemoryRedis } from './redis';
import { MemoryQueue } from './memory-queue';
import { logger } from './logger';

/** BullMQ queues for background work (emails, pushes, announcements, reconciliation). */
const queues = new Map<string, Queue>();
const memQueues = new Map<string, MemoryQueue>();
function memQueue(name: string) {
  let q = memQueues.get(name);
  if (!q) memQueues.set(name, (q = new MemoryQueue(name)));
  return q;
}
const workers: Worker[] = [];

function connection() {
  const u = new URL(redisUrl());
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname && u.pathname.length > 1 ? Number(u.pathname.slice(1)) : 0,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export function queue(name: string): Queue {
  if (isMemoryRedis()) return memQueue(name) as unknown as Queue;
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: connection(),
      prefix: 'tt:q',
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
    queues.set(name, q);
  }
  return q;
}

export async function enqueue(name: string, jobName: string, data: unknown, opts?: JobsOptions) {
  return queue(name).add(jobName, data, opts);
}

export function startWorker(name: string, processor: Processor, concurrency = 4) {
  if (isMemoryRedis()) {
    memQueue(name).process(processor as never, concurrency);
    return null;
  }
  const w = new Worker(name, processor, { connection: connection(), prefix: 'tt:q', concurrency });
  w.on('failed', (job, err) =>
    logger.error(
      { queue: name, job: job?.name, id: job?.id, attempts: job?.attemptsMade, err: err.message },
      'job failed',
    ),
  );
  workers.push(w);
  return w;
}

export async function closeQueues() {
  await Promise.all(workers.map((w) => w.close().catch(() => undefined)));
  await Promise.all([...queues.values()].map((q) => q.close().catch(() => undefined)));
  workers.length = 0;
  queues.clear();
  await Promise.all([...memQueues.values()].map((q) => q.close()));
  memQueues.clear();
}
