import { loadEnv } from './config/env';
import { createContext } from './context';
import { closePool, createPool, exec, queryOne } from './db/pool';
import { hashPassword } from './lib/crypto';
import { seedDevQuestions } from './scripts/seed-dev';
import { migrate } from './db/migrate';
import { buildApp, corsOrigins } from './app';
import { createGateway } from './realtime/gateway';
import { startJobs } from './jobs';

/**
 * Hosting without a terminal (e.g. Hostinger): optional one-time bootstrap from env vars.
 *  - ADMIN_BOOTSTRAP_EMAIL + ADMIN_BOOTSTRAP_PASSWORD: creates the first Super Admin if no admin exists.
 *  - SEED_SAMPLE_QUESTIONS=true: loads the bundled sample questions if the question table is empty.
 */
async function bootstrap(log: { info: (m: string) => void; warn: (m: string) => void }) {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (email && password) {
    const existing = await queryOne<{ n: number }>('SELECT COUNT(*) n FROM admin_users');
    if (Number(existing?.n) === 0) {
      if (password.length < 12) log.warn('ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters — admin not created');
      else {
        const role = await queryOne<{ id: number }>(`SELECT id FROM admin_roles WHERE role_key = 'super_admin'`);
        await exec('INSERT INTO admin_users (email, name, password_hash, role_id) VALUES (?, ?, ?, ?)', [email, 'Super Admin', await hashPassword(password), role!.id]);
        log.info(`Bootstrap Super Admin created: ${email} — remove ADMIN_BOOTSTRAP_PASSWORD from the environment now`);
      }
    }
  }
  if (process.env.SEED_SAMPLE_QUESTIONS === 'true') {
    const q = await queryOne<{ n: number }>('SELECT COUNT(*) n FROM questions');
    if (Number(q?.n) === 0) log.info(`Seeded ${await seedDevQuestions()} sample questions`);
  }
}

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

  await bootstrap(app.log);
  await ctx.settings.load(true);
  await ctx.seasons.tick((m) => app.log.info(m));
  ctx.matchmaking.start();
  const stopJobs = startJobs(ctx);
  // Website push works without setup: VAPID keys are generated once and kept in the database.
  await ctx.push.ensureWebKeys();
  void ctx.ai.recover().catch((err) => app.log.error({ err }, 'ai job recovery failed'));
  // Uploads live in the database too; put back anything a redeploy wiped from the media folder.
  void ctx.storage.syncFromBackup().catch((err) => app.log.error({ err }, 'media restore failed'));

  await app.ready();
  createGateway(ctx, app.server, corsOrigins(env.CORS_ORIGINS));
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
