import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { freshDb, buildTestApp, signUp, bearer, GOOD_PASSWORD } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { purgeExports } from '../src/routes/data-rights.js';

let db, t;
before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db);
});
after(async () => db.destroy());
const api = () => request(t.app);
const linkIn = (to, re) => {
  const m = [...t.mail.messages].reverse().find((x) => x.to === to && re.test(x.text));
  return m && re.exec(m.text)[1];
};

async function familyWithChild() {
  const parent = await signUp(t);
  const fam = (await api().post('/api/v1/families').set(bearer(parent)).send({}).expect(201)).body;
  const code = (await api().post(`/api/v1/families/${fam.id}/child-code`).set(bearer(parent)).send({}).expect(201)).body.code;
  const dev = `p7-${Math.random().toString(36).slice(2, 8)}`;
  const child = (await api().post('/api/v1/auth/child').send({ code, first_name: 'Rafi', device: { device_id: dev } }).expect(200)).body;
  return { parent, fam, child, dev };
}

describe('data export', () => {
  test('emails a one-time link; file has own data only; expires', async () => {
    const parent = await signUp(t);
    const r = (await api().post('/api/v1/me/data-export').set(bearer(parent)).expect(201)).body;
    assert.equal(r.emailed, true);
    const token = linkIn(parent.email, /data-export\/([A-Za-z0-9_-]+)/);
    assert.ok(token);
    const file = (await api().get(`/api/v1/data-export/${token}`).expect(200)).body;
    assert.equal(file.profile.email, parent.email);
    assert.ok(Array.isArray(file.locations));
    await api().get(`/api/v1/data-export/${token}`).expect(404); // one-time
    await api().get('/api/v1/data-export/not-a-real-token-123').expect(404);
    assert.equal(await purgeExports(t.app.locals.ctx), 0);
  });
});

describe('account deletion', () => {
  test('wrong password refused; owner alone -> family and children deleted', async () => {
    const { parent, child, dev } = await familyWithChild();
    await api().post('/api/v1/me/delete').set(bearer(parent)).send({ password: 'wrong-password-1' }).expect(401);
    const r = (await api().post('/api/v1/me/delete').set(bearer(parent)).send({ password: GOOD_PASSWORD }).expect(200)).body;
    assert.equal(r.deleted_accounts, 2);
    const u = await db('users').where({ email: parent.email }).first();
    assert.equal(u, undefined); // email scrubbed
    await api().get('/api/v1/me').set(bearer(parent)).expect(401);
    await api().get('/api/v1/me').set(bearer(child)).set('x-device-id', dev).expect(401);
    const rows = await db('data_requests').where({ type: 'delete', source: 'app' });
    assert.equal(rows.length, 1);
  });

  test('owner with another adult hands the family over', async () => {
    const parent = await signUp(t);
    const fam = (await api().post('/api/v1/families').set(bearer(parent)).send({}).expect(201)).body;
    const other = await signUp(t);
    const inv = (await api().post(`/api/v1/families/${fam.id}/invites`).set(bearer(parent)).send({ role: 'parent' }).expect(201)).body;
    await api().post('/api/v1/invites/accept').set(bearer(other)).send({ code: inv.code }).expect(200);
    await api().post('/api/v1/me/delete').set(bearer(parent)).send({ password: GOOD_PASSWORD }).expect(200);
    const f = await db('families').where({ uuid: fam.id }).first();
    assert.equal(f.deleted_at, null);
    const owner = await db('users').where({ id: f.owner_user_id }).first();
    assert.equal(owner.email, other.email);
  });

  test('web request: same answer for unknown email; confirm link deletes', async () => {
    const parent = await signUp(t);
    await api().post('/api/v1/account-deletion-requests').send({ email: 'nobody@example.com' }).expect(202);
    await api().post('/api/v1/account-deletion-requests').send({ email: parent.email }).expect(202);
    const token = linkIn(parent.email, /delete-account\/\?token=([A-Za-z0-9_-]+)/);
    assert.ok(token);
    await api().post('/api/v1/account-deletion/confirm').send({ token: 'bad-token-00000' }).expect(400);
    await api().post('/api/v1/account-deletion/confirm').send({ token }).expect(200);
    await api().post('/api/v1/account-deletion/confirm').send({ token }).expect(400);
    await api().get('/api/v1/me').set(bearer(parent)).expect(401);
  });
});

describe('help', () => {
  test('articles with English fallback', async () => {
    await db('kb_articles').insert({ language: 'en', slug: 'battery', title: 'Battery', body: 'Turn off battery limits.', category: 'tracking' });
    const bn = (await api().get('/api/v1/help/articles?language=ms').expect(200)).body;
    assert.ok(bn.some((a) => a.slug === 'battery'));
  });
});
