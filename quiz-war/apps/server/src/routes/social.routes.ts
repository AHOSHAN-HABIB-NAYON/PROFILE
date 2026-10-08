import { normalizeUid, paginationSchema, SQUAD_ROLES } from '@quizwar/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { requireUser, uid } from '../http/guards';
import { badRequest, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { squadCreateSchema } from '../modules/squads/squad.service';
import { getPublicUser, getUserByUid } from '../modules/users/users.repo';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export async function socialRoutes(app: FastifyInstance, ctx: AppContext) {
  const auth = { preHandler: requireUser(ctx) };

  async function resolveTarget(body: unknown) {
    const b = parse(z.object({ uid: z.string().max(20).optional(), userId: z.number().int().positive().optional() }), body);
    if (b.userId) {
      const u = await getPublicUser(b.userId);
      if (!u) throw notFound('Player not found');
      return u;
    }
    const n = b.uid ? normalizeUid(b.uid) : null;
    if (!n) throw badRequest('Enter a valid UID');
    const u = await getUserByUid(n);
    if (!u) throw notFound('No player with this UID');
    return u;
  }

  /* -------------------------------- Friends ------------------------------- */
  app.get('/friends', auth, async (req) => ({ items: await ctx.friends.list(uid(req)) }));
  app.get('/friends/requests', auth, async (req) => ctx.friends.requests(uid(req)));
  app.post('/friends/requests', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const target = await resolveTarget(req.body);
    return ctx.friends.request(uid(req), target);
  });
  app.post('/friends/requests/:id/accept', auth, async (req) => {
    await ctx.friends.respond(uid(req), parse(idParam, req.params).id, true);
    return { ok: true };
  });
  app.post('/friends/requests/:id/reject', auth, async (req) => {
    await ctx.friends.respond(uid(req), parse(idParam, req.params).id, false);
    return { ok: true };
  });
  app.delete('/friends/requests/:id', auth, async (req) => {
    await ctx.friends.cancel(uid(req), parse(idParam, req.params).id);
    return { ok: true };
  });
  app.delete('/friends/:id', auth, async (req) => {
    await ctx.friends.remove(uid(req), parse(idParam, req.params).id);
    return { ok: true };
  });
  app.get('/blocks', auth, async (req) => ({ items: await ctx.friends.blocked(uid(req)) }));
  app.post('/blocks', auth, async (req) => {
    const target = await resolveTarget(req.body);
    await ctx.friends.block(uid(req), target.id);
    return { ok: true };
  });
  app.delete('/blocks/:id', auth, async (req) => {
    await ctx.friends.unblock(uid(req), parse(idParam, req.params).id);
    return { ok: true };
  });

  /* ---------------------------- Battle requests --------------------------- */
  app.get('/battles/requests', auth, async (req) => ctx.battles.pending(uid(req)));
  app.post('/battles/requests', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const target = await resolveTarget(req.body);
    const b = parse(z.object({ categoryId: z.number().int().positive().nullish(), questionCount: z.number().int().min(3).max(50).nullish() }).passthrough(), req.body);
    return ctx.battles.send(uid(req), target.id, { categoryId: b.categoryId ?? null, questionCount: b.questionCount ?? null });
  });
  app.post('/battles/requests/:id/accept', auth, async (req) => ctx.battles.respond(uid(req), parse(idParam, req.params).id, true));
  app.post('/battles/requests/:id/decline', auth, async (req) => ctx.battles.respond(uid(req), parse(idParam, req.params).id, false));
  app.delete('/battles/requests/:id', auth, async (req) => {
    await ctx.battles.cancel(uid(req), parse(idParam, req.params).id);
    return { ok: true };
  });

  /* -------------------------------- Online -------------------------------- */
  app.get('/online', async () => ({ online: await ctx.presence.onlineCount() }));

  /* -------------------------------- Squads -------------------------------- */
  app.get('/squads', auth, async (req) => {
    const q = parse(paginationSchema.extend({ q: z.string().max(40).default('') }), req.query);
    return { items: await ctx.squads.search(q.q, q.page, q.pageSize) };
  });
  app.post('/squads', auth, async (req) => ctx.squads.create(uid(req), parse(squadCreateSchema, req.body)));
  app.get('/squads/invites', auth, async (req) => ({ items: await ctx.squads.invites(uid(req)) }));
  app.post('/squads/invites/:id/accept', auth, async (req) => {
    await ctx.squads.respondInvite(uid(req), parse(idParam, req.params).id, true);
    return { ok: true };
  });
  app.post('/squads/invites/:id/decline', auth, async (req) => {
    await ctx.squads.respondInvite(uid(req), parse(idParam, req.params).id, false);
    return { ok: true };
  });
  app.post('/squads/leave', auth, async (req) => {
    await ctx.squads.leave(uid(req));
    return { ok: true };
  });
  app.get('/squads/:id', auth, async (req) => ctx.squads.get(parse(idParam, req.params).id));
  app.patch('/squads/:id', auth, async (req) => {
    const b = parse(z.object({ description: z.string().trim().max(300).nullable().optional(), isOpen: z.boolean().optional() }), req.body);
    await ctx.squads.update(uid(req), parse(idParam, req.params).id, b);
    return { ok: true };
  });
  app.post('/squads/:id/logo', auth, async (req) => {
    const id = parse(idParam, req.params).id;
    const mem = await ctx.squads.membership(uid(req));
    if (!mem || mem.squad_id !== id || mem.role !== 'captain') throw badRequest('Only the captain can change the logo');
    const file = await (req as any).file({ limits: { fileSize: ctx.env.UPLOAD_MAX_BYTES, files: 1 } });
    if (!file) throw badRequest('No file uploaded');
    const url = await ctx.images.squadLogo(id, await file.toBuffer());
    await ctx.squads.update(uid(req), id, { logoUrl: url });
    return { logoUrl: url };
  });
  app.post('/squads/:id/join', auth, async (req) => {
    await ctx.squads.join(uid(req), parse(idParam, req.params).id);
    return { ok: true };
  });
  app.post('/squads/:id/invite', auth, async (req) => {
    const target = await resolveTarget(req.body);
    await ctx.squads.invite(uid(req), parse(idParam, req.params).id, target.id);
    return { ok: true };
  });
  app.delete('/squads/:id/members/:userId', auth, async (req) => {
    const p = parse(z.object({ id: z.coerce.number().int(), userId: z.coerce.number().int() }), req.params);
    await ctx.squads.kick(uid(req), p.id, p.userId);
    return { ok: true };
  });
  app.patch('/squads/:id/members/:userId', auth, async (req) => {
    const p = parse(z.object({ id: z.coerce.number().int(), userId: z.coerce.number().int() }), req.params);
    const b = parse(z.object({ role: z.enum(SQUAD_ROLES) }), req.body);
    await ctx.squads.setRole(uid(req), p.id, p.userId, b.role);
    return { ok: true };
  });
}
