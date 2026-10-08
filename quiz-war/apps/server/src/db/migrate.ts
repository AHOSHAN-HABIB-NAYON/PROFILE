import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'mysql2/promise';

/** Finds database/migrations by walking up from this file (works from src/ and bundled dist/). */
function findMigrationsDir() {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'database', 'migrations');
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd(), 'database/migrations');
}

export const MIGRATIONS_DIR = findMigrationsDir();

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
