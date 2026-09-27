import { afterAll, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { createPool } from '../src/infrastructure/db';
import { migrate, pendingMigrations, latestVersion } from '../src/database/migrator';
import { MIGRATIONS } from '../src/database/migrations';

const cfg = {
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
};
const NAME = 'tradeteam_migration_test';

afterAll(async () => {
  const c = await mysql.createConnection(cfg);
  await c.query(`DROP DATABASE IF EXISTS \`${NAME}\``);
  await c.end();
});

describe('migrations', () => {
  it('apply from scratch, are idempotent, and only run what is pending', async () => {
    const c = await mysql.createConnection(cfg);
    await c.query(`DROP DATABASE IF EXISTS \`${NAME}\``);
    await c.query(`CREATE DATABASE \`${NAME}\``);
    await c.end();
    const pool = createPool({ ...cfg, database: NAME, poolSize: 2 });
    expect((await pendingMigrations(pool)).length).toBe(MIGRATIONS.length);
    const first = await migrate(pool);
    expect(first.applied).toEqual(MIGRATIONS.map((m) => m.version));
    expect((await migrate(pool)).applied).toEqual([]);
    expect(await pendingMigrations(pool)).toEqual([]);

    // Simulate an application update shipping a new migration: only that one runs, data is preserved.
    await pool.query("INSERT INTO assets (symbol) VALUES ('KEEP')");
    const next = {
      version: latestVersion() + 1,
      name: 'test_add_column',
      up: ['ALTER TABLE assets ADD COLUMN test_col INT NULL'],
    };
    const r = await migrate(pool, [...MIGRATIONS, next]);
    expect(r.applied).toEqual([next.version]);
    const [rows] = await pool.query("SELECT symbol FROM assets WHERE symbol = 'KEEP'");
    expect((rows as unknown[]).length).toBe(1);

    // Money columns are DECIMAL, never floating point.
    const [cols] = await pool.query(
      "SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND DATA_TYPE IN ('float','double','real')",
      [NAME],
    );
    expect(cols).toEqual([]);
    await pool.end();
  });
});
