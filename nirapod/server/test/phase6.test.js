import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { freshDb, buildTestApp, signUp, bearer } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { setSecret, setSetting } from '../src/settings.js';
import { redeemHash, expireSubscriptions } from '../src/routes/billing.js';
import { encryptSecret } from '../src/crypto/secrets.js';
import { familyPlan } from '../src/users/presenter.js';

const playState = new Map(); // token -> subscriptionsv2 response
const acks = [];
const playTransport = async (url, { method }) => {
  if (url.includes('oauth2')) return { status: 200, json: { access_token: 'ya29.play', expires_in: 3600 } };
  if (url.endsWith(':acknowledge')) { acks.push(url); return { status: 200, json: {} }; }
  const m = /subscriptionsv2\/tokens\/([^/]+)$/.exec(url);
  if (m && method === 'GET') {
    const j = playState.get(decodeURIComponent(m[1]));
    return j ? { status: 200, json: j } : { status: 404, json: { error: { code: 404 } } };
  }
  return { status: 404, json: {} };
};

let db, t;
before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db, {}, { playTransport });
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  await setSecret(db, t.app.locals.ctx.cfg, 'play_service_account', JSON.stringify({ client_email: 'play@x.iam.gserviceaccount.com', project_id: 'p', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }));
  await setSecret(db, t.app.locals.ctx.cfg, 'play_rtdn_token', 'rtdn-secret-123');
});
after(async () => db.destroy());
const api = () => request(t.app);

async function family() {
  const parent = await signUp(t);
  const fam = (await api().post('/api/v1/families').set(bearer(parent)).send({}).expect(201)).body;
  return { parent, fam };
}
async function makeCode(code, { plan = 'premium', days = 365, gift = null, message = null } = {}) {
  const p = await db('plans').where({ code: plan }).first();
  await db('redeem_codes').insert({
    code_hash: redeemHash(code), code_enc: encryptSecret('k', code), code_last4: code.slice(-4), plan_id: p.id, duration_days: days,
    gift_from_name: gift, gift_message: message,
  });
}
const addPlace = (s, fam, i) => api().post(`/api/v1/families/${fam.id}/places`).set(bearer(s)).send({ name: `P${i}`, lat: 23.8 + i / 100, lng: 90.4 });

describe('plans', () => {
  test('plans with local prices, per-month hint and trial days; public without login', async () => {
    const r = (await api().get('/api/v1/plans?country=BD').expect(200)).body;
    const premium = r.plans.find((p) => p.code === 'premium');
    assert.ok(premium.popular);
    assert.equal(premium.trial_days, 7);
    assert.ok(premium.prices.every((x) => x.currency === 'BDT'));
    const yearly = premium.prices.find((x) => x.period === 'yearly');
    assert.equal(yearly.per_month_minor, Math.round(249900 / 12));
    const us = (await api().get('/api/v1/plans?country=US').expect(200)).body;
    assert.ok(us.plans.find((p) => p.code === 'premium').prices.every((x) => x.currency === 'USD'));
    assert.equal(r.current, null);
  });

  test('free limits come from app_settings and are enforced on the server', async () => {
    const { parent, fam } = await family();
    await setSetting(db, 'free_limits', { max_children: 1, max_members: 2, max_places: 1, history_days: 3 });
    await addPlace(parent, fam, 1).expect(201);
    await addPlace(parent, fam, 2).expect(402);
    await setSetting(db, 'free_limits', { max_children: 1, max_members: 2, max_places: 2, history_days: 3 });
  });
});

describe('trial, redeem, gift', () => {
  test('trial once per family; then premium limits apply', async () => {
    const { parent, fam } = await family();
    const tr = (await api().post('/api/v1/billing/trial').set(bearer(parent)).send({ plan_code: 'premium' }).expect(201)).body;
    assert.equal(tr.status, 'trial');
    await api().post('/api/v1/billing/trial').set(bearer(parent)).send({ plan_code: 'premium' }).expect(409);
    for (let i = 1; i <= 3; i++) await addPlace(parent, fam, i).expect(201); // free allows 2
    const plans = (await api().get('/api/v1/plans').set(bearer(parent)).expect(200)).body;
    assert.equal(plans.current.plan, 'premium');
    assert.equal(plans.current.trial_used, true);
  });

  test('redeem: single use, gift banner, wrong code rejected', async () => {
    const { parent } = await family();
    await makeCode('NRPD-GIFT-0001', { gift: 'Rafi in Saudi Arabia', message: 'Stay safe!' });
    const r = (await api().post('/api/v1/redeem').set(bearer(parent)).send({ code: 'nrpd gift 0001' }).expect(200)).body;
    assert.equal(r.plan, 'premium');
    assert.equal(r.gift.from, 'Rafi in Saudi Arabia');
    const plans = (await api().get('/api/v1/plans').set(bearer(parent)).expect(200)).body;
    assert.equal(plans.gift.from, 'Rafi in Saudi Arabia');
    const other = await family();
    await api().post('/api/v1/redeem').set(bearer(other.parent)).send({ code: 'NRPD-GIFT-0001' }).expect(400);
    await api().post('/api/v1/redeem').set(bearer(other.parent)).send({ code: 'NOPE-NOPE-NOPE' }).expect(400);
    assert.equal(Number((await db('redemptions').count({ n: '*' }).first()).n), 1);
  });

  test('two codes stack; expiry job ends the plan and notifies', async () => {
    const { parent } = await family();
    await makeCode('NRPD-STACK-001', { days: 30 });
    await makeCode('NRPD-STACK-002', { days: 30 });
    await api().post('/api/v1/redeem').set(bearer(parent)).send({ code: 'NRPD-STACK-001' }).expect(200);
    const r2 = (await api().post('/api/v1/redeem').set(bearer(parent)).send({ code: 'NRPD-STACK-002' }).expect(200)).body;
    const days = (new Date(r2.expires_at) - t.clock.now()) / 86400000;
    assert.ok(days > 59 && days < 61, `stacked ${days}`);
    t.clock.advance(61 * 86400000);
    await expireSubscriptions(t.app.locals.ctx);
    try {
      const famRow = await db('families as f').join('users as u', 'u.id', 'f.owner_user_id').where('u.uuid', parent.user.id).first('f.id');
      assert.equal((await familyPlan(db, famRow.id, t.clock.now())).code, 'free');
      assert.ok(await db('notifications').where({ type: 'plan_ended' }).first());
    } finally {
      t.clock.set('2026-10-28T12:00:00.000Z');
    }
  });
});

describe('Google Play', () => {
  test('verify a subscription server-side, acknowledge, and RTDN updates it', async () => {
    const { parent } = await family();
    const token = 'play-token-abcdefghijklmnop';
    playState.set(token, {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING', latestOrderId: 'GPA.1',
      lineItems: [{ productId: 'nirapod_premium', expiryTime: new Date(Date.parse('2026-11-28T12:00:00Z')).toISOString(), autoRenewingPlan: { autoRenewEnabled: true } }],
    });
    const v = (await api().post('/api/v1/billing/play/verify').set(bearer(parent)).send({ product_id: 'nirapod_premium', purchase_token: token }).expect(200)).body;
    assert.equal(v.plan, 'premium');
    assert.equal(v.status, 'active');
    assert.equal(acks.length, 1);
    // Unknown token -> rejected.
    await api().post('/api/v1/billing/play/verify').set(bearer(parent)).send({ product_id: 'nirapod_premium', purchase_token: 'forged-token-0000000' }).expect(400);
    // The same token cannot be used by another family.
    const other = await family();
    await api().post('/api/v1/billing/play/verify').set(bearer(other.parent)).send({ product_id: 'nirapod_premium', purchase_token: token }).expect(409);
    // RTDN: cancelled + expired.
    playState.set(token, { ...playState.get(token), subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' });
    const data = Buffer.from(JSON.stringify({ subscriptionNotification: { purchaseToken: token, notificationType: 13, subscriptionId: 'nirapod_premium' } })).toString('base64');
    await api().post('/api/v1/billing/play/rtdn?token=wrong').send({ message: { data } }).expect(403);
    await api().post('/api/v1/billing/play/rtdn?token=rtdn-secret-123').send({ message: { data } }).expect(204);
    const sub = await db('subscriptions').whereNotNull('play_purchase_token_hash').orderBy('id', 'desc').first();
    assert.equal(sub.status, 'expired');
  });

  test('children cannot buy', async () => {
    const { parent, fam } = await family();
    const code = (await api().post(`/api/v1/families/${fam.id}/child-code`).set(bearer(parent)).send({}).expect(201)).body.code;
    const child = (await api().post('/api/v1/auth/child').send({ code, first_name: 'Rafi', device: { device_id: 'p6-child' } }).expect(200)).body;
    await api().post('/api/v1/redeem').set(bearer(child)).set('x-device-id', 'p6-child').send({ code: 'NRPD-ANY-00001' }).expect(403);
  });
});
