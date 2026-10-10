import { gameSettingsSchema, paginationSchema, questionInputSchema, type GameSettings } from '@quizwar/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { exec, parseJson, query, queryOne, tx } from '../db/pool';
import { clearRefreshCookie, requireAdmin, requireCsrfHeader, setRefreshCookie } from '../http/guards';
import { hashPassword } from '../lib/crypto';
import { AppError, badRequest, notFound, unauthorized } from '../lib/errors';
import { parse } from '../lib/validate';
import { audit } from '../modules/admin/admin.auth';
import { categoryInputSchema } from '../modules/questions/category.service';
import { aiJobInputSchema, aiSettingsSchema } from '../modules/ai/ai-generator.service';
import { MISSION_METRICS, missionInputSchema } from '../modules/missions/mission.service';
import { SmtpMailer } from '../modules/auth/mailer';
import { renderEmail } from '../modules/emails/email.service';

const COOKIE = 'qw_admin_rt';
const COOKIE_PATH = '/api/v1/admin/auth';
const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function adminRoutes(app: FastifyInstance, ctx: AppContext) {
  const secure = ctx.env.NODE_ENV === 'production' || ctx.env.NODE_ENV === 'staging';
  const meta = (req: FastifyRequest) => ({ ip: req.ip, userAgent: req.headers['user-agent'] ?? null });
  const can = (...perms: string[]) => ({ preHandler: requireAdmin(ctx, ...perms) });
  const log = (req: FastifyRequest, action: string, target: Parameters<typeof audit>[2]) => audit(req.admin!, action, target, meta(req));

  /* ------------------------------- Auth ------------------------------- */
  app.post('/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = parse(z.object({ email: z.string().email().max(190), password: z.string().min(1).max(128) }), req.body);
    const t = await ctx.adminAuth.login(b.email, b.password, meta(req));
    setRefreshCookie(reply, COOKIE, COOKIE_PATH, t.refreshToken, ctx.env.ADMIN_SESSION_TTL_HOURS * 3600, secure);
    return { accessToken: t.accessToken, expiresIn: t.expiresIn };
  });
  app.post('/auth/refresh', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    requireCsrfHeader(req);
    const token = req.cookies[COOKIE];
    if (!token) throw unauthorized();
    const t = await ctx.adminAuth.refresh(token, meta(req));
    setRefreshCookie(reply, COOKIE, COOKIE_PATH, t.refreshToken, ctx.env.ADMIN_SESSION_TTL_HOURS * 3600, secure);
    return { accessToken: t.accessToken, expiresIn: t.expiresIn };
  });
  app.post('/auth/logout', async (req, reply) => {
    requireCsrfHeader(req);
    const token = req.cookies[COOKIE];
    if (token) await ctx.adminAuth.logout(token);
    clearRefreshCookie(reply, COOKIE, COOKIE_PATH, secure);
    return { ok: true };
  });
  app.get('/auth/me', can(), async (req) => ({ ...req.admin!, permissions: [...req.admin!.permissions] }));

  /* ----------------------------- Dashboard ---------------------------- */
  app.get('/dashboard', can('dashboard.view'), async () => {
    const one = async (sql: string, p: unknown[] = []) => Number((await queryOne<{ n: number }>(sql, p))?.n ?? 0);
    const [totalUsers, newUsersToday, gamesToday, battlesToday, aiToday, questions, activeStreaks, openReports, flagged] = await Promise.all([
      one(`SELECT COUNT(*) n FROM users WHERE status <> 'deleted'`),
      one(`SELECT COUNT(*) n FROM users WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)`),
      one(`SELECT COUNT(*) n FROM matches WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) AND status = 'finished'`),
      one(`SELECT COUNT(*) n FROM matches WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) AND status = 'finished' AND match_type = 'pvp'`),
      one(`SELECT COUNT(*) n FROM matches WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) AND status = 'finished' AND match_type = 'ai'`),
      one(`SELECT COUNT(*) n FROM questions WHERE deleted_at IS NULL AND is_active = 1 AND review_status = 'approved'`),
      one(`SELECT COUNT(*) n FROM user_profiles WHERE streak_days >= 2 AND last_active_date >= DATE_SUB(UTC_DATE(), INTERVAL 1 DAY)`),
      one(`SELECT COUNT(*) n FROM reports WHERE status IN ('open','reviewing')`),
      one(`SELECT COUNT(*) n FROM matches WHERE flagged = 1 AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)`),
    ]);
    const series = await query<any>(
      `SELECT d.day,
         (SELECT COUNT(*) FROM users u WHERE DATE(u.created_at) = d.day) AS users,
         (SELECT COUNT(*) FROM matches m WHERE DATE(m.created_at) = d.day AND m.status = 'finished') AS games,
         (SELECT COUNT(*) FROM matches m WHERE DATE(m.created_at) = d.day AND m.status = 'finished' AND m.match_type = 'pvp') AS pvp,
         (SELECT COUNT(*) FROM matches m WHERE DATE(m.created_at) = d.day AND m.status = 'finished' AND m.match_type = 'ai') AS ai,
         (SELECT COUNT(DISTINCT mp.user_id) FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE DATE(m.created_at) = d.day) AS active
       FROM (SELECT DATE(DATE_SUB(UTC_DATE(), INTERVAL n DAY)) AS day FROM
             (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8
              UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13) x) d ORDER BY d.day`,
    );
    const categories = await query<any>(
      `SELECT c.name, c.icon, COUNT(*) AS games FROM matches m JOIN categories c ON c.id = m.category_id
       WHERE m.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) GROUP BY c.id, c.name, c.icon ORDER BY games DESC LIMIT 10`,
    );
    // D1 retention of users who signed up 2–8 days ago: played again on the day after signup.
    const retention = await queryOne<any>(
      `SELECT COUNT(*) AS cohort, SUM(EXISTS(SELECT 1 FROM match_players mp JOIN matches m ON m.id = mp.match_id
          WHERE mp.user_id = u.id AND DATE(m.created_at) = DATE(DATE_ADD(u.created_at, INTERVAL 1 DAY)))) AS returned
       FROM users u WHERE u.created_at BETWEEN DATE_SUB(UTC_TIMESTAMP(), INTERVAL 8 DAY) AND DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY)`,
    );
    const mem = process.memoryUsage();
    return {
      totals: {
        totalUsers,
        onlineUsers: await ctx.presence.onlineCount(),
        newUsersToday,
        gamesToday,
        battlesToday,
        aiMatchesToday: aiToday,
        questions,
        activeStreaks,
        openReports,
        flaggedMatches7d: flagged,
        liveMatches: ctx.engine.liveMatches().length,
        queue: ctx.matchmaking.size(),
      },
      series: series.map((s) => ({ day: s.day, users: Number(s.users), games: Number(s.games), pvp: Number(s.pvp), ai: Number(s.ai), active: Number(s.active) })),
      categories: categories.map((c) => ({ ...c, games: Number(c.games) })),
      retention: { cohort: Number(retention?.cohort ?? 0), d1: Number(retention?.cohort) ? Math.round((Number(retention.returned) / Number(retention.cohort)) * 1000) / 10 : null },
      server: { uptimeSec: Math.round(process.uptime()), rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576), node: process.version, redis: !!ctx.redis },
    };
  });

  /* ------------------------------ Players ----------------------------- */
  app.get('/users', can('users.view'), async (req) => {
    const q = parse(paginationSchema.extend({ q: z.string().max(100).default(''), status: z.enum(['active', 'suspended', 'banned', 'deleted', '']).default('') }), req.query);
    const where = ['1=1'];
    const p: unknown[] = [];
    if (q.q) {
      where.push('(u.uid = ? OR p.username LIKE ? OR u.email = ?)');
      p.push(q.q.toUpperCase(), `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`, q.q.toLowerCase());
    }
    if (q.status) (where.push('u.status = ?'), p.push(q.status));
    const total = await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE ${where.join(' AND ')}`, p);
    const items = await query<any>(
      `SELECT u.id, u.uid, u.status, u.created_at AS createdAt, u.last_login_at AS lastLoginAt, u.suspended_until AS suspendedUntil,
              p.username, p.avatar_thumb_url AS avatar, p.level, p.rating, p.league, p.total_games AS games, p.coins,
              (u.email IS NOT NULL) AS hasEmail, (u.google_sub IS NOT NULL) AS hasGoogle
       FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE ${where.join(' AND ')} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
      [...p, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { total: Number(total?.n ?? 0), items: items.map((i) => ({ ...i, hasEmail: !!i.hasEmail, hasGoogle: !!i.hasGoogle, online: ctx.presence.isOnline(i.id) })) };
  });

  app.get('/users/:id', can('users.view'), async (req) => {
    const { id } = parse(idParam, req.params);
    // Email is masked; password hashes, tokens and passkey material are never returned.
    const u = await queryOne<any>(
      `SELECT u.id, u.uid, u.email, u.email_verified_at AS emailVerifiedAt, (u.password_hash IS NOT NULL) AS hasPassword, (u.google_sub IS NOT NULL) AS hasGoogle,
              u.status, u.suspended_until AS suspendedUntil, u.moderation_reason AS moderationReason, u.created_at AS createdAt, u.last_login_at AS lastLoginAt,
              p.*, (SELECT COUNT(*) FROM passkeys pk WHERE pk.user_id = u.id) AS passkeys
       FROM users u JOIN user_profiles p ON p.user_id = u.id WHERE u.id = ?`,
      [id],
    );
    if (!u) throw notFound('Player not found');
    const email = u.email ? String(u.email).replace(/^(.)(.*)(.@.*)$/, (_m: string, a: string, b: string, c: string) => a + '*'.repeat(Math.min(6, b.length)) + c) : null;
    const moderation = await query<any>(
      `SELECT m.id, m.action, m.reason, m.until_at AS untilAt, m.created_at AS createdAt, a.name AS admin FROM moderation_actions m
       LEFT JOIN admin_users a ON a.id = m.admin_id WHERE m.user_id = ? ORDER BY m.id DESC LIMIT 50`,
      [id],
    );
    const reports = await query<any>(`SELECT id, reason, status, created_at AS createdAt FROM reports WHERE target_user_id = ? ORDER BY id DESC LIMIT 50`, [id]);
    return {
      user: { ...u, email, hasPassword: !!u.hasPassword, hasGoogle: !!u.hasGoogle, passkeys: Number(u.passkeys), online: ctx.presence.status(id) },
      moderation,
      reports,
      activeMatchId: ctx.engine.activeMatchOf(id)?.id ?? null,
    };
  });

  app.get('/users/:id/matches', can('users.view'), async (req) => {
    const { id } = parse(idParam, req.params);
    const q = parse(paginationSchema, req.query);
    return { items: await ctx.profile.matchHistory(id, q.page, q.pageSize) };
  });
  app.get('/users/:id/logins', can('users.view'), async (req) => ({ items: await ctx.auth.loginHistory(parse(idParam, req.params).id, 100) }));

  app.post('/users/:id/verified', can('users.moderate'), async (req) => {
    const id = Number((req.params as any).id);
    const b = parse(z.object({ verified: z.boolean() }), req.body);
    await ctx.verified.setByAdmin(id, b.verified);
    await log(req, b.verified ? 'user.verify' : 'user.unverify', { type: 'user', id });
    return { ok: true };
  });
  app.post('/users/:id/moderate', can('users.moderate'), async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(
      z.object({ action: z.enum(['warn', 'suspend', 'ban', 'unban', 'unsuspend']), reason: z.string().trim().min(3).max(500), hours: z.number().int().min(1).max(24 * 365).optional(), reportId: z.number().int().optional() }),
      req.body,
    );
    return moderate(ctx, req, id, b.action, b.reason, b.hours, b.reportId ?? null);
  });

  app.post('/users/:id/reset', can('users.reset'), async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(z.object({ field: z.enum(['username', 'avatar', 'bio']), reason: z.string().trim().min(3).max(500) }), req.body);
    const before = await queryOne<any>('SELECT username, avatar_url, bio FROM user_profiles WHERE user_id = ?', [id]);
    if (!before) throw notFound('Player not found');
    if (b.field === 'avatar') await ctx.profile.removeAvatar(id);
    if (b.field === 'bio') await exec('UPDATE user_profiles SET bio = NULL WHERE user_id = ?', [id]);
    if (b.field === 'username') {
      // Force the player to choose a new username on next launch.
      await exec('UPDATE user_profiles SET username = NULL, onboarded_at = NULL WHERE user_id = ?', [id]);
    }
    await exec(`INSERT INTO moderation_actions (user_id, admin_id, action, reason) VALUES (?, ?, ?, ?)`, [id, req.admin!.id, `reset_${b.field}`, b.reason]);
    await log(req, `user.reset_${b.field}`, { type: 'user', id, before, summary: b.reason });
    await ctx.notifications.notify(id, { type: 'moderation', title: { en: 'Profile updated by moderators', bn: 'মডারেটর আপনার প্রোফাইল আপডেট করেছেন' }, body: { en: `Your ${b.field} was reset: ${b.reason}`, bn: `আপনার ${b.field} রিসেট করা হয়েছে: ${b.reason}` }, url: '/profile' });
    return { ok: true };
  });

  /* ----------------------------- Questions ---------------------------- */
  app.get('/questions', can('questions.view'), async (req) => {
    const q = parse(
      paginationSchema.extend({
        q: z.string().max(200).optional(),
        categoryId: z.coerce.number().int().positive().optional(),
        difficulty: z.enum(['easy', 'medium', 'hard', 'expert']).optional(),
        active: z.enum(['true', 'false']).optional(),
        review: z.enum(['approved', 'pending', 'rejected']).optional(),
        aiJobId: z.coerce.number().int().positive().optional(),
      }),
      req.query,
    );
    return ctx.questionsAdmin.list({ ...q, active: q.active === undefined ? undefined : q.active === 'true' });
  });
  app.get('/questions/export', can('questions.manage'), async (req, reply) => {
    const q = parse(z.object({ format: z.enum(['csv', 'json']).default('csv'), categoryId: z.coerce.number().int().positive().optional() }), req.query);
    const body = await ctx.questionsAdmin.export(q.format, q.categoryId);
    await log(req, 'question.export', { type: 'question', summary: `Exported questions as ${q.format}` });
    reply.header('content-type', q.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="quizwar-questions.${q.format}"`);
    return body;
  });
  app.get('/questions/:id', can('questions.view'), async (req) => ctx.questionsAdmin.get(parse(idParam, req.params).id));
  app.post('/questions', can('questions.manage'), async (req) => {
    const input = parse(questionInputSchema, req.body);
    const id = await ctx.questionsAdmin.create(input, req.admin!.id);
    await log(req, 'question.create', { type: 'question', id, after: input, summary: input.text.slice(0, 120) });
    return { id };
  });
  app.put('/questions/:id', can('questions.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    const input = parse(questionInputSchema, req.body);
    const before = await ctx.questionsAdmin.get(id);
    await ctx.questionsAdmin.update(id, input, req.admin!.id);
    await log(req, 'question.update', { type: 'question', id, before, after: input });
    return { ok: true };
  });
  app.delete('/questions/:id', can('questions.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    const before = await ctx.questionsAdmin.get(id);
    await ctx.questionsAdmin.remove(id);
    await log(req, 'question.delete', { type: 'question', id, before, summary: `Deleted question ${id}` });
    return { ok: true };
  });
  app.post('/questions/:id/duplicate', can('questions.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    const newId = await ctx.questionsAdmin.duplicate(id, req.admin!.id);
    await log(req, 'question.duplicate', { type: 'question', id: newId, summary: `Duplicated from ${id}` });
    return { id: newId };
  });
  app.patch('/questions/:id/active', can('questions.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(z.object({ active: z.boolean() }), req.body);
    await ctx.questionsAdmin.setActive(id, b.active);
    await log(req, b.active ? 'question.activate' : 'question.deactivate', { type: 'question', id });
    return { ok: true };
  });
  app.post('/questions/import', { ...can('questions.manage'), bodyLimit: 10 * 1024 * 1024 }, async (req) => {
    const b = parse(z.object({ format: z.enum(['csv', 'json']), content: z.string().min(1).max(10 * 1024 * 1024) }), req.body);
    const res = await ctx.questionsAdmin.import(b.format, b.content, req.admin!.id);
    await log(req, 'question.import', { type: 'question', summary: `Imported ${res.created}/${res.total} (${res.skipped} duplicates, ${res.errors.length} errors)` });
    ctx.categories.invalidate();
    return res;
  });
  app.get('/questions/bank-stats', can('questions.view'), async () => ({ items: await ctx.questionsAdmin.bankStats() }));
  app.post('/questions/review', can('questions.manage'), async (req) => {
    const b = parse(z.object({ ids: z.array(z.number().int().positive()).min(1).max(500), action: z.enum(['approve', 'reject']) }), req.body);
    const n = await ctx.questionsAdmin.review(b.ids, b.action, req.admin!.id);
    await log(req, `question.${b.action}`, { type: 'question', summary: `${b.action === 'approve' ? 'Approved' : 'Rejected'} ${n} AI questions` });
    ctx.categories.invalidate();
    return { updated: n };
  });

  /* ---------------------------- AI generator --------------------------- */
  app.get('/ai/settings', can('questions.manage'), async () => ({
    settings: await ctx.ai.settings(),
    defaults: ctx.ai.defaults(),
    apiKeyConfigured: ctx.ai.configured,
  }));
  app.put('/ai/settings', can('settings.app'), async (req) => {
    const b = parse(aiSettingsSchema.partial(), req.body);
    const before = await ctx.ai.settings();
    const after = await ctx.ai.updateSettings(b, req.admin!.id);
    await log(req, 'ai.settings', { type: 'settings', before: { ...before, systemPrompt: undefined }, after: { ...after, systemPrompt: undefined }, summary: `AI model ${after.model}` });
    return after;
  });
  app.post('/ai/test', { ...can('questions.manage'), config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(z.object({ model: z.string().trim().max(80).optional() }), req.body ?? {});
    return ctx.ai.test(b.model);
  });
  app.get('/ai/jobs', can('questions.manage'), async () => ({ items: await ctx.ai.listJobs() }));
  app.post('/ai/jobs', { ...can('questions.manage'), config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(aiJobInputSchema, req.body);
    const id = await ctx.ai.createJob(b, req.admin!.id);
    await log(req, 'ai.job', { type: 'question', id, summary: `AI: ${b.count} questions (category ${b.categoryId}${b.topic ? `, ${b.topic}` : ''})` });
    return { id };
  });
  app.post('/ai/jobs/:id/cancel', can('questions.manage'), async (req) => {
    await ctx.ai.cancelJob(parse(idParam, req.params).id);
    return { ok: true };
  });

  /* ------------------------------ Missions ----------------------------- */
  app.get('/missions', can('content.manage'), async () => ({ items: await ctx.missions.adminList(), metrics: MISSION_METRICS }));
  app.post('/missions', can('content.manage'), async (req) => {
    const b = parse(missionInputSchema, req.body);
    const id = await ctx.missions.create(b);
    await log(req, 'mission.create', { type: 'mission', id, after: b, summary: b.title });
    return { id };
  });
  app.put('/missions/:id', can('content.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(missionInputSchema, req.body);
    await ctx.missions.update(id, b);
    await log(req, 'mission.update', { type: 'mission', id, after: b, summary: b.title });
    return { ok: true };
  });
  app.delete('/missions/:id', can('content.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    await ctx.missions.remove(id);
    await log(req, 'mission.delete', { type: 'mission', id });
    return { ok: true };
  });

  app.post('/questions/image', can('questions.manage'), async (req) => {
    const file = await (req as any).file({ limits: { fileSize: ctx.env.UPLOAD_MAX_BYTES, files: 1 } });
    if (!file) throw badRequest('No file uploaded');
    return ctx.images.questionImage(await file.toBuffer());
  });

  /* ----------------------------- Categories --------------------------- */
  app.post('/categories/icon', can('categories.manage'), async (req) => {
    const file = await (req as any).file({ limits: { fileSize: Math.min(ctx.env.UPLOAD_MAX_BYTES, 2 * 1024 * 1024), files: 1 } });
    if (!file) throw badRequest('No file uploaded');
    return ctx.images.categoryIcon(await file.toBuffer());
  });
  app.get('/categories', can('questions.view'), async () => ({ items: await ctx.categories.listAdmin() }));
  app.post('/categories', can('categories.manage'), async (req) => {
    const b = parse(categoryInputSchema, req.body);
    const id = await ctx.categories.create(b);
    await log(req, 'category.create', { type: 'category', id, after: b });
    return { id };
  });
  app.put('/categories/:id', can('categories.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(categoryInputSchema, req.body);
    const before = await queryOne('SELECT * FROM categories WHERE id = ?', [id]);
    await ctx.categories.update(id, b);
    await log(req, 'category.update', { type: 'category', id, before, after: b });
    return { ok: true };
  });
  app.delete('/categories/:id', can('categories.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    const before = await queryOne('SELECT * FROM categories WHERE id = ?', [id]);
    await ctx.categories.remove(id);
    await log(req, 'category.delete', { type: 'category', id, before });
    return { ok: true };
  });
  app.post('/categories/reorder', can('categories.manage'), async (req) => {
    const b = parse(z.object({ ids: z.array(z.number().int().positive()).max(500) }), req.body);
    await ctx.categories.reorder(b.ids);
    await log(req, 'category.reorder', { type: 'category', after: b.ids });
    return { ok: true };
  });

  /* ------------------------------ Matches ----------------------------- */
  app.get('/matches/live', can('matches.view'), async () => ({
    // Correct answers are deliberately not exposed for live matches.
    items: ctx.engine.liveMatches().map((m) => ({
      id: m.id,
      mode: m.mode.key,
      type: m.type,
      ranked: m.ranked,
      state: m.state,
      category: m.category?.name ?? null,
      currentQuestion: m.currentIndex + 1,
      questionCount: m.questionCount,
      startedAt: m.startedAt,
      durationSec: m.startedAt ? Math.round((Date.now() - m.startedAt) / 1000) : 0,
      flags: m.flags,
      teamScores: ctx.engine.teamScores(m),
      players: m.players.map((p) => ({ userId: p.userId, username: p.username, uid: p.uid, team: p.team, isBot: p.isBot, connected: p.connected, forfeited: p.forfeited, score: p.score })),
    })),
  }));
  app.get('/matches', can('matches.view'), async (req) => {
    const q = parse(paginationSchema.extend({ flagged: z.enum(['true', 'false']).optional(), type: z.enum(['pvp', 'ai', 'solo', 'daily']).optional() }), req.query);
    const where = ['1=1'];
    const p: unknown[] = [];
    if (q.flagged === 'true') where.push('m.flagged = 1');
    if (q.type) (where.push('m.match_type = ?'), p.push(q.type));
    const items = await query<any>(
      `SELECT m.id, m.mode, m.match_type AS type, m.ranked, m.status, m.winner_team AS winnerTeam, m.end_reason AS endReason, m.flagged, m.flag_reason AS flagReason,
              m.created_at AS createdAt, m.ended_at AS endedAt, c.name AS category,
              (SELECT GROUP_CONCAT(COALESCE(pp.username, mp.bot_name) ORDER BY mp.team SEPARATOR ' vs ') FROM match_players mp
                 LEFT JOIN user_profiles pp ON pp.user_id = mp.user_id WHERE mp.match_id = m.id) AS players
       FROM matches m LEFT JOIN categories c ON c.id = m.category_id WHERE ${where.join(' AND ')} ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      [...p, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { items: items.map((i) => ({ ...i, ranked: !!i.ranked, flagged: !!i.flagged })) };
  });
  app.get('/matches/:id', can('matches.view'), async (req) => {
    const id = String((req.params as any).id);
    const m = await queryOne<any>('SELECT * FROM matches WHERE id = ?', [id]);
    if (!m) throw notFound('Match not found');
    const players = await query<any>(
      `SELECT mp.*, p.username, u.uid FROM match_players mp LEFT JOIN user_profiles p ON p.user_id = mp.user_id LEFT JOIN users u ON u.id = mp.user_id WHERE mp.match_id = ?`,
      [id],
    );
    const events = await query<any>('SELECT type, user_id AS userId, data, created_at AS createdAt FROM match_events WHERE match_id = ? ORDER BY id LIMIT 500', [id]);
    // Answer timing is shown for finished matches only (for cheating investigations).
    const answers =
      m.status === 'finished' || m.status === 'aborted'
        ? await query<any>(
            'SELECT match_player_id AS matchPlayerId, question_index AS q, option_index AS optionIndex, is_correct AS correct, response_ms AS ms, points, power_up AS powerUp FROM match_answers WHERE match_id = ? ORDER BY question_index',
            [id],
          )
        : [];
    return { match: { ...m, settings_json: parseJson(m.settings_json) }, players, events: events.map((e) => ({ ...e, data: parseJson(e.data) })), answers };
  });
  app.post('/matches/:id/abort', can('matches.manage'), async (req) => {
    const id = String((req.params as any).id);
    ctx.engine.adminAbort(id);
    await log(req, 'match.abort', { type: 'match', id });
    return { ok: true };
  });

  /* ------------------------------ Reports ----------------------------- */
  app.get('/reports', can('reports.view'), async (req) => {
    const q = parse(paginationSchema.extend({ status: z.enum(['open', 'reviewing', 'dismissed', 'actioned', 'all']).default('open') }), req.query);
    const items = await query<any>(
      `SELECT r.id, r.reason, r.details, r.status, r.action, r.created_at AS createdAt, r.match_id AS matchId, r.handled_at AS handledAt,
              rp.username AS reporter, ru.uid AS reporterUid, tp.username AS target, tu.uid AS targetUid, r.target_user_id AS targetUserId,
              (SELECT COUNT(*) FROM reports r2 WHERE r2.target_user_id = r.target_user_id) AS targetReportCount
       FROM reports r LEFT JOIN user_profiles rp ON rp.user_id = r.reporter_id LEFT JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN user_profiles tp ON tp.user_id = r.target_user_id LEFT JOIN users tu ON tu.id = r.target_user_id
       ${q.status === 'all' ? '' : 'WHERE r.status = ?'} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      q.status === 'all' ? [q.pageSize, (q.page - 1) * q.pageSize] : [q.status, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { items: items.map((i) => ({ ...i, targetReportCount: Number(i.targetReportCount) })) };
  });
  app.get('/reports/:id', can('reports.view'), async (req) => {
    const r = await queryOne<any>('SELECT * FROM reports WHERE id = ?', [parse(idParam, req.params).id]);
    if (!r) throw notFound('Report not found');
    return { ...r, evidence: parseJson(r.evidence) };
  });
  app.post('/reports/:id/resolve', can('reports.handle'), async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(z.object({ action: z.enum(['dismiss', 'warn', 'suspend', 'ban']), note: z.string().trim().max(500).default(''), hours: z.number().int().min(1).max(8760).optional() }), req.body);
    const r = await queryOne<any>('SELECT id, target_user_id, status FROM reports WHERE id = ?', [id]);
    if (!r) throw notFound('Report not found');
    if (b.action !== 'dismiss') {
      if (!req.admin!.permissions.has('users.moderate')) throw new AppError(403, 'forbidden', 'You cannot moderate players');
      if (!r.target_user_id) throw badRequest('This report has no player attached');
      await moderate(ctx, req, r.target_user_id, b.action, b.note || `Report #${id}`, b.hours, id);
    }
    await exec(`UPDATE reports SET status = ?, action = ?, admin_note = ?, handled_by_admin_id = ?, handled_at = UTC_TIMESTAMP() WHERE id = ?`, [
      b.action === 'dismiss' ? 'dismissed' : 'actioned',
      b.action,
      b.note || null,
      req.admin!.id,
      id,
    ]);
    await log(req, 'report.resolve', { type: 'report', id, after: b });
    return { ok: true };
  });

  /* --------------------------- Integrations --------------------------- */
  // Which server-side services are configured. Never returns secrets — only on/off and public ids.
  app.get('/integrations', can('dashboard.view'), async () => {
    const env = ctx.env;
    const appS = ctx.settings.app();
    const origins = ctx.passkeys.origins;
    const fingerprints = (env.ANDROID_SHA256_CERT_FINGERPRINTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const smtpHost = env.SMTP_HOST ?? (env.SMTP_URL ? (() => { try { return new URL(env.SMTP_URL!).hostname; } catch { return 'custom'; } })() : null);
    return {
      google: {
        configured: !!env.GOOGLE_CLIENT_ID,
        enabled: appS.googleLoginEnabled,
        clientId: env.GOOGLE_CLIENT_ID ?? null,
        extraAudiences: (env.GOOGLE_EXTRA_AUDIENCES ?? '').split(',').filter(Boolean).length,
      },
      passkey: {
        enabled: appS.passkeyEnabled,
        rpId: env.WEBAUTHN_RP_ID,
        webOrigins: origins.filter((o) => !o.startsWith('android:')),
        androidOrigin: origins.some((o) => o.startsWith('android:apk-key-hash:')),
        androidFingerprints: fingerprints.length,
        rpMatchesSite: (() => { try { return new URL(env.PUBLIC_WEB_URL).hostname.endsWith(env.WEBAUTHN_RP_ID); } catch { return false; } })(),
        lastError: ctx.passkeys.lastError,
      },
      email: { configured: ctx.mailer instanceof SmtpMailer, host: smtpHost, from: env.MAIL_FROM },
      push: ctx.push.status,
      ai: { configured: ctx.ai.configured },
      publicWebUrl: env.PUBLIC_WEB_URL,
    };
  });
  app.post('/integrations/test-email', { ...can('settings.app'), config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req) => {
    const b = parse(z.object({ to: z.string().email().max(190) }), req.body);
    if (ctx.mailer instanceof SmtpMailer) {
      try {
        await ctx.mailer.verify();
      } catch (err: any) {
        throw new AppError(400, 'smtp_failed', `SMTP login failed: ${String(err?.message ?? err).slice(0, 200)}`);
      }
    } else throw new AppError(400, 'smtp_missing', 'SMTP is not configured on the server');
    const appS = ctx.settings.app();
    const mail = renderEmail(ctx.env.PUBLIC_WEB_URL, appS.supportEmail, {
      preheader: 'SMTP পরীক্ষা সফল · SMTP test',
      title: 'ইমেইল কাজ করছে · Email works',
      intro: 'এটি QUIZ WAR এডমিন প্যানেল থেকে পাঠানো একটি পরীক্ষামূলক ইমেইল। This is a test email from the QUIZ WAR admin panel.',
      note: 'এখন থেকে স্বাগত ইমেইল, ইমেইল যাচাই ও পাসওয়ার্ড রিসেট ইমেইল যাবে। Welcome, verification and password-reset emails will now be delivered.',
    }, appS.appName);
    try {
      await ctx.mailer.send({ to: b.to, subject: 'QUIZ WAR — SMTP test', ...mail });
    } catch (err: any) {
      throw new AppError(400, 'smtp_failed', `Sending failed: ${String(err?.message ?? err).slice(0, 200)}`);
    }
    await log(req, 'integrations.test_email', { type: 'email', id: 0, after: { to: b.to } });
    return { ok: true };
  });

  /* ------------------------------ Settings ---------------------------- */
  app.get('/settings', can('dashboard.view'), async () => {
    await ctx.settings.load(true);
    return { game: ctx.settings.game(), app: ctx.settings.app() };
  });
  app.put('/settings/game/:section', can('settings.game'), async (req) => {
    const section = String((req.params as any).section) as keyof GameSettings;
    if (!(section in gameSettingsSchema.shape)) throw notFound('Unknown settings section');
    const before = ctx.settings.game()[section];
    let after;
    try {
      after = await ctx.settings.updateGameSection(section, req.body, req.admin!.id);
    } catch (err) {
      if (err instanceof z.ZodError) throw badRequest(err.issues[0]?.message ?? 'Invalid settings', err.issues);
      throw err;
    }
    await log(req, 'settings.game', { type: 'settings', id: section, before, after });
    return { section: after };
  });
  /** Background music upload (MP3 / M4A / OGG, max 12 MB) for the menu or match slot. */
  app.post('/music/:slot', { ...can('settings.app'), bodyLimit: 14 * 1024 * 1024 }, async (req) => {
    const { slot } = parse(z.object({ slot: z.enum(['menu', 'match']) }), req.params);
    const file = await (req as any).file({ limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
    if (!file) throw badRequest('No file uploaded');
    const buf: Buffer = await file.toBuffer();
    if (file.file.truncated) throw new AppError(413, 'file_too_large', 'Music file must be 12 MB or smaller');
    const kind = audioKind(buf);
    if (!kind) throw badRequest('Upload an MP3, M4A or OGG audio file');
    const url = await ctx.storage.put(`music/${slot}-${Date.now()}.${kind.ext}`, buf);
    const before = ctx.settings.app();
    const old = slot === 'menu' ? before.music.menuUrl : before.music.matchUrl;
    const after = await ctx.settings.updateApp({ music: { ...before.music, [slot === 'menu' ? 'menuUrl' : 'matchUrl']: url } }, req.admin!.id);
    if (old) await ctx.storage.remove(old);
    await log(req, 'settings.music', { type: 'settings', summary: `Uploaded ${slot} music (${Math.round(buf.length / 1024)} KB)` });
    return { music: after.music };
  });
  app.delete('/music/:slot', can('settings.app'), async (req) => {
    const { slot } = parse(z.object({ slot: z.enum(['menu', 'match']) }), req.params);
    const before = ctx.settings.app();
    const old = slot === 'menu' ? before.music.menuUrl : before.music.matchUrl;
    const after = await ctx.settings.updateApp({ music: { ...before.music, [slot === 'menu' ? 'menuUrl' : 'matchUrl']: null } }, req.admin!.id);
    if (old) await ctx.storage.remove(old);
    await log(req, 'settings.music', { type: 'settings', summary: `Removed ${slot} music` });
    return { music: after.music };
  });

  app.put('/settings/app', can('settings.app'), async (req) => {
    const before = ctx.settings.app();
    let after;
    try {
      after = await ctx.settings.updateApp(req.body as any, req.admin!.id);
    } catch (err) {
      if (err instanceof z.ZodError) throw badRequest(err.issues[0]?.message ?? 'Invalid settings', err.issues);
      throw err;
    }
    await log(req, 'settings.app', { type: 'settings', id: 'app', before, after });
    return { app: after };
  });

  /* --------------------------- Announcements -------------------------- */
  app.get('/announcements', can('announcements.send'), async () => ({
    items: await query<any>('SELECT a.id, a.title, a.body, a.push, a.created_at AS createdAt, u.name AS admin FROM announcements a LEFT JOIN admin_users u ON u.id = a.admin_id ORDER BY a.id DESC LIMIT 50'),
  }));
  app.post('/announcements', can('announcements.send'), async (req) => {
    const b = parse(z.object({ title: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(500), push: z.boolean().default(false) }), req.body);
    const res = await exec('INSERT INTO announcements (admin_id, title, body, push) VALUES (?, ?, ?, ?)', [req.admin!.id, b.title, b.body, b.push ? 1 : 0]);
    ctx.emitter.io?.emit('server:announcement', { title: b.title, body: b.body });
    // In-app notification for recently active players (batched so this never blocks).
    void (async () => {
      let after = 0;
      for (;;) {
        const ids = await query<{ user_id: number }>(
          `SELECT user_id FROM user_profiles p JOIN users u ON u.id = p.user_id WHERE u.status = 'active' AND p.user_id > ? AND p.last_active_date >= DATE_SUB(UTC_DATE(), INTERVAL 30 DAY) ORDER BY p.user_id LIMIT 500`,
          [after],
        );
        if (!ids.length) break;
        for (const r of ids) await ctx.notifications.notify(r.user_id, { type: 'announcement', title: b.title, body: b.body, url: '/notifications' }, { push: b.push, forcePush: b.push });
        after = ids[ids.length - 1].user_id;
      }
    })().catch((err) => ctx.log.error({ err }, 'announcement fan-out failed'));
    await log(req, 'announcement.send', { type: 'announcement', id: res.insertId, after: b });
    return { id: res.insertId };
  });

  /* ------------------- Achievements / Seasons / Shop ------------------ */
  const achievementSchema = z.object({
    key: z.string().regex(/^[a-z0-9_]{2,40}$/),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(200),
    icon: z.string().trim().min(1).max(16),
    metric: z.enum(['wins', 'total_correct', 'best_win_streak', 'total_games', 'peak_rating', 'fast_answers', 'level', 'daily_challenges_done', 'best_streak_days']),
    threshold: z.number().int().min(1),
    rewardCoins: z.number().int().min(0).max(100000),
    rewardXp: z.number().int().min(0).max(100000),
    isActive: z.boolean().default(true),
  });
  app.get('/achievements', can('content.manage'), async () => ({
    items: await query<any>(
      `SELECT a.*, (SELECT COUNT(*) FROM user_achievements ua WHERE ua.achievement_id = a.id) AS unlocked FROM achievements a ORDER BY a.sort_order, a.id`,
    ),
  }));
  app.post('/achievements', can('content.manage'), async (req) => {
    const b = parse(achievementSchema, req.body);
    const r = await exec('INSERT INTO achievements (ach_key, name, description, icon, metric, threshold, reward_coins, reward_xp, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      b.key, b.name, b.description, b.icon, b.metric, b.threshold, b.rewardCoins, b.rewardXp, b.isActive ? 1 : 0,
    ]);
    await log(req, 'achievement.create', { type: 'achievement', id: r.insertId, after: b });
    return { id: r.insertId };
  });
  app.put('/achievements/:id', can('content.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(achievementSchema, req.body);
    const before = await queryOne('SELECT * FROM achievements WHERE id = ?', [id]);
    await exec('UPDATE achievements SET ach_key = ?, name = ?, description = ?, icon = ?, metric = ?, threshold = ?, reward_coins = ?, reward_xp = ?, is_active = ? WHERE id = ?', [
      b.key, b.name, b.description, b.icon, b.metric, b.threshold, b.rewardCoins, b.rewardXp, b.isActive ? 1 : 0, id,
    ]);
    await log(req, 'achievement.update', { type: 'achievement', id, before, after: b });
    return { ok: true };
  });

  app.get('/seasons', can('content.manage'), async () => ({
    items: await query<any>(`SELECT s.*, (SELECT COUNT(*) FROM season_ratings sr WHERE sr.season_id = s.id) AS players FROM seasons s ORDER BY s.id DESC LIMIT 50`),
  }));
  app.post('/seasons', can('content.manage'), async (req) => {
    const b = parse(z.object({ name: z.string().trim().min(2).max(80), startsAt: z.coerce.date(), endsAt: z.coerce.date(), softResetFactor: z.number().min(0).max(1).default(0.5) }), req.body);
    if (b.endsAt <= b.startsAt) throw badRequest('End must be after start');
    const r = await exec(`INSERT INTO seasons (name, starts_at, ends_at, status, soft_reset_factor) VALUES (?, ?, ?, 'upcoming', ?)`, [b.name, b.startsAt, b.endsAt, b.softResetFactor]);
    await log(req, 'season.create', { type: 'season', id: r.insertId, after: b });
    return { id: r.insertId };
  });
  app.post('/seasons/:id/end', can('content.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    await exec(`UPDATE seasons SET ends_at = UTC_TIMESTAMP() WHERE id = ? AND status = 'active'`, [id]);
    await ctx.seasons.tick((m) => ctx.log.info(m));
    await log(req, 'season.end', { type: 'season', id });
    return { ok: true };
  });

  const shopSchema = z.object({
    key: z.string().regex(/^[a-z0-9_]{2,40}$/),
    type: z.enum(['avatar', 'frame', 'theme', 'title', 'effect', 'power_up']),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(200).nullable().optional(),
    price: z.number().int().min(0).max(1_000_000),
    data: z.record(z.unknown()).nullable().optional(),
    isActive: z.boolean().default(true),
  });
  app.get('/shop', can('content.manage'), async () => ({ items: (await query<any>('SELECT * FROM shop_items ORDER BY sort_order, id')).map((i) => ({ ...i, data: parseJson(i.data) })) }));
  app.post('/shop', can('content.manage'), async (req) => {
    const b = parse(shopSchema, req.body);
    const r = await exec('INSERT INTO shop_items (item_key, type, name, description, price, data, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      b.key, b.type, b.name, b.description ?? null, b.price, b.data ? JSON.stringify(b.data) : null, b.isActive ? 1 : 0,
    ]);
    await log(req, 'shop.create', { type: 'shop_item', id: r.insertId, after: b });
    return { id: r.insertId };
  });
  app.put('/shop/:id', can('content.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(shopSchema, req.body);
    const before = await queryOne('SELECT * FROM shop_items WHERE id = ?', [id]);
    await exec('UPDATE shop_items SET item_key = ?, type = ?, name = ?, description = ?, price = ?, data = ?, is_active = ? WHERE id = ?', [
      b.key, b.type, b.name, b.description ?? null, b.price, b.data ? JSON.stringify(b.data) : null, b.isActive ? 1 : 0, id,
    ]);
    await log(req, 'shop.update', { type: 'shop_item', id, before, after: b });
    return { ok: true };
  });

  /* --------------------------- Admins & roles ------------------------- */
  app.get('/admins', can('admins.manage'), async () => ({
    items: await query<any>(
      `SELECT a.id, a.email, a.name, a.is_active AS isActive, a.last_login_at AS lastLoginAt, a.created_at AS createdAt, r.id AS roleId, r.name AS role
       FROM admin_users a JOIN admin_roles r ON r.id = a.role_id ORDER BY a.id`,
    ),
  }));
  app.post('/admins', can('admins.manage'), async (req) => {
    const b = parse(z.object({ email: z.string().email().max(190), name: z.string().trim().min(2).max(80), password: z.string().min(12).max(128), roleId: z.number().int().positive() }), req.body);
    try {
      const r = await exec('INSERT INTO admin_users (email, name, password_hash, role_id) VALUES (?, ?, ?, ?)', [b.email.toLowerCase(), b.name, await hashPassword(b.password), b.roleId]);
      await log(req, 'admin.create', { type: 'admin', id: r.insertId, after: { email: b.email, name: b.name, roleId: b.roleId } });
      return { id: r.insertId };
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') throw new AppError(409, 'conflict', 'An admin with this email exists');
      throw err;
    }
  });
  app.put('/admins/:id', can('admins.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(z.object({ name: z.string().trim().min(2).max(80), roleId: z.number().int().positive(), isActive: z.boolean(), password: z.string().min(12).max(128).optional() }), req.body);
    if (id === req.admin!.id && !b.isActive) throw badRequest('You cannot disable your own account');
    const before = await queryOne('SELECT id, email, name, role_id, is_active FROM admin_users WHERE id = ?', [id]);
    if (!before) throw notFound('Admin not found');
    await exec('UPDATE admin_users SET name = ?, role_id = ?, is_active = ? WHERE id = ?', [b.name, b.roleId, b.isActive ? 1 : 0, id]);
    if (b.password) await exec('UPDATE admin_users SET password_hash = ? WHERE id = ?', [await hashPassword(b.password), id]);
    if (!b.isActive || b.password) await exec('UPDATE admin_sessions SET revoked_at = UTC_TIMESTAMP() WHERE admin_id = ? AND revoked_at IS NULL', [id]);
    ctx.adminAuth.invalidate(id);
    await log(req, 'admin.update', { type: 'admin', id, before, after: { name: b.name, roleId: b.roleId, isActive: b.isActive, passwordChanged: !!b.password } });
    return { ok: true };
  });
  app.get('/roles', can('admins.manage'), async () => {
    const roles = await query<any>('SELECT id, role_key AS `key`, name, is_system AS isSystem FROM admin_roles ORDER BY id');
    const perms = await query<any>('SELECT id, perm_key AS `key`, description FROM admin_permissions ORDER BY id');
    const links = await query<any>('SELECT role_id, permission_id FROM admin_role_permissions');
    return {
      permissions: perms,
      roles: roles.map((r) => ({ ...r, isSystem: !!r.isSystem, permissions: links.filter((l) => l.role_id === r.id).map((l) => perms.find((p) => p.id === l.permission_id)?.key) })),
    };
  });
  app.put('/roles/:id/permissions', can('admins.manage'), async (req) => {
    const { id } = parse(idParam, req.params);
    const b = parse(z.object({ permissions: z.array(z.string().max(60)).max(100) }), req.body);
    const role = await queryOne<{ role_key: string }>('SELECT role_key FROM admin_roles WHERE id = ?', [id]);
    if (!role) throw notFound('Role not found');
    if (role.role_key === 'super_admin') throw badRequest('Super Admin always has every permission');
    const before = await query('SELECT p.perm_key FROM admin_role_permissions rp JOIN admin_permissions p ON p.id = rp.permission_id WHERE rp.role_id = ?', [id]);
    await tx(async (conn) => {
      await exec('DELETE FROM admin_role_permissions WHERE role_id = ?', [id], conn);
      if (b.permissions.length) await exec('INSERT INTO admin_role_permissions (role_id, permission_id) SELECT ?, id FROM admin_permissions WHERE perm_key IN (?)', [id, b.permissions], conn);
    });
    ctx.adminAuth.invalidate();
    await log(req, 'role.permissions', { type: 'role', id, before: before.map((x: any) => x.perm_key), after: b.permissions });
    return { ok: true };
  });

  /* ------------------------------ Audit log --------------------------- */
  app.get('/audit', can('audit.view'), async (req) => {
    const q = parse(paginationSchema.extend({ adminId: z.coerce.number().int().optional(), action: z.string().max(60).optional(), targetType: z.string().max(40).optional() }), req.query);
    const where = ['1=1'];
    const p: unknown[] = [];
    if (q.adminId) (where.push('l.admin_id = ?'), p.push(q.adminId));
    if (q.action) (where.push('l.action LIKE ?'), p.push(`${q.action}%`));
    if (q.targetType) (where.push('l.target_type = ?'), p.push(q.targetType));
    const items = await query<any>(
      `SELECT l.id, l.action, l.target_type AS targetType, l.target_id AS targetId, l.summary, l.before_json AS beforeJson, l.after_json AS afterJson,
              l.ip, l.created_at AS createdAt, a.name AS admin, a.email AS adminEmail
       FROM admin_logs l LEFT JOIN admin_users a ON a.id = l.admin_id WHERE ${where.join(' AND ')} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
      [...p, q.pageSize, (q.page - 1) * q.pageSize],
    );
    return { items: items.map((i) => ({ ...i, before: parseJson(i.beforeJson), after: parseJson(i.afterJson), beforeJson: undefined, afterJson: undefined })) };
  });
}

async function moderate(
  ctx: AppContext,
  req: FastifyRequest,
  userId: number,
  action: 'warn' | 'suspend' | 'ban' | 'unban' | 'unsuspend',
  reason: string,
  hours: number | undefined,
  reportId: number | null,
) {
  const before = await queryOne<any>('SELECT status, suspended_until, moderation_reason FROM users WHERE id = ?', [userId]);
  if (!before || before.status === 'deleted') throw notFound('Player not found');
  let untilAt: Date | null = null;
  if (action === 'suspend') {
    if (!hours) throw badRequest('Choose a suspension length');
    untilAt = new Date(Date.now() + hours * 3600_000);
    await exec(`UPDATE users SET status = 'suspended', suspended_until = ?, moderation_reason = ? WHERE id = ?`, [untilAt, reason, userId]);
  } else if (action === 'ban') {
    await exec(`UPDATE users SET status = 'banned', moderation_reason = ? WHERE id = ?`, [reason, userId]);
  } else if (action === 'unban' || action === 'unsuspend') {
    await exec(`UPDATE users SET status = 'active', suspended_until = NULL, moderation_reason = NULL WHERE id = ?`, [userId]);
  }
  await exec('INSERT INTO moderation_actions (user_id, admin_id, report_id, action, reason, until_at) VALUES (?, ?, ?, ?, ?, ?)', [userId, req.admin!.id, reportId, action, reason, untilAt]);
  if (action === 'ban' || action === 'suspend') {
    // Kick the player out immediately: revoke sessions, drop sockets, leave queue/match.
    ctx.matchmaking.leave(userId);
    const live = ctx.engine.activeMatchOf(userId);
    if (live) await ctx.engine.forfeit(live.id, userId);
    await ctx.auth.revokeAllSessions(userId, action);
  }
  if (action === 'warn') {
    await ctx.notifications.notify(userId, { type: 'moderation', title: { en: 'Warning from moderators', bn: 'মডারেটরদের সতর্কবার্তা' }, body: { en: reason, bn: reason }, url: '/legal/guidelines' }, { forcePush: true });
  }
  const after = await queryOne<any>('SELECT status, suspended_until, moderation_reason FROM users WHERE id = ?', [userId]);
  const target = await queryOne<{ uid: string }>('SELECT uid FROM users WHERE id = ?', [userId]);
  await audit(req.admin!, `user.${action}`, { type: 'user', id: userId, before, after, summary: `${action} ${target?.uid}: ${reason}` }, { ip: req.ip, userAgent: req.headers['user-agent'] ?? null });
  return { ok: true };
}

/** Recognises audio by its magic bytes (never trusts the file name or MIME type). */
export function audioKind(b: Buffer): { ext: string; type: string } | null {
  if (b.length < 12) return null;
  if (b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: 'mp3', type: 'audio/mpeg' };
  if (b.subarray(0, 4).toString('latin1') === 'OggS') return { ext: 'ogg', type: 'audio/ogg' };
  if (b.subarray(4, 8).toString('latin1') === 'ftyp') return { ext: 'm4a', type: 'audio/mp4' };
  return null;
}
