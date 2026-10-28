import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { Writable } from 'node:stream';
import { freshDb, buildTestApp, signUp, uniqueEmail, bearer, GOOD_PASSWORD, testClock } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { createLogger } from '../src/logger.js';
import { sha256 } from '../src/auth/tokens.js';

const MIN = 60_000;
let db;
let t;
before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db);
});
after(async () => db.destroy());

const api = () => request(t.app);
const post = (p, body, headers = {}) => api().post(`/api/v1${p}`).set(headers).send(body);

describe('register', () => {
  test('creates an unverified account, stores 18+/terms consent and emails a 6-digit code', async () => {
    const email = uniqueEmail('Reg').toUpperCase();
    const res = await post('/auth/register', { email: `  ${email} `, password: GOOD_PASSWORD, adult_and_terms_confirmed: true, language: 'bn' }).expect(201);
    const norm = email.trim().toLowerCase();
    assert.equal(res.body.email, norm);
    assert.equal(res.body.code_expires_in_s, 600);
    const u = await db('users').where({ email: norm }).first();
    assert.ok(u, 'email stored lowercase');
    assert.equal(u.email_verified_at, null);
    assert.ok(u.adult_confirmed_at && u.terms_accepted_at);
    assert.equal(u.terms_version, '2026-10');
    assert.equal(u.language, 'bn');
    assert.match(u.password_hash, /^\$2b\$04\$/);
    const consent = await db('consents').where({ user_id: u.id, type: 'age_18_terms_privacy' }).first();
    assert.equal(consent.granted, 1);
    const code = t.lastCode(norm);
    assert.match(code, /^\d{6}$/);
    const row = await db('email_codes').where({ user_id: u.id, purpose: 'verify_email' }).first();
    assert.notEqual(row.code_hash, code, 'code is stored hashed');
    assert.ok(!row.code_hash.includes(code));
    const mail = t.mail.messages.at(-1);
    assert.match(mail.subject, /যাচাই/, 'Bengali template for a Bengali user');
    const log = await db('email_logs').where({ user_id: u.id }).first();
    assert.equal(log.template, 'verify_email');
    assert.equal(log.language, 'bn');
    assert.equal(log.status, 'sent');
    assert.ok(!JSON.stringify(log).includes(code));
  });

  test('requires the 18+/terms confirmation', async () => {
    const res = await post('/auth/register', { email: uniqueEmail(), password: GOOD_PASSWORD, adult_and_terms_confirmed: false }).expect(403);
    assert.equal(res.body.error.code, 'CONSENT_REQUIRED');
    assert.equal(res.body.error.details.needs, 'age_terms');
    const missing = await post('/auth/register', { email: uniqueEmail(), password: GOOD_PASSWORD }).expect(400);
    assert.equal(missing.body.error.code, 'VALIDATION_FAILED');
  });

  test('password rules: length, letter, number, common list', async () => {
    const cases = [['Ab1', 'min_length'], ['abcdefghij', 'number'], ['1234567890', 'letter'], ['password1', 'common'], ['Qwerty123', 'common']];
    for (const [pw, rule] of cases) {
      const res = await post('/auth/register', { email: uniqueEmail(), password: pw, adult_and_terms_confirmed: true }).expect(400);
      assert.equal(res.body.error.code, 'VALIDATION_FAILED');
      assert.ok(res.body.error.details.rules.includes(rule), `${pw} -> ${rule}`);
      assert.ok(!JSON.stringify(res.body).includes(pw), 'password never echoed');
    }
    await post('/auth/register', { email: uniqueEmail(), password: 'রাফি-স্কুল-7x', adult_and_terms_confirmed: true }).expect(201);
  });

  test('invalid email -> VALIDATION_FAILED; existing email -> 409 CONFLICT', async () => {
    assert.equal((await post('/auth/register', { email: 'nope', password: GOOD_PASSWORD, adult_and_terms_confirmed: true }).expect(400)).body.error.code, 'VALIDATION_FAILED');
    const email = uniqueEmail();
    await post('/auth/register', { email, password: GOOD_PASSWORD, adult_and_terms_confirmed: true }).expect(201);
    const dup = await post('/auth/register', { email: email.toUpperCase(), password: GOOD_PASSWORD, adult_and_terms_confirmed: true }).expect(409);
    assert.equal(dup.body.error.code, 'CONFLICT');
  });
});

describe('verify email', () => {
  test('correct code verifies, signs in and asks for profile setup; welcome email sent', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { email, password: GOOD_PASSWORD, adult_and_terms_confirmed: true }).expect(201);
    const res = await post('/auth/verify-email', { email, code: t.lastCode(email), device: { device_id: 'dev-a', model: 'Pixel 8' } }).expect(200);
    assert.ok(res.body.access_token && res.body.refresh_token);
    assert.equal(res.body.expires_in, 900);
    assert.equal(res.body.needs_profile_setup, true);
    assert.equal(res.body.user.email, email);
    assert.equal(res.body.user.email_verified, true);
    assert.equal(res.body.user.role, null);
    assert.ok(t.mail.messages.some((m) => m.to === email && /Welcome/.test(m.subject)));
    const s = await db('sessions').where({ uuid: res.body.session_id }).first();
    assert.equal(s.device_model, 'Pixel 8');
    assert.equal(s.refresh_token_hash, sha256(res.body.refresh_token));
    // the same code cannot be used twice
    assert.equal((await post('/auth/verify-email', { email, code: t.lastCode(email) }).expect(400)).body.error.code, 'CODE_INVALID');
  });

  test('code expires after 10 minutes', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { email, password: GOOD_PASSWORD, adult_and_terms_confirmed: true }).expect(201);
    t.clock.advance(10 * MIN + 1000);
    const res = await post('/auth/verify-email', { email, code: t.lastCode(email) }).expect(410);
    assert.equal(res.body.error.code, 'CODE_EXPIRED');
  });

  test('5 wrong attempts lock for 15 minutes, even for a newly sent code', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { email, password: GOOD_PASSWORD, adult_and_terms_confirmed: true }).expect(201);
    const good = t.lastCode(email);
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 1; i <= 4; i++) {
      const r = await post('/auth/verify-email', { email, code: bad }).expect(400);
      assert.equal(r.body.error.code, 'CODE_INVALID');
      assert.equal(r.body.error.details.attempts_left, 5 - i);
    }
    const locked = await post('/auth/verify-email', { email, code: bad }).expect(423);
    assert.equal(locked.body.error.code, 'AUTH_LOCKED');
    assert.equal(locked.body.error.details.retry_after_s, 900);
    assert.equal((await post('/auth/verify-email', { email, code: good }).expect(423)).body.error.code, 'AUTH_LOCKED');
    // resend during the lock does not unlock
    t.clock.advance(MIN);
    await post('/auth/resend-code', { email, purpose: 'verify_email' }).expect(202);
    assert.equal((await post('/auth/verify-email', { email, code: t.lastCode(email) }).expect(423)).body.error.code, 'AUTH_LOCKED');
    t.clock.advance(15 * MIN);
    await post('/auth/resend-code', { email, purpose: 'verify_email' }).expect(202);
    await post('/auth/verify-email', { email, code: t.lastCode(email) }).expect(200);
  });

  test('unknown email -> CODE_INVALID (no enumeration detail)', async () => {
    const r = await post('/auth/verify-email', { email: uniqueEmail('ghost'), code: '123456' }).expect(400);
    assert.equal(r.body.error.code, 'CODE_INVALID');
  });
});

describe('resend code', () => {
  test('30 s gap, max 5 per hour, retry_after_s; only the newest code works', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { email, password: GOOD_PASSWORD, adult_and_terms_confirmed: true }).expect(201);
    const first = t.lastCode(email);
    const early = await post('/auth/resend-code', { email, purpose: 'verify_email' }).expect(429);
    assert.equal(early.body.error.code, 'RATE_LIMITED');
    assert.equal(early.body.error.details.retry_after_s, 30);
    t.clock.advance(10_000);
    assert.equal((await post('/auth/resend-code', { email, purpose: 'verify_email' }).expect(429)).body.error.details.retry_after_s, 20);
    // sends 2..5
    for (let i = 0; i < 4; i++) {
      t.clock.advance(31_000);
      await post('/auth/resend-code', { email, purpose: 'verify_email' }).expect(202);
    }
    t.clock.advance(31_000);
    const capped = await post('/auth/resend-code', { email, purpose: 'verify_email' }).expect(429);
    assert.ok(capped.body.error.details.retry_after_s > 30 && capped.body.error.details.retry_after_s <= 3600);
    const latest = t.lastCode(email);
    if (latest !== first) {
      assert.equal((await post('/auth/verify-email', { email, code: first }).expect(400)).body.error.code, 'CODE_INVALID');
    }
    t.clock.advance(60 * MIN);
    await post('/auth/resend-code', { email, purpose: 'verify_email' }).expect(202);
  });

  test('unknown email gets the same answers (202, then the same 429)', async () => {
    const ghost = uniqueEmail('ghost');
    const before = t.mail.messages.length;
    const a = await post('/auth/resend-code', { email: ghost, purpose: 'verify_email' }).expect(202);
    assert.deepEqual(Object.keys(a.body), ['accepted', 'resend_after_s']);
    const b = await post('/auth/resend-code', { email: ghost, purpose: 'verify_email' }).expect(429);
    assert.equal(b.body.error.details.retry_after_s, 30);
    assert.equal(t.mail.messages.length, before, 'no email sent');
  });
});

describe('login', () => {
  test('success returns a session; wrong password is generic; unknown email is identical', async () => {
    const u = await signUp(t);
    const ok = await post('/auth/login', { email: u.email.toUpperCase(), password: GOOD_PASSWORD, device: { device_id: 'login-1' } }).expect(200);
    assert.ok(ok.body.access_token);
    assert.equal(ok.body.needs_profile_setup, true);
    const wrong = await post('/auth/login', { email: u.email, password: 'Wrong-pass-1' }).expect(401);
    const ghost = await post('/auth/login', { email: uniqueEmail('ghost'), password: 'Wrong-pass-1' }).expect(401);
    assert.equal(wrong.body.error.code, 'AUTH_INVALID_CREDENTIALS');
    assert.equal(wrong.body.error.message, ghost.body.error.message);
    assert.deepEqual(Object.keys(wrong.body.error).sort(), Object.keys(ghost.body.error).sort());
    const audits = await db('audit_logs').where({ action: 'auth.login', target_id: ok.body.session_id });
    assert.equal(audits.length, 1);
  });

  test('5 failed attempts lock the account for 15 minutes (even with the right password)', async () => {
    const u = await signUp(t);
    for (let i = 0; i < 4; i++) await post('/auth/login', { email: u.email, password: 'Wrong-pass-1' }).expect(401);
    const fifth = await post('/auth/login', { email: u.email, password: 'Wrong-pass-1' }).expect(423);
    assert.equal(fifth.body.error.code, 'AUTH_LOCKED');
    assert.equal(fifth.body.error.details.retry_after_s, 900);
    assert.equal((await post('/auth/login', { email: u.email, password: GOOD_PASSWORD }).expect(423)).body.error.code, 'AUTH_LOCKED');
    t.clock.advance(14 * MIN);
    await post('/auth/login', { email: u.email, password: GOOD_PASSWORD }).expect(423);
    t.clock.advance(MIN + 1000);
    await post('/auth/login', { email: u.email, password: GOOD_PASSWORD }).expect(200);
    const row = await db('users').where({ email: u.email }).first();
    assert.equal(row.failed_login_count, 0);
    assert.ok(await db('audit_logs').where({ action: 'auth.login_locked', actor_id: row.id }).first());
  });

  test('a successful login resets the failure counter', async () => {
    const u = await signUp(t);
    for (let i = 0; i < 4; i++) await post('/auth/login', { email: u.email, password: 'Wrong-pass-1' }).expect(401);
    await post('/auth/login', { email: u.email, password: GOOD_PASSWORD }).expect(200);
    for (let i = 0; i < 4; i++) await post('/auth/login', { email: u.email, password: 'Wrong-pass-1' }).expect(401);
    await post('/auth/login', { email: u.email, password: GOOD_PASSWORD }).expect(200);
  });

  test('unverified email -> AUTH_EMAIL_NOT_VERIFIED and a code is resent', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { email, password: GOOD_PASSWORD, adult_and_terms_confirmed: true }).expect(201);
    t.clock.advance(31_000);
    const n = t.mail.messages.length;
    const res = await post('/auth/login', { email, password: GOOD_PASSWORD }).expect(403);
    assert.equal(res.body.error.code, 'AUTH_EMAIL_NOT_VERIFIED');
    assert.equal(res.body.error.details.code_sent, true);
    assert.equal(t.mail.messages.length, n + 1);
    await post('/auth/verify-email', { email, code: t.lastCode(email) }).expect(200);
  });

  test('suspended users cannot log in or use existing tokens', async () => {
    const u = await signUp(t);
    await db('users').where({ email: u.email }).update({ status: 'suspended' });
    const res = await post('/auth/login', { email: u.email, password: GOOD_PASSWORD }).expect(403);
    assert.equal(res.body.error.details.reason, 'account_suspended');
    const me = await api().get('/api/v1/me').set(bearer(u)).expect(401);
    assert.equal(me.body.error.code, 'AUTH_REFRESH_INVALID');
    assert.equal((await post('/auth/refresh', { refresh_token: u.refresh_token }).expect(401)).body.error.code, 'AUTH_REFRESH_INVALID');
  });

  test('new-device email is sent on login from a new device only (no IP stored)', async () => {
    const u = await signUp(t, uniqueEmail(), { device: { device_id: 'phone-1', model: 'Galaxy A54' } });
    const count = () => t.mail.messages.filter((m) => m.to === u.email && /New sign-in/.test(m.subject)).length;
    await post('/auth/login', { email: u.email, password: GOOD_PASSWORD, device: { device_id: 'phone-1' } }).expect(200);
    assert.equal(count(), 0);
    await post('/auth/login', { email: u.email, password: GOOD_PASSWORD, device: { device_id: 'phone-2', manufacturer: 'Xiaomi', model: 'Redmi 12' } }).expect(200);
    assert.equal(count(), 1);
    assert.match(t.mail.messages.at(-1).text, /Xiaomi Redmi 12/);
    const cols = Object.keys(await db('sessions').columnInfo());
    assert.ok(!cols.some((c) => /ip/.test(c)), 'sessions have no IP column');
  });

  test('one session per device: logging in again on the same device replaces the old session', async () => {
    const u = await signUp(t, uniqueEmail(), { device: { device_id: 'same-dev' } });
    await post('/auth/login', { email: u.email, password: GOOD_PASSWORD, device: { device_id: 'same-dev' } }).expect(200);
    const userId = (await db('users').where({ email: u.email }).first()).id;
    const active = await db('sessions').where({ user_id: userId, device_id: 'same-dev' }).whereNull('revoked_at');
    assert.equal(active.length, 1);
  });
});

describe('tokens, refresh and middleware', () => {
  test('missing token -> AUTH_REQUIRED, garbage -> AUTH_REQUIRED, expired -> AUTH_TOKEN_EXPIRED', async () => {
    assert.equal((await api().get('/api/v1/me').expect(401)).body.error.code, 'AUTH_REQUIRED');
    assert.equal((await api().get('/api/v1/me').set('authorization', 'Bearer abc.def.ghi').expect(401)).body.error.code, 'AUTH_REQUIRED');
    const u = await signUp(t);
    await api().get('/api/v1/me').set(bearer(u)).expect(200);
    t.clock.advance(15 * MIN + 1000);
    assert.equal((await api().get('/api/v1/me').set(bearer(u)).expect(401)).body.error.code, 'AUTH_TOKEN_EXPIRED');
  });

  test('access token is HS256 with sub = user uuid, sid = session uuid, 15 minutes', async () => {
    const u = await signUp(t);
    const [h, p] = u.access_token.split('.').slice(0, 2).map((x) => JSON.parse(Buffer.from(x, 'base64url')));
    assert.equal(h.alg, 'HS256');
    assert.equal(p.sub, u.user.id);
    assert.equal(p.sid, u.session_id);
    assert.equal(p.exp - p.iat, 900);
  });

  test('refresh rotates; replaying a rotated token revokes the whole family', async () => {
    const u = await signUp(t);
    const r1 = await post('/auth/refresh', { refresh_token: u.refresh_token }).expect(200);
    assert.notEqual(r1.body.refresh_token, u.refresh_token);
    assert.ok(r1.body.access_token);
    const r2 = await post('/auth/refresh', { refresh_token: r1.body.refresh_token }).expect(200);
    // replay of the first (rotated) token
    const replay = await post('/auth/refresh', { refresh_token: u.refresh_token }).expect(401);
    assert.equal(replay.body.error.code, 'AUTH_REFRESH_INVALID');
    // the latest token is now dead too, and so is its access token
    assert.equal((await post('/auth/refresh', { refresh_token: r2.body.refresh_token }).expect(401)).body.error.code, 'AUTH_REFRESH_INVALID');
    assert.equal((await api().get('/api/v1/me').set(bearer(r2.body)).expect(401)).body.error.code, 'AUTH_REFRESH_INVALID');
    const s = await db('sessions').where({ uuid: u.session_id }).first();
    assert.equal(s.revoked_reason, 'refresh_reuse');
    assert.ok(await db('audit_logs').where({ action: 'auth.refresh_reuse_detected', target_id: u.session_id }).first());
  });

  test('refresh keeps the session id stable (sessions list) and rejects unknown tokens', async () => {
    const u = await signUp(t);
    const r1 = await post('/auth/refresh', { refresh_token: u.refresh_token }).expect(200);
    const list = await api().get('/api/v1/auth/sessions').set(bearer(r1.body)).expect(200);
    assert.ok(list.body.some((s) => s.id === u.session_id && s.current));
    assert.equal((await post('/auth/refresh', { refresh_token: 'x'.repeat(43) }).expect(401)).body.error.code, 'AUTH_REFRESH_INVALID');
  });
});

describe('logout and sessions', () => {
  test('logout revokes the session and clears its FCM token', async () => {
    const u = await signUp(t);
    await db('sessions').where({ uuid: u.session_id }).update({ fcm_token: 'fcm-abc' });
    await post('/auth/logout', {}, bearer(u)).expect(204);
    const s = await db('sessions').where({ uuid: u.session_id }).first();
    assert.ok(s.revoked_at);
    assert.equal(s.fcm_token, null);
    assert.equal((await api().get('/api/v1/me').set(bearer(u)).expect(401)).body.error.code, 'AUTH_REFRESH_INVALID');
    assert.equal((await post('/auth/refresh', { refresh_token: u.refresh_token }).expect(401)).body.error.code, 'AUTH_REFRESH_INVALID');
    assert.ok(await db('audit_logs').where({ action: 'auth.logout', target_id: u.session_id }).first());
  });

  test('list sessions and remote sign-out of own sessions only', async () => {
    const u = await signUp(t, uniqueEmail(), { device: { device_id: 'd1', model: 'Pixel 7', app_version: '0.1.0' } });
    const other = await post('/auth/login', { email: u.email, password: GOOD_PASSWORD, device: { device_id: 'd2', model: 'Redmi' } }).expect(200);
    const list = await api().get('/api/v1/auth/sessions').set(bearer(u)).expect(200);
    assert.equal(list.body.length, 2);
    const cur = list.body.find((s) => s.current);
    assert.equal(cur.id, u.session_id);
    assert.equal(cur.device_model, 'Pixel 7');
    for (const s of list.body) assert.deepEqual(Object.keys(s).sort(), ['app_version', 'created_at', 'current', 'device_model', 'id', 'is_child_device', 'last_used_at', 'os_version']);

    const stranger = await signUp(t);
    assert.equal((await api().delete(`/api/v1/auth/sessions/${other.body.session_id}`).set(bearer(stranger)).expect(404)).body.error.code, 'NOT_FOUND');
    await api().delete(`/api/v1/auth/sessions/${other.body.session_id}`).set(bearer(u)).expect(204);
    await api().get('/api/v1/me').set(bearer(other.body)).expect(401);
    assert.equal((await api().get('/api/v1/auth/sessions').set(bearer(u)).expect(200)).body.length, 1);
    assert.ok(await db('audit_logs').where({ action: 'auth.session_revoked', target_id: other.body.session_id }).first());
    await api().delete('/api/v1/auth/sessions/not-a-uuid').set(bearer(u)).expect(400);
  });
});

describe('forgot and reset password', () => {
  test('always 202 with the same body (no enumeration); code sent only to real accounts', async () => {
    const u = await signUp(t);
    const n = t.mail.messages.length;
    const a = await post('/auth/forgot', { email: u.email }).expect(202);
    const b = await post('/auth/forgot', { email: uniqueEmail('ghost') }).expect(202);
    assert.deepEqual(a.body, b.body);
    assert.equal(t.mail.messages.length, n + 1);
    // throttled request: still 202
    await post('/auth/forgot', { email: u.email }).expect(202);
    assert.equal(t.mail.messages.length, n + 1);
  });

  test('reset with the code changes the password, revokes ALL sessions, audits', async () => {
    const u = await signUp(t, uniqueEmail(), { device: { device_id: 'r1' } });
    const second = await post('/auth/login', { email: u.email, password: GOOD_PASSWORD, device: { device_id: 'r2' } }).expect(200);
    await post('/auth/forgot', { email: u.email }).expect(202);
    const code = t.lastCode(u.email);
    const weak = await post('/auth/reset', { email: u.email, code, new_password: 'password1' }).expect(400);
    assert.ok(weak.body.error.details.rules.includes('common'));
    await post('/auth/reset', { email: u.email, code, new_password: 'New-Family-Pass-9' }).expect(204);
    await api().get('/api/v1/me').set(bearer(u)).expect(401);
    await api().get('/api/v1/me').set(bearer(second.body)).expect(401);
    await post('/auth/login', { email: u.email, password: GOOD_PASSWORD }).expect(401);
    await post('/auth/login', { email: u.email, password: 'New-Family-Pass-9' }).expect(200);
    const userId = (await db('users').where({ email: u.email }).first()).id;
    assert.ok(await db('audit_logs').where({ action: 'auth.password_reset', actor_id: userId }).first());
    // code is single use
    await post('/auth/reset', { email: u.email, code, new_password: 'Another-Pass-77' }).expect(400);
  });

  test('reset code rules: wrong attempts lock, expiry, unknown email', async () => {
    const u = await signUp(t);
    await post('/auth/forgot', { email: u.email }).expect(202);
    const good = t.lastCode(u.email);
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) await post('/auth/reset', { email: u.email, code: bad, new_password: 'New-Family-Pass-9' }).expect(400);
    assert.equal((await post('/auth/reset', { email: u.email, code: bad, new_password: 'New-Family-Pass-9' }).expect(423)).body.error.code, 'AUTH_LOCKED');
    t.clock.advance(16 * MIN);
    await post('/auth/forgot', { email: u.email }).expect(202);
    t.clock.advance(11 * MIN);
    assert.equal((await post('/auth/reset', { email: u.email, code: t.lastCode(u.email), new_password: 'New-Family-Pass-9' }).expect(410)).body.error.code, 'CODE_EXPIRED');
    assert.equal((await post('/auth/reset', { email: uniqueEmail('ghost'), code: '123456', new_password: 'New-Family-Pass-9' }).expect(400)).body.error.code, 'CODE_INVALID');
  });

  test('reset proves email ownership: an unverified account becomes verified', async () => {
    const email = uniqueEmail();
    await post('/auth/register', { email, password: GOOD_PASSWORD, adult_and_terms_confirmed: true }).expect(201);
    t.clock.advance(31_000);
    await post('/auth/forgot', { email }).expect(202);
    await post('/auth/reset', { email, code: t.lastCode(email), new_password: 'New-Family-Pass-9' }).expect(204);
    await post('/auth/login', { email, password: 'New-Family-Pass-9' }).expect(200);
  });
});

test('auth endpoints are rate limited per IP', async () => {
  const limited = buildTestApp(db, { AUTH_RATE_LIMIT_MAX: '3' });
  for (const p of ['/auth/login', '/auth/register', '/auth/forgot', '/auth/reset', '/auth/verify-email', '/auth/resend-code', '/auth/child', '/auth/google']) {
    for (let i = 0; i < 3; i++) await request(limited.app).post(`/api/v1${p}`).send({});
    const res = await request(limited.app).post(`/api/v1${p}`).send({}).expect(429);
    assert.equal(res.body.error.code, 'RATE_LIMITED', p);
    assert.ok(res.body.error.details.retry_after_s > 0);
  }
  const r = buildTestApp(db, { REFRESH_RATE_LIMIT_MAX: '1' });
  await request(r.app).post('/api/v1/auth/refresh').send({});
  await request(r.app).post('/api/v1/auth/refresh').send({}).expect(429);
});

test('codes, emails, passwords and tokens never reach the logs', async () => {
  const lines = [];
  const sink = new Writable({ write(chunk, enc, cb) { lines.push(chunk.toString()); cb(); } });
  const logged = buildTestApp(db, {}, { logger: createLogger('trace', sink), clock: testClock() });
  const email = uniqueEmail('logcheck');
  await request(logged.app).post('/api/v1/auth/register').send({ email, password: GOOD_PASSWORD, adult_and_terms_confirmed: true }).expect(201);
  const code = logged.lastCode(email);
  const s = await request(logged.app).post('/api/v1/auth/verify-email').send({ email, code }).expect(200);
  await request(logged.app).get('/api/v1/me?email=x').set(bearer(s.body)).set('x-forwarded-for', '203.0.113.9').expect(200);
  await request(logged.app).post('/api/v1/auth/login').send({ email, password: 'Wrong-pass-1' }).expect(401);
  const out = lines.join('');
  assert.ok(out.length > 0, 'something was logged');
  for (const secret of [email, code, GOOD_PASSWORD, s.body.access_token, s.body.refresh_token, '127.0.0.1', '::ffff', '203.0.113.9', 'email=x']) {
    assert.ok(!out.includes(secret), `log contains ${secret.slice(0, 12)}`);
  }
});
