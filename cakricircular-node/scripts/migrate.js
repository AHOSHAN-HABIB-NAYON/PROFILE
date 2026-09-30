import { migrate } from '../src/migrate.js';
import { closePool } from '../src/db.js';
const n = await migrate({ log: console.log });
console.log(`✔ ডাটাবেস প্রস্তুত (${n}টি টেবিল)`);
await closePool();
