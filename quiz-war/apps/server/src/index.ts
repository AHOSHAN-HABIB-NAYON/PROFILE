import { loadEnv } from './config/env';
import { createContext } from './context';
import { closePool, createPool } from './db/pool';
import { migrate } from './db/migrate';
import { buildApp } from './app';
import { createGateway } from './realtime/gateway';
import { startJobs } from './jobs';

async function main() {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL, env.DATABASE_POOL_SIZE);
  if (process.env.MIGRATE_ON_START === 'true') await migrate(pool);

  // Temporary logger until Fastify's logger exists.
  const boot = { info: console.log, warn: console.warn, error: console.error };
  const ctx = createContext(env, boot as any);
  const app = await buildApp(ctx);
  (ctx as any).log = app.log;
  Object.assign(ctx.log, { info: app.log.info.bind(app.log), warn: app.log.warn.bind(app.log), error: app.log.error.bind(app.log) });

  await ctx.settings.load(true);
  await ctx.seasons.tick((m) => app.log.info(m));
  ctx.matchmaking.start();
  const stopJobs = startJobs(ctx);

  await app.ready();
  createGateway(ctx, app.server, env.CORS_ORIGINS.split(',').map((s) => s.trim()));
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`QUIZ WAR API listening on ${env.HOST}:${env.PORT} (${env.NODE_ENV})`);

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'shutting down');
    stopJobs();
    ctx.matchmaking.stop();
    ctx.engine.shutdown();
    await new Promise((r) => setTimeout(r, 500));
    ctx.emitter.io?.close();
    await app.close();
    await ctx.redis?.quit().catch(() => undefined);
    await closePool();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal startup error', err);
  process.exit(1);
});
