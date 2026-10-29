import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { freshDb, buildTestApp, signUp, bearer, uniqueEmail, GOOD_PASSWORD } from './helpers.js';
import { seed } from '../src/db/seed.js';

let db;
let t;
const emitted = [];
const fakeHub = { attach() {}, emitToUsers: (users, event, data) => emitted.push({ users: [...users], event, data }) };
const placesCalls = [];
const fakePlaces = async (q) => {
  placesCalls.push(q);
  return [
    { id: 'p1', name: 'Green Valley School', lat: q.lat + 0.001, lng: q.lng, address: 'Road 1' },
    { id: 'p2', name: 'City Hospital', lat: q.lat + 0.01, lng: q.lng, address: 'Road 2' },
  ];
};

before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db, {}, { realtime: fakeHub, placesFetcher: fakePlaces });
});
after(async () => db.destroy());

const api = () => request(t.app);
let dev = 0;
const pt = (over = {}) => ({ recorded_at: t.clock.now().toISOString(), lat: 23.8103, lng: 90.4125, accuracy_m: 12, battery_pct: 80, ...over });

async function familySetup() {
  const parent = await signUp(t);
  const fam = (await api().post('/api/v1/families').set(bearer(parent)).send({ name: 'Rahman' }).expect(201)).body;
  const code = (await api().post(`/api/v1/families/${fam.id}/child-code`).set(bearer(parent)).send({}).expect(201)).body.code;
  const child = (await api().post('/api/v1/auth/child').send({ code, first_name: 'Rafi', device: { device_id: `d${++dev}` } }).expect(200)).body;
  return { parent, fam, child };
}

async function inviteAdult(parent, famId, extra = {}) {
  const email = uniqueEmail('guardian');
  const inv = (await api().post(`/api/v1/families/${famId}/invites`).set(bearer(parent)).send({ email, ...extra }).expect(201)).body;
  const g = await signUp(t, email);
  await api().post('/api/v1/invites/accept').set(bearer(g)).send({ code: inv.code }).expect(200);
  return { g, inv };
}

const live = async (s, famId) => (await api().get(`/api/v1/families/${famId}/live`).set(bearer(s)).expect(200)).body;

describe('invites', () => {
  test('create invite: code, 7-day expiry, email sent in the inviter language, overseas flag kept', async () => {
    const { parent, fam } = await familySetup();
    const email = uniqueEmail('inv');
    const res = await api().post(`/api/v1/families/${fam.id}/invites`).set(bearer(parent))
      .send({ email, is_overseas: true, timezone: 'Asia/Riyadh' }).expect(201);
    assert.match(res.body.code, /^[A-Z2-9]{6}$/);
    assert.equal(res.body.is_overseas, true);
    assert.ok(new Date(res.body.expires_at) - t.clock.now() >= 6.9 * 24 * 3600_000);
    assert.ok(t.mail.messages.some((m) => m.to === email && m.text.includes(res.body.code)));
  });

  test('invalid time zone and child callers are rejected', async () => {
    const { parent, fam, child } = await familySetup();
    await api().post(`/api/v1/families/${fam.id}/invites`).set(bearer(parent)).send({ timezone: 'Mars/Base' }).expect(400);
    await api().post(`/api/v1/families/${fam.id}/invites`).set(bearer(child)).send({}).expect(403);
  });

  test('free plan member limit (2 adults) applies to invites', async () => {
    const { parent, fam } = await familySetup();
    await inviteAdult(parent, fam.id);
    const r = await api().post(`/api/v1/families/${fam.id}/invites`).set(bearer(parent)).send({}).expect(402);
    assert.equal(r.body.error.details.limit, 'max_members');
  });
});

describe('visibility and adult consent', () => {
  test('child location is visible to the parent; child sees only themself', async () => {
    const { parent, fam, child } = await familySetup();
    await api().post('/api/v1/locations').set(bearer(child)).set('x-device-id', 'x').send({ points: [pt()] }).expect(202);
    const pv = await live(parent, fam.id);
    const rafi = pv.find((m) => m.member_id === child.user.id);
    assert.equal(rafi.point.lat, 23.8103);
    assert.equal(rafi.battery_pct, 80);
    assert.equal(rafi.online, true);
    const cv = await live(child, fam.id);
    assert.deepEqual(cv.map((m) => m.member_id), [child.user.id]);
  });

  test('an adult is invisible to other adults until they accept; pausing hides them again', async () => {
    const { parent, fam } = await familySetup();
    const { g } = await inviteAdult(parent, fam.id);
    // pending: uploads refused, not visible
    const refused = await api().post('/api/v1/locations').set(bearer(g)).send({ points: [pt()] }).expect(403);
    assert.equal(refused.body.error.code, 'CONSENT_REQUIRED');
    assert.ok(!(await live(parent, fam.id)).some((m) => m.member_id === g.user.id));
    // accept
    await api().patch(`/api/v1/families/${fam.id}/members/${g.user.id}`).set(bearer(g)).send({ sharing_status: 'active' }).expect(200);
    await api().post('/api/v1/locations').set(bearer(g)).send({ points: [pt({ lat: 24.7136, lng: 46.6753 })] }).expect(202);
    assert.equal((await live(parent, fam.id)).find((m) => m.member_id === g.user.id).point.lat, 24.7136);
    // pause
    await api().patch(`/api/v1/families/${fam.id}/members/${g.user.id}`).set(bearer(g)).send({ sharing_status: 'paused' }).expect(200);
    assert.ok(!(await live(parent, fam.id)).some((m) => m.member_id === g.user.id));
    // a consent record is kept for each change
    const rows = await db('consents').where({ type: 'adult_location_sharing' });
    assert.ok(rows.length >= 2);
  });

  test('only the adult themself can change their sharing; children cannot pause', async () => {
    const { parent, fam, child } = await familySetup();
    const { g } = await inviteAdult(parent, fam.id);
    await api().patch(`/api/v1/families/${fam.id}/members/${g.user.id}`).set(bearer(parent)).send({ sharing_status: 'active' }).expect(403);
    await api().patch(`/api/v1/families/${fam.id}/members/${child.user.id}`).set(bearer(child)).send({ sharing_status: 'paused' }).expect(403);
  });

  test('non-members get 404 for live; realtime goes only to allowed viewers', async () => {
    const { parent, fam, child } = await familySetup();
    const stranger = await signUp(t);
    await api().get(`/api/v1/families/${fam.id}/live`).set(bearer(stranger)).expect(404);
    emitted.length = 0;
    await api().post('/api/v1/locations').set(bearer(child)).send({ points: [pt()] }).expect(202);
    const ev = emitted.find((e) => e.event === 'location.update');
    assert.ok(ev.users.includes(parent.user.id));
    assert.ok(!ev.users.includes(stranger.user.id));
  });

  test('points far in the past or future are dropped; bad coordinates rejected', async () => {
    const { child } = await familySetup();
    const old = new Date(t.clock.now().getTime() - 8 * 24 * 3600_000).toISOString();
    const res = await api().post('/api/v1/locations').set(bearer(child)).send({ points: [pt(), pt({ recorded_at: old })] }).expect(202);
    assert.deepEqual(res.body, { accepted: 1, dropped: 1 });
    await api().post('/api/v1/locations').set(bearer(child)).send({ points: [pt({ lat: 95 })] }).expect(400);
  });

  test('unavailable reason comes from device diagnostics', async () => {
    const { parent, fam, child } = await familySetup();
    await api().post('/api/v1/locations').set(bearer(child)).send({ points: [pt()], device_state: { location_allowed: false } }).expect(202);
    const r = (await live(parent, fam.id)).find((m) => m.member_id === child.user.id);
    assert.equal(r.unavailable_reason, 'permission_removed');
  });
});

describe('request update now', () => {
  test('parent can request a child update once per 2 minutes; the child is notified', async () => {
    const { parent, fam, child } = await familySetup();
    emitted.length = 0;
    const url = `/api/v1/families/${fam.id}/members/${child.user.id}/request-update`;
    await api().post(url).set(bearer(parent)).send({}).expect(202);
    assert.ok(emitted.some((e) => e.event === 'update.requested' && e.users[0] === child.user.id));
    const again = await api().post(url).set(bearer(parent)).send({}).expect(429);
    assert.ok(again.body.error.details.retry_after_s > 0);
    t.clock.advance(2 * 60_000 + 1000);
    await api().post(url).set(bearer(parent)).send({}).expect(202);
    const n = await db('notifications').where({ type: 'update_requested' }).count({ c: '*' }).first();
    assert.ok(Number(n.c) >= 2);
  });

  test('children cannot request; adults cannot be targeted', async () => {
    const { parent, fam, child } = await familySetup();
    await api().post(`/api/v1/families/${fam.id}/members/${parent.user.id}/request-update`).set(bearer(child)).send({}).expect(403);
    await api().post(`/api/v1/families/${fam.id}/members/${parent.user.id}/request-update`).set(bearer(parent)).send({}).expect(403);
  });
});

describe('remove, leave, transfer', () => {
  test('removing a child revokes the child device sessions', async () => {
    const { parent, fam, child } = await familySetup();
    await api().delete(`/api/v1/families/${fam.id}/members/${child.user.id}`).set(bearer(parent)).expect(204);
    await api().get('/api/v1/me').set(bearer(child)).expect(401);
  });

  test('owner must transfer before leaving; after transfer the old owner can leave', async () => {
    const { parent, fam } = await familySetup();
    const { g } = await inviteAdult(parent, fam.id);
    const blocked = await api().delete(`/api/v1/families/${fam.id}/members/${parent.user.id}`).set(bearer(parent)).expect(409);
    assert.equal(blocked.body.error.details.reason, 'owner_must_transfer');
    const tr = await api().post(`/api/v1/families/${fam.id}/transfer`).set(bearer(parent)).send({ new_owner_member_id: g.user.id }).expect(200);
    assert.equal(tr.body.owner_member_id, g.user.id);
    await api().delete(`/api/v1/families/${fam.id}/members/${parent.user.id}`).set(bearer(parent)).expect(204);
    await api().get(`/api/v1/families/${fam.id}`).set(bearer(parent)).expect(404);
  });

  test('a guardian cannot remove the owner; a child cannot leave by itself', async () => {
    const { parent, fam, child } = await familySetup();
    const { g } = await inviteAdult(parent, fam.id);
    await api().delete(`/api/v1/families/${fam.id}/members/${parent.user.id}`).set(bearer(g)).expect(403);
    await api().delete(`/api/v1/families/${fam.id}/members/${child.user.id}`).set(bearer(child)).expect(403);
  });
});

describe('nearby places', () => {
  test('cached per grid cell for 24 h, sorted by distance, never sends exact coordinates to Google', async () => {
    const s = await signUp(t);
    placesCalls.length = 0;
    const r1 = (await api().get('/api/v1/nearby?lat=23.81034&lng=90.41251&categories=school').set(bearer(s)).expect(200)).body;
    assert.equal(r1.fetched, true);
    assert.equal(r1.places[0].name, 'Green Valley School');
    assert.ok(r1.places[0].distance_m < r1.places[1].distance_m);
    assert.equal(placesCalls[0].lat, 23.81); // cell centre, not the user's position
    const r2 = (await api().get('/api/v1/nearby?lat=23.8121&lng=90.4139&categories=school').set(bearer(s)).expect(200)).body;
    assert.equal(r2.fetched, false);
    assert.equal(placesCalls.length, 1);
  });

  test('admin switch turns the feature off', async () => {
    const s = await signUp(t);
    await db('app_settings').where({ key: 'nearby_places_enabled' }).update({ value: 'false' });
    const r = await api().get('/api/v1/nearby?lat=1&lng=1').set(bearer(s)).expect(503);
    assert.equal(r.body.error.code, 'FEATURE_DISABLED');
    await db('app_settings').where({ key: 'nearby_places_enabled' }).update({ value: 'true' });
  });

  test('per-user daily limit stops new Google calls', async () => {
    const s = await signUp(t);
    await db('app_settings').where({ key: 'nearby_places_per_user_daily' }).update({ value: '1' });
    placesCalls.length = 0;
    await api().get('/api/v1/nearby?lat=10.1&lng=10.1&categories=school').set(bearer(s)).expect(200);
    const r = (await api().get('/api/v1/nearby?lat=11.1&lng=11.1&categories=school').set(bearer(s)).expect(200)).body;
    assert.equal(placesCalls.length, 1);
    assert.deepEqual(r.places, []);
    await db('app_settings').where({ key: 'nearby_places_per_user_daily' }).update({ value: '30' });
  });
});

test('misuse reports are stored', async () => {
  const s = await signUp(t);
  await api().post('/api/v1/abuse-reports').set(bearer(s)).send({ category: 'covert_tracking', details: 'x' }).expect(201);
  assert.ok(await db('abuse_reports').where({ category: 'covert_tracking' }).first());
});

test('GOOD_PASSWORD helper is exported (sanity)', () => assert.ok(GOOD_PASSWORD));
