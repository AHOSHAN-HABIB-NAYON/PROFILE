import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createDb } from './db/knex.js';
import { createApp } from './app.js';
import { attachRealtime } from './realtime.js';
import { startScheduler } from './jobs/index.js';

const cfg = loadConfig();
const logger = createLogger(cfg.LOG_LEVEL);
const db = createDb(cfg);
const adminDb = createDb(cfg, { admin: true });
if (!cfg.DB_ADMIN_USER) logger.warn('DB_ADMIN_USER not set: admin panel shares the app DB user (dev only).');

// Shared hosting (Hostinger Node.js) often has no shell: apply migrations and the idempotent seed on start.
// Set AUTO_MIGRATE=false to run them by hand instead.
if (process.env.AUTO_MIGRATE !== 'false') {
  const { seed } = await import('./db/seed.js');
  const [, applied] = await db.migrate.latest();
  if (applied.length) logger.info({ applied: applied.length }, 'migrations applied');
  await seed(db);
}

const app = createApp({ cfg, db, adminDb, logger });
const server = app.listen(cfg.PORT, () => logger.info({ port: cfg.PORT }, 'Nirapod server listening'));
attachRealtime(server, app.locals.ctx);
// In-process jobs (set RUN_JOBS=false when cron runs scripts/run-jobs.js instead).
const stopJobs = process.env.RUN_JOBS === 'false' ? () => {} : startScheduler(app.locals.ctx);

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  stopJobs();
  server.close();
  await Promise.allSettled([db.destroy(), adminDb.destroy()]);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
