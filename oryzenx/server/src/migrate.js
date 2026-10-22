const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

// Columns added after the first release. Added only if missing, so this works on MySQL and MariaDB.
const COLUMNS = [
  ['users', 'kyc_status', "ENUM('none','submitted','approved','rejected','resubmit','review') NOT NULL DEFAULT 'none'"],
  ['users', 'kyc_note', 'VARCHAR(255) NULL'],
  ['users', 'kyc_fail_count', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'],
  ['users', 'kyc_consent_at', 'DATETIME NULL'],
  ['users', 'kyc_submitted_at', 'DATETIME NULL'],
];

async function ensureColumn(table, column, ddl) {
  const [rows] = await pool.query(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column],
  );
  if (!rows.length) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
}

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = sql
    .split(/;\s*$/m)
    .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  for (const stmt of statements) await pool.query(stmt);
  for (const [t, c, d] of COLUMNS) await ensureColumn(t, c, d);
}

module.exports = migrate;

if (require.main === module) {
  migrate()
    .then(() => { console.log('Database schema is up to date.'); return pool.end(); })
    .catch((err) => { console.error(err); process.exit(1); });
}
