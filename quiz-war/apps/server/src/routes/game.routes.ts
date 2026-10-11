import { LEADERBOARD_SCOPES, paginationSchema } from '@quizwar/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { optionalUser, requireUser, uid } from '../http/guards';
import { parse } from '../lib/validate';
import { notFound } from '../lib/errors';
import { query, queryOne } from '../db/pool';

export async function gameRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/categories', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return { items: await ctx.categories.listPublic() };
  });

  /** Study mode: every question of a category with its correct answer, 30 per page. */
  app.get('/categories/:id/study', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { id } = parse(z.object({ id: z.coerce.number().int().positive() }), req.params);
    const q = parse(z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), difficulty: z.enum(['easy', 'medium', 'hard', 'expert']).optional() }), req.query);
    const cat = (await ctx.categories.listPublic()).find((c: any) => c.id === id);
    if (!cat) throw notFound('Category not found');
    const PAGE = 30;
    const where = `q.category_id = ? AND q.is_active = 1 AND q.review_status = 'approved' AND q.deleted_at IS NULL${q.difficulty ? ' AND q.difficulty = ?' : ''}`;
    const args: unknown[] = q.difficulty ? [id, q.difficulty] : [id];
    const total = Number((await queryOne<{ n: number }>(`SELECT COUNT(*) n FROM questions q WHERE ${where}`, args))?.n ?? 0);
    const pages = Math.max(1, Math.ceil(total / PAGE));
    const page = Math.min(q.page, pages);
    const rows = await query<any>(`SELECT q.id, q.text, q.explanation, q.difficulty, q.image_url FROM questions q WHERE ${where} ORDER BY q.id LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, args);
    const opts = rows.length
      ? await query<any>(`SELECT question_id, option_index, text, is_correct FROM question_options WHERE question_id IN (${rows.map(() => '?').join(',')}) ORDER BY question_id, option_index`, rows.map((r) => r.id))
      : [];
    const byQ = new Map<number, { text: string; correct: boolean }[]>();
    for (const o of opts) byQ.set(Number(o.question_id), [...(byQ.get(Number(o.question_id)) ?? []), { text: o.text, correct: !!o.is_correct }]);
    reply.header('cache-control', 'public, max-age=120');
    return {
      category: { id: cat.id, name: cat.name, nameBn: cat.nameBn, slug: cat.slug, icon: cat.icon, iconUrl: cat.iconUrl, color: cat.color },
      page, pages, total, pageSize: PAGE,
      items: rows.map((r, i) => {
        const options = byQ.get(Number(r.id)) ?? [];
        return { n: (page - 1) * PAGE + i + 1, id: Number(r.id), text: r.text, explanation: r.explanation, difficulty: r.difficulty, imageUrl: r.image_url, options: options.map((o) => o.text), correctIndex: options.findIndex((o) => o.correct) };
      }),
    };
  });

  app.get('/our-apps', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return { items: ctx.settings.app().ourAppsEnabled ? await ctx.ourApps.listPublic() : [] };
  });
  app.post('/our-apps/:id/click', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    await ctx.ourApps.click(parse(z.object({ id: z.coerce.number().int().positive() }), req.params).id);
    return { ok: true };
  });

  app.get('/promos', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return { items: await ctx.promos.listPublic() };
  });
  app.post('/promos/:id/:kind', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const p = parse(z.object({ id: z.coerce.number().int().positive(), kind: z.enum(['view', 'click']) }), req.params);
    await ctx.promos.track(p.id, p.kind);
    return { ok: true };
  });

  app.get('/leaderboards/:scope', { preHandler: optionalUser(ctx) }, async (req) => {
    const { scope } = parse(z.object({ scope: z.enum([...LEADERBOARD_SCOPES, 'daily']) }), req.params);
    const q = parse(paginationSchema.extend({ categoryId: z.coerce.number().int().positive().optional() }), req.query);
    return ctx.leaderboard.get(scope, { page: q.page, pageSize: q.pageSize, categoryId: q.categoryId, viewerId: req.user?.id ?? null });
  });

  app.get('/seasons/current', async () => {
    const s = ctx.seasons.current();
    return { season: s ? { id: s.id, name: s.name, startsAt: s.startsAt, endsAt: s.endsAt } : null, leagues: ctx.settings.game().ranked.leagues };
  });

  app.get('/daily', { preHandler: requireUser(ctx) }, async (req) => ctx.daily.status(uid(req)));

  app.get('/verified', { preHandler: requireUser(ctx) }, async (req) => ctx.verified.status(uid(req)));
  app.post('/verified/claim', { preHandler: requireUser(ctx), config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => ctx.verified.claim(uid(req)));
  app.get('/missions', { preHandler: requireUser(ctx) }, async (req) => ctx.missions.list(uid(req)));
  app.post('/missions/:id/claim', { preHandler: requireUser(ctx), config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { id } = parse(z.object({ id: z.coerce.number().int().positive() }), req.params);
    return ctx.missions.claim(uid(req), id);
  });
}
