import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { exec, one } from '../src/infrastructure/db';
import { queue } from '../src/infrastructure/queue';
import { setSettings } from '../src/modules/settings/settings.service';
import { hotp, currentStep } from '../src/modules/auth/totp';
import { startHarness, csrfFor, userAgent, type Harness } from './harness';
import { hashPassword } from '../src/modules/auth/passwords';

let h: Harness;
beforeAll(async () => {
  h = await startHarness();
});
afterAll(async () => h?.stop());

async function lastEmailTo(to: string) {
  const jobs = await queue('email').getJobs(['waiting', 'delayed', 'active'], 0, 200);
  return jobs.filter((j) => j.data.to === to).sort((a, b) => Number(b.timestamp) - Number(a.timestamp))[0]
    ?.data as { code?: string; cta?: { url: string } } | undefined;
}

describe('registration & email verification', () => {
  it('registers, requires verification, verifies with emailed code', async () => {
    await setSettings({ 'auth.email_verification_required': true });
    const a = request.agent(h.server);
    let csrf = await csrfFor(a);
    const reg = await a
      .post('/api/auth/register')
      .set('x-csrf-token', csrf)
      .send({ email: 'Dana@Example.com', password: 'Str0ngPassword', name: 'Dana' });
    expect(reg.status).toBe(201);
    const login = await a
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: 'dana@example.com', password: 'Str0ngPassword' });
    expect(login.body.status).toBe('email_verification_required');
    const mail = await lastEmailTo('dana@example.com');
    expect(mail?.code).toMatch(/^\d{6}$/);
    const bad = await a
      .post('/api/auth/verify-email')
      .set('x-csrf-token', csrf)
      .send({ email: 'dana@example.com', code: mail!.code === '000000' ? '111111' : '000000' });
    expect(bad.status).toBe(400);
    const ok = await a
      .post('/api/auth/verify-email')
      .set('x-csrf-token', csrf)
      .send({ email: 'dana@example.com', code: mail!.code });
    expect(ok.body.status).toBe('ok');
    csrf = await csrfFor(a);
    const me = await a.get('/api/auth/me');
    expect(me.body.user.emailVerified).toBe(true);
    await setSettings({ 'auth.email_verification_required': false });
  });

  it('does not reveal whether an email is registered', async () => {
    const a = request.agent(h.server);
    const csrf = await csrfFor(a);
    const r = await a
      .post('/api/auth/register')
      .set('x-csrf-token', csrf)
      .send({ email: 'dana@example.com', password: 'Str0ngPassword', name: 'X' });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('verification_sent');
    const f = await a
      .post('/api/auth/forgot-password')
      .set('x-csrf-token', csrf)
      .send({ email: 'nobody@example.com' });
    expect(f.body.ok).toBe(true);
  });

  it('rejects weak passwords', async () => {
    const a = request.agent(h.server);
    const csrf = await csrfFor(a);
    const r = await a
      .post('/api/auth/register')
      .set('x-csrf-token', csrf)
      .send({ email: 'weak@example.com', password: 'password', name: 'W' });
    expect(r.status).toBe(422);
  });
});

describe('login protection', () => {
  it('locks the account after repeated failures', async () => {
    await exec(
      'INSERT INTO users (uid, email, password_hash, name, email_verified_at) VALUES (?,?,?,?,NOW())',
      ['555000111', 'lock@example.com', await hashPassword('Password123!'), 'Lock'],
    );
    await exec('INSERT INTO user_profiles (user_id) SELECT id FROM users WHERE email = ?', [
      'lock@example.com',
    ]);
    const a = request.agent(h.server);
    const csrf = await csrfFor(a);
    for (let i = 0; i < 5; i++) {
      const r = await a
        .post('/api/auth/login')
        .set('x-csrf-token', csrf)
        .send({ email: 'lock@example.com', password: 'wrong-password' });
      expect(r.status, JSON.stringify(r.body)).toBe(401);
    }
    const locked = await a
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: 'lock@example.com', password: 'Password123!' });
    expect(locked.status).toBe(423);
    const attempts = await one<{ n: number }>(
      "SELECT COUNT(*) AS n FROM login_attempts WHERE email = 'lock@example.com' AND success = 0",
    );
    expect(Number(attempts?.n)).toBeGreaterThanOrEqual(5);
  });
});

describe('2FA, sessions and step-up', () => {
  it('enables TOTP, requires it at login, supports backup codes, and revokes sessions', async () => {
    const u = await userAgent(h, 'erin@example.com');
    const setup = await u.agent.post('/api/account/2fa/setup').set('x-csrf-token', u.csrf);
    expect(setup.body.otpauthUrl).toContain('otpauth://totp/');
    const enable = await u.agent
      .post('/api/account/2fa/enable')
      .set('x-csrf-token', u.csrf)
      .send({ code: hotp(setup.body.secret, currentStep()) });
    expect(enable.status).toBe(200);
    expect(enable.body.backupCodes).toHaveLength(10);

    const b = request.agent(h.server);
    let csrf = await csrfFor(b);
    const first = await b
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: 'erin@example.com', password: 'Password123!' });
    expect(first.body.status).toBe('mfa_required');
    expect(first.body.methods.totp).toBe(true);
    const wrong = await b
      .post('/api/auth/2fa/verify')
      .set('x-csrf-token', csrf)
      .send({ mfaToken: first.body.mfaToken, method: 'totp', code: '000000' });
    expect(wrong.status).toBe(401);
    const ok = await b
      .post('/api/auth/2fa/verify')
      .set('x-csrf-token', csrf)
      .send({ mfaToken: first.body.mfaToken, method: 'backup', code: enable.body.backupCodes[0] });
    expect(ok.body.status).toBe('ok');
    // backup code is single-use
    const c = request.agent(h.server);
    csrf = await csrfFor(c);
    const again = await c
      .post('/api/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: 'erin@example.com', password: 'Password123!' });
    const reuse = await c
      .post('/api/auth/2fa/verify')
      .set('x-csrf-token', csrf)
      .send({ mfaToken: again.body.mfaToken, method: 'backup', code: enable.body.backupCodes[0] });
    expect(reuse.status).toBe(401);

    csrf = await csrfFor(b);
    const sessions = await b.get('/api/account/sessions');
    expect(sessions.body.items.length).toBeGreaterThanOrEqual(1);
    const revoked = await b.post('/api/account/sessions/revoke-others').set('x-csrf-token', csrf);
    expect(revoked.body.revoked).toBeGreaterThanOrEqual(1);
    // the original agent's session was rotated/revoked → unauthenticated
    expect((await u.agent.get('/api/account/profile')).status).toBe(401);
    expect((await b.get('/api/account/profile')).status).toBe(200);
  });

  it('isolates user data', async () => {
    const x = await userAgent(h, 'x@example.com', { USDT: '5' });
    const y = await userAgent(h, 'y@example.com');
    const nx = await one<{ id: number }>('SELECT id FROM notifications WHERE user_id = ? LIMIT 1', [x.id]);
    await y.agent
      .post('/api/account/notifications/read')
      .set('x-csrf-token', y.csrf)
      .send({ ids: [Number(nx!.id)] });
    const still = await one<{ read_at: Date | null }>('SELECT read_at FROM notifications WHERE id = ?', [
      nx!.id,
    ]);
    expect(still?.read_at).toBeNull();
    const yw = await y.agent.get('/api/wallets');
    expect(yw.body.items).toHaveLength(0);
  });

  it('withdrawals require a second factor and lock funds', async () => {
    await exec(
      "INSERT INTO networks (asset_id, code, name, chain_family, deposit_mode, static_address, memo_required, confirmations, min_withdraw) SELECT id, 'TRC20', 'Tron (TRC20)', 'tron', 'static', 'TXYZexchangeHotWallet000000000000', 1, 1, 1 FROM assets WHERE symbol = 'USDT'",
    );
    const w = await userAgent(h, 'wendy@example.com', { USDT: '100' });
    const body = {
      asset: 'USDT',
      network: 'TRC20',
      address: 'TAbcdefghijklmnopqrstuvwxyz12345',
      memo: '123',
      amount: '10',
    };
    const noMfa = await w.agent.post('/api/withdrawals').set('x-csrf-token', w.csrf).send(body);
    expect(noMfa.status).toBe(403);
    const setup = await w.agent.post('/api/account/2fa/setup').set('x-csrf-token', w.csrf);
    await w.agent
      .post('/api/account/2fa/enable')
      .set('x-csrf-token', w.csrf)
      .send({ code: hotp(setup.body.secret, currentStep()) });
    const csrf = await csrfFor(w.agent);
    // session rotated with mfa → allowed immediately
    const r = await w.agent.post('/api/withdrawals').set('x-csrf-token', csrf).send(body);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.status).toBe('manual_review');
    const bal = await one<{ available: string; locked: string }>(
      "SELECT b.available, b.locked FROM balances b JOIN assets a ON a.id = b.asset_id WHERE b.user_id = ? AND a.symbol = 'USDT'",
      [w.id],
    );
    expect(Number(bal!.locked)).toBe(10);
    const cancel = await w.agent.delete(`/api/withdrawals/${r.body.id}`).set('x-csrf-token', csrf);
    expect(cancel.body.ok).toBe(true);
    const after = await one<{ available: string; locked: string }>(
      "SELECT b.available, b.locked FROM balances b JOIN assets a ON a.id = b.asset_id WHERE b.user_id = ? AND a.symbol = 'USDT'",
      [w.id],
    );
    expect(Number(after!.available)).toBe(100);
    expect(Number(after!.locked)).toBe(0);
  });

  it('credits signed deposit webhooks exactly once after confirmations', async () => {
    const d = await userAgent(h, 'dep@example.com');
    const addr = await d.agent
      .post('/api/deposits')
      .set('x-csrf-token', d.csrf)
      .send({ asset: 'USDT', network: 'TRC20' });
    expect(addr.body.memo).toMatch(/^\d+$/);
    const crypto = await import('node:crypto');
    const send = async (confirmations: number) => {
      const payload = JSON.stringify({
        network: 'TRC20',
        asset: 'USDT',
        address: addr.body.address,
        memo: addr.body.memo,
        txid: 'abc123txid',
        amount: '25',
        confirmations,
      });
      const t = Math.floor(Date.now() / 1000);
      const sig = crypto.createHmac('sha256', 'test-webhook-secret').update(`${t}.${payload}`).digest('hex');
      return request(h.server)
        .post('/api/webhooks/deposits')
        .set('content-type', 'application/json')
        .set('x-signature', `t=${t},v1=${sig}`)
        .send(payload);
    };
    expect((await request(h.server).post('/api/webhooks/deposits').send({})).status).toBe(401);
    expect((await send(0)).body.status).toBe('pending');
    expect((await send(1)).body.status).toBe('credited');
    expect((await send(2)).body.status).toBe('credited');
    const bal = await one<{ available: string }>(
      "SELECT b.available FROM balances b JOIN assets a ON a.id = b.asset_id WHERE b.user_id = ? AND a.symbol = 'USDT'",
      [d.id],
    );
    expect(Number(bal!.available)).toBe(25);
  });
});

describe('admin', () => {
  it('requires a second factor before any admin action', async () => {
    await exec(
      "INSERT INTO admin_users (email, name, password_hash, role_id) SELECT 'root@example.com', 'Root', ?, id FROM admin_roles WHERE name = 'super_admin'",
      [await hashPassword('AdminPassw0rd!')],
    );
    const a = request.agent(h.server);
    let csrf = await csrfFor(a);
    const login = await a
      .post('/api/admin/auth/login')
      .set('x-csrf-token', csrf)
      .send({ email: 'root@example.com', password: 'AdminPassw0rd!' });
    expect(login.body.status).toBe('setup_required');
    csrf = await csrfFor(a);
    expect((await a.get('/api/admin/users')).status).toBe(403);
    const setup = await a.post('/api/admin/auth/2fa/setup').set('x-csrf-token', csrf);
    expect(setup.status, JSON.stringify(setup.body)).toBe(200);
    const en = await a
      .post('/api/admin/auth/2fa/enable')
      .set('x-csrf-token', csrf)
      .send({ code: hotp(setup.body.secret, currentStep()) });
    expect(en.status).toBe(200);
    const users = await a.get('/api/admin/users');
    expect(users.status).toBe(200);
    expect(users.body.total).toBeGreaterThan(0);
    csrf = await csrfFor(a);
    const target = users.body.items[0];
    const s = await a
      .post(`/api/admin/users/${target.id}/status`)
      .set('x-csrf-token', csrf)
      .send({ status: 'suspended', reason: 'test' });
    expect(s.body.ok).toBe(true);
    const log = await one<{ action: string }>(
      "SELECT action FROM audit_logs WHERE action = 'user.suspended' ORDER BY id DESC LIMIT 1",
    );
    expect(log?.action).toBe('user.suspended');
    // user cookies cannot access admin API
    const u = await userAgent(h, 'notadmin@example.com');
    expect((await u.agent.get('/api/admin/dashboard')).status).toBe(401);
    const dash = await a.get('/api/admin/dashboard');
    expect(dash.status).toBe(200);
    expect(dash.body.users.total).toBeGreaterThan(0);
  });
});
