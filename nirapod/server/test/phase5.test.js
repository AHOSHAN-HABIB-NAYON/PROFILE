import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { freshDb, buildTestApp, signUp, bearer } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { setSecret, setSetting } from '../src/settings.js';
import { encryptSecret, decryptSecret, maskSecret } from '../src/crypto/secrets.js';
import { sendDailySummaries } from '../src/jobs/index.js';

const sent = [];
let invalidTokens = new Set();
const fcmTransport = async (url, { body }) => {
  if (url.includes('oauth2')) return { status: 200, json: { access_token: 'ya29.test', expires_in: 3600 } };
  const msg = JSON.parse(body).message;
  if (invalidTokens.has(msg.token)) return { status: 404, json: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } };
  sent.push(msg);
  return { status: 200, json: { name: 'projects/x/messages/1' } };
};

let db, t;
before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db, {}, { fcmTransport });
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  await setSecret(db, t.app.locals.ctx.cfg, 'fcm_service_account', JSON.stringify({
    client_email: 'push@x.iam.gserviceaccount.com', project_id: 'nirapod-test', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }));
});
after(async () => db.destroy());
const api = () => request(t.app);
let n = 0;

async function setup() {
  const parent = await signUp(t);
  const fam = (await api().post('/api/v1/families').set(bearer(parent)).send({}).expect(201)).body;
  await api().patch('/api/v1/me/profile').set(bearer(parent)).send({ name: 'Mom', timezone: 'Asia/Dhaka' }).expect(200);
  await api().post('/api/v1/me/push-token').set(bearer(parent)).send({ token: `fcm-parent-token-${++n}-abcdefghij` }).expect(204);
  const code = (await api().post(`/api/v1/families/${fam.id}/child-code`).set(bearer(parent)).send({}).expect(201)).body.code;
  const child = (await api().post('/api/v1/auth/child').send({ code, first_name: 'Rafi', timezone: 'Asia/Dhaka', device: { device_id: `p5-${n}` } }).expect(200)).body;
  await api().post('/api/v1/me/push-token').set(bearer(child)).set('x-device-id', `p5-${n}`).send({ token: `fcm-child-token-${n}-abcdefghij` }).expect(204);
  return { parent, fam, child };
}

describe('secrets', () => {
  test('encrypt / decrypt / mask', () => {
    const e = encryptSecret('master', 'sk-very-secret-1234');
    assert.notEqual(e, 'sk-very-secret-1234');
    assert.equal(decryptSecret('master', e), 'sk-very-secret-1234');
    assert.equal(decryptSecret('other', e), null);
    assert.equal(maskSecret('sk-very-secret-1234'), 'sk-…1234');
  });
});

describe('push + alerts', () => {
  test('SOS pushes high priority on the safety channel; alerts list, unread and read', async () => {
    const { parent, child } = await setup();
    sent.length = 0;
    await api().post('/api/v1/sos').set(bearer(child)).send({ lat: 23.81, lng: 90.41 }).expect(201);
    const sos = sent.find((m) => m.data.type === 'sos');
    assert.ok(sos, 'sos push');
    assert.equal(sos.android.priority, 'HIGH');
    assert.equal(sos.android.notification.channel_id, 'nirapod_safety');
    assert.equal(sos.android.notification.title, 'SOS from Rafi');
    const list = (await api().get('/api/v1/notifications').set(bearer(parent)).expect(200)).body;
    assert.ok(list.unread >= 2); // family joined + sos
    assert.ok(list.items.some((i) => i.type === 'sos' && i.category === 'safety'));
    const safety = (await api().get('/api/v1/notifications?category=safety').set(bearer(parent)).expect(200)).body;
    assert.ok(safety.items.every((i) => i.category === 'safety'));
    await api().post('/api/v1/notifications/read').set(bearer(parent)).send({ all: true }).expect(200);
    assert.equal((await api().get('/api/v1/notifications').set(bearer(parent))).body.unread, 0);
  });

  test('family category can be turned off; safety cannot; request update wakes the child', async () => {
    const { parent, fam, child } = await setup();
    await api().patch('/api/v1/me/notification-prefs').set(bearer(parent)).send({ push: { family: false }, email: { daily_summary: false } }).expect(200);
    const prefs = (await api().get('/api/v1/me/notification-prefs').set(bearer(parent)).expect(200)).body;
    assert.equal(prefs.push.family, false);
    assert.equal(prefs.email.daily_summary, false);
    assert.equal(prefs.push.marketing, false); // marketing off unless chosen
    sent.length = 0;
    await api().post('/api/v1/safe-arrival').set(bearer(child)).send({}).expect(201);
    assert.equal(sent.filter((m) => m.data.type === 'safe_arrival').length, 0);
    await api().post(`/api/v1/families/${fam.id}/members/${child.user.id}/request-update`).set(bearer(parent)).send({}).expect(202);
    const wake = sent.find((m) => m.data.type === 'update_requested');
    assert.ok(wake && !wake.android.notification, 'data-only wake');
  });

  test('an invalid token is cleared', async () => {
    const { parent, child } = await setup();
    const row = await db('sessions as s').join('users as u', 'u.id', 's.user_id').where('u.uuid', parent.user.id).whereNotNull('s.fcm_token').first('s.fcm_token', 's.id');
    invalidTokens = new Set([row.fcm_token]);
    await api().post('/api/v1/sos').set(bearer(child)).send({}).expect(201);
    assert.equal((await db('sessions').where({ id: row.id }).first()).fcm_token, null);
    invalidTokens = new Set();
  });
});

describe('emails', () => {
  test('family joined email to the parent; daily summary at the chosen local hour, once a day', async () => {
    const before = t.mail.messages.length;
    const { parent } = await setup();
    assert.ok(t.mail.messages.slice(before).some((m) => /joined your Nirapod family/.test(m.subject)));
    await api().patch('/api/v1/me/notification-prefs').set(bearer(parent)).send({ daily_summary_hour: 20 }).expect(200);
    t.clock.set('2026-10-29T14:05:00.000Z'); // 20:05 in Dhaka
    const b2 = t.mail.messages.length;
    await sendDailySummaries(t.app.locals.ctx);
    await sendDailySummaries(t.app.locals.ctx);
    const mails = t.mail.messages.slice(b2).filter((m) => /Your family today/.test(m.subject));
    assert.ok(mails.length >= 1);
    assert.ok(mails.some((m) => /Rafi/.test(m.text)));
    t.clock.set('2026-10-28T12:00:00.000Z');
  });

  test('Firebase client config is public in app-config', async () => {
    await setSetting(db, 'firebase_android', { api_key: 'AIza-public', app_id: '1:2:android:3', project_id: 'nirapod', sender_id: '2' });
    const cfg = (await api().get('/api/v1/app-config').expect(200)).body;
    assert.equal(cfg.firebase_android.project_id, 'nirapod');
  });
});
