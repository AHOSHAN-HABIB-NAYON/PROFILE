import { LEADERBOARD_SCOPES, paginationSchema } from '@quizwar/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { optionalUser, requireUser, uid } from '../http/guards';
import { parse } from '../lib/validate';

export async function gameRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get('/categories', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=60');
    return { items: await ctx.categories.listPublic() };
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
