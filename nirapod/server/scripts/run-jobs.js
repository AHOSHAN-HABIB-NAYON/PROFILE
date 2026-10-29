// Runs every scheduled job once (for hPanel/system cron when the server process cannot keep timers).
// Usage: node scripts/run-jobs.js [job ...]
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/knex.js';
import { createLogger } from '../src/logger.js';
import { createRealtimeHub } from '../src/realtime.js';
import { systemClock } from '../src/clock.js';
import { JOBS, runJob } from '../src/jobs/index.js';

const cfg = loadConfig();
const db = createDb(cfg);
const ctx = { db, cfg, clock: systemClock, logger: createLogger(cfg.LOG_LEVEL), realtime: createRealtimeHub() };
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(JOBS);
try {
  for (const n of names) {
    if (!JOBS[n]) throw new Error(`Unknown job ${n}`);
    const affected = await runJob(db, systemClock, n, () => JOBS[n].run(ctx));
    console.log(`${n}: ${affected}`);
  }
} finally {
  await db.destroy();
}
