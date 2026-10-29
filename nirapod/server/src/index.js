// Server entry. If start-up fails (bad settings, database unreachable, a module that did not install), the
// process stays up in a minimal "start-up error" mode: /api/v1/health answers 503 with the problem category
// (setting names or database error codes only, never values), so the cause is visible without shell access.
import http from 'node:http';

const port = Number(process.env.PORT) || 3000;

function describe(err) {
  const msg = String(err?.message ?? err);
  if (msg.startsWith('Missing required production settings') || msg.startsWith('Invalid configuration')) {
    // These messages list setting names only.
    return { problem: 'settings', detail: msg };
  }
  const code = err?.code;
  const dbHints = {
    ER_ACCESS_DENIED_ERROR: 'Database user or password is wrong (DB_USER / DB_PASSWORD).',
    ER_BAD_DB_ERROR: 'Database name not found (DB_NAME).',
    ER_DBACCESS_DENIED_ERROR: 'This database user has no access to DB_NAME. Add the user to the database in hPanel.',
    ECONNREFUSED: 'Cannot reach the database server (DB_HOST / DB_PORT). On Hostinger use localhost and 3306.',
    ENOTFOUND: 'Database host name not found (DB_HOST).',
    ETIMEDOUT: 'Database connection timed out (DB_HOST).',
  };
  if (code && dbHints[code]) return { problem: 'database', code, detail: dbHints[code] };
  if (code === 'ERR_MODULE_NOT_FOUND' || code === 'ERR_DLOPEN_FAILED') {
    return { problem: 'install', code, detail: 'A package is missing or did not build. Run the npm install / redeploy again.' };
  }
  return { problem: 'startup', code: code ?? null, detail: 'Start-up failed. See the application logs.' };
}

function startupErrorServer(info) {
  const body = JSON.stringify({ status: 'error', ...info });
  http
    .createServer((req, res) => {
      res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(body);
    })
    .listen(port);
}

// No top-level await: Hostinger's LiteSpeed/Passenger loader require()s the startup file, and Node can only
// require() an ES module that has no top-level await.
async function main() {
  const { loadConfig } = await import('./config.js');
  const { createLogger } = await import('./logger.js');
  const { createDb } = await import('./db/knex.js');
  const { createApp } = await import('./app.js');
  const { attachRealtime } = await import('./realtime.js');
  const { startScheduler } = await import('./jobs/index.js');

  const cfg = loadConfig();
  const logger = createLogger(cfg.LOG_LEVEL);
  const db = createDb(cfg);
  const adminDb = createDb(cfg, { admin: true });
  if (!cfg.DB_ADMIN_USER) logger.warn('DB_ADMIN_USER not set: admin panel shares the app DB user (dev only).');

  // Shared hosting (Hostinger Node.js) often has no shell: apply migrations and the idempotent seed on start.
  // Set AUTO_MIGRATE=false to run them by hand instead.
  try {
    if (process.env.AUTO_MIGRATE !== 'false') {
      const { seed } = await import('./db/seed.js');
      const [, applied] = await db.migrate.latest();
      if (applied.length) logger.info({ applied: applied.length }, 'migrations applied');
      await seed(db);
    }
  } catch (err) {
    await Promise.allSettled([db.destroy(), adminDb.destroy()]);
    throw err;
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
}

main().catch((err) => {
  const info = describe(err);
  console.error(`Nirapod start-up failed: ${info.problem}${info.code ? ` (${info.code})` : ''}: ${info.detail}`);
  startupErrorServer(info);
});
