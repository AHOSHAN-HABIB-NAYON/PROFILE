import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import { freshDb, buildTestApp, signUp, bearer } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { totpAt } from '../src/auth/totp.js';
import { LOCATION_TABLES } from '../migrations/20261028_0001_initial_schema.js';
import { familyPlan } from '../src/users/presenter.js';

let db, t, token, secret;
const SETUP = 'setup-key-0123456789';
before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db, { ADMIN_SETUP_KEY: SETUP });
});
after(async () => db.destroy());
const api = () => request(t.app);
const adm = () => ({ authorization: `Bearer ${token}` });

describe('admin auth', () => {
  test('first super admin needs the setup key; login; 2FA required for writes, then enforced at login', async () => {
    assert.equal((await api().get('/api/v1/admin/setup').expect(200)).body.needs_setup, true);
    await api().post('/api/v1/admin/setup').send({ setup_key: 'wrong-key-000000', email: 'owner@example.com', password: 'Strong-Admin-Pass-1', name: 'Nayon' }).expect(403);
    await api().post('/api/v1/admin/setup').send({ setup_key: SETUP, email: 'owner@example.com', password: 'Strong-Admin-Pass-1', name: 'Nayon' }).expect(201);
    await api().post('/api/v1/admin/setup').send({ setup_key: SETUP, email: 'x@example.com', password: 'Strong-Admin-Pass-1', name: 'X' }).expect(409);
    await api().post('/api/v1/admin/auth/login').send({ email: 'owner@example.com', password: 'nope-nope-nope' }).expect(401);
    const l = (await api().post('/api/v1/admin/auth/login').send({ email: 'owner@example.com', password: 'Strong-Admin-Pass-1' }).expect(200)).body;
    assert.equal(l.needs_2fa_setup, true);
    token = l.token;
    const w = await api().put('/api/v1/admin/settings').set(adm()).send({ whatsapp_number: '+8801700000000' }).expect(403);
    assert.equal(w.body.error.details.reason, '2fa_required');
    secret = (await api().post('/api/v1/admin/2fa/setup').set(adm()).expect(200)).body.secret;
    await api().post('/api/v1/admin/2fa/enable').set(adm()).send({ code: '000000' }).expect(400);
    await api().post('/api/v1/admin/2fa/enable').set(adm()).send({ code: totpAt(secret, t.clock.now().getTime()) }).expect(200);
    const nocode = await api().post('/api/v1/admin/auth/login').send({ email: 'owner@example.com', password: 'Strong-Admin-Pass-1' }).expect(401);
    assert.equal(nocode.body.error.details.two_factor, 'required');
    token = (await api().post('/api/v1/admin/auth/login').send({ email: 'owner@example.com', password: 'Strong-Admin-Pass-1', code: totpAt(secret, t.clock.now().getTime()) }).expect(200)).body.token;
    await api().get('/api/v1/admin/me').expect(401);
  });
});

describe('admin features', () => {
  test('settings and secrets: app-config follows; secrets are masked', async () => {
    await api().put('/api/v1/admin/settings').set(adm()).send({ min_version: '1.2.0', whatsapp_number: '+8801700000000', live_chat_human_for: 'premium' }).expect(200);
    await api().put('/api/v1/admin/settings').set(adm()).send({ hacker: 1 }).expect(400);
    const cfg = (await api().get('/api/v1/app-config').expect(200)).body;
    assert.equal(cfg.min_version, '1.2.0');
    await api().put('/api/v1/admin/secrets/google_places_api_key').set(adm()).send({ value: 'AIzaSyTESTKEY1234567890' }).expect(204);
    await api().put('/api/v1/admin/secrets/fcm_service_account').set(adm()).send({ value: '{"nope":1}' }).expect(400);
    const s = (await api().get('/api/v1/admin/secrets').set(adm()).expect(200)).body;
    assert.ok(s.google_places_api_key.includes('…'));
    assert.ok(!JSON.stringify(s).includes('TESTKEY1234'));
    await api().put('/api/v1/admin/ai').set(adm()).send({ api_key: 'sk-live-abcdefghijklmnop', model: 'gpt-4o-mini', enabled: true }).expect(204);
    const ai = (await api().get('/api/v1/admin/ai').set(adm()).expect(200)).body;
    assert.ok(!ai.api_key.includes('abcdefghij'));
  });

  test('users: search, detail without location, grant, family limit, suspend', async () => {
    const p = await signUp(t);
    const fam = (await api().post('/api/v1/families').set(bearer(p)).send({}).expect(201)).body;
    const list = (await api().get(`/api/v1/admin/users?q=${encodeURIComponent(p.email)}`).set(adm()).expect(200)).body;
    assert.equal(list.length, 1);
    const d = (await api().get(`/api/v1/admin/users/${list[0].id}`).set(adm()).expect(200)).body;
    assert.equal(d.family.id, fam.id);
    assert.ok(!/"lat"|"lng"|latitude/.test(JSON.stringify(d)));
    const g = (await api().post(`/api/v1/admin/families/${fam.id}/grant`).set(adm()).send({ plan_code: 'premium', days: 30, gift_from_name: 'Rafi' }).expect(201)).body;
    assert.ok(g.expires_at);
    const famRow = await db('families').where({ uuid: fam.id }).first();
    assert.equal((await familyPlan(db, famRow.id, t.clock.now())).code, 'premium');
    const other = await signUp(t);
    const fam2 = (await api().post('/api/v1/families').set(bearer(other)).send({}).expect(201)).body;
    await api().put(`/api/v1/admin/families/${fam2.id}/limits`).set(adm()).send({ limits: { max_places: 7 } }).expect(200);
    const f2 = await db('families').where({ uuid: fam2.id }).first();
    assert.equal((await familyPlan(db, f2.id, t.clock.now())).max_places, 7);
    await api().post(`/api/v1/admin/users/${list[0].id}/suspend`).set(adm()).send({ suspend: true }).expect(200);
    await api().get('/api/v1/me').set(bearer(p)).expect(401);
    const audit = (await api().get('/api/v1/admin/audit').set(adm()).expect(200)).body;
    assert.ok(audit.some((a) => a.action === 'user.suspended' && a.actor === 'Nayon'));
  });

  test('redeem codes: created once, redeemable, CSV export, revoke', async () => {
    const r = (await api().post('/api/v1/admin/codes').set(adm()).send({ plan_code: 'premium', days: 30, count: 2, batch_name: 'eid', gift_from_name: 'Uncle' }).expect(201)).body;
    assert.equal(r.codes.length, 2);
    const p = await signUp(t);
    await api().post('/api/v1/families').set(bearer(p)).send({}).expect(201);
    await api().post('/api/v1/redeem').set(bearer(p)).send({ code: r.codes[0] }).expect(200);
    const csv = (await api().get('/api/v1/admin/codes/export?batch=eid').set(adm()).expect(200)).text;
    assert.ok(csv.includes(r.codes[1]));
    const list = (await api().get('/api/v1/admin/codes?batch=eid').set(adm()).expect(200)).body;
    const active = list.find((c) => c.status === 'active');
    await api().post(`/api/v1/admin/codes/${active.id}/revoke`).set(adm()).expect(204);
  });

  test('plans, KB, changelog, emergency numbers, dashboard, health', async () => {
    await api().patch('/api/v1/admin/plans/premium').set(adm()).send({ trial_days: 14 }).expect(204);
    const plans = (await api().get('/api/v1/admin/plans').set(adm()).expect(200)).body;
    assert.equal(plans.plans.find((p) => p.code === 'premium').trial_days, 14);
    await api().post('/api/v1/admin/kb').set(adm()).send({ language: 'en', slug: 'battery-help', title: 'Battery', body: 'Turn off battery saver.' }).expect(201);
    const help = (await api().get('/api/v1/help/articles?language=en').expect(200)).body;
    assert.ok(help.some((a) => a.slug === 'battery-help'));
    await api().post('/api/v1/admin/changelog').set(adm()).send({ version: '1.1.0', title: 'Live chat', body: 'Talk to us in the app.', is_published: true, published_at: '2026-10-28T00:00:00.000Z' }).expect(201);
    await api().post('/api/v1/admin/emergency-numbers').set(adm()).send({ country_iso2: 'xk', service: 'general', number: '112' }).expect(201);
    await api().post('/api/v1/admin/emergency-numbers').set(adm()).send({ country_iso2: 'xk', service: 'general', number: '112' }).expect(409);
    const dash = (await api().get('/api/v1/admin/dashboard').set(adm()).expect(200)).body;
    assert.ok(dash.users >= 3);
    const h = (await api().get('/api/v1/admin/health').set(adm()).expect(200)).body;
    assert.ok(Array.isArray(h.jobs));
  });

  test('chat inbox: join with agent name, reply, internal note hidden from the user', async () => {
    const p = await signUp(t);
    await api().post('/api/v1/families').set(bearer(p)).send({}).expect(201);
    await api().post('/api/v1/chat/messages').set(bearer(p)).send({ body: 'I need a refund please' }).expect(201);
    const inbox = (await api().get('/api/v1/admin/chats?filter=needs_human').set(adm()).expect(200)).body;
    assert.ok(inbox.length >= 1);
    const id = inbox[0].id;
    const detail = (await api().get(`/api/v1/admin/chats/${id}`).set(adm()).expect(200)).body;
    assert.ok(detail.context.plan);
    assert.ok(!/"lat"|"lng"/.test(JSON.stringify(detail)));
    await api().post(`/api/v1/admin/chats/${id}/join`).set(adm()).expect(204);
    await api().post(`/api/v1/admin/chats/${id}/messages`).set(adm()).send({ body: 'User seems ok', internal: true }).expect(201);
    await api().post(`/api/v1/admin/chats/${id}/messages`).set(adm()).send({ body: 'Hi, I can help with the refund.' }).expect(201);
    const cur = (await api().get('/api/v1/chat/current').set(bearer(p)).expect(200)).body.conversation;
    assert.equal(cur.agent.name, 'Nayon');
    assert.ok(cur.messages.some((m) => m.body === 'Hi, I can help with the refund.'));
    assert.ok(!cur.messages.some((m) => m.body === 'User seems ok'));
    await api().post(`/api/v1/admin/chats/${id}/close`).set(adm()).expect(204);
    assert.equal((await api().get('/api/v1/chat/current').set(bearer(p)).expect(200)).body.conversation, null);
  });

  test('roles: support cannot change settings; finance cannot read chats', async () => {
    await api().post('/api/v1/admin/admins').set(adm()).send({ email: 'sup@example.com', name: 'Sup', role: 'support', password: 'Strong-Support-Pass-1' }).expect(201);
    const l = (await api().post('/api/v1/admin/auth/login').send({ email: 'sup@example.com', password: 'Strong-Support-Pass-1' }).expect(200)).body;
    await api().get('/api/v1/admin/settings').set({ authorization: `Bearer ${l.token}` }).expect(403);
    await api().get('/api/v1/admin/chats').set({ authorization: `Bearer ${l.token}` }).expect(200);
    await api().post('/api/v1/admin/admins').set(adm()).send({ email: 'fin@example.com', name: 'Fin', role: 'finance', password: 'Strong-Finance-Pass-1' }).expect(201);
    const f = (await api().post('/api/v1/admin/auth/login').send({ email: 'fin@example.com', password: 'Strong-Finance-Pass-1' }).expect(200)).body;
    await api().get('/api/v1/admin/chats').set({ authorization: `Bearer ${f.token}` }).expect(403);
  });

  test('the admin code never touches location tables', () => {
    const src = fs.readFileSync(new URL('../src/routes/admin.js', import.meta.url), 'utf8');
    for (const tbl of LOCATION_TABLES) assert.ok(!new RegExp(`['"\`]${tbl}['"\`]`).test(src), `admin.js references ${tbl}`);
  });
});
