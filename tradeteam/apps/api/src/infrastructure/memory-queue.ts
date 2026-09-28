import { logger } from './logger';

/**
 * In-process job queue used when no Redis is configured (single-server hosting). Same contract as
 * the BullMQ usage elsewhere: named queues, a processor per queue, retries with exponential
 * backoff. Jobs are not persisted across restarts — they carry only notifications (email/push),
 * never financial operations, which are always committed to MySQL synchronously.
 */
interface Job {
  id: string;
  name: string;
  data: unknown;
  attemptsMade: number;
  timestamp: number;
}
type Processor = (job: Job) => Promise<unknown>;

const ATTEMPTS = 5;
let seq = 0;

export class MemoryQueue {
  private waiting: Job[] = [];
  private active = 0;
  private failed = 0;
  private delayed = 0;
  private processor: Processor | null = null;
  constructor(
    readonly name: string,
    private concurrency = 4,
  ) {}

  async add(name: string, data: unknown) {
    const job: Job = { id: String(++seq), name, data, attemptsMade: 0, timestamp: Date.now() };
    this.waiting.push(job);
    this.pump();
    return job;
  }

  process(p: Processor, concurrency: number) {
    this.processor = p;
    this.concurrency = concurrency;
    this.pump();
  }

  private pump() {
    while (this.processor && this.active < this.concurrency && this.waiting.length) {
      const job = this.waiting.shift()!;
      this.active++;
      this.processor(job)
        .catch((err: Error) => {
          job.attemptsMade++;
          if (job.attemptsMade < ATTEMPTS) {
            this.delayed++;
            setTimeout(
              () => {
                this.delayed--;
                this.waiting.push(job);
                this.pump();
              },
              2000 * 2 ** (job.attemptsMade - 1),
            ).unref();
          } else this.failed++;
          logger.error(
            { queue: this.name, job: job.name, attempts: job.attemptsMade, err: err.message },
            'job failed',
          );
        })
        .finally(() => {
          this.active--;
          this.pump();
        });
    }
  }

  async getJobCounts() {
    return { waiting: this.waiting.length, active: this.active, failed: this.failed, delayed: this.delayed };
  }
  async getJobs() {
    return [...this.waiting];
  }
  async close() {
    this.processor = null;
  }
}
