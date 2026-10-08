import { normalizeUid, paginationSchema, profileUpdateSchema, reportSchema, usernameSchema } from '@quizwar/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { optionalUser, requireUser, uid } from '../http/guards';
import { AppError, badRequest, notFound } from '../lib/errors';
import { parse } from '../lib/validate';
import { getMe, getUserByUid } from '../modules/users/users.repo';

async function readUpload(req: any, maxBytes: number): Promise<Buffer> {
  const file = await req.file({ limits: { fileSize: maxBytes, files: 1 } });
  if (!file) throw badRequest('No file uploaded');
  const buf = await file.toBuffer();
  if (file.file.truncated) throw new AppError(413, 'image_too_large', 'Image is too large');
  return buf;
}

export async function userRoutes(app: FastifyInstance, ctx: AppContext) {
  const auth = { preHandler: requireUser(ctx) };

  app.get('/me', auth, async (req) => {
    const me = await getMe(uid(req));
    if (!me) throw notFound('Account not found');
    const squad = await ctx.squads.membership(me.id);
    const live = ctx.engine.activeMatchOf(me.id);
    return { user: me, squadId: squad?.squad_id ?? null, activeMatchId: live?.id ?? null };
  });

  app.post('/me/onboarding', auth, async (req) => {
    const b = parse(z.object({ username: usernameSchema }), req.body);
    return { user: await ctx.profile.completeOnboarding(uid(req), b.username) };
  });

  app.patch('/me', auth, async (req) => {
    const b = parse(profileUpdateSchema, req.body);
    return { user: await ctx.profile.update(uid(req), b) };
  });

  app.patch('/me/preferences', auth, async (req) => {
    const b = parse(z.object({ availableForBattle: z.boolean().optional(), dnd: z.boolean().optional(), tutorialDone: z.boolean().optional() }), req.body);
    await ctx.profile.setPreferences(uid(req), b);
    if (b.availableForBattle !== undefined || b.dnd !== undefined) {
      ctx.presence.set(uid(req), { available: b.availableForBattle, status: b.dnd === undefined ? undefined : b.dnd ? 'dnd' : 'online' });
    }
    return { ok: true };
  });

  app.post('/me/avatar', { ...auth, config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req) => {
    const buf = await readUpload(req, ctx.env.UPLOAD_MAX_BYTES);
    return ctx.profile.setAvatar(uid(req), buf);
  });
  app.delete('/me/avatar', auth, async (req) => {
    await ctx.profile.removeAvatar(uid(req));
    return { ok: true };
  });

  app.get('/me/stats', auth, async (req) => ctx.profile.detailedStats(uid(req)));
  app.get('/me/matches', auth, async (req) => {
    const p = parse(paginationSchema, req.query);
    return { items: await ctx.profile.matchHistory(uid(req), p.page, p.pageSize) };
  });
  app.get('/matches/:id/review', auth, async (req) => ({ items: await ctx.profile.review(uid(req), String((req.params as any).id)) }));
  app.get('/matches/:id/result', auth, async (req) => {
    const m = ctx.engine.get(String((req.params as any).id));
    if (!m || !m.result || !m.players.some((p) => p.userId === uid(req))) throw notFound('Result not available');
    return { result: m.result, snapshot: ctx.engine.snapshot(m, uid(req)) };
  });
  app.get('/me/achievements', auth, async (req) => ({ items: await ctx.profile.myAchievements(uid(req)) }));
  app.get('/me/seasons', auth, async (req) => ({ items: await ctx.seasons.history(uid(req)) }));
  app.get('/me/rewards/daily', auth, async (req) => ctx.progression.dailyRewardStatus(uid(req)));
  app.post('/me/rewards/daily/claim', { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => ctx.progression.claimDailyReward(uid(req)));
  app.get('/me/power-ups', auth, async (req) => ctx.progression.powerUpInventory(uid(req)));

  /** Public profile by UID (also used by QR / deep links). No private data. */
  app.get('/users/:uid', { preHandler: optionalUser(ctx) }, async (req) => {
    const u = normalizeUid(String((req.params as any).uid));
    if (!u) throw notFound('Player not found');
    const profile = await ctx.profile.publicProfile(u);
    let relation: Record<string, unknown> | null = null;
    if (req.user && req.user.id !== profile.user.id) {
      if (await ctx.friends.isBlockedEitherWay(req.user.id, profile.user.id)) throw notFound('Player not found');
      relation = {
        friend: await ctx.friends.areFriends(req.user.id, profile.user.id),
        status: ctx.presence.status(profile.user.id),
        available: ctx.presence.isAvailable(profile.user.id),
      };
    }
    return { ...profile, relation };
  });

  app.get('/users/search', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const q = parse(z.object({ uid: z.string().max(20) }), req.query);
    const u = normalizeUid(q.uid);
    if (!u) throw badRequest('Enter a valid UID like QW-8F29K7');
    const user = await getUserByUid(u);
    if (!user || (await ctx.friends.isBlockedEitherWay(uid(req), user.id))) throw notFound('No player with this UID');
    return { user, status: ctx.presence.status(user.id) };
  });

  app.post('/reports', { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(reportSchema, req.body);
    let targetUserId: number | null = null;
    if (b.targetUid) {
      const u = normalizeUid(b.targetUid);
      const user = u ? await getUserByUid(u) : null;
      if (!user) throw notFound('Player not found');
      targetUserId = user.id;
    }
    return ctx.reports.create(uid(req), { targetUserId, matchId: b.matchId, reason: b.reason, details: b.details });
  });

  /* ---------------------------- Notifications ---------------------------- */
  app.get('/notifications', auth, async (req) => {
    const q = parse(z.object({ before: z.coerce.number().int().positive().optional() }), req.query);
    return ctx.notifications.list(uid(req), q.before ?? null);
  });
  app.post('/notifications/read', auth, async (req) => {
    const b = parse(z.object({ ids: z.union([z.literal('all'), z.array(z.number().int().positive()).max(200)]) }), req.body);
    await ctx.notifications.markRead(uid(req), b.ids);
    return { ok: true };
  });
  app.post('/push/register', auth, async (req) => {
    const b = parse(z.object({ platform: z.enum(['android', 'web']), token: z.string().min(10).max(4000) }), req.body);
    if (b.platform === 'web') {
      const sub = (() => {
        try {
          return JSON.parse(b.token);
        } catch {
          return null;
        }
      })();
      if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint)) throw badRequest('Invalid push subscription');
    }
    await ctx.push.register(uid(req), b.platform, b.token);
    return { ok: true };
  });
  app.post('/push/unregister', auth, async (req) => {
    const b = parse(z.object({ token: z.string().min(10).max(4000) }), req.body);
    await ctx.push.unregister(uid(req), b.token);
    return { ok: true };
  });

  /* --------------------------------- Shop -------------------------------- */
  app.get('/shop', auth, async (req) => ({ items: await ctx.shop.list(uid(req)) }));
  app.post('/shop/purchase', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(z.object({ itemKey: z.string().max(40), quantity: z.number().int().min(1).max(10).optional() }), req.body);
    return ctx.shop.purchase(uid(req), b.itemKey, b.quantity ?? 1);
  });
  app.post('/shop/equip', auth, async (req) => {
    const b = parse(z.object({ slot: z.enum(['frame', 'title', 'theme_cosmetic']), itemKey: z.string().max(40).nullable() }), req.body);
    await ctx.shop.equip(uid(req), b.slot, b.itemKey);
    return { user: await getMe(uid(req)) };
  });
}
