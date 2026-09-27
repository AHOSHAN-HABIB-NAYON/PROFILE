import { loadEnv, requireRuntimeEnv, isInstalled } from '../config/env';
import { createPool } from '../infrastructure/db';
import { migrate, pendingMigrations } from '../database/migrator';

/** `npm run migrate` — applies pending migrations for an installed deployment (safe to re-run). */
async function main() {
  if (!isInstalled()) {
    console.error('Not installed yet: open the site to run the installer first.');
    process.exit(1);
  }
  const env = requireRuntimeEnv(loadEnv());
  const pool = createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    poolSize: 2,
  });
  const pending = await pendingMigrations(pool);
  console.warn(
    pending.length
      ? `Pending: ${pending.map((m) => `${m.version}_${m.name}`).join(', ')}`
      : 'Database is up to date.',
  );
  const r = await migrate(pool);
  console.warn(`Applied: ${r.applied.length ? r.applied.join(', ') : 'none'}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
