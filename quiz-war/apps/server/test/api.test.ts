import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, exec, queryOne } from '../src/db/pool';
import { hashPassword } from '../src/lib/crypto';
import { client, dbAvailable, makeTestApp, resetDb } from './db';

const hasDb = await dbAvailable();
const d = hasDb ? describe : describe.skip;

let t: Awaited<ReturnType<typeof makeTestApp>>;
let api: ReturnType<typeof client>;

async function newPlayer(name: string) {
  const email = `${name}-${Math.random().toString(36).slice(2, 7)}@test.dev`;
  const r = await api('POST', '/auth/register', { email, password: 'secret123' });
  expect(r.status).toBe(200);
  const o = await api('POST', '/me/onboarding', { username: `${name}${Math.floor(Math.random() * 1e5)}` }, r.body.accessToken);
  expect(o.status).toBe(200);
  return { email, token: r.body.accessToken as string, refresh: r.body.refreshToken as string, user: o.body.user };
}

d('HTTP API (MySQL)', () => {
  beforeAll(async () => {
    await resetDb();
    t = await makeTestApp();
    api = client(t.app);
  });
  afterAll(async () => {
    await t?.app.close();
    await closePool();
  });

  describe('authentication', () => {
    it('registers, assigns a UID and requires onboarding', async () => {
      const r = await api('POST', '/auth/register', { email: 'first@test.dev', password: 'secret123' });
      expect(r.status).toBe(200);
      expect(r.body.user.uid).toMatch(/^QW-[2-9A-Z]{6}$/);
      expect(r.body.user.needsOnboarding).toBe(true);
      expect(r.body.refreshToken).toBeTruthy();
      const dup = await api('POST', '/auth/register', { email: 'first@test.dev', password: 'secret123' });
      expect(dup.status).toBe(409);
    });

    it('rejects weak passwords and invalid emails', async () => {
      expect((await api('POST', '/auth/register', { email: 'x@test.dev', password: 'short' })).status).toBe(400);
      expect((await api('POST', '/auth/register', { email: 'nope', password: 'secret123' })).status).toBe(400);
    });

    it('web clients get the refresh token only as an httpOnly cookie', async () => {
      const r = await api('POST', '/auth/login', { email: 'first@test.dev', password: 'secret123' }, undefined, { 'x-client-platform': 'web' });
      expect(r.status).toBe(200);
      expect(r.body.refreshToken).toBeUndefined();
      expect(String(r.headers['set-cookie'])).toMatch(/qw_rt=.*HttpOnly/i);
      // cookie refresh without the CSRF header is refused
      const cookie = String(r.headers['set-cookie']).split(';')[0];
      const noCsrf = await api('POST', '/auth/refresh', {}, undefined, { 'x-client-platform': 'web', cookie });
      expect(noCsrf.status).toBe(403);
      const ok = await api('POST', '/auth/refresh', {}, undefined, { 'x-client-platform': 'web', cookie, 'x-requested-with': 'QuizWar' });
      expect(ok.status).toBe(200);
    });

    it('rate-limits login attempts per IP', async () => {
      let last = 0;
      for (let i = 0; i < 12; i++) last = (await api('POST', '/auth/login', { email: 'rl@test.dev', password: 'x' }, undefined, { 'x-test-rate-limit': 'on' })).status;
      expect(last).toBe(429);
    });

    it('locks the account after repeated wrong passwords', async () => {
      const p = await newPlayer('lock');
      for (let i = 0; i < 5; i++) expect((await api('POST', '/auth/login', { email: p.email, password: 'wrong-pass1' })).status).toBe(401);
      const locked = await api('POST', '/auth/login', { email: p.email, password: 'secret123' });
      expect(locked.status).toBe(429);
      expect(locked.body.error.code).toBe('account_locked');
    });

    it('rotates refresh tokens and revokes the session on reuse', async () => {
      const p = await newPlayer('rot');
      const r1 = await api('POST', '/auth/refresh', { refreshToken: p.refresh });
      expect(r1.status).toBe(200);
      expect(r1.body.refreshToken).not.toBe(p.refresh);
      // pretend the rotation happened a while ago, then replay the old token (theft scenario)
      await exec('UPDATE user_sessions SET last_used_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE) WHERE user_id = ?', [p.user.id]);
      expect((await api('POST', '/auth/refresh', { refreshToken: p.refresh })).status).toBe(401);
      // whole session family is now dead
      expect((await api('POST', '/auth/refresh', { refreshToken: r1.body.refreshToken })).status).toBe(401);
    });

    it('verifies email and resets password (revoking sessions)', async () => {
      const p = await newPlayer('mail');
      const verifyMail = t.mailer.sent.find((m) => m.to === p.email && m.subject.includes('Verify'))!;
      const token = decodeURIComponent(verifyMail.text.match(/token=([^\s]+)/)![1]);
      expect((await api('POST', '/auth/verify-email', { token })).status).toBe(200);
      expect((await api('POST', '/auth/verify-email', { token })).status).toBe(400); // single use
      expect((await api('POST', '/auth/forgot-password', { email: p.email })).status).toBe(200);
      expect((await api('POST', '/auth/forgot-password', { email: 'nobody@test.dev' })).status).toBe(200); // no enumeration
      const reset = t.mailer.sent.find((m) => m.to === p.email && m.subject.includes('Reset'))!;
      const rt = decodeURIComponent(reset.text.match(/token=([^\s]+)/)![1]);
      expect((await api('POST', '/auth/reset-password', { token: rt, password: 'newpass456' })).status).toBe(200);
      expect((await api('POST', '/auth/refresh', { refreshToken: p.refresh })).status).toBe(401);
      expect((await api('POST', '/auth/login', { email: p.email, password: 'newpass456' })).status).toBe(200);
    });

    it('signs in with Google and links verified emails', async () => {
      const r = await api('POST', '/auth/google', { idToken: 'valid-google-g123456' });
      expect(r.status).toBe(200);
      expect(r.body.created).toBe(true);
      const again = await api('POST', '/auth/google', { idToken: 'valid-google-g123456' });
      expect(again.body.created).toBe(false);
      expect(again.body.user.id).toBe(r.body.user.id);
      expect((await api('POST', '/auth/google', { idToken: 'forged-token-xxxxxxxxxxxxxxxx' })).status).toBe(401);
    });

    it('lists sessions and logs out all devices', async () => {
      const p = await newPlayer('sess');
      const s = await api('GET', '/auth/sessions', undefined, p.token);
      expect(s.body.items.length).toBe(1);
      expect((await api('POST', '/auth/logout-all', {}, p.token)).status).toBe(200);
      expect((await api('POST', '/auth/refresh', { refreshToken: p.refresh })).status).toBe(401);
      const hist = await api('GET', '/auth/login-history', undefined, p.token);
      expect(hist.body.items.length).toBeGreaterThan(0);
    });

    it('deletes an account and anonymises personal data', async () => {
      const p = await newPlayer('del');
      expect((await api('DELETE', '/auth/account', { password: 'secret123', confirmation: 'nope' }, p.token)).status).toBe(400);
      expect((await api('DELETE', '/auth/account', { password: 'secret123', confirmation: 'DELETE' }, p.token)).status).toBe(200);
      const row = await queryOne<any>('SELECT email, password_hash, status FROM users WHERE id = ?', [p.user.id]);
      expect(row).toMatchObject({ email: null, password_hash: null, status: 'deleted' });
      expect((await api('GET', `/users/${p.user.uid}`)).status).toBe(404);
      expect((await api('POST', '/auth/login', { email: p.email, password: 'secret123' })).status).toBe(401);
    });
  });

  describe('UID, profiles and friends', () => {
    it('finds players by UID without exposing email', async () => {
      const a = await newPlayer('uida');
      const b = await newPlayer('uidb');
      const r = await api('GET', `/users/search?uid=${b.user.uid.toLowerCase()}`, undefined, a.token);
      expect(r.status).toBe(200);
      expect(r.body.user.id).toBe(b.user.id);
      const pub = await api('GET', `/users/${b.user.uid}`);
      expect(pub.status).toBe(200);
      expect(JSON.stringify(pub.body)).not.toContain(b.email);
      expect((await api('GET', '/users/search?uid=QW-ZZZZZZ', undefined, a.token)).status).toBe(404);
    });

    it('friend request → accept → remove; blocking hides the player', async () => {
      const a = await newPlayer('fa');
      const b = await newPlayer('fb');
      expect((await api('POST', '/friends/requests', { uid: b.user.uid }, a.token)).body.status).toBe('sent');
      expect((await api('POST', '/friends/requests', { uid: b.user.uid }, a.token)).status).toBe(409);
      const inc = await api('GET', '/friends/requests', undefined, b.token);
      expect(inc.body.incoming).toHaveLength(1);
      expect((await api('POST', `/friends/requests/${inc.body.incoming[0].id}/accept`, {}, b.token)).status).toBe(200);
      expect((await api('GET', '/friends', undefined, a.token)).body.items).toHaveLength(1);
      expect((await api('DELETE', `/friends/${b.user.id}`, undefined, a.token)).status).toBe(200);
      expect((await api('GET', '/friends', undefined, b.token)).body.items).toHaveLength(0);
      expect((await api('POST', '/blocks', { userId: b.user.id }, a.token)).status).toBe(200);
      expect((await api('GET', `/users/${a.user.uid}`, undefined, b.token)).status).toBe(404);
      expect((await api('POST', '/friends/requests', { uid: a.user.uid }, b.token)).status).toBe(404);
    });

    it('a reverse pending request auto-accepts', async () => {
      const a = await newPlayer('ra');
      const b = await newPlayer('rb');
      await api('POST', '/friends/requests', { uid: b.user.uid }, a.token);
      const r = await api('POST', '/friends/requests', { uid: a.user.uid }, b.token);
      expect(r.body.status).toBe('accepted');
    });
  });

  describe('battle requests', () => {
    it('refuses to challenge players who are offline / unavailable', async () => {
      const a = await newPlayer('ba');
      const b = await newPlayer('bb');
      const r = await api('POST', '/battles/requests', { userId: b.user.id }, a.token);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('not_available');
    });

    it('expired requests cannot be accepted; duplicates are rejected', async () => {
      const a = await newPlayer('ea');
      const b = await newPlayer('eb');
      t.ctx.presence.connect(b.user.id, 'sock-b', { available: true, dnd: false });
      const r = await api('POST', '/battles/requests', { userId: b.user.id }, a.token);
      expect(r.status).toBe(200);
      expect((await api('POST', '/battles/requests', { userId: b.user.id }, a.token)).status).toBe(409);
      await exec('UPDATE battle_requests SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE id = ?', [r.body.id]);
      const acc = await api('POST', `/battles/requests/${r.body.id}/accept`, {}, b.token);
      expect(acc.status).toBe(410);
      expect(acc.body.error.code).toBe('request_expired');
      t.ctx.presence.disconnect(b.user.id, 'sock-b');
    });

    it('accepting creates a War Room for both players', async () => {
      const a = await newPlayer('wa');
      const b = await newPlayer('wb');
      t.ctx.presence.connect(b.user.id, 'sock-wb', { available: true, dnd: false });
      const r = await api('POST', '/battles/requests', { userId: b.user.id, questionCount: 5 }, a.token);
      const acc = await api('POST', `/battles/requests/${r.body.id}/accept`, {}, b.token);
      expect(acc.status).toBe(200);
      const m = t.ctx.engine.get(acc.body.matchId)!;
      expect(m.state).toBe('lobby');
      expect(m.players.map((p) => p.userId).sort()).toEqual([a.user.id, b.user.id].sort());
      t.ctx.engine.abort(m, 'aborted');
      t.ctx.presence.disconnect(b.user.id, 'sock-wb');
    });
  });

  describe('economy', () => {
    it('daily reward can only be claimed once per day', async () => {
      const p = await newPlayer('daily');
      const s = await api('GET', '/me/rewards/daily', undefined, p.token);
      expect(s.body.claimedToday).toBe(false);
      const c = await api('POST', '/me/rewards/daily/claim', {}, p.token);
      expect(c.status).toBe(200);
      const again = await api('POST', '/me/rewards/daily/claim', {}, p.token);
      expect(again.status).toBe(409);
      const me = await api('GET', '/me', undefined, p.token);
      expect(me.body.user.coins).toBe(100);
    });

    it('shop purchases are server-authoritative and need enough coins', async () => {
      const p = await newPlayer('shop');
      expect((await api('POST', '/shop/purchase', { itemKey: 'frame_gold' }, p.token)).body.error.code).toBe('insufficient_coins');
      await exec('UPDATE user_profiles SET coins = 500 WHERE user_id = ?', [p.user.id]);
      expect((await api('POST', '/shop/purchase', { itemKey: 'pu_hint', quantity: 2 }, p.token)).status).toBe(200);
      const inv = await api('GET', '/me/power-ups', undefined, p.token);
      expect(inv.body.hint).toBe(2);
      expect((await api('GET', '/me', undefined, p.token)).body.user.coins).toBe(400);
    });

    it('leaderboards paginate and cap page size', async () => {
      const r = await api('GET', '/leaderboards/global?page=1&pageSize=500');
      expect(r.status).toBe(400);
      const ok = await api('GET', '/leaderboards/weekly?page=1&pageSize=10');
      expect(ok.status).toBe(200);
      expect(Array.isArray(ok.body.items)).toBe(true);
    });
  });

  describe('uploads', () => {
    async function upload(token: string, buf: Buffer, filename: string, type: string) {
      const boundary = '----qwtest';
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
        buf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/v1/me/avatar',
        payload: body,
        headers: { authorization: `Bearer ${token}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      });
      return { status: res.statusCode, body: res.json() };
    }

    it('rejects non-images even with an image extension', async () => {
      const p = await newPlayer('up');
      const r = await upload(p.token, Buffer.from('<?php echo "pwned"; ?>'), 'avatar.png', 'image/png');
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('invalid_image');
    });

    it('resizes, converts to WebP and creates a thumbnail', async () => {
      const p = await newPlayer('up2');
      const png = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#1d4ed8' } }).png().toBuffer();
      const r = await upload(p.token, png, 'me.png', 'image/png');
      expect(r.status).toBe(200);
      expect(r.body.avatarUrl).toMatch(/\.webp$/);
      expect(r.body.avatarThumbUrl).toMatch(/_t\.webp$/);
    });
  });

  describe('admin RBAC + audit', () => {
    let superToken: string;
    let qmToken: string;

    beforeAll(async () => {
      const roles = await queryOne<any>(`SELECT (SELECT id FROM admin_roles WHERE role_key='super_admin') s, (SELECT id FROM admin_roles WHERE role_key='question_manager') q`);
      await exec('INSERT INTO admin_users (email, name, password_hash, role_id) VALUES (?, ?, ?, ?), (?, ?, ?, ?)', [
        'super@test.dev', 'Super', await hashPassword('super-password-1'), roles.s,
        'qm@test.dev', 'QM', await hashPassword('qm-password-123'), roles.q,
      ]);
      superToken = (await t.app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { email: 'super@test.dev', password: 'super-password-1' } })).json().accessToken;
      qmToken = (await t.app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { email: 'qm@test.dev', password: 'qm-password-123' } })).json().accessToken;
    });

    const adm = (method: string, url: string, token: string, payload?: unknown) =>
      t.app.inject({ method: method as any, url: `/api/v1/admin${url}`, payload: payload as any, headers: { authorization: `Bearer ${token}` } });

    it('player tokens are not admin tokens', async () => {
      const p = await newPlayer('notadmin');
      expect((await adm('GET', '/dashboard', p.token)).statusCode).toBe(401);
    });

    it('question manager can manage questions but not players', async () => {
      const cat = await queryOne<{ id: number }>(`SELECT id FROM categories WHERE slug = 'ict'`);
      const create = await adm('POST', '/questions', qmToken, {
        categoryId: cat!.id,
        difficulty: 'easy',
        language: 'en',
        text: 'What does RAM stand for?',
        options: ['Random Access Memory', 'Read Access Memory', 'Run Any Memory', 'Rapid Access Mode'],
        correctIndex: 0,
        explanation: 'RAM = Random Access Memory',
      });
      expect(create.statusCode).toBe(200);
      const p = await newPlayer('target');
      const mod = await adm('POST', `/users/${p.user.id}/moderate`, qmToken, { action: 'ban', reason: 'testing ban' });
      expect(mod.statusCode).toBe(403);
      const audit = await queryOne<any>(`SELECT action, target_id FROM admin_logs WHERE action = 'question.create' ORDER BY id DESC LIMIT 1`);
      expect(audit.target_id).toBe(String(create.json().id));
    });

    it('super admin bans a player: sessions revoked, audit logged', async () => {
      const p = await newPlayer('banme');
      const r = await adm('POST', `/users/${p.user.id}/moderate`, superToken, { action: 'ban', reason: 'cheating confirmed' });
      expect(r.statusCode).toBe(200);
      expect((await api('POST', '/auth/refresh', { refreshToken: p.refresh })).status).toBe(401);
      const login = await api('POST', '/auth/login', { email: p.email, password: 'secret123' });
      expect(login.body.error.code).toBe('account_banned');
      const log = await queryOne<any>(`SELECT before_json, after_json FROM admin_logs WHERE action = 'user.ban' ORDER BY id DESC LIMIT 1`);
      expect(JSON.stringify(log.after_json)).toContain('banned');
      // admin view masks email and never returns secrets
      const view = await adm('GET', `/users/${p.user.id}`, superToken);
      const body = JSON.stringify(view.json());
      expect(body).not.toContain(p.email);
      expect(body).not.toContain('password_hash');
      expect(body).not.toContain('scrypt$');
    });

    it('imports questions from CSV with per-row validation', async () => {
      const csv = [
        'category,difficulty,language,text,option_a,option_b,option_c,option_d,correct,explanation,hint,image_url',
        'math,easy,bn,"২ + ২ = কত?",৩,৪,৫,৬,B,"২ আর ২ যোগ করলে ৪",,',
        'math,impossible,bn,Bad row,a,b,c,d,A,,,',
      ].join('\n');
      const r = await adm('POST', '/questions/import', superToken, { format: 'csv', content: csv });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toMatchObject({ total: 2, created: 1 });
      expect(r.json().errors[0].row).toBe(2);
      const exp = await adm('GET', '/questions/export?format=csv', superToken);
      expect(exp.body).toContain('২ + ২ = কত?');
    });

    it('validates game settings before saving', async () => {
      const bad = await adm('PUT', '/settings/game/match', superToken, { questionCount: 1000, questionTimeSec: 10, countdownSec: 3, revealMs: 2000, minHumanResponseMs: 250 });
      expect(bad.statusCode).toBe(400);
      const ok = await adm('PUT', '/settings/game/match', superToken, { questionCount: 12, questionTimeSec: 12, countdownSec: 3, revealMs: 2000, minHumanResponseMs: 250 });
      expect(ok.statusCode).toBe(200);
      expect(t.ctx.settings.game().match.questionCount).toBe(12);
      expect((await adm('PUT', '/settings/game/match', qmToken, {})).statusCode).toBe(403);
    });
  });
});
