import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  AI_LEVEL_DIFFICULTY,
  AI_LEVELS,
  DIFFICULTIES,
  type Difficulty,
  MODES,
  POWER_UPS,
  type ClientToServerEvents,
  type ServerToClientEvents,
  MATCH_REACTIONS,
} from '@quizwar/shared';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { queryOne } from '../db/pool';
import { GameError } from '../game/engine';
import { AppError } from '../lib/errors';
import type { AppContext } from '../context';
import { loadIdentity } from '../context';
import { verifyAccessToken } from '../modules/auth/tokens';

interface SocketData {
  userId: number;
  sessionId: number;
  bucket: { tokens: number; at: number; strikes: number };
}

type QSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const modeKey = z.enum(Object.keys(MODES) as [keyof typeof MODES, ...(keyof typeof MODES)[]]);
const matchId = z.string().regex(/^[0-9A-Z]{26}$/);
const schemas = {
  presence: z.object({ status: z.enum(['online', 'away', 'dnd']).optional(), available: z.boolean().optional() }),
  mmJoin: z.object({ mode: modeKey, ranked: z.boolean(), categoryId: z.number().int().positive().nullish() }),
  aiLevel: z.object({ level: z.enum(AI_LEVELS).optional() }),
  aiStart: z.object({
    mode: modeKey.optional(),
    level: z.enum(AI_LEVELS),
    categoryId: z.number().int().positive().nullish(),
    tutorial: z.boolean().optional(),
    questionCount: z.number().int().min(3).max(50).nullish(),
  }),
  soloStart: z.object({
    mode: z.enum(['solo', 'survival', 'speed', 'daily']),
    categoryId: z.number().int().positive().nullish(),
    difficulty: z.enum(DIFFICULTIES).nullish(),
    practiceMistakes: z.boolean().optional(),
    questionCount: z.number().int().min(3).max(50).nullish(),
  }),
  roomCreate: z.object({
    mode: modeKey,
    categoryId: z.number().int().positive().nullish(),
    questionCount: z.number().int().min(3).max(50).optional(),
    difficulty: z.enum(DIFFICULTIES).nullish(),
    questionTimeSec: z.number().int().min(3).max(60).nullish(),
    squadId: z.number().int().positive().nullish(),
  }),
  roomJoin: z.object({ matchId: z.union([matchId, z.string().regex(/^[A-Za-z2-9]{6}$/)]), team: z.number().int().min(0).max(7).optional() }),
  roomSettings: z.object({
    matchId,
    questionCount: z.number().int().min(3).max(500).nullish(),
    questionTimeSec: z.number().int().min(3).max(120).optional(),
    totalTimeSec: z.number().int().min(60).max(3 * 3600).nullish(),
    difficulty: z.enum(DIFFICULTIES).nullish(),
    categoryId: z.number().int().positive().nullish(),
  }),
  ready: z.object({ matchId, ready: z.boolean() }),
  matchOnly: z.object({ matchId }),
  react: z.object({ matchId, reaction: z.enum(MATCH_REACTIONS) }),
  resume: z.object({ matchId: matchId.optional() }),
  answer: z.object({ matchId, questionIndex: z.number().int().min(0).max(10000), optionIndex: z.number().int().min(0).max(9) }),
  powerUp: z.object({ matchId, questionIndex: z.number().int().min(0).max(10000), powerUp: z.enum(POWER_UPS) }),
  timeSync: z.object({ clientTime: z.number() }),
};

/** Token bucket per socket: 15 events/sec sustained, burst 30. Repeated abuse disconnects. */
function allow(socket: QSocket) {
  const b = socket.data.bucket;
  const now = Date.now();
  b.tokens = Math.min(30, b.tokens + ((now - b.at) / 1000) * 15);
  b.at = now;
  if (b.tokens < 1) {
    b.strikes++;
    if (b.strikes > 50) socket.disconnect(true);
    return false;
  }
  b.tokens -= 1;
  return true;
}

function fail(err: unknown) {
  if (err instanceof GameError || err instanceof AppError) return { ok: false as const, code: err.code, message: err.message };
  if (err instanceof z.ZodError) return { ok: false as const, code: 'invalid_request', message: 'Invalid request' };
  return { ok: false as const, code: 'server_error', message: 'Something went wrong. Please try again.' };
}

export function createGateway(ctx: AppContext, http: HttpServer, corsOrigins: string[]) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(http, {
    path: '/socket.io',
    cors: { origin: corsOrigins, credentials: true },
    pingInterval: 15_000,
    pingTimeout: 20_000,
    maxHttpBufferSize: 32 * 1024,
    transports: ['websocket', 'polling'],
  });
  ctx.emitter.io = io;

  if (ctx.redis) {
    const pub = ctx.redis.duplicate();
    const sub = ctx.redis.duplicate();
    io.adapter(createAdapter(pub, sub));
  }

  /* ------------------------------- Auth ------------------------------- */
  io.use(async (socket, next) => {
    try {
      const token = String(socket.handshake.auth?.token ?? '');
      if (!token) return next(new Error('unauthorized'));
      const claims = await verifyAccessToken(ctx.env.JWT_SECRET, token);
      if (!(await ctx.auth.isSessionActive(claims.sid, claims.sub))) return next(new Error('unauthorized'));
      const u = await queryOne<{ status: string; suspended_until: Date | null }>('SELECT status, suspended_until FROM users WHERE id = ?', [claims.sub]);
      if (!u || u.status === 'banned' || u.status === 'deleted') return next(new Error('forbidden'));
      if (u.status === 'suspended' && u.suspended_until && u.suspended_until.getTime() > Date.now()) return next(new Error('suspended'));
      const app = ctx.settings.app();
      const versionCode = Number(socket.handshake.auth?.versionCode ?? 0);
      if (socket.handshake.auth?.platform === 'android' && app.forceUpdate && versionCode < app.minAppVersionCode) return next(new Error('update_required'));
      socket.data.userId = claims.sub;
      socket.data.sessionId = claims.sid;
      socket.data.bucket = { tokens: 30, at: Date.now(), strikes: 0 };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  /* ------------------------------ Presence ---------------------------- */
  ctx.presence.onChange((userId, status) => {
    void ctx.friends
      .friendIds(userId)
      .then((ids) => ids.forEach((fid) => ctx.emitter.toUser(fid, 'presence:update', { userId, status })))
      .catch(() => undefined);
  });

  const countTimer = setInterval(async () => {
    const online = await ctx.presence.onlineCount();
    io.local.emit('presence:count', { online });
    await ctx.presence.heartbeat();
  }, 10_000);
  countTimer.unref();

  io.on('connection', async (socket: QSocket) => {
    const userId = socket.data.userId;
    void socket.join(`user:${userId}`);
    let identity: Awaited<ReturnType<typeof loadIdentity>>;
    try {
      identity = await loadIdentity(userId);
    } catch {
      socket.disconnect(true);
      return;
    }
    ctx.presence.connect(userId, socket.id, { available: identity.available, dnd: identity.dnd });
    socket.emit('presence:count', { online: await ctx.presence.onlineCount() });
    // Re-attach to a running match (e.g. after a network drop) — client then calls match:resume.
    const active = ctx.engine.activeMatchOf(userId);
    if (active) void socket.join(`match:${active.id}`);

    const guard = <T>(schema: z.ZodType<T>, fn: (p: T) => Promise<unknown> | unknown) => {
      return async (payload: unknown, ack?: (r: any) => void) => {
        const reply = typeof ack === 'function' ? ack : () => undefined;
        if (!allow(socket)) return reply({ ok: false, code: 'rate_limited', message: 'Slow down' });
        try {
          const p = schema.parse(payload ?? {});
          const res = await fn(p);
          reply({ ok: true, ...((res as object) ?? {}) });
        } catch (err) {
          if (!(err instanceof GameError) && !(err instanceof AppError) && !(err instanceof z.ZodError)) ctx.log.error({ err, userId }, 'socket handler error');
          reply(fail(err));
        }
      };
    };

    const ensurePlayable = async () => {
      if (ctx.settings.app().maintenanceMode) throw new AppError(503, 'maintenance', ctx.settings.app().maintenanceMessage);
      const id = await loadIdentity(userId);
      if (!id.onboarded) throw new AppError(403, 'onboarding_required', 'Choose a username first');
      return id;
    };

    const category = async (id: number | null | undefined) => (id ? await ctx.categories.get(id) : null);
    /** Chosen difficulty → only those questions and the admin-set time per question (hard = less time). */
    const difficultyOptions = (difficulty: Difficulty | null, questionCount?: number | null, questionTimeSec?: number | null) => {
      const m = ctx.settings.game().match;
      return {
        difficulties: difficulty ? [difficulty] : null,
        questionCount: questionCount ?? undefined,
        questionTimeSec: questionTimeSec ?? (difficulty ? m.difficultyTimeSec[difficulty] : undefined),
      };
    };

    socket.on('presence:set', async (p) => {
      if (!allow(socket)) return;
      const parsed = schemas.presence.safeParse(p);
      if (!parsed.success) return;
      ctx.presence.set(userId, parsed.data);
      const prefs: { availableForBattle?: boolean; dnd?: boolean } = {};
      if (parsed.data.available !== undefined) prefs.availableForBattle = parsed.data.available;
      if (parsed.data.status) prefs.dnd = parsed.data.status === 'dnd';
      if (Object.keys(prefs).length && (parsed.data.available !== undefined || parsed.data.status !== 'away')) {
        await ctx.profile.setPreferences(userId, prefs).catch(() => undefined);
      }
    });

    socket.on(
      'mm:join',
      guard(schemas.mmJoin, async (p) => {
        const id = await ensurePlayable();
        if (p.categoryId) await category(p.categoryId);
        const blocked = await ctx.friends.blockedSet(userId);
        const t = ctx.matchmaking.join(id, {
          mode: p.mode,
          ranked: p.ranked,
          categoryId: p.categoryId ?? null,
          blocked,
          firstMatch: id.totalGames === 0,
        });
        return { ticketId: t.id };
      }),
    );

    socket.on('mm:leave', async (ack) => {
      ctx.matchmaking.leave(userId);
      if (typeof ack === 'function') ack({ ok: true });
    });

    socket.on(
      'mm:accept_ai',
      guard(schemas.aiLevel, async (p) => {
        const m = await ctx.matchmaking.acceptAi(userId, p.level ?? ctx.settings.game().ai.defaultLevel);
        return { matchId: m.id };
      }),
    );

    socket.on(
      'ai:start',
      guard(schemas.aiStart, async (p) => {
        const id = await ensurePlayable();
        if (!ctx.settings.game().ai.enabled) throw new AppError(403, 'ai_disabled', 'AI battles are disabled right now');
        ctx.matchmaking.leave(userId);
        const mode = p.mode && MODES[p.mode].kind === 'battle' ? p.mode : 'duel';
        const def = MODES[mode];
        const bots: { team: number; level: typeof p.level }[] = [];
        for (let team = 0; team < def.teams; team++) for (let i = 0; i < (team === 0 ? def.teamSize - 1 : def.teamSize); i++) bots.push({ team, level: p.tutorial ? 'easy' : p.level });
        if (p.tutorial) {
          // First-run starter pack (granted once) so new players can try power-ups.
          await ctx.progression.grantReward(userId, 'tutorial', 'starter', { itemKey: 'pu_fifty_fifty', itemQty: 2, coins: 100 });
        }
        const m = await ctx.engine.createMatch({
          mode,
          source: p.tutorial ? 'tutorial' : 'ai',
          categoryId: p.categoryId ?? null,
          category: await category(p.categoryId),
          players: [{ ...id, team: 0 }],
          bots,
          ...(p.tutorial ? { questionCount: 5 } : difficultyOptions(AI_LEVEL_DIFFICULTY[p.level], p.questionCount)),
          autoStart: true,
        });
        return { matchId: m.id };
      }),
    );

    socket.on(
      'solo:start',
      guard(schemas.soloStart, async (p) => {
        const id = await ensurePlayable();
        ctx.matchmaking.leave(userId);
        if (p.mode === 'daily') {
          const m = await ctx.daily.start(id);
          return { matchId: m.id };
        }
        const difficulty = p.difficulty ?? null;
        const m = await ctx.engine.createMatch({
          mode: p.mode,
          source: 'solo',
          categoryId: p.categoryId ?? null,
          category: await category(p.categoryId),
          ...(p.mode === 'solo' ? difficultyOptions(difficulty, p.questionCount) : { difficulties: difficulty ? [difficulty] : null }),
          practiceMistakesOf: p.practiceMistakes ? userId : null,
          players: [{ ...id, team: 0 }],
          autoStart: true,
        });
        return { matchId: m.id };
      }),
    );

    socket.on(
      'room:create',
      guard(schemas.roomCreate, async (p) => {
        const id = await ensurePlayable();
        if (MODES[p.mode].kind !== 'battle') throw new AppError(400, 'invalid_mode', 'War Rooms are for team battles');
        if (p.squadId) {
          const mem = await ctx.squads.membership(userId);
          if (!mem || mem.squad_id !== p.squadId) throw new AppError(403, 'forbidden', 'You are not in this squad');
        }
        ctx.matchmaking.leave(userId);
        const m = await ctx.engine.createMatch({
          mode: p.mode,
          source: 'room',
          categoryId: p.categoryId ?? null,
          category: await category(p.categoryId),
          ...difficultyOptions(p.difficulty ?? null, p.questionCount ?? null, p.questionTimeSec ?? null),
          squadId: p.squadId ?? null,
          hostUserId: userId,
          players: [{ ...id, team: 0 }],
        });
        return { matchId: m.id };
      }),
    );

    socket.on(
      'room:join',
      guard(schemas.roomJoin, async (p) => {
        const id = await ensurePlayable();
        const m = ctx.engine.get(p.matchId);
        if (!m) throw new GameError('match_not_found', 'This War Room no longer exists');
        if (!m.players.some((x) => x.userId === userId)) {
          if (m.squadId) {
            const mem = await ctx.squads.membership(userId);
            if (!mem || mem.squad_id !== m.squadId) throw new AppError(403, 'forbidden', 'This War Room is for squad members only');
          }
          if (m.hostUserId && (await ctx.friends.isBlockedEitherWay(userId, m.hostUserId))) throw new GameError('match_not_found', 'This War Room no longer exists');
        }
        const joined = await ctx.engine.joinMatch(m.id, id, p.team);
        return { snapshot: ctx.engine.snapshot(joined, userId) };
      }),
    );

    socket.on(
      'room:settings',
      guard(schemas.roomSettings, async (p) => {
        ctx.engine.updateRoom(p.matchId, userId, {
          questionCount: p.questionCount,
          questionTimeSec: p.questionTimeSec,
          totalTimeSec: p.totalTimeSec,
          difficulty: p.difficulty,
          category: p.categoryId === undefined ? undefined : await category(p.categoryId),
        });
        return {};
      }),
    );

    socket.on('room:ready', guard(schemas.ready, (p) => ctx.engine.setReady(p.matchId, userId, p.ready)));
    socket.on('room:start', guard(schemas.matchOnly, (p) => ctx.engine.hostStart(p.matchId, userId)));
    socket.on('room:leave', guard(schemas.matchOnly, (p) => ctx.engine.leaveLobby(p.matchId, userId)));
    socket.on('match:resume', guard(schemas.resume, (p) => ({ snapshot: ctx.engine.resume(userId, p.matchId) })));
    socket.on('match:answer', guard(schemas.answer, (p) => ctx.engine.submitAnswer(p.matchId, userId, p.questionIndex, p.optionIndex)));
    socket.on('match:powerup', guard(schemas.powerUp, (p) => ctx.engine.usePowerUp(p.matchId, userId, p.questionIndex, p.powerUp)));
    socket.on('match:forfeit', guard(schemas.matchOnly, (p) => ctx.engine.forfeit(p.matchId, userId)));
    socket.on('match:react', guard(schemas.react, (p) => ctx.engine.react(p.matchId, userId, p.reaction)));
    socket.on('time:sync', guard(schemas.timeSync, (p) => ({ serverTime: Date.now(), clientTime: p.clientTime })));

    socket.on('disconnect', () => {
      const wentOffline = ctx.presence.disconnect(userId, socket.id);
      if (wentOffline) {
        ctx.matchmaking.leave(userId);
        ctx.engine.playerDisconnected(userId);
      }
    });
  });

  return io;
}
