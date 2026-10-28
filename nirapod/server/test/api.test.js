import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { freshDb, buildApp } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { ErrorCodes } from '../src/errors.js';

let db;
let app;
before(async () => {
  db = await freshDb();
  await seed(db);
  app = buildApp(db, { CORS_ALLOWED_ORIGINS: 'https://admin.example.com' });
});
after(async () => db.destroy());

test('GET /api/v1/health reports ok with db status', async () => {
  const res = await request(app).get('/api/v1/health').expect(200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.db, 'ok');
  assert.ok(res.headers['x-request-id']);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('security headers are set and x-powered-by is hidden', async () => {
  const res = await request(app).get('/api/v1/health');
  assert.equal(res.headers['x-powered-by'], undefined);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(res.headers['content-security-policy']);
});

test('errors use the consistent shape and known codes', async () => {
  const res = await request(app).get('/api/v1/does-not-exist').expect(404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
  assert.ok(res.body.error.requestId);
  assert.ok(ErrorCodes[res.body.error.code]);

  const bad = await request(app).post('/api/v1/health').set('content-type', 'application/json').send('{bad').expect(400);
  assert.equal(bad.body.error.code, 'BAD_REQUEST');
});

test('only /api/v1 is served', async () => {
  const res = await request(app).get('/api/health').expect(404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('CORS allows only the allow-list', async () => {
  const ok = await request(app).get('/api/v1/health').set('Origin', 'https://admin.example.com');
  assert.equal(ok.headers['access-control-allow-origin'], 'https://admin.example.com');
  const no = await request(app).get('/api/v1/health').set('Origin', 'https://evil.example.com');
  assert.equal(no.headers['access-control-allow-origin'], undefined);
});

test('rate limiting returns RATE_LIMITED', async () => {
  const limited = buildApp(db, { RATE_LIMIT_MAX: '2' });
  await request(limited).get('/api/v1/health').expect(200);
  await request(limited).get('/api/v1/health').expect(200);
  const res = await request(limited).get('/api/v1/health').expect(429);
  assert.equal(res.body.error.code, 'RATE_LIMITED');
});

test('GET /api/v1/app-config returns public settings only', async () => {
  const res = await request(app).get('/api/v1/app-config').expect(200);
  assert.equal(res.body.min_version, '0.1.0');
  assert.equal(res.body.languages_enabled.en, true);
  assert.equal(res.body.payment_banner_enabled, false);
  assert.equal(res.body.legal_request_email, undefined);
  assert.equal(res.body.support_emails, undefined);
  assert.ok(!JSON.stringify(res.body).match(/api_key|secret|password/i));
});

test('health reports degraded when the DB is down', async () => {
  const broken = { raw: async () => { throw new Error('down'); } };
  const res = await request(buildApp(broken)).get('/api/v1/health').expect(503);
  assert.equal(res.body.db, 'down');
});

test('landing and admin shells are served by the same server', async () => {
  await request(app).get('/').expect(200).expect('content-type', /html/);
  await request(app).get('/admin/').expect(200).expect('content-type', /html/);
});
