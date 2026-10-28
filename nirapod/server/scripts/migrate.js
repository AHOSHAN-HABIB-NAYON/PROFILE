// Usage: node scripts/migrate.js latest|rollback|status
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/knex.js';

const cmd = process.argv[2] || 'latest';
const db = createDb(loadConfig());
try {
  if (cmd === 'latest') {
    const [batch, files] = await db.migrate.latest();
    console.log(`Migrations batch ${batch}: ${files.length ? files.join(', ') : 'already up to date'}`);
  } else if (cmd === 'rollback') {
    const [batch, files] = await db.migrate.rollback();
    console.log(`Rolled back batch ${batch}: ${files.join(', ') || 'nothing'}`);
  } else if (cmd === 'status') {
    const [done, pending] = await db.migrate.list();
    console.log({ done: done.map((d) => d.name ?? d), pending: pending.map((p) => p.file ?? p) });
  } else {
    throw new Error(`Unknown command ${cmd}`);
  }
} finally {
  await db.destroy();
}
