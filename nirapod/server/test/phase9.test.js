import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import { freshDb, buildTestApp, signUp, bearer, GOOD_PASSWORD } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { totpAt } from '../src/auth/totp.js';
import { setSetting } from '../src/settings.js';
import { encryptSecret } from '../src/crypto/secrets.js';
import { remindExpiring } from '../src/routes/billing.js';
import { cleanupCodesAndCache } from '../src/jobs/index.js';

const aiProvider = { async complete({ messages }) { return { text: `ok:${messages.length}`, promptTokens: 10, completionTokens: 5 }; } };
let db, t, token;
before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db, { ADMIN_SETUP_KEY: 'setup-key-0123456789' }, { aiProvider });
  const cfg = t.app.locals.ctx.cfg;
  await db('ai_settings').del();
  await db('ai_settings').insert({ enabled: true, model: 'gpt-4o-mini', api_key_enc: encryptSecret(cfg.MASTER_KEY || cfg.JWT_ACCESS_SECRET, 'sk-test-0123456789abc') });
  await request(t.app).post('/api/v1/admin/setup').send({ setup_key: 'setup-key-0123456789', email: 'a@example.com', password: 'Strong-Admin-Pass-1', name: 'Nayon' }).expect(201);
  token = (await request(t.app).post('/api/v1/admin/auth/login').send({ email: 'a@example.com', password: 'Strong-Admin-Pass-1' })).body.token;
  const { secret } = (await request(t.app).post('/api/v1/admin/2fa/setup').set({ authorization: `Bearer ${token}` })).body;
  await request(t.app).post('/api/v1/admin/2fa/enable').set({ authorization: `Bearer ${token}` }).send({ code: totpAt(secret, t.clock.now().getTime()) }).expect(200);
});
after(async () => db.destroy());
const api = () => request(t.app);
const adm = () => ({ authorization: `Bearer ${token}` });

describe('change password', () => {
  test('needs the current password; signs out other devices', async () => {
    const p = await signUp(t);
    const other = (await api().post('/api/v1/auth/login').send({ email: p.email, password: GOOD_PASSWORD, device: { device_id: 'phone-2' } }).expect(200)).body;
    await api().post('/api/v1/auth/change-password').set(bearer(p)).send({ current_password: 'wrong-pass-1', new_password: 'Another-Pass-2026' }).expect(401);
    await api().post('/api/v1/auth/change-password').set(bearer(p)).send({ current_password: GOOD_PASSWORD, new_password: 'short' }).expect(400);
    const r = (await api().post('/api/v1/auth/change-password').set(bearer(p)).send({ current_password: GOOD_PASSWORD, new_password: 'Another-Pass-2026' }).expect(200)).body;
    assert.equal(r.other_sessions_signed_out, 1);
    await api().get('/api/v1/me').set(bearer(p)).expect(200);
    await api().get('/api/v1/me').set(bearer(other)).expect(401);
    await api().post('/api/v1/auth/login').send({ email: p.email, password: 'Another-Pass-2026' }).expect(200);
  });
});

describe('admin extras', () => {
  test('reused payment reference warns; revoke a granted package; redemptions; reset codes', async () => {
    const p = await signUp(t);
    const fam = (await api().post('/api/v1/families').set(bearer(p)).send({}).expect(201)).body;
    await api().post(`/api/v1/admin/families/${fam.id}/grant`).set(adm()).send({ plan_code: 'premium', days: 30, payment_reference: 'BKASH-TX-1' }).expect(201);
    const again = await api().post(`/api/v1/admin/families/${fam.id}/grant`).set(adm()).send({ plan_code: 'premium', days: 30, payment_reference: 'BKASH-TX-1' }).expect(409);
    assert.equal(again.body.error.details.reused_payment_reference, true);
    await api().post(`/api/v1/admin/families/${fam.id}/grant`).set(adm()).send({ plan_code: 'premium', days: 30, payment_reference: 'BKASH-TX-1', confirm_reused: true }).expect(201);
    const users = (await api().get(`/api/v1/admin/users?q=${encodeURIComponent(p.email)}`).set(adm())).body;
    const d = (await api().get(`/api/v1/admin/users/${users[0].id}`).set(adm())).body;
    for (const s of d.family.subscriptions) await api().post(`/api/v1/admin/subscriptions/${s.id}/revoke`).set(adm()).send({ reason: 'test refund' }).expect(204);
    const plans = (await api().get('/api/v1/plans').set(bearer(p))).body;
    assert.equal(plans.current.plan, 'free');
    await api().post(`/api/v1/families/${fam.id}/child-code`).set(bearer(p)).send({}).expect(201);
    const reset = (await api().post(`/api/v1/admin/families/${fam.id}/reset-codes`).set(adm()).expect(200)).body;
    assert.equal(reset.revoked, 1);
    assert.ok(Array.isArray((await api().get('/api/v1/admin/redemptions').set(adm()).expect(200)).body));
  });

  test('AI draft + translate; banner logo upload appears in app-config', async () => {
    const p = await signUp(t);
    await api().post('/api/v1/families').set(bearer(p)).send({}).expect(201);
    const c = (await api().post('/api/v1/chat/messages').set(bearer(p)).send({ body: 'How do I add a child?' }).expect(201)).body.conversation;
    const draft = (await api().post(`/api/v1/admin/chats/${c.id}/suggest`).set(adm()).expect(200)).body.draft;
    assert.ok(draft.startsWith('ok:'));
    assert.ok((await api().post('/api/v1/admin/translate').set(adm()).send({ text: 'Hello', to: 'bn' }).expect(200)).body.text);
    const png = await sharp({ create: { width: 200, height: 60, channels: 3, background: '#E2136E' } }).png().toBuffer();
    const r = (await api().post('/api/v1/admin/banner-logos').set(adm()).attach('logo', png, 'bkash.png').expect(201)).body;
    const cfg = (await api().get('/api/v1/app-config').expect(200)).body;
    assert.deepEqual(cfg.payment_banner_logos, r.logos);
    await api().get(r.logos[0]).expect(200);
    await api().delete(`/api/v1/admin/banner-logos/${r.logos[0].split('/').pop()}`).set(adm()).expect(200);
  });

  test('landing AI widget: off by default, on with the switch', async () => {
    await api().post('/api/v1/public/assistant').send({ message: 'What is Nirapod?' }).expect(503);
    await setSetting(db, 'landing_ai_chat_enabled', true);
    const r = (await api().post('/api/v1/public/assistant').send({ message: 'What is Nirapod? email me x@y.com' }).expect(200)).body;
    assert.ok(r.reply);
    await setSetting(db, 'landing_ai_chat_enabled', false);
  });
});

describe('jobs', () => {
  test('expiry reminder sent once, 3 days before; old codes and cache cleaned', async () => {
    const p = await signUp(t);
    const fam = (await api().post('/api/v1/families').set(bearer(p)).send({}).expect(201)).body;
    await api().post('/api/v1/billing/trial').set(bearer(p)).send({ plan_code: 'premium' }).expect(201);
    const ctx = t.app.locals.ctx;
    try {
      assert.equal(await remindExpiring(ctx), 0);
      t.clock.advance(5 * 86400_000);
      assert.equal(await remindExpiring(ctx), 1);
      assert.equal(await remindExpiring(ctx), 0);
      assert.ok(await db('notifications').where({ type: 'trial_ending' }).orWhere('title_key', 'notif.trial_ending').first());
      t.clock.advance(40 * 86400_000);
      await db('nearby_cache').insert({ grid_cell: 'x', category: 'school', language: 'en', payload: '[]', fetched_at: new Date('2026-10-01'), expires_at: new Date('2026-10-02') });
      assert.ok((await cleanupCodesAndCache(ctx)) >= 1);
    } finally {
      t.clock.set('2026-10-28T12:00:00.000Z');
    }
    assert.ok(fam.id);
  });
});
