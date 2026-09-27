import crypto from 'node:crypto';
import type { Pool } from 'mysql2/promise';
import { logger } from '../infrastructure/logger';
import { MIGRATIONS } from './migrations';

export interface Migration {
  version: number;
  name: string;
  up: string[];
  /** Optional migrations may fail due to privileges without blocking startup. */
  optional?: boolean;
}

function checksum(m: Migration) {
  return crypto.createHash('sha256').update(m.up.join('\n;\n')).digest('hex');
}

export async function ensureMigrationsTable(pool: Pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INT UNSIGNED PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    checksum CHAR(64) NOT NULL,
    status ENUM('applied','skipped') NOT NULL DEFAULT 'applied',
    applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

export async function appliedVersions(pool: Pool): Promise<Map<number, string>> {
  const [rows] = await pool.query('SELECT version, checksum FROM schema_migrations');
  return new Map(
    (rows as { version: number; checksum: string }[]).map((r) => [Number(r.version), r.checksum]),
  );
}

export async function pendingMigrations(pool: Pool, list: Migration[] = MIGRATIONS): Promise<Migration[]> {
  await ensureMigrationsTable(pool);
  const applied = await appliedVersions(pool);
  return list.filter((m) => !applied.has(m.version));
}

/**
 * Applies only migrations that have not run yet. A named lock (GET_LOCK) prevents two instances
 * migrating concurrently. MySQL DDL is not transactional, so each migration's statements are
 * written to be applied once, in order; the version row is recorded only after all statements
 * succeed. Checksums detect edited historical migrations.
 */
export async function migrate(pool: Pool, list: Migration[] = MIGRATIONS): Promise<{ applied: number[] }> {
  const conn = await pool.getConnection();
  const appliedNow: number[] = [];
  try {
    const [lockRows] = await conn.query("SELECT GET_LOCK('tradeteam_migrate', 60) AS l");
    if ((lockRows as { l: number }[])[0]?.l !== 1) throw new Error('Could not acquire migration lock');
    await ensureMigrationsTable(pool);
    const applied = await appliedVersions(pool);
    for (const m of list) {
      const sum = checksum(m);
      const prev = applied.get(m.version);
      if (prev) {
        if (prev !== sum)
          logger.warn({ version: m.version }, 'migration checksum differs from applied version');
        continue;
      }
      logger.info({ version: m.version, name: m.name }, 'applying migration');
      let status: 'applied' | 'skipped' = 'applied';
      for (const stmt of m.up) {
        try {
          await conn.query(stmt);
        } catch (err) {
          if (m.optional) {
            logger.warn({ version: m.version, err: (err as Error).message }, 'optional migration skipped');
            status = 'skipped';
            break;
          }
          throw new Error(`Migration ${m.version} (${m.name}) failed: ${(err as Error).message}`);
        }
      }
      await conn.query('INSERT INTO schema_migrations (version, name, checksum, status) VALUES (?,?,?,?)', [
        m.version,
        m.name,
        sum,
        status,
      ]);
      appliedNow.push(m.version);
    }
    return { applied: appliedNow };
  } finally {
    await conn.query("SELECT RELEASE_LOCK('tradeteam_migrate')").catch(() => undefined);
    conn.release();
  }
}

export function latestVersion(list: Migration[] = MIGRATIONS) {
  return list.reduce((a, m) => Math.max(a, m.version), 0);
}
