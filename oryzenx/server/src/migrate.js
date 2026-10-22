const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  for (const stmt of statements) await pool.query(stmt);
}

module.exports = migrate;

if (require.main === module) {
  migrate()
    .then(() => { console.log('Database schema is up to date.'); return pool.end(); })
    .catch((err) => { console.error(err); process.exit(1); });
}
