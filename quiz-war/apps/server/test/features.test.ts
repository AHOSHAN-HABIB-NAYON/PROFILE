import { MODES } from '@quizwar/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closePool, exec, query, queryOne } from '../src/db/pool';
import { hashPassword } from '../src/lib/crypto';
import { AiGeneratorService, normalizeQuestion } from '../src/modules/ai/ai-generator.service';
import { audioKind } from '../src/routes/admin.routes';
import { smtpConfigFromEnv } from '../src/modules/auth/mailer';
import { client, dbAvailable, makeTestApp, resetDb } from './db';

const hasDb = await dbAvailable();
const d = hasDb ? describe : describe.skip;

let t: Awaited<ReturnType<typeof makeTestApp>>;
let api: ReturnType<typeof client>;

async function newPlayer(name: string) {
  const email = `${name}-${Math.random().toString(36).slice(2, 7)}@test.dev`;
  const r = await api('POST', '/auth/register', { email, password: 'secret123' });
  const o = await api('POST', '/me/onboarding', { username: `${name}${Math.floor(Math.random() * 1e5)}` }, r.body.accessToken);
  return { token: r.body.accessToken as string, id: Number(o.body.user.id ?? (await queryOne<any>('SELECT id FROM users WHERE email = ?', [email])).id) };
}

async function coins(userId: number) {
  return Number((await queryOne<any>('SELECT coins FROM user_profiles WHERE user_id = ?', [userId])).coins);
}

/** Minimal finished-match object for the reward pipeline. */
function fakeMatch(players: { userId: number; team: number; forfeited?: boolean; correct?: number }[], winnerTeam: number | null) {
  return {
    id: `TEST${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
    mode: MODES.duel,
    type: 'pvp',
    source: 'challenge',
    ranked: false,
    categoryId: null,
    startedAt: Date.now() - 60_000,
    winnerTeam,
    flags: [],
    players: players.map((p) => ({
      userId: p.userId,
      team: p.team,
      isBot: false,
      forfeited: !!p.forfeited,
      level: 1,
      rating: 1000,
      matchPlayerId: null,
      score: (p.correct ?? 0) * 100,
      correct: p.correct ?? 0,
      answeredCount: 5,
      fastAnswers: 0,
      bestCombo: 1,
      totalResponseMs: 5000,
      answers: new Map([[0, {}], [1, {}], [2, {}], [3, {}], [4, {}]]),
    })),
  } as any;
}

d('Features (MySQL)', () => {
  beforeAll(async () => {
    await resetDb();
    t = await makeTestApp();
    api = client(t.app);
  });
  afterAll(async () => {
    await t?.app.close();
    await closePool();
  });

  describe('question rotation', () => {
    it('never repeats a question until the whole category is played, then repeats oldest first', async () => {
      const cat = await exec(`INSERT INTO categories (slug, name, name_bn, icon, sort_order) VALUES ('rot-test', 'Rotation', 'রোটেশন', 'x', 99)`);
      const catId = cat.insertId;
      const ids: number[] = [];
      for (let i = 0; i < 6; i++) {
        ids.push(await t.ctx.questionsAdmin.create(
          { categoryId: catId, difficulty: 'easy', language: 'bn', text: `রোটেশন প্রশ্ন ${i}`, options: ['ক', 'খ', 'গ', 'ঘ'], correctIndex: 0, isActive: true },
          null,
        ));
      }
      // A question waiting for review is never served.
      await t.ctx.questionsAdmin.create(
        { categoryId: catId, difficulty: 'easy', language: 'bn', text: 'রিভিউ বাকি', options: ['ক', 'খ', 'গ', 'ঘ'], correctIndex: 0, isActive: false },
        null,
        { source: 'ai', reviewStatus: 'pending' },
      );
      const p = await newPlayer('rot');
      const see = async (qids: number[], daysAgo: number) => {
        for (const q of qids)
          await exec(`INSERT INTO user_seen_questions (user_id, question_id, category_id, seen_at) VALUES (?, ?, ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY))`, [p.id, q, catId, daysAgo]);
      };
      const pick = async () => (await t.ctx.questionSource.pick({ categoryId: catId, count: 3, userIds: [p.id] })).map((q) => q.id);

      const first = await pick();
      expect(first).toHaveLength(3);
      await see(first, 3);
      const second = await pick();
      expect(second.some((id) => first.includes(id))).toBe(false);
      expect([...first, ...second].sort()).toEqual([...ids].sort());
      await see(second, 2);

      // Bank exhausted → next rotation starts with the questions seen longest ago.
      const third = await pick();
      expect([...third].sort()).toEqual([...first].sort());
      const cycle = await queryOne<any>('SELECT cycle FROM user_question_cycles WHERE user_id = ? AND category_id = ?', [p.id, catId]);
      expect(Number(cycle.cycle)).toBe(2);
    });
  });

  describe('quit penalty + missions', () => {
    it('fines the quitter, gives the coins to the opponent, and missions become claimable once', async () => {
      const a = await newPlayer('stay');
      const b = await newPlayer('quit');
      await exec('UPDATE user_profiles SET coins = 500, xp = 50 WHERE user_id IN (?)', [[a.id, b.id]]);
      const pen = t.ctx.settings.game().penalties;

      const results = await t.ctx.progression.applyMatchResult(fakeMatch([{ userId: a.id, team: 0, correct: 5 }, { userId: b.id, team: 1, forfeited: true }], 0));
      const ra = results.find((r) => r.userId === a.id)!;
      const rb = results.find((r) => r.userId === b.id)!;
      expect(rb.penaltyCoins).toBe(pen.quitCoins);
      expect(rb.xpGained).toBe(0);
      expect(ra.bonusCoins).toBe(pen.quitCoins);
      expect(await coins(b.id)).toBe(500 - pen.quitCoins);
      const tx = await query<any>(`SELECT reason, amount FROM coin_transactions WHERE user_id IN (?) AND reason IN ('quit_penalty', 'opponent_quit')`, [[a.id, b.id]]);
      expect(tx.map((x) => [x.reason, Number(x.amount)]).sort()).toEqual([['opponent_quit', pen.quitCoins], ['quit_penalty', -pen.quitCoins]]);
      // XP fine never drops a level.
      expect(Number((await queryOne<any>('SELECT xp FROM user_profiles WHERE user_id = ?', [b.id])).xp)).toBe(Math.max(0, 50 - pen.quitXp));

      // The winner completed "first battle win" (once) and a perfect match.
      const list = await api('GET', '/missions', undefined, a.token);
      expect(list.status).toBe(200);
      const firstWin = list.body.items.find((m: any) => m.period === 'once' && m.metric === 'battle_wins');
      expect(firstWin).toMatchObject({ completed: true, claimed: false });
      expect(list.body.claimable).toBeGreaterThan(0);
      const note = await queryOne<any>(`SELECT title FROM notifications WHERE user_id = ? AND type = 'mission'`, [a.id]);
      expect(note.title).toContain('Claim');

      const before = await coins(a.id);
      const claim = await api('POST', `/missions/${firstWin.id}/claim`, {}, a.token);
      expect(claim.status).toBe(200);
      expect(await coins(a.id)).toBe(before + firstWin.rewardCoins);
      expect((await api('POST', `/missions/${firstWin.id}/claim`, {}, a.token)).status).toBe(409);
      // Quitter got nothing towards missions.
      const qb = await api('GET', '/missions', undefined, b.token);
      expect(qb.body.items.every((m: any) => m.progress === 0)).toBe(true);
      // Unfinished missions can't be claimed.
      const unfinished = qb.body.items[0];
      expect((await api('POST', `/missions/${unfinished.id}/claim`, {}, b.token)).status).toBe(400);
    });

    it('public config exposes the penalty so the app can warn before quitting', async () => {
      const r = await api('GET', '/config');
      expect(r.body.game.penalties).toMatchObject({ enabled: true, quitCoins: expect.any(Number), quitXp: expect.any(Number) });
    });
  });

  describe('AI question generator', () => {
    it('generates into the review queue, skips duplicates, and approval makes them playable', async () => {
      const cat = await queryOne<{ id: number }>(`SELECT id FROM categories WHERE slug = 'bcs'`);
      const existing = await queryOne<{ text: string }>('SELECT text FROM questions WHERE category_id = ? LIMIT 1', [cat!.id]);
      const calls: any[] = [];
      const fakeFetch = (async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        calls.push(body);
        // First call: the model doesn't support reasoning effort → service retries without it.
        if (calls.length === 1) return new Response(JSON.stringify({ error: { message: 'Unsupported parameter: reasoning.effort' } }), { status: 400 });
        const n = calls.length;
        const questions = [
          { text: `বাংলাদেশের সংবিধান কত সালে গৃহীত হয়? (${n})`, options: ['১৯৭১', '১৯৭২', '১৯৭৩', '১৯৭৪'], correctIndex: 1, explanation: '৪ নভেম্বর ১৯৭২।', difficulty: 'easy', subtopic: 'সংবিধান', sources: ['https://bdlaws.minlaw.gov.bd'] },
          { text: existing?.text ?? 'dup', options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: '', difficulty: 'easy', subtopic: '', sources: [] },
          { text: 'খারাপ প্রশ্ন', options: ['a', 'a', 'b', 'c'], correctIndex: 0, explanation: '', difficulty: 'easy', subtopic: '', sources: [] },
        ];
        return new Response(
          JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ questions }) }] }], usage: { input_tokens: 100, output_tokens: 50 } }),
          { status: 200 },
        );
      }) as any;
      const ai = new AiGeneratorService({ apiKey: 'sk-test', baseUrl: 'https://api.example.test/v1' }, t.ctx.questionsAdmin, { info: () => undefined, error: () => undefined }, fakeFetch);
      await ai.updateSettings({ batchSize: 3 }, null);
      const jobId = await ai.createJob({ categoryId: cat!.id, topic: 'সংবিধান', difficulty: 'mixed', language: 'bn', count: 2 }, null);
      for (let i = 0; i < 50; i++) {
        const j = await queryOne<any>('SELECT status FROM ai_generation_jobs WHERE id = ?', [jobId]);
        if (j.status !== 'queued' && j.status !== 'running') break;
        await new Promise((r) => setTimeout(r, 50));
      }
      const job = (await ai.listJobs()).find((j) => j.id === jobId)!;
      expect(job.status).toBe('done');
      expect(job.created).toBe(2);
      expect(job.duplicates).toBeGreaterThan(0);
      expect(job.invalid).toBeGreaterThan(0);
      expect(calls[0].reasoning).toBeDefined();
      expect(calls[1].reasoning).toBeUndefined();
      expect(calls[1].tools).toEqual([{ type: 'web_search' }]);
      expect(calls[1].input).toContain('সংবিধান');

      const pending = await query<any>(`SELECT id, is_active, source_refs FROM questions WHERE ai_job_id = ? AND review_status = 'pending'`, [jobId]);
      expect(pending).toHaveLength(2);
      expect(pending.every((q) => !q.is_active)).toBe(true);
      expect(JSON.parse(pending[0].source_refs)[0]).toContain('gov.bd');
      // Pending questions are not served.
      const served = await t.ctx.questionSource.pick({ categoryId: cat!.id, count: 500, userIds: [] });
      expect(served.some((q) => pending.some((p) => p.id === q.id))).toBe(false);

      expect(await t.ctx.questionsAdmin.review(pending.map((p) => p.id), 'approve', null)).toBe(2);
      const after = await t.ctx.questionSource.pick({ categoryId: cat!.id, count: 500, userIds: [] });
      expect(pending.every((p) => after.some((q) => q.id === p.id))).toBe(true);
    });

    it('normalises Bangla digits and punctuation for duplicate detection', () => {
      expect(normalizeQuestion('সংবিধান কত সালে? (১৯৭২)')).toBe(normalizeQuestion('সংবিধান  কত সালে (1972)'));
    });

    it('admin endpoints: settings need settings.app, jobs need an API key', async () => {
      const roles = await queryOne<any>(`SELECT (SELECT id FROM admin_roles WHERE role_key='super_admin') s`);
      await exec('INSERT INTO admin_users (email, name, password_hash, role_id) VALUES (?, ?, ?, ?)', ['ai-super@test.dev', 'S', await hashPassword('super-password-1'), roles.s]);
      const token = (await t.app.inject({ method: 'POST', url: '/api/v1/admin/auth/login', payload: { email: 'ai-super@test.dev', password: 'super-password-1' } })).json().accessToken;
      const adm = (method: string, url: string, payload?: unknown) =>
        t.app.inject({ method: method as any, url: `/api/v1/admin${url}`, payload: payload as any, headers: { authorization: `Bearer ${token}` } });
      const s = await adm('GET', '/ai/settings');
      expect(s.statusCode).toBe(200);
      expect(s.json().settings.model).toBe('gpt-5.6-luna');
      expect(s.json().apiKeyConfigured).toBe(false);
      expect(s.json().defaults.systemPrompt).toContain('BCS');
      expect((await adm('PUT', '/ai/settings', { model: 'gpt-test-model' })).json().model).toBe('gpt-test-model');
      const cat = await queryOne<{ id: number }>(`SELECT id FROM categories WHERE slug = 'bank'`);
      const job = await adm('POST', '/ai/jobs', { categoryId: cat!.id, count: 5 });
      expect(job.statusCode).toBe(400);
      expect(job.json().error.code ?? job.json().code).toBe('ai_not_configured');
      const stats = await adm('GET', '/questions/bank-stats');
      expect(stats.json().items.find((c: any) => c.id === cat!.id)).toHaveProperty('live');
      const missions = await adm('GET', '/missions');
      expect(missions.json().items.length).toBeGreaterThan(5);
      expect(missions.json().metrics).toHaveProperty('battle_wins');

      // Connections card: on/off flags only, never secrets.
      const integ = await adm('GET', '/integrations');
      expect(integ.statusCode).toBe(200);
      expect(integ.json().email.configured).toBe(false);
      expect(integ.json().google).toHaveProperty('configured');
      expect(JSON.stringify(integ.json())).not.toMatch(/JWT|PRIVATE|password/i);
      const te = await adm('POST', '/integrations/test-email', { to: 'x@test.dev' });
      expect(te.statusCode).toBe(400);
    });
  });

  describe('emails, language and support settings', () => {
    it('sends one branded welcome email after onboarding, in the player language', async () => {
      const p = await newPlayer('welcome');
      await new Promise((r) => setTimeout(r, 50));
      const email = (await queryOne<any>('SELECT email FROM users WHERE id = ?', [p.id])).email;
      const welcome = t.mailer.sent.filter((m) => m.to === email && m.subject.includes('স্বাগতম'));
      expect(welcome).toHaveLength(1);
      expect(welcome[0].text).toContain('QW-');
      // Onboarding again (e.g. after a username reset) never re-sends it.
      await t.ctx.emails.welcome(p.id);
      expect(t.mailer.sent.filter((m) => m.to === email && m.subject.includes('স্বাগতম'))).toHaveLength(1);
    });

    it('notifications follow the chosen language; activity emails respect verification and the preference', async () => {
      const p = await newPlayer('lang');
      const email = (await queryOne<any>('SELECT email FROM users WHERE id = ?', [p.id])).email;
      const r = await api('PATCH', '/me/preferences', { lang: 'en', emailActivity: true }, p.token);
      expect(r.status).toBe(200);
      const me = await api('GET', '/me', undefined, p.token);
      expect(me.body.user).toMatchObject({ lang: 'en', emailActivity: true, hasPassword: true });

      await t.ctx.notifications.notify(p.id, { type: 'achievement', title: { en: 'Achievement unlocked!', bn: 'নতুন অ্যাচিভমেন্ট!' }, body: { en: 'First Victory', bn: 'প্রথম জয়' } });
      const n = await queryOne<any>(`SELECT title FROM notifications WHERE user_id = ? AND type = 'achievement'`, [p.id]);
      expect(n.title).toBe('Achievement unlocked!');
      await new Promise((r) => setTimeout(r, 50));
      // Not verified yet → no activity email.
      expect(t.mailer.sent.some((m) => m.to === email && m.subject.includes('Achievement'))).toBe(false);

      await exec('UPDATE users SET email_verified_at = UTC_TIMESTAMP() WHERE id = ?', [p.id]);
      await t.ctx.notifications.notify(p.id, { type: 'achievement', title: { en: 'Achievement unlocked!', bn: 'x' }, body: { en: 'Ten Wins', bn: 'x' } });
      await new Promise((r) => setTimeout(r, 50));
      expect(t.mailer.sent.filter((m) => m.to === email && m.subject.includes('Achievement'))).toHaveLength(1);
      // At most one activity email per 12 hours.
      await t.ctx.notifications.notify(p.id, { type: 'achievement', title: { en: 'Achievement unlocked!', bn: 'x' }, body: { en: 'More', bn: 'x' } });
      await new Promise((r) => setTimeout(r, 50));
      expect(t.mailer.sent.filter((m) => m.to === email && m.subject.includes('Achievement'))).toHaveLength(1);
    });

    it('public config carries support email, contacts, music and update settings', async () => {
      const r = await api('GET', '/config');
      expect(r.body.supportEmail).toBe('support.quizwarbd@gmail.com');
      expect(r.body.contacts).toEqual([]);
      expect(r.body.music).toMatchObject({ menuUrl: null, volume: expect.any(Number) });
      expect(r.body.game.leagues[0].icon).toBe('bronze');
    });

    it('recognises audio uploads by magic bytes only', () => {
      expect(audioKind(Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00\x00\x00', 'latin1'))?.ext).toBe('mp3');
      expect(audioKind(Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A \x00\x00', 'latin1')]))?.ext).toBe('m4a');
      expect(audioKind(Buffer.from('OggS\x00\x02\x00\x00\x00\x00\x00\x00', 'latin1'))?.ext).toBe('ogg');
      expect(audioKind(Buffer.from('<?php echo 1; ?>   ', 'latin1'))).toBeNull();
    });
  });

  describe('find online players', () => {
    it('lists available players by closest rating, hides blocked and unavailable ones', async () => {
      const me = await newPlayer('finder');
      const a = await newPlayer('avail');
      const b = await newPlayer('blocked');
      const c = await newPlayer('busy');
      for (const p of [me, a, b]) t.ctx.presence.connect(p.id, `s-${p.id}`, { available: true, dnd: false });
      t.ctx.presence.connect(c.id, `s-${c.id}`, { available: false, dnd: false });
      await api('POST', '/blocks', { userId: b.id }, me.token);
      const r = await api('GET', '/players/online', undefined, me.token);
      expect(r.status).toBe(200);
      const ids = r.body.items.map((x: any) => x.user.id);
      expect(ids).toContain(a.id);
      expect(ids).not.toContain(me.id);
      expect(ids).not.toContain(b.id);
      expect(ids).not.toContain(c.id);
      for (const p of [me, a, b, c]) t.ctx.presence.disconnect(p.id, `s-${p.id}`);
    });
  });

  describe('question count and difficulty', () => {
    it('fills a hard match from neighbouring levels when the bank is short, hardest first', async () => {
      const all = await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM questions q JOIN categories c ON c.id = q.category_id WHERE q.is_active = 1 AND q.review_status = 'approved' AND q.deleted_at IS NULL AND c.is_active = 1`);
      const want = Math.min(12, Number(all!.n));
      const picked = await t.ctx.questionSource.pick({ categoryId: null, count: want, userIds: [], difficulties: ['expert'] });
      expect(picked).toHaveLength(want);
      const experts = Number((await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM questions WHERE difficulty = 'expert' AND is_active = 1 AND review_status = 'approved' AND deleted_at IS NULL`))!.n);
      expect(picked.filter((q) => q.difficulty === 'expert').length).toBe(Math.min(experts, want));
      expect(new Set(picked.map((q) => q.id)).size).toBe(picked.length);
    });

    it('/me reports an open War Room separately from a running match', async () => {
      const p = await newPlayer('roomie');
      const m = await t.ctx.engine.createMatch({ mode: 'duo', source: 'room', players: [{ userId: p.id, username: 'roomie', uid: null, avatarUrl: null, level: 1, rating: 1000, team: 0 }] });
      const me = await api('GET', '/me', undefined, p.token);
      expect(me.body.activeMatchId).toBeNull();
      expect(me.body.openRoomId).toBe(m.id);
      await t.ctx.engine.leaveLobby(m.id, p.id);
    });
  });

  describe('war room codes and settings', () => {
    it('gives rooms a short code, lets only the host change rules, supports a time limit', async () => {
      const host = await newPlayer('host');
      const guest = await newPlayer('guest');
      const who = (id: number, n: string) => ({ userId: id, username: n, uid: null, avatarUrl: null, level: 1, rating: 1000 });
      const m = await t.ctx.engine.createMatch({ mode: 'duel', source: 'room', hostUserId: host.id, players: [{ ...who(host.id, 'host'), team: 0 }] });
      expect(m.roomCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(t.ctx.engine.get(m.roomCode!.toLowerCase())?.id).toBe(m.id);
      await t.ctx.engine.joinMatch(m.id, who(guest.id, 'guest'));
      expect(() => t.ctx.engine.updateRoom(m.id, guest.id, { questionCount: 100 })).toThrow(/host/);
      t.ctx.engine.updateRoom(m.id, host.id, { questionCount: 300, difficulty: 'hard', questionTimeSec: 5 });
      expect(m.questionCount).toBe(300);
      expect(m.difficulties).toEqual(['hard']);
      t.ctx.engine.updateRoom(m.id, host.id, { totalTimeSec: 600 });
      expect(m.totalTimeSec).toBe(600);
      expect(m.questionCount).toBeNull();
      expect(t.ctx.engine.snapshot(m, host.id).roomCode).toBe(m.roomCode);
      const third = await newPlayer('third');
      await expect(t.ctx.engine.joinMatch(m.id, who(third.id, 'third'))).rejects.toThrow(/full/i);
      await t.ctx.engine.leaveLobby(m.id, guest.id);
      await t.ctx.engine.leaveLobby(m.id, host.id);
    });
  });

  describe('verified badge', () => {
    it('cannot be bought without the win-rate requirement; admins can grant it and it shows publicly', async () => {
      const p = await newPlayer('verif');
      const st = await api('GET', '/verified', undefined, p.token);
      expect(st.body.eligible).toBe(false);
      expect(st.body.price).toBe(50000);
      const claim = await api('POST', '/verified/claim', {}, p.token);
      expect(claim.status).toBe(403);
      await t.ctx.verified.setByAdmin(p.id, true);
      const uid = (await queryOne<any>('SELECT uid FROM users WHERE id = ?', [p.id])).uid;
      const pub = await api('GET', `/users/${uid}`, undefined, p.token);
      expect(pub.body.user.verified).toBe(true);
      expect((await api('GET', '/verified', undefined, p.token)).body.verified).toBe(true);
    });
  });

  describe('uploads survive a redeploy', () => {
    it('keeps a database copy and restores wiped files on sync and on request', async () => {
      const { rm, readFile } = await import('node:fs/promises');
      const path = await import('node:path');
      const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
      const url = await t.ctx.storage.put('test/redeploy.png', png, 'image/png');
      const row = await queryOne<any>('SELECT size, content_type FROM media_files WHERE media_key = ?', ['test/redeploy.png']);
      expect(row.size).toBe(png.length);
      const file = path.resolve(t.ctx.env.STORAGE_LOCAL_DIR, 'test/redeploy.png');
      await rm(file);
      const res = await t.app.inject({ method: 'GET', url: '/media/test/redeploy.png' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(Buffer.compare(res.rawPayload, png)).toBe(0);
      await rm(file);
      expect((await t.ctx.storage.syncFromBackup()).restored).toBeGreaterThanOrEqual(1);
      expect(Buffer.compare(await readFile(file), png)).toBe(0);
      await t.ctx.storage.remove(url);
      expect(await queryOne('SELECT 1 x FROM media_files WHERE media_key = ?', ['test/redeploy.png'])).toBeFalsy();
    });
  });

  it('"your rank" matches your place in the list, even with tied ratings', async () => {
    const ps = [await newPlayer('Tie'), await newPlayer('Tie'), await newPlayer('Tie')];
    for (const [k, p] of ps.entries())
      await exec('UPDATE user_profiles SET rating = 9000, total_games = 5, wins = ?, xp = 50 WHERE user_id = ?', [k, p.id]);
    const list = await api('GET', '/leaderboards/global?page=1&pageSize=50');
    for (const p of ps) {
      const r = await api('GET', '/leaderboards/global?page=1&pageSize=50', undefined, p.token);
      const pos = list.body.items.findIndex((e: any) => Number(e.user.id) === p.id) + 1;
      expect(pos).toBeGreaterThan(0);
      expect(r.body.me.rank).toBe(pos);
    }
  });

  describe('player chat', () => {
    it('sends, lists, marks read, respects blocks, and purges after 7 days', async () => {
      const a = await newPlayer('chatA');
      const b = await newPlayer('chatB');
      const uidOf = async (id: number) => (await queryOne<any>('SELECT uid FROM users WHERE id = ?', [id])).uid as string;
      const [ua, ub] = [await uidOf(a.id), await uidOf(b.id)];

      const s = await api('POST', `/chats/${ub}/messages`, { body: '  হাই 👋\u0000  ' }, a.token);
      expect(s.status).toBe(200);
      expect(s.body.message.body).toBe('হাই 👋');
      expect((await api('POST', `/chats/${ua}/messages`, { body: '   ' }, a.token)).status).toBe(400);

      const unread = await api('GET', '/chats/unread', undefined, b.token);
      expect(unread.body.count).toBe(1);
      const list = await api('GET', '/chats', undefined, b.token);
      expect(list.body.items[0].peer.uid).toBe(ua);
      expect(list.body.items[0].unread).toBe(1);

      const hist = await api('GET', `/chats/${ua}/messages`, undefined, b.token);
      expect(hist.body.items.map((m: any) => m.body)).toEqual(['হাই 👋']);
      await api('POST', `/chats/${ua}/read`, {}, b.token);
      expect((await api('GET', '/chats/unread', undefined, b.token)).body.count).toBe(0);

      // Blocked either way: no more messages.
      await api('POST', '/blocks', { userId: a.id }, b.token);
      expect((await api('POST', `/chats/${ub}/messages`, { body: 'hello?' }, a.token)).status).toBe(403);
      expect((await api('POST', `/chats/${ua}/messages`, { body: 'hello?' }, b.token)).body.error.code).toBe('blocked_by_you');
      await api('DELETE', `/blocks/${a.id}`, undefined, b.token);

      await exec('UPDATE chat_messages SET created_at = NOW() - INTERVAL 8 DAY WHERE sender_id = ?', [a.id]);
      expect(await t.ctx.chat.purgeOld()).toBeGreaterThanOrEqual(1);
      expect((await api('GET', `/chats/${ua}/messages`, undefined, b.token)).body.items).toHaveLength(0);
    });
  });
});

describe('smtp config', () => {
  it('builds a Gmail transport from host/user/pass and strips app-password spaces', () => {
    expect(smtpConfigFromEnv({})).toBeNull();
    expect(smtpConfigFromEnv({ SMTP_URL: 'smtps://a:b@x:465' })).toBe('smtps://a:b@x:465');
    expect(smtpConfigFromEnv({ SMTP_HOST: 'smtp.gmail.com', SMTP_USER: 'a@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop' })).toEqual({
      host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'a@gmail.com', pass: 'abcdefghijklmnop' },
    });
    expect((smtpConfigFromEnv({ SMTP_HOST: 'h', SMTP_PORT: 587 }) as any).secure).toBe(false);
  });
});
