import { Kysely, MysqlDialect, sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { createPool, type Pool, type PoolOptions } from 'mysql2';
import { config } from '../core/env.js';
import { logger } from '../core/logger.js';
import { migrations } from './migrations/index.js';
import type { DB } from './types.js';

export interface DbCredentials { host: string; port: number; user: string; password: string; database: string }

let instance: Kysely<DB> | null = null;
let pool: Pool | null = null;

export function poolOptions(c: DbCredentials, extra: Partial<PoolOptions> = {}): PoolOptions {
  return {
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    database: c.database,
    connectionLimit: Number(process.env.DB_POOL_SIZE ?? 10),
    charset: 'utf8mb4_unicode_ci',
    timezone: 'Z',
    decimalNumbers: true,
    supportBigNumbers: true,
    dateStrings: false,
    connectTimeout: 10000,
    ...extra,
  };
}

export function createDb(c: DbCredentials): { db: Kysely<DB>; pool: Pool } {
  const p = createPool(poolOptions(c));
  p.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  const db = new Kysely<DB>({
    dialect: new MysqlDialect({ pool: p }),
    log: (event) => {
      if (event.level === 'error') logger.error({ err: (event.error as Error)?.message, sql: event.query.sql }, 'db query failed');
    },
  });
  return { db, pool: p };
}

export function initDb(): Kysely<DB> {
  if (instance) return instance;
  if (!config.dbConfigured) throw new Error('Database is not configured');
  const created = createDb(config.db);
  instance = created.db;
  pool = created.pool;
  return instance;
}

export function db(): Kysely<DB> {
  if (!instance) return initDb();
  return instance;
}

export function hasDb(): boolean {
  return instance !== null;
}

export async function closeDb(): Promise<void> {
  if (instance) await instance.destroy();
  instance = null;
  pool = null;
}

export function rawPool(): Pool {
  if (!pool) initDb();
  return pool!;
}

export async function runMigrations(target: Kysely<any> = db()): Promise<string[]> {
  const migrator = new Migrator({
    db: target,
    provider: { getMigrations: async () => migrations },
    migrationTableName: 'migrations',
    migrationLockTableName: 'migrations_lock',
  });
  const { error, results } = await migrator.migrateToLatest();
  const applied = (results ?? []).filter((r) => r.status === 'Success').map((r) => r.migrationName);
  const failed = (results ?? []).find((r) => r.status === 'Error');
  if (error || failed) {
    const msg = failed ? `Migration ${failed.migrationName} failed` : 'Migration failed';
    throw Object.assign(new Error(`${msg}: ${(error as Error)?.message ?? 'unknown error'}`), { cause: error });
  }
  return applied;
}

export async function pendingMigrations(target: Kysely<any> = db()): Promise<string[]> {
  const migrator = new Migrator({
    db: target,
    provider: { getMigrations: async () => migrations },
    migrationTableName: 'migrations',
    migrationLockTableName: 'migrations_lock',
  });
  const list = await migrator.getMigrations();
  return list.filter((m) => !m.executedAt).map((m) => m.name);
}

export async function ping(target: Kysely<any> = db()): Promise<boolean> {
  await sql`SELECT 1`.execute(target);
  return true;
}

/** JSON helpers for LONGTEXT JSON columns. */
export const json = {
  stringify(value: unknown): string | null {
    return value === undefined || value === null ? null : JSON.stringify(value);
  },
  parse<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try { return JSON.parse(value) as T; } catch { return fallback; }
  },
};
