import { loadEnvFile } from './core/env.js';

loadEnvFile();

/**
 * ShopiGo maintenance CLI (also used by the updater on a NEW release):
 *   node server/dist/cli.js migrate            apply pending migrations + idempotent defaults
 *   node server/dist/cli.js health             boot the app on a random port and probe it
 *   node server/dist/cli.js relink             recreate storage/install.lock from the database
 *   node server/dist/cli.js reset-admin <email> <new-password>
 *   node server/dist/cli.js backup [database|full|config]
 *   node server/dist/cli.js maintenance on|off
 *   node server/dist/cli.js seed-demo          development/demo data ONLY
 *   node server/dist/cli.js version
 */
const [, , command, ...args] = process.argv;

async function main() {
  const { CODE_VERSION } = await import('./core/version.js');
  const { config } = await import('./core/env.js');
  if (command === 'version') { console.log(CODE_VERSION); return; }
  if (!config.dbConfigured) throw new Error('Database is not configured (.env missing). Install ShopiGo from the browser first.');
  const { db, closeDb, runMigrations } = await import('./db/index.js');
  try {
    switch (command) {
      case 'migrate': {
        const applied = await runMigrations();
        const { seedDefaults } = await import('./db/defaults.js');
        await seedDefaults(db());
        await db().updateTable('installation').set({ version: CODE_VERSION }).where('id', '=', 1).execute();
        console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
        break;
      }
      case 'health': {
        const fs = await import('node:fs');
        const path = await import('node:path');
        const { CLIENT_DIST } = await import('./core/paths.js');
        if (!fs.existsSync(path.join(CLIENT_DIST, 'index.html'))) throw new Error('client/dist/index.html missing');
        const { ping, pendingMigrations } = await import('./db/index.js');
        await ping();
        const pending = await pendingMigrations();
        if (pending.length) throw new Error(`Pending migrations: ${pending.join(', ')}`);
        const { createApp } = await import('./app.js');
        const server = createApp().listen(0, '127.0.0.1');
        await new Promise((r) => server.once('listening', r));
        const port = (server.address() as { port: number }).port;
        const res = await fetch(`http://127.0.0.1:${port}/api/health`);
        const body = (await res.json()) as { ok: boolean; db: boolean };
        const home = await fetch(`http://127.0.0.1:${port}/api/public/bootstrap`);
        server.close();
        if (!res.ok || !body.db) throw new Error(`Health endpoint failed: ${JSON.stringify(body)}`);
        if (!home.ok && home.status !== 503) throw new Error(`Storefront API failed with HTTP ${home.status}`);
        console.log(`Health OK (version ${CODE_VERSION})`);
        break;
      }
      case 'relink': {
        const { writeLock } = await import('./core/state.js');
        const row = await db().selectFrom('installation').selectAll().where('id', '=', 1).executeTakeFirst();
        if (!row || row.status !== 'installed') throw new Error('No installed ShopiGo found in this database');
        writeLock(row.installation_id, row.version);
        console.log('install.lock recreated');
        break;
      }
      case 'reset-admin': {
        const [email, password] = args;
        if (!email || !password) throw new Error('Usage: reset-admin <email> <new-password>');
        const { hashPassword, passwordProblems } = await import('./services/password.js');
        const problem = passwordProblems(password);
        if (problem) throw new Error(problem);
        const r = await db().updateTable('admins').set({ password_hash: await hashPassword(password), failed_attempts: 0, locked_until: null, status: 'active' }).where('email', '=', email.toLowerCase()).executeTakeFirst();
        if (!Number(r.numUpdatedRows)) throw new Error('No admin with that email');
        await db().updateTable('admin_sessions').set({ revoked_at: new Date() }).where('revoked_at', 'is', null).execute();
        console.log('Password reset. All sessions signed out.');
        break;
      }
      case 'backup': {
        const { createBackup } = await import('./services/backup.js');
        const type = (args[0] ?? 'database') as 'database' | 'full' | 'config';
        const b = await createBackup(type, null, 'CLI backup');
        console.log(`Backup created: storage/backups/${b.file} (${Math.round(b.size / 1024)} KB)`);
        break;
      }
      case 'maintenance': {
        const { setMaintenance } = await import('./core/state.js');
        setMaintenance({ enabled: args[0] === 'on', reason: 'CLI' });
        console.log(`Maintenance ${args[0] === 'on' ? 'enabled' : 'disabled'}`);
        break;
      }
      case 'seed-demo': {
        const { seedDemo } = await import('./db/demo.js');
        await seedDemo();
        console.log('Demo data created (development only).');
        break;
      }
      default:
        console.log('Commands: migrate | health | relink | reset-admin <email> <password> | backup [type] | maintenance on|off | seed-demo | version');
    }
  } finally {
    await closeDb();
    const { getRedis } = await import('./core/cache.js');
    getRedis()?.disconnect();
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
});
