import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { freshDb, buildTestApp, signUp, bearer } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { batteryAlert } from '../src/tracking/alerts.js';
import { detectStaleDevices, purgeLocationHistory, runJob } from '../src/jobs/index.js';

let db, t;
before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db);
});
after(async () => db.destroy());
const api = () => request(t.app);
let n = 0;

async function setup() {
  const parent = await signUp(t);
  const fam = (await api().post('/api/v1/families').set(bearer(parent)).send({}).expect(201)).body;
  await api().patch('/api/v1/me/profile').set(bearer(parent)).send({ name: 'Mom' }).expect(200);
  const code = (await api().post(`/api/v1/families/${fam.id}/child-code`).set(bearer(parent)).send({}).expect(201)).body.code;
  const deviceId = `dev-${++n}`;
  const child = (await api().post('/api/v1/auth/child').send({ code, first_name: 'Rafi', timezone: 'Asia/Dhaka', device: { device_id: deviceId } }).expect(200)).body;
  return { parent, fam, child, deviceId };
}
const pt = (over = {}) => ({ recorded_at: t.clock.now().toISOString(), lat: 23.81, lng: 90.41, accuracy_m: 10, battery_pct: 60, ...over });
const deviceAuth = (key, id) => ({ authorization: `Device ${key}`, 'x-device-id': id });

describe('device upload key', () => {
  test('child creates a key; it uploads only for its own device; adults cannot create one', async () => {
    const { parent, child, deviceId } = await setup();
    await api().post('/api/v1/devices/upload-key').set(bearer(parent)).expect(403);
    const key = (await api().post('/api/v1/devices/upload-key').set(bearer(child)).set('x-device-id', deviceId).expect(201)).body.upload_key;
    await api().post('/api/v1/locations').set(deviceAuth(key, deviceId)).send({ points: [pt()] }).expect(202);
    await api().post('/api/v1/locations').set(deviceAuth(key, 'other-device')).send({ points: [pt()] }).expect(401);
    await api().get('/api/v1/me').set({ authorization: `Device ${key}` }).expect(401); // key is useless elsewhere
  });

  test('adults: background key only while their own sharing is active; pausing revokes it; no offline alerts for adults', async () => {
    const devId = `adult-${++n}`;
    const mom = await signUp(t, undefined, { device: { device_id: devId } });
    const fam = (await api().post('/api/v1/families').set(bearer(mom)).send({}).expect(201)).body;
    await api().patch(`/api/v1/families/${fam.id}/members/${mom.user.id}`).set(bearer(mom)).send({ sharing_status: 'paused' }).expect(200);
    await api().post('/api/v1/devices/upload-key').set(bearer(mom)).expect(403);
    await api().patch(`/api/v1/families/${fam.id}/members/${mom.user.id}`).set(bearer(mom)).send({ sharing_status: 'active' }).expect(200);
    const key = (await api().post('/api/v1/devices/upload-key').set(bearer(mom)).expect(201)).body.upload_key;
    await api().post('/api/v1/locations').set(deviceAuth(key, devId)).send({ points: [pt()] }).expect(202);
    t.clock.advance(60 * 60_000);
    await detectStaleDevices(t.app.locals.ctx);
    const momId = (await db('users').where({ uuid: mom.user.id }).first()).id;
    assert.equal((await db('timeline_events').where({ type: 'offline', user_id: momId })).length, 0);
    const again = (await api().post('/api/v1/auth/login').send({ email: mom.email, password: 'Nirapod-Family-2026', device: { device_id: devId } }).expect(200)).body;
    await api().patch(`/api/v1/families/${fam.id}/members/${mom.user.id}`).set(bearer(again)).send({ sharing_status: 'paused' }).expect(200);
    await api().post('/api/v1/locations').set(deviceAuth(key, devId)).send({ points: [pt()] }).expect(401);
  });

  test('live watch: adults can ask background phones for fast updates; children cannot; throttled per family', async () => {
    const { parent, fam, child } = await setup();
    await api().post('/api/v1/devices/upload-key').set(bearer(child)).expect(201);
    const woke = [];
    t.app.locals.ctx.pusher = { wakeUsers: async (ids, data) => { woke.push([ids.length, data.type]); return ids.length; } };
    const r1 = (await api().post(`/api/v1/families/${fam.id}/live-watch`).set(bearer(parent)).expect(202)).body;
    assert.equal(r1.live_seconds, 300);
    assert.deepEqual(woke, [[1, 'live']]);
    await api().post(`/api/v1/families/${fam.id}/live-watch`).set(bearer(parent)).expect(202);
    assert.equal(woke.length, 1); // throttled
    await api().post(`/api/v1/families/${fam.id}/live-watch`).set(bearer(child)).expect(403);
    delete t.app.locals.ctx.pusher;
  });

  test('removing the child invalidates the key', async () => {
    const { parent, fam, child, deviceId } = await setup();
    const key = (await api().post('/api/v1/devices/upload-key').set(bearer(child)).expect(201)).body.upload_key;
    await api().delete(`/api/v1/families/${fam.id}/members/${child.user.id}`).set(bearer(parent)).expect(204);
    await api().post('/api/v1/locations').set(deviceAuth(key, deviceId)).send({ points: [pt()] }).expect(401);
  });
});

describe('alerts', () => {
  test('battery thresholds with hysteresis', () => {
    assert.deepEqual(batteryAlert(50, null), { alert: null, next: null });
    assert.deepEqual(batteryAlert(20, null), { alert: 'battery_low', next: 20 });
    assert.deepEqual(batteryAlert(18, 20), { alert: null, next: 20 });
    assert.deepEqual(batteryAlert(5, 20), { alert: 'battery_critical', next: 5 });
    assert.deepEqual(batteryAlert(4, 5), { alert: null, next: 5 });
    assert.deepEqual(batteryAlert(30, 5), { alert: null, next: null });
  });

  test('uploads raise battery and location-off alerts once, for parents only', async () => {
    const { parent, fam, child } = await setup();
    await api().post('/api/v1/locations').set(bearer(child)).send({ points: [pt({ battery_pct: 19 })] }).expect(202);
    await api().post('/api/v1/locations').set(bearer(child)).send({ points: [pt({ battery_pct: 18 })] }).expect(202);
    await api().post('/api/v1/locations').set(bearer(child)).send({ device_state: { location_services_on: false } }).expect(202);
    await api().post('/api/v1/locations').set(bearer(child)).send({ device_state: { location_services_on: false } }).expect(202);
    const tl = (await api().get(`/api/v1/families/${fam.id}/timeline`).set(bearer(parent)).expect(200)).body;
    assert.equal(tl.filter((e) => e.type === 'battery_low').length, 1);
    assert.equal(tl.filter((e) => e.type === 'location_off').length, 1);
    assert.equal(tl.find((e) => e.type === 'battery_low').member_name, 'Rafi');
    const notes = await db('notifications').where({ type: 'battery_low' });
    assert.ok(notes.length >= 1);
    assert.ok(notes.every((x) => x.user_id !== undefined && x.category === 'safety'));
    const childNotes = await db('notifications as n').join('users as u', 'u.id', 'n.user_id').where({ 'u.uuid': child.user.id, 'n.type': 'battery_low' });
    assert.equal(childNotes.length, 0);
  });

  test('"Request update now" reaches the device in the next upload response (once)', async () => {
    const { parent, fam, child } = await setup();
    await api().post(`/api/v1/families/${fam.id}/members/${child.user.id}/request-update`).set(bearer(parent)).send({}).expect(202);
    const r1 = (await api().post('/api/v1/locations').set(bearer(child)).send({ points: [pt()] }).expect(202)).body;
    assert.deepEqual(r1.update_requested, { by_name: 'Mom' });
    const r2 = (await api().post('/api/v1/locations').set(bearer(child)).send({ points: [pt()] }).expect(202)).body;
    assert.equal(r2.update_requested, null);
  });
});

describe('history', () => {
  test('route for a day in the member zone; older than the plan allows -> PLAN_LIMIT_REACHED', async () => {
    const { parent, fam, child } = await setup();
    // 2026-10-28T12:00Z is 18:00 in Dhaka (same day)
    await api().post('/api/v1/locations').set(bearer(child)).send({ points: [pt({ recorded_at: '2026-10-28T11:00:00.000Z' }), pt({ recorded_at: '2026-10-28T11:30:00.000Z', lat: 23.82 })] }).expect(202);
    const r = (await api().get(`/api/v1/families/${fam.id}/members/${child.user.id}/route?date=2026-10-28`).set(bearer(parent)).expect(200)).body;
    assert.equal(r.timezone, 'Asia/Dhaka');
    assert.equal(r.points.length, 2);
    assert.equal(r.history_days, 3);
    const old = await api().get(`/api/v1/families/${fam.id}/members/${child.user.id}/route?date=2026-10-20`).set(bearer(parent)).expect(402);
    assert.equal(old.body.error.details.limit, 'history_days');
  });

  test('a child cannot see the parent route; strangers get 404', async () => {
    const { parent, fam, child } = await setup();
    await api().get(`/api/v1/families/${fam.id}/members/${parent.user.id}/route?date=2026-10-28`).set(bearer(child)).expect(404);
    const stranger = await signUp(t);
    await api().get(`/api/v1/families/${fam.id}/timeline`).set(bearer(stranger)).expect(404);
  });

  test('timeline category filter', async () => {
    const { parent, fam, child } = await setup();
    await api().post('/api/v1/locations').set(bearer(child)).send({ points: [pt({ battery_pct: 3 })] }).expect(202);
    await api().post(`/api/v1/families/${fam.id}/members/${child.user.id}/request-update`).set(bearer(parent)).send({}).expect(202);
    const safety = (await api().get(`/api/v1/families/${fam.id}/timeline?category=safety`).set(bearer(parent)).expect(200)).body;
    assert.ok(safety.every((e) => ['battery_low', 'battery_critical', 'offline', 'location_off', 'permission_removed', 'sos', 'safe_walk_overdue'].includes(e.type)));
    const family = (await api().get(`/api/v1/families/${fam.id}/timeline?category=family`).set(bearer(parent)).expect(200)).body;
    assert.ok(family.some((e) => e.type === 'update_requested'));
    assert.ok(family.every((e) => !('by' in e.data)));
  });
});

describe('jobs', () => {
  test('stale device: one offline alert after 15 min without updates, re-armed by the next upload', async () => {
    const { parent, fam, child, deviceId } = await setup();
    // The background service uploads with the device key (no expiry), like on a real phone.
    const key = (await api().post('/api/v1/devices/upload-key').set(bearer(child)).expect(201)).body.upload_key;
    const upload = () => api().post('/api/v1/locations').set(deviceAuth(key, deviceId)).send({ points: [pt()] }).expect(202);
    await upload();
    t.clock.advance(16 * 60_000);
    const ctx = t.app.locals.ctx;
    assert.ok((await runJob(db, t.clock, 'stale_devices', () => detectStaleDevices(ctx))) >= 1);
    assert.equal(await detectStaleDevices(ctx), 0); // not twice
    const fresh = (await api().post('/api/v1/auth/login').send({ email: parent.email, password: 'Nirapod-Family-2026' }).expect(200)).body;
    const tl = (await api().get(`/api/v1/families/${fam.id}/timeline`).set(bearer(fresh)).expect(200)).body;
    const off = tl.find((e) => e.type === 'offline' && e.member_id === child.user.id);
    assert.ok(off.data.minutes >= 15);
    await upload();
    t.clock.advance(16 * 60_000);
    assert.ok(await detectStaleDevices(ctx) >= 1);
    const run = await db('job_runs').where({ job: 'stale_devices' }).orderBy('id', 'desc').first();
    assert.equal(run.status, 'ok');
  });

  test('retention purge keeps only the plan window (free = 3 days)', async () => {
    const { parent, fam, child } = await setup();
    await api().post('/api/v1/locations').set(bearer(child)).send({ points: [pt({ recorded_at: new Date(t.clock.now() - 2 * 86400_000).toISOString() })] }).expect(202);
    t.clock.advance(2 * 86400_000);
    await purgeLocationHistory(t.app.locals.ctx);
    const left = await db('locations as l').join('users as u', 'u.id', 'l.user_id').where('u.uuid', child.user.id);
    assert.ok(left.every((p) => t.clock.now() - new Date(p.recorded_at) <= 3 * 86400_000));
    assert.ok(parent && fam);
  });
});
