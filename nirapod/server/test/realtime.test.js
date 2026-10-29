import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import request from 'supertest';
import { io as connect } from 'socket.io-client';
import { freshDb, buildTestApp, signUp, bearer } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { attachRealtime, createRealtimeHub } from '../src/realtime.js';

let db, t, server, url;
before(async () => {
  db = await freshDb();
  await seed(db);
  // Real clock: socket auth checks session expiry against it.
  t = buildTestApp(db, {}, { realtime: createRealtimeHub(), clock: { now: () => new Date() } });
  server = http.createServer(t.app);
  attachRealtime(server, t.app.locals.ctx);
  await new Promise((r) => server.listen(0, r));
  url = `http://127.0.0.1:${server.address().port}/rt`;
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.destroy();
});

test('socket rejects missing/invalid tokens', async () => {
  const s = connect(url, { path: '/socket.io', transports: ['websocket'], auth: { token: 'nope' }, reconnection: false });
  const err = await new Promise((r) => s.on('connect_error', r));
  assert.equal(err.data?.code, 'AUTH_REQUIRED');
  s.close();
});

test('parent receives a child location.update over the socket', async () => {
  const parent = await signUp(t);
  const fam = (await request(t.app).post('/api/v1/families').set(bearer(parent)).send({}).expect(201)).body;
  const code = (await request(t.app).post(`/api/v1/families/${fam.id}/child-code`).set(bearer(parent)).send({}).expect(201)).body.code;
  const child = (await request(t.app).post('/api/v1/auth/child').send({ code, first_name: 'Rafi', device: { device_id: 'rt1' } }).expect(200)).body;
  const s = connect(url, { path: '/socket.io', transports: ['websocket'], auth: { token: parent.access_token }, reconnection: false });
  await new Promise((r, j) => { s.on('connect', r); s.on('connect_error', j); });
  const got = new Promise((r) => s.on('location.update', r));
  await request(t.app).post('/api/v1/locations').set(bearer(child))
    .send({ points: [{ recorded_at: new Date().toISOString(), lat: 23.81, lng: 90.41, accuracy_m: 10 }] }).expect(202);
  const ev = await got;
  assert.equal(ev.v, 1);
  assert.equal(ev.data.member_id, child.user.id);
  assert.equal(ev.data.point.lat, 23.81);
  s.close();
});
