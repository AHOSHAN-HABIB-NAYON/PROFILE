// Usage: node scripts/seed.js [--all-languages]
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/knex.js';
import { seed } from '../src/db/seed.js';

const db = createDb(loadConfig());
try {
  await seed(db, { allLanguages: process.argv.includes('--all-languages') });
  console.log('Seed complete');
} finally {
  await db.destroy();
}
