import { Queue, Worker, type Processor, type JobsOptions } from 'bullmq';
import { redisUrl } from './redis';
import { logger } from './logger';

/** BullMQ queues for background work (emails, pushes, announcements, reconciliation). */
const queues = new Map<string, Queue>();
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
}
