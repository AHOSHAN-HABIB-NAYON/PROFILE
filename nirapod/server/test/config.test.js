import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

test('production refuses to start without secrets and a separate admin DB user', () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /JWT_ACCESS_SECRET.*MASTER_KEY.*DB_ADMIN_USER/);
});

test('production forces HTTPS', () => {
  const cfg = loadConfig({
    NODE_ENV: 'production', JWT_ACCESS_SECRET: 'x'.repeat(40), MASTER_KEY: 'k', DB_PASSWORD: 'p',
    DB_ADMIN_USER: 'a', DB_ADMIN_PASSWORD: 'b',
  });
  assert.equal(cfg.FORCE_HTTPS, true);
});

test('CORS allow-list is parsed', () => {
  const cfg = loadConfig({ CORS_ALLOWED_ORIGINS: 'https://a.com, https://b.com' });
  assert.deepEqual(cfg.corsOrigins, ['https://a.com', 'https://b.com']);
});
