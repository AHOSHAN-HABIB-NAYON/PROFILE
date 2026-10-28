import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { freshDb, buildTestApp, signUp, uniqueEmail, GOOD_PASSWORD, buildApp } from './helpers.js';
import { seed } from '../src/db/seed.js';

let db;
let t;
before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db);
});
after(async () => db.destroy());

const google = (body) => request(t.app).post('/api/v1/auth/google').send(body);
let n = 0;
function fakeToken(payload) {
  const tok = `fake-google-id-token-${++n}`;
  t.google.tokens.set(tok, { sub: `g-${n}-${Date.now()}`, email_verified: true, ...payload });
  return tok;
}

test('new Google account needs the 18+/Terms confirmation (CONSENT_REQUIRED, needs=age_terms)', async () => {
  const email = uniqueEmail('g');
  const tok = fakeToken({ email, name: 'Mina Rahman', picture: 'https://lh3.googleusercontent.com/a/photo' });
  const res = await google({ id_token: tok }).expect(403);
  assert.equal(res.body.error.code, 'CONSENT_REQUIRED');
  assert.equal(res.body.error.details.needs, 'age_terms');
  assert.equal(await db('users').where({ email }).first(), undefined, 'nothing created');

  const ok = await google({ id_token: tok, adult_and_terms_confirmed: true, language: 'bn', device: { device_id: 'g-dev' } }).expect(200);
  assert.equal(ok.body.is_new_account, true);
  assert.equal(ok.body.needs_profile_setup, true);
  assert.equal(ok.body.user.name, 'Mina Rahman');
  assert.equal(ok.body.user.avatar_url, 'https://lh3.googleusercontent.com/a/photo');
  assert.equal(ok.body.user.auth_provider, 'google');
  assert.equal(ok.body.user.email_verified, true);
  assert.equal(ok.body.user.language, 'bn');
  const u = await db('users').where({ email }).first();
  assert.ok(u.adult_confirmed_at && u.terms_accepted_at);
  assert.ok(await db('consents').where({ user_id: u.id, type: 'age_18_terms_privacy' }).first());

  // second sign-in: existing account, straight to Home
  const again = await google({ id_token: tok }).expect(200);
  assert.equal(again.body.is_new_account, false);
  assert.equal(again.body.needs_profile_setup, false);
});

test('Google account without a name is allowed (name null, profile setup needed)', async () => {
  const res = await google({ id_token: fakeToken({ email: uniqueEmail('noname') }), adult_and_terms_confirmed: true }).expect(200);
  assert.equal(res.body.user.name, null);
  assert.equal(res.body.needs_profile_setup, true);
});

test('email_verified=false is rejected', async () => {
  const res = await google({ id_token: fakeToken({ email: uniqueEmail(), email_verified: false }), adult_and_terms_confirmed: true }).expect(403);
  assert.equal(res.body.error.code, 'AUTH_EMAIL_NOT_VERIFIED');
});

test('invalid token -> AUTH_INVALID_CREDENTIALS', async () => {
  const res = await google({ id_token: 'not-a-real-google-token' }).expect(401);
  assert.equal(res.body.error.code, 'AUTH_INVALID_CREDENTIALS');
});

test('links to an existing verified email account (no consent sheet), password still works', async () => {
  const u = await signUp(t);
  const tok = fakeToken({ email: u.email.toUpperCase(), name: 'From Google' });
  const res = await google({ id_token: tok }).expect(200);
  assert.equal(res.body.is_new_account, false);
  assert.equal(res.body.user.id, u.user.id);
  assert.equal(res.body.user.auth_provider, 'email');
  assert.equal(res.body.user.name, 'From Google', 'prefilled because the account had no name');
  const row = await db('users').where({ email: u.email }).first();
  assert.ok(row.google_sub);
  await request(t.app).post('/api/v1/auth/login').send({ email: u.email, password: GOOD_PASSWORD }).expect(200);
  // linked by google_sub next time even if the Google email changes
  t.google.tokens.set(tok, { ...t.google.tokens.get(tok), email: uniqueEmail('changed') });
  assert.equal((await google({ id_token: tok }).expect(200)).body.user.id, u.user.id);
});

test('linking an UNVERIFIED email account removes the unproven password and its sessions', async () => {
  const email = uniqueEmail('squat');
  await request(t.app).post('/api/v1/auth/register').send({ email, password: GOOD_PASSWORD, adult_and_terms_confirmed: true }).expect(201);
  const res = await google({ id_token: fakeToken({ email }) }).expect(200);
  assert.equal(res.body.is_new_account, false);
  const row = await db('users').where({ email }).first();
  assert.equal(row.password_hash, null);
  assert.ok(row.email_verified_at);
  assert.equal((await request(t.app).post('/api/v1/auth/login').send({ email, password: GOOD_PASSWORD }).expect(401)).body.error.code, 'AUTH_INVALID_CREDENTIALS');
});

test('without GOOGLE_OAUTH_CLIENT_IDS the real verifier reports FEATURE_DISABLED', async () => {
  const app = buildApp(db, { GOOGLE_OAUTH_CLIENT_IDS: '' });
  const res = await request(app).post('/api/v1/auth/google').send({ id_token: 'x'.repeat(30) }).expect(503);
  assert.equal(res.body.error.code, 'FEATURE_DISABLED');
});

test('the real verifier rejects a forged token', async () => {
  const app = buildApp(db, { GOOGLE_OAUTH_CLIENT_IDS: 'test-client.apps.googleusercontent.com' });
  const forged = ['{"alg":"RS256","kid":"x"}', '{"sub":"1","email":"a@b.c","email_verified":true}'].map((s) => Buffer.from(s).toString('base64url')).join('.') + '.sig';
  const res = await request(app).post('/api/v1/auth/google').send({ id_token: forged });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'AUTH_INVALID_CREDENTIALS');
});
