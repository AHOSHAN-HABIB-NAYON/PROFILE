import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/knex.js';
import { createLogger } from '../src/logger.js';
import { createApp } from '../src/app.js';

export function testConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DB_HOST: process.env.DB_HOST || '127.0.0.1',
    DB_PORT: process.env.DB_PORT || '3306',
    DB_NAME: process.env.DB_NAME || 'nirapod_test',
    DB_USER: process.env.DB_USER || 'nirapod',
    DB_PASSWORD: process.env.DB_PASSWORD ?? 'nirapod',
    LOG_LEVEL: 'silent',
    ...overrides,
  });
}

export async function freshDb(cfg = testConfig()) {
  const db = createDb(cfg);
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  return db;
}

export function buildApp(db, overrides = {}) {
  const cfg = testConfig(overrides);
  return createApp({ cfg, db, logger: createLogger('silent') });
}
