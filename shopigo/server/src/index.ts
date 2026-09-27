import { loadEnvFile } from './core/env.js';

loadEnvFile();

const { config } = await import('./core/env.js');
const { logger } = await import('./core/logger.js');
const { ensureDirs } = await import('./core/paths.js');
const { detectInstallation } = await import('./core/state.js');
const { CODE_VERSION } = await import('./core/version.js');
const { db, initDb, pendingMigrations, runMigrations } = await import('./db/index.js');
const { seedDefaults } = await import('./db/defaults.js');
const { createApp, clientBuilt } = await import('./app.js');
const { startScheduler } = await import('./services/scheduler.js');

async function boot() {
  try { ensureDirs(); } catch (err) { logger.error({ err }, 'could not create storage directories'); }
  if (config.dbConfigured) {
    try { initDb(); } catch (err) { logger.error({ err }, 'database init failed'); }
  }
  const installed = await detectInstallation(() => db());
  if (installed) {
    // Code was updated (via the admin updater or by uploading files): apply
    // pending forward-only migrations automatically, after a safety backup.
    const pending = await pendingMigrations().catch(() => [] as string[]);
    if (pending.length) {
      logger.warn({ pending }, 'pending migrations found — backing up and migrating');
      try {
        const { createBackup } = await import('./services/backup.js');
        await createBackup('database', null, `pre-update auto backup before ${pending.join(', ')}`);
      } catch (err) { logger.error({ err }, 'pre-migration backup failed — migrations aborted'); throw err; }
      await runMigrations();
    }
    await seedDefaults(db());
    await db().updateTable('installation').set({ version: CODE_VERSION }).where('id', '=', 1).execute();
    startScheduler();
  }
  if (!clientBuilt()) logger.warn('client/dist is missing — run `npm run build`');

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    logger.info({ port: config.port, version: CODE_VERSION, installed }, installed ? 'ShopiGo is running' : 'ShopiGo is waiting for installation — open the site in a browser');
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  const shutdown = (signal: string) => {
    logger.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
}

boot().catch((err) => {
  logger.fatal({ err }, 'ShopiGo failed to start');
  process.exit(1);
});
