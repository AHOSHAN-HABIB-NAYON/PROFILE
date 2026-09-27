'use strict';
/**
 * End-to-end API tests against a running, installed LifeTrack instance.
 *   BASE_URL=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... node --test test/
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const BASE = process.env.BASE_URL || 'http://localhost:3000';

function client() {
  const jar = {};
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  async function req(method, path, body, headers = {}) {
    const h = { Accept: 'application/json', Cookie: cookieHeader(), 'X-CSRF-Token': jar.lt_csrf || '', Origin: BASE, ...headers };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(BASE + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i); const v = kv.slice(i + 1); if (v) jar[k] = v; else delete jar[k]; }
    let data = null; try { data = await r.json(); } catch {}
    return { status: r.status, data: data?.data, error: data?.error };
  }
  return { jar, req, get: (p) => req('GET', p), post: (p, b, h) => req('POST', p, b ?? {}, h), patch: (p, b) => req('PATCH', p, b), del: (p) => req('DELETE', p) };
}
const rnd = () => Math.random().toString(36).slice(2, 8);

test('LifeTrack API', async (t) => {
  const a = client(); const b = client();
  await a.get('/api/public/config'); await b.get('/api/public/config');
  const emailA = `alice_${rnd()}@test.dev`; const emailB = `bob_${rnd()}@test.dev`;

  await t.test('CSRF is enforced', async () => {
    const c = client();
    const r = await c.req('POST', '/api/auth/login', { email: 'x@y.z', password: 'x' }, { 'X-CSRF-Token': '' });
    assert.equal(r.status, 403);
  });
  await t.test('register + session', async () => {
    let r = await a.post('/api/auth/register', { name: 'Alice', email: emailA, password: 'Passw0rd!' });
    assert.equal(r.status, 201, JSON.stringify(r.error));
    r = await b.post('/api/auth/register', { name: 'Bob', email: emailB, password: 'Passw0rd!' });
    assert.equal(r.status, 201);
    r = await a.get('/api/me');
    assert.equal(r.data.user.email, emailA);
    assert.equal(r.data.profile.theme, 'light', 'light is the default theme');
    assert.equal(r.data.unread, 1, 'welcome notification exists');
  });
  await t.test('weak password + duplicate email rejected', async () => {
    const c = client(); await c.get('/api/public/config');
    let r = await c.post('/api/auth/register', { name: 'X', email: `w_${rnd()}@t.dev`, password: 'short' });
    assert.equal(r.status, 422);
    r = await c.post('/api/auth/register', { name: 'X', email: emailA, password: 'Passw0rd!' });
    assert.equal(r.status, 409);
  });

  let cash; let bk; let txId;
  await t.test('accounts + opening balance', async () => {
    let r = await a.get('/api/accounts');
    assert.equal(r.data.length, 2);
    cash = r.data.find((x) => x.type === 'cash'); bk = r.data.find((x) => x.type === 'bkash');
    r = await a.post('/api/accounts', { name: 'City Bank', type: 'bank', opening_balance: '10000' });
    assert.equal(r.status, 201); assert.equal(r.data.balance, '10000.00');
  });
  await t.test('income/expense update balances exactly', async () => {
    let r = await a.post('/api/transactions', { type: 'income', account_id: cash.id, amount: '25000', note: 'Salary' });
    assert.equal(r.status, 201); txId = r.data.id;
    r = await a.post('/api/transactions', { type: 'expense', account_id: cash.id, amount: '420.50', note: 'Lunch' });
    assert.equal(r.status, 201);
    r = await a.get(`/api/accounts/${cash.id}`);
    assert.equal(r.data.balance, '24579.50');
  });
  await t.test('invalid amounts rejected', async () => {
    for (const amount of ['-5', '0', 'abc', '1.234', '1e5']) {
      const r = await a.post('/api/transactions', { type: 'expense', account_id: cash.id, amount });
      assert.equal(r.status, 422, amount);
    }
  });
  await t.test('idempotency prevents duplicates', async () => {
    const key = 'k-' + rnd();
    const r1 = await a.post('/api/transactions', { type: 'expense', account_id: cash.id, amount: '100' }, { 'Idempotency-Key': key });
    const r2 = await a.post('/api/transactions', { type: 'expense', account_id: cash.id, amount: '100' }, { 'Idempotency-Key': key });
    assert.equal(r1.status, 201); assert.equal(r2.status, 200); assert.equal(r2.data.duplicate, true); assert.equal(r1.data.id, r2.data.id);
    const acc = await a.get(`/api/accounts/${cash.id}`);
    assert.equal(acc.data.balance, '24479.50');
  });
  await t.test('concurrent writes keep balances consistent', async () => {
    await Promise.all(Array.from({ length: 10 }, () => a.post('/api/transactions', { type: 'income', account_id: bk.id, amount: '10.10' })));
    const acc = await a.get(`/api/accounts/${bk.id}`);
    assert.equal(acc.data.balance, '101.00');
  });
  await t.test('transfer moves money between own accounts', async () => {
    let r = await a.post('/api/transactions', { type: 'transfer', account_id: cash.id, to_account_id: bk.id, amount: '479.50' });
    assert.equal(r.status, 201);
    r = await a.get(`/api/accounts/${bk.id}`); assert.equal(r.data.balance, '580.50');
    r = await a.get(`/api/accounts/${cash.id}`); assert.equal(r.data.balance, '24000.00');
  });
  await t.test('edit and delete reverse effects', async () => {
    let r = await a.patch(`/api/transactions/${txId}`, { amount: '26000' });
    assert.equal(r.status, 200);
    r = await a.get(`/api/accounts/${cash.id}`); assert.equal(r.data.balance, '25000.00');
    r = await a.del(`/api/transactions/${txId}`); assert.equal(r.status, 200);
    r = await a.get(`/api/accounts/${cash.id}`); assert.equal(r.data.balance, '-1000.00');
  });
  await t.test('IDOR: another user cannot read or touch data', async () => {
    const acc = (await a.get('/api/accounts')).data[0];
    const tx = (await a.get('/api/transactions')).data.items[0];
    assert.equal((await b.get(`/api/accounts/${acc.id}`)).status, 404);
    assert.equal((await b.get(`/api/transactions/${tx.id}`)).status, 404);
    assert.equal((await b.del(`/api/transactions/${tx.id}`)).status, 404);
    assert.equal((await b.patch(`/api/accounts/${acc.id}`, { name: 'pwned' })).status, 404);
    const bAcc = (await b.get('/api/accounts')).data[0];
    const r = await b.post('/api/transactions', { type: 'transfer', account_id: bAcc.id, to_account_id: acc.id, amount: '1' });
    assert.equal(r.status, 404, 'cannot transfer into a foreign account');
    assert.equal((await b.get('/api/admin/stats')).status, 403, 'non-admin blocked from admin API');
  });
  await t.test('lending: reminder, partial + full repayment, overpayment blocked', async () => {
    const due = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
    let r = await a.post('/api/loans', { kind: 'lent', person_name: 'Rahim', amount: '5000', account_id: cash.id, given_at: new Date().toISOString().slice(0, 10), due_date: due });
    assert.equal(r.status, 201, JSON.stringify(r.error)); const loan = r.data;
    r = await a.get(`/api/loans/lent/${loan.id}`); assert.equal(r.data.reminders.length, 2);
    r = await a.post(`/api/loans/lent/${loan.id}/payments`, { amount: '6000', account_id: cash.id, paid_at: due }); assert.equal(r.status, 422);
    r = await a.post(`/api/loans/lent/${loan.id}/payments`, { amount: '2000', account_id: cash.id, paid_at: due }); assert.equal(r.status, 201); assert.equal(r.data.status, 'open');
    r = await a.post(`/api/loans/lent/${loan.id}/payments`, { amount: '3000', account_id: cash.id, paid_at: due }); assert.equal(r.data.status, 'settled');
    r = await a.get(`/api/accounts/${cash.id}`); assert.equal(r.data.balance, '-1000.00');
    r = await a.get('/api/reminders'); assert.equal(r.data.filter((x) => x.ref_type === 'lent').length, 0, 'reminders cancelled when settled');
    r = await a.del(`/api/loans/lent/${loan.id}`); assert.equal(r.status, 200);
    r = await a.get(`/api/accounts/${cash.id}`); assert.equal(r.data.balance, '-1000.00');
  });
  await t.test('goals, moods, notes, reminders', async () => {
    let r = await a.post('/api/goals', { name: 'New Phone', kind: 'phone', target_amount: '50000', current_amount: '16000' });
    assert.equal(r.status, 201); assert.equal(r.data.progress, 32);
    r = await a.post(`/api/goals/${r.data.id}/contribute`, { amount: '34000' }); assert.ok(r.data.completed_at);
    r = await a.post('/api/moods', { mood: 4, date: new Date().toISOString().slice(0, 10), activity: 'Work' }); assert.equal(r.status, 200);
    r = await a.post('/api/notes', { title: 'Groceries', body: 'Rice, oil' }); assert.equal(r.status, 201);
    r = await a.post('/api/reminders', { title: 'Electricity bill', type: 'bill', amount: '1250', due_at: new Date(Date.now() + 2 * 864e5).toISOString() }); assert.equal(r.status, 201);
  });
  await t.test('insights endpoints', async () => {
    let r = await a.get('/api/insights/dashboard'); assert.equal(r.status, 200); assert.equal(r.data.series.length, 6);
    for (const p of ['daily', 'weekly', 'monthly', 'yearly']) { r = await a.get(`/api/insights/reports?period=${p}`); assert.equal(r.status, 200, p); }
    r = await a.get('/api/insights/calendar'); assert.equal(r.status, 200);
  });
  await t.test('TOTP 2FA login flow', async () => {
    const totp = require('../src/lib/totp');
    let r = await a.post('/api/security/2fa/totp/setup'); assert.equal(r.status, 200);
    const code = totp.hotp(r.data.secret, Math.floor(Date.now() / 30000));
    r = await a.post('/api/security/2fa/totp/enable', { code }); assert.equal(r.status, 200); assert.equal(r.data.recoveryCodes.length, 10);
    const rc = r.data.recoveryCodes[0];
    const c = client(); await c.get('/api/public/config');
    r = await c.post('/api/auth/login', { email: emailA, password: 'Passw0rd!' }); assert.equal(r.data.mfa, true);
    assert.equal((await c.get('/api/accounts')).status, 401, 'mfa-pending session has no access');
    r = await c.post('/api/auth/2fa/verify', { method: 'recovery', code: rc }); assert.equal(r.status, 200);
    assert.equal((await c.get('/api/accounts')).status, 200);
    const d = client(); await d.get('/api/public/config');
    await d.post('/api/auth/login', { email: emailA, password: 'Passw0rd!' });
    r = await d.post('/api/auth/2fa/verify', { method: 'recovery', code: rc }); assert.equal(r.status, 401, 'recovery code single-use');
  });
  await t.test('forgot password never reveals accounts', async () => {
    const c = client(); await c.get('/api/public/config');
    const r1 = await c.post('/api/auth/forgot', { email: emailB }); const r2 = await c.post('/api/auth/forgot', { email: `nobody_${rnd()}@x.dev` });
    assert.equal(r1.status, 200); assert.deepEqual(r1.data, r2.data);
  });
  await t.test('admin API with RBAC', async () => {
    if (!process.env.ADMIN_EMAIL) return;
    const ad = client(); await ad.get('/api/public/config');
    const r = await ad.post('/api/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
    assert.equal(r.status, 200);
    const s = await ad.get('/api/admin/stats'); assert.equal(s.status, 200); assert.ok(s.data.users.total >= 3);
    const u = await ad.get('/api/admin/users?q=' + encodeURIComponent(emailB)); assert.equal(u.data.items.length, 1);
    assert.equal(JSON.stringify(u.data).includes('password_hash'), false, 'no secrets leak');
    const sets = await ad.get('/api/admin/settings'); assert.equal(sets.status, 200);
    assert.ok(['', '__set__'].includes(sets.data.values.vapid_private ?? ''), 'secret masked');
  });
});
