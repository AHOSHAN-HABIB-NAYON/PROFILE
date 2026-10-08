import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'mysql2/promise';

export const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../database/migrations');

/** Split a migration file into statements. Migrations must end statements with `;` + newline. */
export function splitSql(sql: string): string[] {
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function migrate(pool: Pool, dir = process.env.MIGRATIONS_DIR || MIGRATIONS_DIR, log: (m: string) => void = console.log) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name VARCHAR(190) NOT NULL PRIMARY KEY,
       applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  );
  const [rows] = await pool.query('SELECT name FROM schema_migrations');
  const applied = new Set((rows as { name: string }[]).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    const conn = await pool.getConnection();
    try {
      // DDL auto-commits in MySQL, so migrations are written to be applied once, in order.
      for (const stmt of splitSql(sql)) await conn.query(stmt);
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
      log(`migrated ${file}`);
    } finally {
      conn.release();
    }
  }
}
