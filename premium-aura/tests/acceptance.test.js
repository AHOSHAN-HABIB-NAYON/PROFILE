'use strict';
/**
 * End-to-end acceptance tests against a running, installed instance.
 *
 *   BASE_URL=http://localhost:3000 ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=Admin12345 npm test
 *
 * Uses real HTTP + MySQL. Creates throw-away users/services/resources with a
 * unique suffix. A local mock provider server exercises API polling.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { authenticator } = require('otplib');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin12345';
const RUN = Date.now().toString(36);
const NUM = String(Date.now()).slice(-7); // unique digits per run
const MAIL_LOG = path.join(__dirname, '..', 'logs', 'mail.log');

class Client {
  constructor() { this.cookies = new Map(); this.csrf = null; }

  cookieHeader() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; '); }

  async req(method, url, { json, form, headers = {}, csrf = true, redirect = 'manual' } = {}) {
    const token = method !== 'GET' && csrf ? await this.token() : null; // may set the session cookie
    const h = { Accept: 'application/json', Cookie: this.cookieHeader(), ...headers };
    if (token) h['X-CSRF-Token'] = token;
    let body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const res = await fetch(BASE + url, { method, headers: h, body, redirect });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  }

  async token() {
    if (!this.csrf) this.csrf = (await this.req('GET', '/api/auth/csrf')).data.csrfToken;
    return this.csrf;
  }

  get(u) { return this.req('GET', u); }

  post(u, json) { return this.req('POST', u, { json }); }

  put(u, json) { return this.req('PUT', u, { json }); }

  async login(email, password) {
    const r = await this.post('/api/auth/login', { email, password });
    this.csrf = null; // token rotates with the regenerated session
    return r;
  }
}

function lastMailLink(to, pathPart) {
  const lines = fs.readFileSync(MAIL_LOG, 'utf8').trim().split('\n').reverse();
  for (const l of lines) {
    const e = JSON.parse(l).meta;
    if (e.to === to && e.link?.includes(pathPart)) return e.link;
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const admin = new Client();
const user = new Client();
const userEmail = `user_${RUN}@example.com`;
const userPass = 'UserPass123';
let service;
let mock;
let mockRecords = [];

test.before(async () => {
  mock = http.createServer((req, res) => {
    if (req.headers.authorization !== 'Bearer mock-secret') { res.writeHead(401); return res.end('{}'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: mockRecords }));
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
});
test.after(() => mock.close());

test('server is up and serves the installed app', async () => {
  const r = await admin.get('/api/public/site');
  assert.equal(r.status, 200);
  assert.equal(r.data.site.site_name.length > 0, true);
  const inst = await admin.req('GET', '/install');
  assert.equal(inst.status, 302, 'installer must be disabled after install');
});

test('admin login works; admin API is protected', async () => {
  const anon = new Client();
  assert.equal((await anon.get('/api/admin/stats')).status, 401);
  const r = await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const s = await admin.get('/api/admin/stats');
  assert.equal(s.status, 200);
  assert.ok(s.data.users.total >= 1);
});

test('CSRF protection rejects state-changing requests without a token', async () => {
  const r = await admin.req('POST', '/api/admin/notifications', { json: { title: 'x' }, csrf: false });
  assert.equal(r.status, 403);
  const bad = await admin.req('POST', '/api/admin/notifications', { json: { title: 'x' }, csrf: false, headers: { 'X-CSRF-Token': 'forged' } });
  assert.equal(bad.status, 403);
});

test('registration + email verification + login', async () => {
  await admin.put('/api/admin/settings', { require_email_verification: '1', registration_enabled: '1' });
  const reg = await user.post('/api/auth/register', { name: 'Test User', email: userEmail, password: userPass, password_confirm: userPass });
  assert.equal(reg.status, 201, JSON.stringify(reg.data));
  assert.equal(reg.data.verify_required, true);
  const blocked = await user.login(userEmail, userPass);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'EMAIL_UNVERIFIED');
  const link = lastMailLink(userEmail, '/verify-email');
  assert.ok(link, 'verification email logged');
  const v = await user.req('GET', new URL(link).pathname + new URL(link).search);
  assert.equal(v.status, 302);
  assert.match(v.headers.get('location'), /verified=1/);
  const ok = await user.login(userEmail, userPass);
  assert.equal(ok.status, 200);
  const me = await user.get('/api/me');
  assert.equal(me.data.user.email, userEmail);
  assert.equal(me.data.user.initial, 'T');
  assert.equal(me.data.user.password_hash, undefined, 'never expose password hashes');
});

test('non-admins cannot reach admin endpoints', async () => {
  assert.equal((await user.get('/api/admin/users')).status, 403);
});

test('forgot + reset password', async () => {
  const anon = new Client();
  const f = await anon.post('/api/auth/forgot', { email: userEmail });
  assert.equal(f.status, 200);
  const link = lastMailLink(userEmail, '/reset-password');
  assert.ok(link);
  const token = new URL(link).searchParams.get('token');
  const r = await anon.post('/api/auth/reset', { token, password: 'NewPass4567' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await anon.login(userEmail, 'NewPass4567')).status, 200);
  // reset signed out every session — sign the main client back in
  assert.equal((await user.login(userEmail, 'NewPass4567')).status, 200);
});

test('dashboard + wallet endpoints', async () => {
  const d = await user.get('/api/dashboard');
  assert.equal(d.status, 200);
  assert.equal(d.data.cards.wallet.balance, '0.0000');
  assert.equal(d.data.chart.labels.length, 7);
  const w = await user.get('/api/wallet');
  assert.equal(w.status, 200);
});

test('admin creates a service and imports resources from CSV (dedup)', async () => {
  const c = await admin.post('/api/admin/services', { country_name: 'Testland', country_code: 'ZZ', flag_code: 'pk', app_name: 'Telegram', app_code: `T${RUN}`.toUpperCase().slice(0, 16), status: 'active' });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  service = (await admin.get('/api/admin/services')).data.items.find((s) => s.id === c.data.id);
  const csv = `country,service,resource,status\n${[1, 2, 3, 4, 5].map((i) => `${service.country_code},${service.app_code},92${NUM}${String(i).padStart(3, '0')},available`).join('\n')}\n${service.country_code},${service.app_code},92${NUM}001,available\n`;
  const fd = new FormData();
  fd.append('file', new Blob([csv], { type: 'text/csv' }), 'resources.csv');
  const r = await admin.req('POST', '/api/admin/resources/import', { form: fd });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.report.inserted, 5);
  assert.equal(r.data.report.duplicates, 1);
});

test('XLSX import works', async () => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('r');
  ws.addRow(['country', 'service', 'resource', 'status']);
  ws.addRow([service.country_code, service.app_code, `XL-${RUN}-1`, 'available']);
  ws.addRow([service.country_code, service.app_code, `XL-${RUN}-2`, 'disabled']);
  const buf = await wb.xlsx.writeBuffer();
  const fd = new FormData();
  fd.append('file', new Blob([buf]), 'r.xlsx');
  const r = await admin.req('POST', '/api/admin/resources/import', { form: fd });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.report.inserted, 2);
});

test('TXT import (one number per line) + notification never reveals counts', async () => {
  const fd = new FormData();
  fd.append('file', new Blob([`92${NUM}701\n92${NUM}702\n\n92${NUM}703\n`], { type: 'text/plain' }), 'numbers.txt');
  fd.append('service_id', String(service.id));
  fd.append('notify', '1');
  const r = await admin.req('POST', '/api/admin/resources/import', { form: fd });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.report.inserted, 3);
  const n = (await user.get('/api/notifications')).data.items.find((x) => x.title === 'New numbers available');
  assert.ok(n, 'users were notified');
  assert.equal(/\b3\b|\d+ new/.test(n.body), false, `notification must not include counts: ${n.body}`);
  assert.ok(n.body.includes(service.app_code), 'notification names the range');
});

test('uploads are validated by content (executable disguised as CSV/PNG rejected)', async () => {
  const fd = new FormData();
  fd.append('file', new Blob([Buffer.from('MZ\x00\x00binary')]), 'evil.csv');
  const r = await admin.req('POST', '/api/admin/resources/import', { form: fd });
  assert.equal(r.status, 400);
  const fd2 = new FormData();
  fd2.append('file', new Blob(['<?php echo 1; ?>'], { type: 'image/png' }), 'shell.png');
  const r2 = await admin.req('POST', '/api/admin/news/image', { form: fd2 });
  assert.equal(r2.status, 400);
});

test('resource allocation + interval rate limit + duplicate prevention', async () => {
  await admin.put('/api/admin/rate-limits', { interval_seconds: 1, hourly_limit: 50, daily_limit: 3, enabled: true });
  const a1 = await user.post('/api/resource/assign', { service_id: service.id });
  assert.equal(a1.status, 201, JSON.stringify(a1.data));
  const a2 = await user.post('/api/resource/assign', { service_id: service.id });
  assert.equal(a2.status, 429, 'second request within 1s is rate limited server-side');
  await sleep(1100);
  const a3 = await user.post('/api/resource/assign', { service_id: service.id });
  assert.equal(a3.status, 201);
  assert.notEqual(a1.data.assignment.resource_value, a3.data.assignment.resource_value, 'never assign the same resource twice');
  const mine = await user.get('/api/resources/mine');
  assert.equal(mine.data.items.length, 2);
});

test('free daily limit triggers premium upgrade prompt', async () => {
  await sleep(1100);
  assert.equal((await user.post('/api/resource/assign', { service_id: service.id })).status, 201);
  await sleep(1100);
  const r = await user.post('/api/resource/assign', { service_id: service.id });
  assert.equal(r.status, 429, 'free daily limit reached');
  assert.equal(r.data.upgrade, true, 'free users get the upgrade prompt');
});

test('serial search only returns accessible resources', async () => {
  const mine = await user.get('/api/resources/mine');
  const digits = mine.data.items[0].resource_value.replace(/\D/g, '').slice(-6);
  const r = await user.get(`/api/resource/search?serial=${digits}`);
  assert.equal(r.status, 200);
  assert.ok(r.data.items.length >= 1);
  assert.ok(r.data.items.every((x) => x.mine || x.status === 'available'));
  assert.equal((await user.get('/api/resource/search?serial=12')).status, 400);
});

test('users see Available/Unavailable, never counts; unused numbers auto-return', async () => {
  const s = await user.get('/api/services');
  const mineSvc = s.data.services.find((x) => x.id === service.id);
  assert.equal(typeof mineSvc.available, 'boolean', 'users only get availability, not the count');
  const a = (await admin.get('/api/services')).data.services.find((x) => x.id === service.id);
  assert.equal(typeof a.available, 'number', 'admins still see counts');
  // simulate a 10+ minute old number with no OTP and run the scheduler job
  const mine = (await user.get('/api/resources/mine')).data.items;
  const target = mine[mine.length - 1];
  const db = require('../server/config/database');
  const config = require('../server/config/env');
  if (!db.isReady()) await db.init(config.db);
  await db.run('UPDATE resource_assignments SET assigned_at = UTC_TIMESTAMP() - INTERVAL 11 MINUTE WHERE id = ?', [target.id]);
  await require('../server/services/scheduler').returnUnused();
  const after = (await user.get('/api/resources/mine')).data.items.find((x) => x.id === target.id);
  assert.equal(after.status, 'returned', 'shown as Return');
  const res = await admin.get(`/api/admin/resources?q=${encodeURIComponent(target.resource_value)}`);
  assert.equal(res.data.items[0].status, 'available', 'number is back in the pool for others');
  await db.close();
});

test('SQL injection attempts are treated as data', async () => {
  const r = await admin.get(`/api/admin/users?q=${encodeURIComponent("' OR 1=1; DROP TABLE users; --")}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.items.length, 0);
  const r2 = await user.get(`/api/resource/search?serial=${encodeURIComponent("1' OR '1'='1")}`);
  assert.equal(r2.status, 400);
  assert.equal((await admin.get('/api/admin/stats')).status, 200, 'users table still exists');
});

test('API provider polling: normalize, authorize, dedupe, reward, health', async () => {
  await admin.put('/api/admin/settings', { otp_public_feed: '0' });
  const mine = (await user.get('/api/resources/mine')).data.items;
  const number = mine[0].resource_value;
  mockRecords = [
    { id: `ext-${RUN}-1`, number, message: 'Your Telegram code is 27288. Do not share it.', created_at: new Date().toISOString() },
    { id: `ext-${RUN}-1`, number, message: 'Your Telegram code is 27288. Do not share it.', created_at: new Date().toISOString() }, // duplicate
    { id: `ext-${RUN}-2`, number: '0000000000', message: 'code 11111' }, // not an authorized resource → ignored
  ];
  const c = await admin.post('/api/admin/providers', {
    name: `Mock ${RUN}`, provider_type: 'generic', base_url: `http://127.0.0.1:${mock.address().port}`, endpoint: '/messages',
    auth_type: 'bearer', credential: 'mock-secret', records_path: 'data', polling_interval_sec: 5, enabled: false,
  });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  const list = await admin.get('/api/admin/providers');
  const p = list.data.items.find((x) => x.id === c.data.id);
  assert.equal(p.has_credential, true);
  assert.equal(JSON.stringify(list.data).includes('mock-secret'), false, 'credential never returned');
  const h = await admin.post(`/api/admin/providers/${p.id}/test`);
  assert.equal(h.data.health.status, 'online');
  const poll = await admin.post(`/api/admin/providers/${p.id}/poll`);
  assert.equal(poll.data.result.inserted, 1, JSON.stringify(poll.data));
  assert.equal(poll.data.result.duplicates, 1);
  assert.equal(poll.data.result.unauthorized, 1);
  const again = await admin.post(`/api/admin/providers/${p.id}/poll`);
  assert.equal(again.data.result.inserted, 0, 'second poll is fully deduplicated');
  const feed = await user.get('/api/events');
  const ev = feed.data.items.find((x) => !x.is_demo);
  assert.equal(ev.code, '27288');
  assert.equal(ev.application, 'TG');
  assert.equal(JSON.stringify(feed.data).includes('Do not share'), false, 'message body never exposed');
  assert.equal(ev.number, `${number.slice(0, 4)}••••${number.slice(-4)}`, 'users see a masked number');
  assert.equal(ev.resource_value, undefined, 'full number is not sent to users');
  const w = await user.get('/api/wallet');
  assert.equal(w.data.wallet.balance, '0.0100', 'reward credited');
  const act = await user.get('/api/activity');
  assert.ok(act.data.items.every((x) => x.code === null), 'codes hidden by default');
  await admin.put('/api/admin/settings', { live_activity_show_code: '1' });
  assert.ok((await user.get('/api/activity')).data.items.some((x) => x.code === '27288'), 'codes shown when enabled');
  await admin.put('/api/admin/settings', { live_activity_show_code: '0' });
  const item = act.data.items.find((x) => x.number === `${number.slice(0, 4)}••••${number.slice(-4)}`);
  assert.ok(item, 'real event appears in Live Activity');
  const svcs = (await user.get('/api/services')).data.services;
  assert.ok(svcs.find((x) => x.id === service.id).otps_today >= 1, 'service shows OTP activity today');
  // automatic 5s polling
  await admin.post(`/api/admin/providers/${p.id}/toggle`, { enabled: true });
  mockRecords = [{ id: `ext-${RUN}-3`, number, message: 'WhatsApp code 63821' }];
  let found = false;
  for (let i = 0; i < 20 && !found; i += 1) {
    await sleep(1000);
    found = (await user.get('/api/events')).data.items.some((x) => x.code === '63821');
  }
  await admin.post(`/api/admin/providers/${p.id}/toggle`, { enabled: false });
  assert.ok(found, 'enabled provider is polled automatically');
  await admin.put('/api/admin/settings', { otp_public_feed: '1' });
});

test('OTP page: every API OTP is shown (masked), searchable by last 4 digits; other number formats still reach the owner', async () => {
  await admin.put('/api/admin/settings', { otp_public_feed: '1' });
  const p = (await admin.get('/api/admin/providers')).data.items.find((x) => x.name === `Mock ${RUN}`);
  // a one-number service so we know which number the new user gets
  const sc = await admin.post('/api/admin/services', { country_name: 'Iraq', country_code: 'IQ', flag_code: 'iq', app_name: 'WhatsApp', app_code: `W${RUN}`.toUpperCase().slice(0, 16), status: 'active' });
  const stored = `964${NUM}88`; // stored without "+"
  const fd = new FormData();
  fd.append('file', new Blob([`${stored}\n`], { type: 'text/plain' }), 'n.txt');
  fd.append('service_id', String(sc.data.id));
  assert.equal((await admin.req('POST', '/api/admin/resources/import', { form: fd })).status, 200);
  const email = `feed_${RUN}@example.com`;
  await admin.post('/api/admin/users', { name: 'Feed User', email, password: 'FeedUser123' });
  const owner = new Client();
  await owner.login(email, 'FeedUser123');
  const a = await owner.post('/api/resource/assign', { service_id: sc.data.id });
  assert.equal(a.status, 201, JSON.stringify(a.data));
  const unlisted = `4477${NUM}`;
  mockRecords = [
    { id: `pub-${RUN}-1`, number: unlisted, message: 'Your WhatsApp code 734-512' }, // not imported
    { id: `pub-${RUN}-2`, number: `+${stored.slice(0, 3)} ${stored.slice(3)}`, message: 'WhatsApp code 918273' }, // same number, other format
    { id: `pub-${RUN}-3`, number: `8801${NUM}9`, from: `Mock ${RUN}`, message: 'Your code 445566' }, // provider's own name as sender
  ];
  const poll = await admin.post(`/api/admin/providers/${p.id}/poll`);
  assert.equal(poll.data.result.inserted, 3, JSON.stringify(poll.data));
  assert.equal(poll.data.result.unlisted, 2);
  const bd = (await user.get(`/api/events?q=${NUM.slice(-3)}9`)).data.items.find((x) => x.code === '445566');
  assert.equal(bd.application, 'SMS', 'provider name is never shown as the app');
  assert.equal(bd.country_code, 'BD', 'country guessed from the number');
  assert.equal(JSON.stringify(bd).includes('Mock'), false, 'users never see the provider name');

  // the owner gets the OTP on the Get Number list even though the provider wrote the number differently
  const mineRow = (await owner.get('/api/resources/mine')).data.items.find((x) => x.id === a.data.assignment.id);
  assert.equal(mineRow.last_code, '918273', 'OTP reached the number list');

  // everyone sees both OTPs, numbers masked
  const byTail = await user.get(`/api/events?q=${unlisted.slice(-4)}`);
  const hit = byTail.data.items.find((x) => x.code === '734512');
  assert.ok(hit, 'unlisted number OTP is found by its last 4 digits');
  assert.equal(hit.number, `${unlisted.slice(0, 4)}••••${unlisted.slice(-4)}`);
  assert.equal(hit.country_code, 'GB', 'country guessed from +44');
  assert.equal(JSON.stringify(byTail.data).includes(unlisted), false, 'full number never sent');
  assert.ok(byTail.data.items.every((x) => x.number.endsWith(unlisted.slice(-4))), 'search only returns matching numbers');
  const ownFeed = (await owner.get(`/api/events?q=${stored.slice(-4)}`)).data.items.find((x) => x.code === '918273');
  assert.equal(ownFeed.mine, true, 'owner sees it marked as their number');

  // other common field names are understood; a rejected record explains why and can be inspected by the admin
  mockRecords = [
    { id: `pub-${RUN}-4`, destination_number: `4478${NUM}`, sms_content: 'Your code is 556677' },
    { id: `pub-${RUN}-5`, dst: `4479${NUM}`, sms_content: 'Welcome, no code here' },
  ];
  const p2 = await admin.post(`/api/admin/providers/${p.id}/poll`);
  assert.equal(p2.data.result.inserted, 1, JSON.stringify(p2.data));
  assert.equal(p2.data.result.invalid, 1);
  const logs = (await admin.get(`/api/admin/providers/${p.id}`)).data.logs;
  assert.ok(logs.some((l) => /no OTP code found ×1 · fields: id, dst, sms_content/.test(l.message)), 'log explains the rejection');
  // camelCase fields + Arabic WhatsApp text with a hidden direction mark (real ThirdWave shape)
  mockRecords = [{
    id: `tw-${RUN}`, receivedAt: new Date().toISOString(), sourceAddress: 'WhatsApp', rangeName: 'Iraq - Mobile - Zain',
    destinationNumber: `964786${NUM}`, messageBody: '<#> كود ‏واتساب الخاص بك: \u200e282-366\nلا تطلع أحداً عليه\n4sgLq1p5sV6', status: 'DELIVERED',
  }, { id: `pub-${RUN}-5`, dst: `4479${NUM}`, sms_content: 'Welcome, no code here' }];
  const p3 = await admin.post(`/api/admin/providers/${p.id}/poll`);
  assert.equal(p3.data.result.inserted, 1, JSON.stringify(p3.data));
  const tw = (await user.get(`/api/events?q=${NUM.slice(-4)}`)).data.items.find((x) => x.code === '282366');
  assert.ok(tw, 'camelCase provider fields are understood');
  assert.equal(tw.application, 'WS');
  assert.equal(tw.country_code, 'IQ');
  const sample = await admin.get(`/api/admin/providers/${p.id}/sample`);
  assert.equal(sample.data.firstInvalid.sms_content, 'Welcome, no code here');
  assert.equal((await user.get(`/api/admin/providers/${p.id}/sample`)).status, 403, 'admins only');

  // switched off → users only see their own numbers again
  await admin.put('/api/admin/settings', { otp_public_feed: '0' });
  assert.equal((await user.get(`/api/events?q=${unlisted.slice(-4)}`)).data.items.some((x) => x.code === '734512'), false);
  await admin.put('/api/admin/settings', { otp_public_feed: '1' });
});

test('provider rate limit (HTTP 429) backs off instead of hammering the API', async () => {
  let hits = 0;
  const rl = http.createServer((req, res) => { hits += 1; res.writeHead(429, { 'Retry-After': '45', 'Content-Type': 'application/json' }); res.end('{"error":"Too many requests"}'); });
  await new Promise((r) => rl.listen(0, '127.0.0.1', r));
  try {
    const c = await admin.post('/api/admin/providers', {
      name: `RateLimited ${RUN}`, provider_type: 'generic', base_url: `http://127.0.0.1:${rl.address().port}`, endpoint: '/m',
      auth_type: 'bearer', credential: 'x', polling_interval_sec: 1, enabled: false,
    });
    const poll = await admin.post(`/api/admin/providers/${c.data.id}/poll`);
    assert.match(poll.data.result.error, /rate limited, next poll in 45s/);
    const h = await admin.post(`/api/admin/providers/${c.data.id}/test`);
    assert.match(h.data.health.message, /Rate limited/);
    // enabled with a 1s interval: the Retry-After pause means no further requests for a while
    await admin.post(`/api/admin/providers/${c.data.id}/toggle`, { enabled: true });
    await sleep(12_000); // poller refreshes its list every 10s
    const before = hits;
    await sleep(4000);
    assert.ok(hits - before <= 1, `backed off (${hits - before} requests in 4s at a 1s interval)`);
    await admin.req('DELETE', `/api/admin/providers/${c.data.id}`);
  } finally {
    rl.close();
  }
});

test('demo generator: 2 events/second, admin-only, labelled DEMO, separate storage', async () => {
  await admin.post('/api/admin/demo/purge');
  const r = await admin.put('/api/admin/demo', { enabled: true, events_per_second: 2, interval_ms: 1000, applications: ['TG', 'WS'], countries: 'PK,IQ', expiration_hours: 24, starting_count: 0 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  await sleep(3200);
  await admin.post('/api/admin/demo/toggle', { enabled: false });
  const feed = await admin.get('/api/events?pageSize=30');
  const demo = feed.data.items.filter((x) => x.is_demo);
  const userFeed = await user.get('/api/events?pageSize=30');
  assert.equal(userFeed.data.items.filter((x) => x.is_demo).length, 0, 'users never see demo events');
  assert.ok(demo.length >= 5 && demo.length <= 8, `expected ~6 demo events, got ${demo.length}`);
  assert.ok(demo.every((x) => x.status === 'DEMO'));
  const liveEvents = await admin.get('/api/admin/events');
  assert.ok(liveEvents.data.items.every((x) => x.provider !== 'Demo generator'), 'demo events are not stored with real events');
  const w = await user.get('/api/wallet');
  assert.equal(w.data.wallet.balance, '0.0200', 'demo events never credit wallets (2 real events only)');
});

test('pagination returns 30 per page', async () => {
  await admin.put('/api/admin/demo', { enabled: true, events_per_second: 5, interval_ms: 1000, applications: ['FB'], countries: 'PK', expiration_hours: 24, starting_count: 0 });
  await sleep(7000);
  await admin.post('/api/admin/demo/toggle', { enabled: false });
  const p1 = await admin.get('/api/events?page=1');
  assert.equal(p1.data.items.length, 30);
  assert.ok(p1.data.pagination.pages >= 2);
  const p2 = await admin.get('/api/events?page=2');
  assert.ok(p2.data.items.length >= 1);
  assert.equal(p1.data.items.some((a) => p2.data.items.some((b) => a.key === b.key)), false);
});

test('manual expiration removes events from the feed', async () => {
  const r = await admin.post('/api/admin/events/expire', { scope: 'all_demo' });
  assert.equal(r.status, 200);
  const feed = await admin.get('/api/events');
  assert.equal(feed.data.items.filter((x) => x.is_demo).length, 0);
  const cfg = await admin.put('/api/admin/events/config', { expiration_hours: 24, event_reward: '0.01' });
  assert.equal(cfg.status, 200);
  assert.equal((await admin.put('/api/admin/events/config', { expiration_hours: 5, event_reward: '0.01' })).status, 400);
});

test('premium: plans, payment screenshot upload, admin approval', async () => {
  await admin.put('/api/admin/settings', { trc20_address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE', binance_uid: '1193351097' });
  const ov = await user.get('/api/premium');
  assert.equal(ov.status, 200);
  assert.ok(ov.data.plans.length >= 4);
  assert.ok(ov.data.methods.trc20.qr.startsWith('data:image/png'));
  const plan = ov.data.plans.find((p) => p.name === '7 Days') || ov.data.plans[0];
  const png = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'icons', 'icon-192.png'));
  const fd = new FormData();
  fd.append('plan_id', String(plan.id));
  fd.append('method', 'trc20');
  fd.append('transaction_ref', `tx-${RUN}`);
  fd.append('screenshot', new Blob([png], { type: 'image/png' }), 'shot.png');
  const r = await user.req('POST', '/api/payment', { form: fd });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const list = await admin.get('/api/admin/payments?status=pending');
  const pay = list.data.items.find((p) => p.id === r.data.id);
  assert.ok(pay.screenshot_url);
  assert.equal((await user.get(pay.screenshot_url)).status, 200, 'owner can view');
  // simulate a host that wiped uploads/ on redeploy: the database copy is served instead
  const dir = path.join(__dirname, '..', 'uploads', 'private');
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
  const again = await user.req('GET', pay.screenshot_url);
  assert.equal(again.status, 200, 'screenshot survives a wiped uploads folder');
  const other = new Client();
  assert.equal((await other.get(pay.screenshot_url)).status, 401, 'private file protected');
  const ap = await admin.post(`/api/admin/payments/${pay.id}/review`, { action: 'approve' });
  assert.equal(ap.status, 200);
  const me = await user.get('/api/me');
  assert.equal(me.data.premium.plan, plan.name);
  const lim = (await user.get('/api/profile')).data.limits;
  if (plan.hourly_limit) assert.equal(lim.hourly_limit, plan.hourly_limit, 'premium plan speed applies');
  if (plan.daily_limit) assert.equal(lim.daily_limit, plan.daily_limit);
  await sleep(1100);
  assert.equal((await user.post('/api/resource/assign', { service_id: service.id })).status, 201, 'premium lifts the free quota');
});

test('withdrawals: minimum enforced, hold + refund on rejection, paid flow', async () => {
  const uid = (await admin.get(`/api/admin/users?q=${encodeURIComponent(userEmail)}`)).data.items[0].id;
  const low = await user.post('/api/withdraw', { amount: '10', binance_uid: '1193351097' });
  assert.equal(low.status, 400);
  await admin.post(`/api/admin/users/${uid}/wallet`, { amount: '60.00', reason: 'test credit' });
  const w = await user.post('/api/withdraw', { amount: '50', binance_uid: '1193351097' });
  assert.equal(w.status, 201, JSON.stringify(w.data));
  assert.equal(w.data.balance, '10.0200');
  assert.equal((await user.post('/api/withdraw', { amount: '50', binance_uid: '1193351097' })).status, 409);
  const rej = await admin.post(`/api/admin/withdrawals/${w.data.id}/review`, { action: 'reject', note: 'test' });
  assert.equal(rej.status, 200);
  assert.equal((await user.get('/api/wallet')).data.wallet.balance, '60.0200');
  const w2 = await user.post('/api/withdraw', { amount: '50.02', binance_uid: '1193351097' });
  assert.equal(w2.status, 201);
  await admin.post(`/api/admin/withdrawals/${w2.data.id}/review`, { action: 'approve' });
  await admin.post(`/api/admin/withdrawals/${w2.data.id}/review`, { action: 'paid' });
  const list = await user.get('/api/withdrawals');
  assert.equal(list.data.items[0].status, 'paid');
  const tx = (await user.get('/api/wallet?type=refund')).data.items;
  assert.equal(tx.length, 1);
});

test('news: publish (XSS sanitised), like toggles without duplicates, share, SEO page', async () => {
  const c = await admin.post('/api/admin/news', {
    title: `Welcome ${RUN}`, category: 'announcement', status: 'published', notify: true,
    body_html: '<p>Hello <strong>VIP</strong><script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">x</a></p>',
    meta_title: 'SEO title', meta_description: 'SEO description',
  });
  assert.equal(c.status, 201, JSON.stringify(c.data));
  const feed = await user.get('/api/news');
  const post = feed.data.items.find((p) => p.id === c.data.id);
  assert.ok(post);
  assert.equal(/<script|onerror|javascript:/i.test(post.body_html), false, 'XSS stripped');
  const l1 = await user.post('/api/news/like', { post_id: post.id });
  assert.equal(l1.data.liked, true);
  assert.equal(l1.data.likes, 1);
  const l2 = await user.post('/api/news/like', { post_id: post.id });
  assert.equal(l2.data.likes, 0, 'second like toggles — never double counts');
  await user.post('/api/news/like', { post_id: post.id });
  const s = await user.post('/api/news/share', { post_id: post.id, channel: 'link' });
  assert.equal(s.data.shares, 1);
  const page = await fetch(`${BASE}/news/${c.data.slug}`);
  const html = await page.text();
  assert.equal(page.status, 200);
  for (const tag of ['<title>SEO title</title>', 'name="description"', 'rel="canonical"', 'og:title', 'og:image', 'twitter:card']) assert.ok(html.includes(tag), tag);
});

test('notifications: unread badge + mark read', async () => {
  const n = await user.get('/api/notifications');
  assert.ok(n.data.unread > 0);
  const first = n.data.items[0];
  const r = await user.post(`/api/notifications/${first.id}/read`);
  assert.equal(r.data.unread, n.data.unread - 1);
  const all = await user.post('/api/notifications/read-all');
  assert.equal(all.data.unread, 0);
});

test('profile update, theme, password change', async () => {
  assert.equal((await user.put('/api/profile', { name: 'Test User 2', address: 'Dhaka', binance_uid: '1193351097', timezone: 'Asia/Dhaka' })).status, 200);
  assert.equal((await user.put('/api/profile/theme', { theme: 'dark' })).status, 200);
  const p = await user.get('/api/profile');
  assert.equal(p.data.user.name, 'Test User 2');
  assert.equal(p.data.user.theme, 'dark');
  const bad = await user.post('/api/profile/password', { current_password: 'wrong', new_password: 'Another123' });
  assert.equal(bad.status, 403);
  const ok = await user.post('/api/profile/password', { current_password: 'NewPass4567', new_password: 'Another123' });
  assert.equal(ok.status, 200);
});

test('2FA: setup requires password, TOTP login challenge, recovery code', async () => {
  assert.equal((await user.post('/api/security/2fa/setup', { password: 'nope' })).status, 403);
  const s = await user.post('/api/security/2fa/setup', { password: 'Another123' });
  assert.equal(s.status, 200);
  assert.ok(s.data.qr.startsWith('data:image/png'));
  const c = await user.post('/api/security/2fa/confirm', { code: authenticator.generate(s.data.secret) });
  assert.equal(c.status, 200, JSON.stringify(c.data));
  assert.equal(c.data.recovery_codes.length, 8);
  const fresh = new Client();
  const l = await fresh.login(userEmail, 'Another123');
  assert.equal(l.data.twofa, true);
  assert.equal((await fresh.get('/api/dashboard')).status, 401, 'not signed in before 2FA');
  assert.equal((await fresh.post('/api/auth/2fa', { code: '000000' })).status, 401);
  const ok = await fresh.post('/api/auth/2fa', { code: c.data.recovery_codes[0] });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  fresh.csrf = null;
  assert.equal((await fresh.get('/api/dashboard')).status, 200);
  const again = new Client();
  await again.login(userEmail, 'Another123');
  assert.equal((await again.post('/api/auth/2fa', { code: c.data.recovery_codes[0] })).status, 401, 'recovery codes are single-use');
});

test('SMTP settings: password write-only; test fails cleanly when unreachable', async () => {
  const s = await admin.put('/api/admin/smtp', { host: '127.0.0.1', port: 2, username: 'u', password: 'smtp-secret', encryption: 'none', from_email: 'no-reply@example.com', enabled: true });
  assert.equal(s.status, 200);
  const g = await admin.get('/api/admin/smtp');
  assert.equal(g.data.smtp.has_password, true);
  assert.equal(JSON.stringify(g.data).includes('smtp-secret'), false);
  const t = await admin.post('/api/admin/smtp/test', { to: 'x@example.com' });
  assert.equal(t.status, 400);
  assert.equal(JSON.stringify(t.data).includes('smtp-secret'), false);
  await admin.put('/api/admin/smtp', { host: '', enabled: false, clear_password: true });
});

test('maintenance mode blocks users (503) but not admins', async () => {
  await admin.put('/api/admin/maintenance', { is_active: true, title: 'Upgrading', message: 'Back soon', contact: 'support@example.com' });
  await sleep(5200); // maintenance state is cached for 5s
  const u = await user.get('/api/dashboard');
  assert.equal(u.status, 503);
  assert.equal(u.data.maintenance.title, 'Upgrading');
  assert.equal((await admin.get('/api/admin/stats')).status, 200);
  const page = await fetch(`${BASE}/dashboard`, { headers: { Cookie: user.cookieHeader() }, redirect: 'manual' });
  assert.equal(page.status, 503);
  await admin.put('/api/admin/maintenance', { is_active: false, title: 'Upgrading' });
  await sleep(5200);
  assert.equal((await user.get('/api/dashboard')).status, 200);
});

test('admin user management: suspend blocks sessions, audit log records it', async () => {
  const uid = (await admin.get(`/api/admin/users?q=${encodeURIComponent(userEmail)}`)).data.items[0].id;
  assert.equal((await admin.post(`/api/admin/users/${uid}/suspend`)).status, 200);
  assert.equal((await user.get('/api/dashboard')).status, 401);
  assert.equal((await admin.post(`/api/admin/users/${uid}/unsuspend`)).status, 200);
  const logs = await admin.get('/api/admin/logs?q=user.suspend');
  assert.ok(logs.data.items.some((l) => l.action === 'user.suspend'));
});

test('admin approval: verify email → Pending with WhatsApp contact → approve → email → login', async () => {
  await admin.put('/api/admin/settings', { require_admin_approval: '1', require_email_verification: '1', support_whatsapp: '+8801757827996' });
  const email = `pending_${RUN}@example.com`;
  const c = new Client();
  assert.equal((await c.post('/api/auth/register', { name: 'Pending User', email, password: 'Pending123', password_confirm: 'Pending123' })).status, 201);
  const link = lastMailLink(email, '/verify-email');
  const v = await c.req('GET', new URL(link).pathname + new URL(link).search);
  assert.match(v.headers.get('location'), /verified=pending/, 'verification lands on the Pending page');
  const l = await c.login(email, 'Pending123');
  assert.equal(l.status, 403);
  assert.equal(l.data.code, 'ACCOUNT_PENDING');
  assert.equal(l.data.contact.whatsapp, '+8801757827996');
  const adminNote = (await admin.get('/api/notifications')).data.items.find((n) => n.title === 'New account waiting for approval' && n.body.includes(email));
  assert.ok(adminNote, 'admins are notified');
  const alert = fs.readFileSync(MAIL_LOG, 'utf8').trim().split('\n').map((x) => JSON.parse(x).meta)
    .find((m) => m.to === ADMIN_EMAIL && /waiting for approval/.test(m.subject) && m.text.includes(email));
  assert.ok(alert, 'admin is emailed after the user verifies');
  const id = (await admin.get(`/api/admin/users?q=${encodeURIComponent(email)}&status=pending`)).data.items[0].id;
  assert.equal((await admin.post(`/api/admin/users/${id}/approve`)).status, 200);
  const mails = fs.readFileSync(MAIL_LOG, 'utf8').trim().split('\n').map((x) => JSON.parse(x).meta);
  assert.ok(mails.some((m) => m.to === email && /approved/i.test(m.subject)), 'approval email sent');
  assert.equal((await c.login(email, 'Pending123')).status, 200, 'approved user can sign in');
  await admin.put('/api/admin/settings', { require_admin_approval: '0' });
});

test('Google login: hidden until configured, secret write-only, state checked, creates & links accounts', async () => {
  // Mock Google token + userinfo endpoints (the server runs with GOOGLE_OAUTH_MOCK=http://127.0.0.1:4599).
  let profile;
  const g = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url === '/token') {
        const p = new URLSearchParams(body);
        if (p.get('client_secret') !== 'GOCSPX-test-secret' || p.get('code') !== 'good-code') return send(400, { error: 'invalid_grant' });
        return send(200, { access_token: 'mock-access' });
      }
      if (req.url === '/userinfo' && req.headers.authorization === 'Bearer mock-access') return send(200, profile);
      send(404, {});
    });
  });
  await new Promise((r) => g.listen(4599, '127.0.0.1', r));
  try {
    await admin.put('/api/admin/settings', { require_admin_approval: '0', google_login_enabled: '0' });
    const anon = new Client();
    assert.equal((await anon.get('/api/public/site')).data.site.google_login, '0');
    assert.match((await anon.get('/auth/google')).headers.get('location'), /google=disabled/);

    const s = await admin.put('/api/admin/settings', { google_login_enabled: '1', google_client_id: '123-abc.apps.googleusercontent.com', google_client_secret: 'GOCSPX-test-secret' });
    assert.equal(s.status, 200, JSON.stringify(s.data));
    const got = (await admin.get('/api/admin/settings')).data.settings;
    assert.equal(got.google_client_secret, '', 'secret never returned');
    assert.equal(got.has_google_secret, true);
    assert.equal((await anon.get('/api/public/site')).data.site.google_login, '1');

    const flow = async (c, code = 'good-code', tamper = false) => {
      const start = await c.get('/auth/google');
      const loc = new URL(start.headers.get('location'));
      assert.equal(loc.searchParams.get('client_id'), '123-abc.apps.googleusercontent.com');
      assert.match(loc.searchParams.get('redirect_uri'), /\/auth\/google\/callback$/);
      const state = tamper ? 'forged-state' : loc.searchParams.get('state');
      return c.get(`/auth/google/callback?code=${code}&state=${state}`);
    };

    // forged state is rejected
    profile = { sub: `g-${RUN}`, email: `google_${RUN}@example.com`, email_verified: true, name: 'Google User' };
    assert.match((await flow(new Client(), 'good-code', true)).headers.get('location'), /google=expired/);
    // bad code is rejected
    assert.match((await flow(new Client(), 'bad-code')).headers.get('location'), /google=failed/);
    // unverified Google email is rejected
    profile = { ...profile, email_verified: false };
    assert.match((await flow(new Client())).headers.get('location'), /google=unverified/);

    // new account is created, verified and signed in
    profile = { ...profile, email_verified: true };
    const c1 = new Client();
    const ok = await flow(c1);
    assert.equal(ok.headers.get('location'), '/dashboard');
    const me = await c1.get('/api/me');
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, `google_${RUN}@example.com`);

    // existing password account is linked by email (no duplicate) and its 2FA is still enforced
    profile = { sub: `g2-${RUN}`, email: userEmail, email_verified: true, name: 'X' };
    const c2 = new Client();
    assert.equal((await flow(c2)).headers.get('location'), '/two-factor', '2FA still required');
    assert.equal((await c2.get('/api/me')).data.user, null, 'not signed in before the 2FA code');
    assert.equal((await admin.get(`/api/admin/users?q=${encodeURIComponent(userEmail)}`)).data.items.length, 1, 'no duplicate account');

    // with admin approval on, a new Google account lands on the Pending page
    await admin.put('/api/admin/settings', { require_admin_approval: '1' });
    profile = { sub: `g3-${RUN}`, email: `google3_${RUN}@example.com`, email_verified: true, name: 'Pending G' };
    assert.match((await flow(new Client())).headers.get('location'), /verified=pending/);
  } finally {
    await admin.put('/api/admin/settings', { require_admin_approval: '0', google_login_enabled: '0' });
    g.close();
  }
});

test('lost authenticator: email code signs in and turns 2FA off; admin can reset 2FA', async () => {
  const email = `lost_${RUN}@example.com`;
  assert.equal((await admin.post('/api/admin/users', { name: 'Lost Phone', email, password: 'LostPhone123' })).status, 201);
  const setup2fa = async () => {
    const c = new Client();
    await c.login(email, 'LostPhone123');
    const s = await c.post('/api/security/2fa/setup', { password: 'LostPhone123' });
    assert.equal((await c.post('/api/security/2fa/confirm', { code: authenticator.generate(s.data.secret) })).status, 200);
  };
  await setup2fa();
  const c = new Client();
  assert.equal((await c.login(email, 'LostPhone123')).data.twofa, true);
  const sent = await c.post('/api/auth/2fa/email');
  assert.equal(sent.status, 200, JSON.stringify(sent.data));
  assert.match(sent.data.message, /lo•••@example\.com/);
  assert.equal((await c.post('/api/auth/2fa/email')).status, 429, 'resend is throttled');
  const mail = fs.readFileSync(MAIL_LOG, 'utf8').trim().split('\n').map((x) => JSON.parse(x).meta).reverse()
    .find((m) => m.to === email && /sign-in code/.test(m.subject));
  const code = mail.subject.slice(0, 6);
  assert.equal((await c.post('/api/auth/2fa/email/verify', { code: code === '000000' ? '111111' : '000000' })).status, 401);
  const ok = await c.post('/api/auth/2fa/email/verify', { code });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.redirect, '/security');
  c.csrf = null;
  assert.equal((await c.get('/api/dashboard')).status, 200, 'signed in');
  const fresh = new Client();
  const l = await fresh.login(email, 'LostPhone123');
  assert.equal(l.status, 200);
  assert.notEqual(l.data.twofa, true, '2FA is off after email recovery');

  // admin reset
  await setup2fa();
  const id = (await admin.get(`/api/admin/users?q=${encodeURIComponent(email)}`)).data.items[0].id;
  assert.equal((await admin.post(`/api/admin/users/${id}/reset-2fa`)).status, 200);
  assert.notEqual((await new Client().login(email, 'LostPhone123')).data.twofa, true, 'admin reset turns 2FA off');

  // admin can disable email recovery
  await setup2fa();
  await admin.put('/api/admin/settings', { twofa_email_recovery: '0' });
  const d = new Client();
  await d.login(email, 'LostPhone123');
  assert.equal((await d.post('/api/auth/2fa/email')).status, 403);
  await admin.put('/api/admin/settings', { twofa_email_recovery: '1' });
});

test('PWA manifest, service worker, security headers, JSON errors without stack traces', async () => {
  const m = await fetch(`${BASE}/manifest.json`);
  const mj = await m.json();
  assert.equal(mj.display, 'standalone');
  assert.ok(mj.icons.length >= 1);
  const sw = await fetch(`${BASE}/service-worker.js`);
  assert.equal(sw.status, 200);
  const h = sw.headers;
  assert.ok(h.get('content-security-policy'));
  assert.equal(h.get('x-content-type-options'), 'nosniff');
  const nf = await fetch(`${BASE}/api/does-not-exist`, { headers: { Cookie: admin.cookieHeader() } });
  assert.equal(nf.status, 404);
  const body = await nf.json();
  assert.equal(body.ok, false);
  assert.equal(JSON.stringify(body).includes('at '), false);
  const html404 = await fetch(`${BASE}/nope-page`, { headers: { Accept: 'text/html', Cookie: admin.cookieHeader() } });
  assert.equal(html404.status, 404);
  // restore the default free limits (50/hour, 200/day)
  await admin.put('/api/admin/rate-limits', { interval_seconds: 1, hourly_limit: 50, daily_limit: 200, enabled: true });
  const envLeak = await fetch(`${BASE}/.env`);
  assert.notEqual(envLeak.status, 200);
  const src = await fetch(`${BASE}/assets/../server/config/env.js`);
  assert.notEqual(src.status, 200);
});
