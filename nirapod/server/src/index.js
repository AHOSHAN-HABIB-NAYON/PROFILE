import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createDb } from './db/knex.js';
import { createApp } from './app.js';

const cfg = loadConfig();
const logger = createLogger(cfg.LOG_LEVEL);
const db = createDb(cfg);
const adminDb = createDb(cfg, { admin: true });
if (!cfg.DB_ADMIN_USER) logger.warn('DB_ADMIN_USER not set: admin panel shares the app DB user (dev only).');

const app = createApp({ cfg, db, adminDb, logger });
const server = app.listen(cfg.PORT, () => logger.info({ port: cfg.PORT }, 'Nirapod server listening'));

async function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close();
  await Promise.allSettled([db.destroy(), adminDb.destroy()]);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
