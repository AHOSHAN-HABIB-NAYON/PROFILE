import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { freshDb, buildTestApp, signUp, bearer, uniqueEmail } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { stepFence, distanceM } from '../src/safety/geo.js';
import { watchTrips } from '../src/jobs/index.js';
import { render } from '../src/email/templates.js';

let db, t;
before(async () => {
  db = await freshDb();
  await seed(db);
  t = buildTestApp(db);
});
after(async () => db.destroy());
const api = () => request(t.app);
let n = 0;

// Home at Dhaka; a point ~2 km away is "outside".
const HOME = { lat: 23.8103, lng: 90.4125 };
const AWAY = { lat: 23.8283, lng: 90.4125 };

async function setup() {
  const parent = await signUp(t);
  const fam = (await api().post('/api/v1/families').set(bearer(parent)).send({}).expect(201)).body;
  await api().patch('/api/v1/me/profile').set(bearer(parent)).send({ name: 'Mom', country_iso2: 'BD' }).expect(200);
  const code = (await api().post(`/api/v1/families/${fam.id}/child-code`).set(bearer(parent)).send({}).expect(201)).body.code;
  const deviceId = `p4-${++n}`;
  const child = (await api().post('/api/v1/auth/child').send({ code, first_name: 'Rafi', timezone: 'Asia/Dhaka', device: { device_id: deviceId } }).expect(200)).body;
  return { parent, fam, child, deviceId };
}
const pt = (pos, over = {}) => ({ recorded_at: t.clock.now().toISOString(), accuracy_m: 10, battery_pct: 80, ...pos, ...over });
async function upload(child, ...positions) {
  const auth = child.deviceAuth ?? bearer(child);
  for (const pos of positions) {
    t.clock.advance(60_000);
    await api().post('/api/v1/locations').set(auth).send({ points: [pt(pos)] }).expect(202);
  }
}
async function withDeviceKey(child, deviceId) {
  const key = (await api().post('/api/v1/devices/upload-key').set(bearer(child)).set('x-device-id', deviceId).expect(201)).body.upload_key;
  return { ...child, deviceAuth: { authorization: `Device ${key}`, 'x-device-id': deviceId } };
}
const relogin = async (s, deviceId) => (await api().post('/api/v1/auth/refresh').set(deviceId ? { 'x-device-id': deviceId } : {}).send({ refresh_token: s.refresh_token }).expect(200)).body;
const timeline = async (parent, fam) => (await api().get(`/api/v1/families/${fam.id}/timeline`).set(bearer(parent)).expect(200)).body;

describe('geofence state machine', () => {
  const place = { ...HOME, radius_m: 150 };
  const at = (pos) => ({ ...pos, accuracy_m: 10, at: new Date() });
  test('first confirmed state is silent; a change needs 2 agreeing points', () => {
    let s = stepFence(place, null, [at(HOME), at(HOME)]);
    assert.equal(s.next.state, 'inside');
    assert.equal(s.events.length, 0);
    s = stepFence(place, s.next, [at(AWAY)]);
    assert.equal(s.events.length, 0); // one point is not enough
    s = stepFence(place, s.next, [at(AWAY)]);
    assert.deepEqual(s.events.map((e) => e.type), ['departure']);
    s = stepFence(place, s.next, [at(HOME), at(AWAY), at(HOME), at(HOME)]);
    assert.deepEqual(s.events.map((e) => e.type), ['arrival']);
  });
  test('inaccurate points and the edge band are ignored', () => {
    const s = stepFence(place, { state: 'inside' }, [at({ ...AWAY, accuracy_m: 400 }), { ...AWAY, accuracy_m: 400, at: new Date() }]);
    assert.equal(s.events.length, 0);
    const edge = { lat: HOME.lat + 0.00153, lng: HOME.lng }; // ~170 m: beyond 150 but inside the 25 m margin
    assert.ok(distanceM(HOME.lat, HOME.lng, edge.lat, edge.lng) > 150);
    assert.equal(stepFence(place, { state: 'inside' }, [at(edge), at(edge)]).events.length, 0);
  });
});

describe('places', () => {
  test('adults add places; free plan allows 2 then PLAN_LIMIT_REACHED; child cannot add', async () => {
    const { parent, fam, child } = await setup();
    const base = `/api/v1/families/${fam.id}/places`;
    await api().post(base).set(bearer(parent)).send({ name: 'Home', type: 'home', ...HOME, radius_m: 150 }).expect(201);
    await api().post(base).set(bearer(parent)).send({ name: 'School', type: 'school', ...AWAY, radius_m: 99 }).expect(400);
    const school = (await api().post(base).set(bearer(parent)).send({ name: 'School', type: 'school', ...AWAY, applies_to: [child.user.id] }).expect(201)).body;
    assert.deepEqual(school.applies_to, [child.user.id]);
    const r = await api().post(base).set(bearer(parent)).send({ name: 'Coaching', type: 'coaching', ...HOME }).expect(402);
    assert.equal(r.body.error.details.limit, 'places');
    await api().post(base).set(bearer(child)).send({ name: 'X', ...HOME }).expect(403);
    const list = (await api().get(base).set(bearer(child)).expect(200)).body;
    assert.equal(list.places.length, 2);
    assert.equal(list.max_places, 2);
    await api().patch(`${base}/${school.id}`).set(bearer(parent)).send({ radius_m: 250 }).expect(200);
    await api().delete(`${base}/${school.id}`).set(bearer(parent)).expect(204);
    await api().delete(`${base}/${school.id}`).set(bearer(parent)).expect(404);
  });

  test('uploads raise debounced departure / arrival alerts with the place name', async () => {
    const { parent, fam, child } = await setup();
    await api().post(`/api/v1/families/${fam.id}/places`).set(bearer(parent)).send({ name: 'Home', type: 'home', ...HOME }).expect(201);
    await upload(child, HOME, HOME, AWAY, AWAY, HOME, HOME);
    const tl = await timeline(parent, fam);
    assert.deepEqual(tl.filter((e) => e.type === 'arrival' || e.type === 'departure').map((e) => e.type), ['arrival', 'departure']);
    assert.equal(tl.find((e) => e.type === 'arrival').data.place, 'Home');
    const notes = await db('notifications').where({ type: 'arrival' });
    assert.ok(notes.some((x) => x.category === 'family'));
  });
});

describe('SOS', () => {
  test('SOS reaches every adult (realtime + email) and emergency contacts by email; status moves forward', async () => {
    const { parent, fam, child } = await setup();
    await api().post(`/api/v1/families/${fam.id}/emergency-contacts`).set(bearer(parent))
      .send({ name: 'Aunt', email: 'aunt@example.com', relationship: 'Aunt' }).expect(201);
    await api().get(`/api/v1/families/${fam.id}/emergency-contacts`).set(bearer(child)).expect(403);
    const before = t.mail.messages.length;
    const sos = (await api().post('/api/v1/sos').set(bearer(child)).send({ trigger: 'button', ...HOME, accuracy_m: 12 }).expect(201)).body;
    assert.equal(sos.status, 'active');
    assert.equal(sos.member.name, 'Rafi');
    assert.match(sos.map_url, /^https:\/\/maps\.google\.com\/\?q=23\.810300,90\.412500$/);
    const socket = sos.deliveries.filter((d) => d.channel === 'socket');
    assert.equal(socket.length, 1);
    assert.equal(socket[0].status, 'sent');
    const emails = t.mail.messages.slice(before);
    assert.ok(emails.some((m) => m.to === 'aunt@example.com' && /SOS from Rafi/.test(m.subject)));
    assert.equal(emails.length, 2); // the parent + the contact
    assert.ok(emails.every((m) => m.text.includes('maps.google.com')));
    // A second press does not create another SOS.
    const again = (await api().post('/api/v1/sos').set(bearer(child)).send({}).expect(200)).body;
    assert.equal(again.id, sos.id);
    // The parent sees it, acknowledges and responds.
    const active = (await api().get(`/api/v1/families/${fam.id}/sos`).set(bearer(parent)).expect(200)).body;
    assert.equal(active[0].id, sos.id);
    await api().post(`/api/v1/sos/${sos.id}/ack`).set(bearer(parent)).send({ state: 'seen' }).expect(200);
    const seen = (await api().get(`/api/v1/sos/${sos.id}`).set(bearer(child)).expect(200)).body;
    const d = seen.deliveries.find((x) => x.channel === 'socket');
    assert.equal(d.status, 'seen');
    assert.ok(d.delivered_at && d.seen_at);
    await api().post(`/api/v1/sos/${sos.id}/ack`).set(bearer(parent)).send({ state: 'delivered' }).expect(200);
    assert.equal((await api().get(`/api/v1/sos/${sos.id}`).set(bearer(parent))).body.deliveries.find((x) => x.channel === 'socket').status, 'seen');
    await api().post(`/api/v1/sos/${sos.id}/ack`).set(bearer(child)).send({ state: 'seen' }).expect(403);
    // Resolve.
    const done = (await api().post(`/api/v1/sos/${sos.id}/resolve`).set(bearer(child)).send({}).expect(200)).body;
    assert.equal(done.status, 'resolved');
    const tl = await timeline(parent, fam);
    assert.ok(tl.some((e) => e.type === 'sos') && tl.some((e) => e.type === 'sos_resolved'));
  });

  test('shake SOS from the background service with the device key; other families cannot read it', async () => {
    const { child, deviceId } = await setup();
    const key = (await api().post('/api/v1/devices/upload-key').set(bearer(child)).set('x-device-id', deviceId).expect(201)).body.upload_key;
    await upload(child, HOME);
    const sos = (await api().post('/api/v1/sos').set({ authorization: `Device ${key}`, 'x-device-id': deviceId }).send({ trigger: 'shake' }).expect(201)).body;
    assert.equal(sos.trigger, 'shake');
    assert.equal(sos.lat, HOME.lat); // falls back to the latest point
    const other = await setup();
    await api().get(`/api/v1/sos/${sos.id}`).set(bearer(other.parent)).expect(404);
  });

  test('emergency numbers come from the table by country', async () => {
    const { parent } = await setup();
    const r = (await api().get('/api/v1/emergency-numbers?country=BD').set(bearer(parent)).expect(200)).body;
    assert.equal(r.country, 'BD');
    assert.ok(r.numbers.length >= 1);
  });

  test('SOS email template has the map button, or explains a missing location', () => {
    assert.match(render('sos_alert', 'en', { name: 'Rafi', time: '7:57 PM', map_url: 'https://maps.google.com/?q=1,2' }).html, /href="https:\/\/maps\.google\.com/);
    assert.match(render('sos_alert', 'en', { name: 'Rafi', time: '7:57 PM' }).text, /not available/);
  });
});

describe('I arrived safely and safe walk', () => {
  test('"I arrived safely" names the place the child is at', async () => {
    const { parent, fam, child } = await setup();
    await api().post(`/api/v1/families/${fam.id}/places`).set(bearer(parent)).send({ name: 'School', type: 'school', ...HOME }).expect(201);
    await upload(child, HOME);
    const r = (await api().post('/api/v1/safe-arrival').set(bearer(child)).send({}).expect(201)).body;
    assert.equal(r.place, 'School');
    const tl = await timeline(parent, fam);
    assert.equal(tl.find((e) => e.type === 'safe_arrival').data.place, 'School');
  });

  test('heading home ends on its own when the child arrives home', async () => {
    const { parent, fam, child } = await setup();
    await api().post(`/api/v1/families/${fam.id}/places`).set(bearer(parent)).send({ name: 'Home', type: 'home', ...HOME }).expect(201);
    await upload(child, AWAY, AWAY);
    const trip = (await api().post('/api/v1/trips').set(bearer(child)).send({ minutes: 30 }).expect(201)).body;
    assert.equal(trip.destination.name, 'Home');
    const watching = (await api().get(`/api/v1/families/${fam.id}/trips`).set(bearer(parent)).expect(200)).body;
    assert.equal(watching[0].id, trip.id);
    await upload(child, HOME, HOME);
    const after = (await api().get('/api/v1/trips/active').set(bearer(child)).expect(200)).body;
    assert.equal(after, null);
    const tl = await timeline(parent, fam);
    assert.ok(tl.some((e) => e.type === 'safe_walk_started') && tl.some((e) => e.type === 'safe_walk_arrived'));
  });

  test('late or stopped too long -> one alert each; manual arrive and cancel', async () => {
    const s0 = await setup();
    const { fam, deviceId } = s0;
    let { parent } = s0;
    let child = await withDeviceKey(s0.child, deviceId);
    await upload(child, AWAY);
    const trip = (await api().post('/api/v1/trips').set(bearer(child)).send({ minutes: 15 }).expect(201)).body;
    assert.equal(trip.destination, null);
    // Standing still for 11 minutes.
    for (let i = 0; i < 11; i++) await upload(child, AWAY);
    await watchTrips(t.app.locals.ctx);
    await watchTrips(t.app.locals.ctx);
    t.clock.advance(5 * 60_000);
    await watchTrips(t.app.locals.ctx);
    await watchTrips(t.app.locals.ctx);
    parent = await relogin(parent);
    child = { ...(await relogin(child, deviceId)), deviceAuth: child.deviceAuth };
    const tl = await timeline(parent, fam);
    assert.equal(tl.filter((e) => e.type === 'safe_walk_stopped').length, 1);
    assert.equal(tl.filter((e) => e.type === 'safe_walk_overdue').length, 1);
    const late = (await api().get(`/api/v1/families/${fam.id}/trips`).set(bearer(parent)).expect(200)).body[0];
    assert.equal(late.overdue, true);
    assert.equal(late.stopped, true);
    const done = (await api().post(`/api/v1/trips/${trip.id}/arrive`).set(bearer(child)).send({}).expect(200)).body;
    assert.equal(done.status, 'arrived');
    const t2 = (await api().post('/api/v1/trips').set(bearer(child)).send({ minutes: 20 }).expect(201)).body;
    await api().post(`/api/v1/trips/${t2.id}/arrive`).set(bearer(parent)).send({}).expect(403);
    assert.equal((await api().post(`/api/v1/trips/${t2.id}/cancel`).set(bearer(parent)).send({}).expect(200)).body.status, 'cancelled');
  });

  test('a stranger cannot read or cancel a trip', async () => {
    const { child } = await setup();
    const trip = (await api().post('/api/v1/trips').set(bearer(child)).send({ minutes: 10 }).expect(201)).body;
    const other = await signUp(t, uniqueEmail('x'));
    await api().post(`/api/v1/trips/${trip.id}/cancel`).set(bearer(other)).send({}).expect(404);
  });
});
