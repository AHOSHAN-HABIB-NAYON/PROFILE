import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/knex.js';
import { createLogger } from '../src/logger.js';
import { createApp } from '../src/app.js';
import { createCaptureTransport } from '../src/email/mailer.js';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nirapod-test-uploads-'));

export function testConfig(overrides = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    DB_HOST: process.env.DB_HOST || '127.0.0.1',
    DB_PORT: process.env.DB_PORT || '3306',
    DB_NAME: process.env.DB_NAME || 'nirapod_test',
    DB_USER: process.env.DB_USER || 'nirapod',
    DB_PASSWORD: process.env.DB_PASSWORD ?? 'nirapod',
    LOG_LEVEL: 'silent',
    JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-0123456789',
    BCRYPT_COST: '4', // production enforces >= 12 (config.test.js)
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '100000',
    REFRESH_RATE_LIMIT_MAX: '100000',
    UPLOAD_DIR,
    PUBLIC_BASE_URL: 'https://nirapod.example',
    ...overrides,
  });
}

export async function freshDb(cfg = testConfig()) {
  const db = createDb(cfg);
  await db.migrate.rollback(undefined, true);
  await db.migrate.latest();
  return db;
}

export function buildApp(db, overrides = {}, deps = {}) {
  const cfg = testConfig(overrides);
  return createApp({ cfg, db, logger: deps.logger ?? createLogger('silent'), ...deps });
}

/** A controllable clock for time-based rules. */
export function testClock(start = '2026-10-28T12:00:00.000Z') {
  let t = new Date(start).getTime();
  return {
    now: () => new Date(t),
    advance(ms) { t += ms; },
    set(iso) { t = new Date(iso).getTime(); },
  };
}

/** App wired with a test clock, an in-memory mail capture and a fake Google verifier. */
export function buildTestApp(db, overrides = {}, deps = {}) {
  const clock = deps.clock ?? testClock();
  const mail = createCaptureTransport();
  const google = { tokens: new Map() };
  const googleVerifier = async (idToken) => {
    const p = google.tokens.get(idToken);
    if (!p) {
      const { ApiError } = await import('../src/errors.js');
      throw new ApiError('AUTH_INVALID_CREDENTIALS', { message: 'Google sign-in failed. Please try again.' });
    }
    return p;
  };
  const app = buildApp(db, overrides, { clock, mailTransport: mail.transport, googleVerifier, ...deps });
  const codeRe = /^\s{4}(\d{6})$/m; // the code line in the plain-text body
  const lastCode = (to) => {
    const m = [...mail.messages].reverse().find((x) => x.to === to && codeRe.test(x.text));
    return m ? codeRe.exec(m.text)[1] : undefined;
  };
  return { app, clock, mail, google, lastCode, cfg: testConfig(overrides) };
}

export const UPLOADS = UPLOAD_DIR;

export const GOOD_PASSWORD = 'Nirapod-Family-2026';
let seq = 0;
export const uniqueEmail = (p = 'user') => `${p}${++seq}.${Date.now()}@example.com`;

/** Registers and verifies an email account. @returns the Session body plus `email`. */
export async function signUp(t, email = uniqueEmail(), { device, language } = {}) {
  await request(t.app).post('/api/v1/auth/register')
    .send({ email, password: GOOD_PASSWORD, adult_and_terms_confirmed: true, language }).expect(201);
  const res = await request(t.app).post('/api/v1/auth/verify-email')
    .send({ email, code: t.lastCode(email), device }).expect(200);
  return { ...res.body, email };
}

export const bearer = (s) => ({ authorization: `Bearer ${s.access_token}` });
