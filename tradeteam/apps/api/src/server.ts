import http from 'node:http';
import type { RequestHandler } from 'express';
import { loadEnv, isInstalled, requireRuntimeEnv } from './config/env';
import { ensureStorage, WEB_ROOT, APP_VERSION, INSTALL_TOKEN_FILE, INSTALL_LOCK_FILE } from './config/paths';
import { logger } from './infrastructure/logger';
import { initDb, closeDb, db } from './infrastructure/db';
import { initRedis, closeRedis, redisSub } from './infrastructure/redis';
import { closeQueues } from './infrastructure/queue';
import { setEncryptionKey } from './infrastructure/crypto';
import { migrate } from './database/migrator';
import { buildServer } from './http/app';
import { loadSettings, setSettings, getSetting } from './modules/settings/settings.service';
import { loadFees, subscribeFeeUpdates } from './modules/trading/fees';
import { loadAssets } from './modules/wallets/assets-cache';
import { loadMarkets, hydrateTickers, subscribeRegistryUpdates } from './modules/markets/registry';
import { Gateway } from './websocket/gateway';
import { MatchingEngine } from './modules/trading/engine';
import { setLocalEngine, startCommandConsumer } from './modules/trading/engine-client';
import { startExternalReconciler } from './modules/trading/external';
import { MarketDataHub } from './modules/market-data/hub';
import { startNotificationWorkers } from './modules/notifications/notifications.service';
import { snapshotAll } from './modules/portfolio/portfolio.service';
import { ensureSetupToken } from './modules/install/install.service';
import { runtime } from './modules/system/runtime';

/**
 * Process entry point. A single Node.js process can serve everything (API, WebSocket, Next.js web
 * app, market-data hub, matching engine, workers) or be split by role flags for scaling.
 */
/**
 * PaaS hosts (e.g. Hostinger Node.js apps) replace the app folder on redeploy, which deletes
 * storage/install.lock. If complete configuration is provided through environment variables and
 * the configured database already contains an installation, restore the lock instead of showing
 * the installer again. An empty database still goes through the installer.
 */
async function recoverInstallLock() {
  let cfg: ReturnType<typeof requireRuntimeEnv>;
  try {
    cfg = requireRuntimeEnv(loadEnv(true));
  } catch {
    return; // configuration incomplete → first-run installer
  }
  // Configuration is complete, so the database should exist: wait for it rather than falling
  // back to the installer during a transient outage at boot.
  for (let attempt = 1; attempt <= 10; attempt++) {
    if ((await checkInstalledDb(cfg)) !== null) return;
    logger.warn({ attempt }, 'database not reachable yet, retrying');
    await new Promise((r) => setTimeout(r, 3000));
  }
}

/** true = installation found and lock restored, false = no installation, null = could not check. */
async function checkInstalledDb(cfg: ReturnType<typeof requireRuntimeEnv>): Promise<boolean | null> {
  const { createPool } = await import('./infrastructure/db');
  const pool = createPool({
    host: cfg.DB_HOST,
    port: cfg.DB_PORT,
    user: cfg.DB_USER,
    password: cfg.DB_PASSWORD,
    database: cfg.DB_NAME,
    poolSize: 1,
  });
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('schema_migrations','users')",
      [cfg.DB_NAME],
    );
    if (Number((rows as { n: number | string }[])[0]?.n) !== 2) return false;
    const fs = await import('node:fs');
    fs.writeFileSync(
      INSTALL_LOCK_FILE,
      JSON.stringify({
        installedAt: 'recovered',
        version: APP_VERSION,
        recoveredAt: new Date().toISOString(),
      }),
      { mode: 0o600, flag: 'wx' },
    );
    logger.warn(
      'install lock restored from existing database (storage was reset, configuration comes from the environment)',
    );
    return true;
  } catch (e) {
    if ((e as { code?: string }).code === 'ER_BAD_DB_ERROR') return false; // database not created yet → installer
    logger.warn({ err: (e as Error).message }, 'install state check failed');
    return null;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function main() {
  ensureStorage();
  const env = loadEnv();
  const server = http.createServer();
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  let nextHandler: RequestHandler | null = null;
  type Upgrade = (req: http.IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => unknown;
  let nextUpgrade: Upgrade | null = null;
  if (env.SERVE_WEB) {
    const { default: next } = await import('next');
    const nextApp = next({
      dev: env.NODE_ENV !== 'production',
      dir: WEB_ROOT,
      hostname: 'localhost',
      port: env.PORT,
    });
    await nextApp.prepare();
    const handle = nextApp.getRequestHandler();
    nextHandler = (req, res) => {
      void handle(req, res);
    };
    nextUpgrade = nextApp.getUpgradeHandler() as unknown as Upgrade;
  }

  const stops: (() => Promise<unknown> | unknown)[] = [];
  let activated = false;

  const { app, mountAppApi } = buildServer({ activate: () => activate(), nextHandler });
  server.on('request', app);
  server.on('upgrade', (req, socket, head) => {
    // Socket.IO handles /socket.io; everything else (Next.js HMR in development) goes to Next.
    if (!req.url?.startsWith('/socket.io') && nextUpgrade) nextUpgrade(req, socket, head);
  });

  async function activate() {
    if (activated) return;
    const cfg = requireRuntimeEnv(loadEnv(true));
    setEncryptionKey(cfg.ENCRYPTION_KEY);
    initDb({
      host: cfg.DB_HOST,
      port: cfg.DB_PORT,
      user: cfg.DB_USER,
      password: cfg.DB_PASSWORD,
      database: cfg.DB_NAME,
      poolSize: cfg.DB_POOL_SIZE,
      ssl: cfg.DB_SSL,
    });
    initRedis(cfg.REDIS_URL);
    if (cfg.AUTO_MIGRATE) {
      const r = await migrate(db());
      if (r.applied.length) logger.info({ applied: r.applied }, 'database upgraded');
    }
    await loadSettings();
    if (getSetting('system.installed_version') !== APP_VERSION)
      await setSettings({ 'system.installed_version': APP_VERSION });
    await redisSub().subscribe('settings:changed');
    redisSub().on('message', (ch) => {
      if (ch === 'settings:changed')
        loadSettings().catch((e) => logger.error({ err: e.message }, 'settings reload failed'));
    });
    await loadFees();
    await loadAssets();
    await loadMarkets();
    await hydrateTickers();
    await subscribeRegistryUpdates();
    await subscribeFeeUpdates();
    redisSub().on('message', (ch) => {
      if (ch === 'markets:changed') {
        loadAssets().catch(() => undefined);
        runtime.hub?.refreshSymbolMap();
        runtime.engine?.loadMarkets().catch(() => undefined);
      }
    });
    mountAppApi();

    const gateway = new Gateway(server);
    await gateway.start();
    runtime.gateway = gateway;
    stops.push(() => gateway.stop());

    if (cfg.RUN_ENGINE) {
      const engine = new MatchingEngine();
      await engine.start();
      setLocalEngine(engine);
      runtime.engine = engine;
      const stopConsumer = await startCommandConsumer(engine, cfg.INSTANCE_ID);
      stops.push(stopConsumer, () => engine.stop());
    }
    if (cfg.RUN_MARKET_DATA) {
      const hub = new MarketDataHub(cfg.INSTANCE_ID);
      await hub.start();
      runtime.hub = hub;
      stops.push(() => hub.stop());
    }
    if (cfg.RUN_WORKERS) {
      startNotificationWorkers();
      const rec = startExternalReconciler();
      const snap = setInterval(() => snapshotAll().catch(() => undefined), 3_600_000);
      setTimeout(() => snapshotAll().catch(() => undefined), 30_000);
      stops.push(
        () => clearInterval(rec),
        () => clearInterval(snap),
      );
    }
    runtime.mode = 'app';
    activated = true;
    logger.info(
      {
        version: APP_VERSION,
        roles: { engine: cfg.RUN_ENGINE, marketData: cfg.RUN_MARKET_DATA, workers: cfg.RUN_WORKERS },
      },
      'application active',
    );
  }

  if (!isInstalled()) await recoverInstallLock();
  if (isInstalled()) {
    await activate();
  } else {
    const token = ensureSetupToken();
    logger.warn(
      `Platform not installed. Open ${env.APP_URL}/install — setup token: ${token} (also in ${INSTALL_TOKEN_FILE})`,
    );
  }

  server.listen(env.PORT, env.HOST, () =>
    logger.info({ port: env.PORT, url: env.APP_URL }, 'http server listening'),
  );

  let shuttingDown = false;
  const shutdown = async (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ sig }, 'shutting down');
    server.close();
    for (const s of stops.reverse()) await Promise.resolve(s()).catch(() => undefined);
    await closeQueues();
    await closeRedis();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (e) => logger.error({ err: e }, 'unhandled rejection'));
}

main().catch((e) => {
  logger.fatal({ err: e }, 'fatal startup error');
  process.exit(1);
});
