import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

/** Integration tests run against a real MySQL/MariaDB and Redis (see README → Testing). */
const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-test-'));
Object.assign(process.env, {
  NODE_ENV: 'test',
  STORAGE_DIR: storage,
  APP_URL: 'http://localhost:3999',
  DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT ?? '3306',
  DB_USER: process.env.TEST_DB_USER ?? 'tt',
  DB_PASSWORD: process.env.TEST_DB_PASSWORD ?? 'ttpass',
  DB_NAME: process.env.TEST_DB_NAME ?? 'tradeteam_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15',
  SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
  ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
  WEBHOOK_SECRET: 'test-webhook-secret',
  LOG_LEVEL: 'silent',
});
