import { emailSchema, loginSchema, passwordSchema, registerSchema } from '@quizwar/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../context';
import { clearRefreshCookie, clientMeta, isNative, requireCsrfHeader, requireUser, setRefreshCookie, uid } from '../http/guards';
import { unauthorized } from '../lib/errors';
import { parse } from '../lib/validate';
import type { TokenPair } from '../modules/auth/auth.service';
import { getMe } from '../modules/users/users.repo';

const COOKIE = 'qw_rt';
const COOKIE_PATH = '/api/v1/auth';

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const secure = ctx.env.NODE_ENV === 'production' || ctx.env.NODE_ENV === 'staging';
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  /** Web gets the refresh token as an httpOnly cookie; native apps get it in the body (stored in secure storage). */
  async function respond(req: FastifyRequest, reply: FastifyReply, t: TokenPair, extra: Record<string, unknown> = {}) {
    const me = await getMe(t.userId);
    if (isNative(req)) return { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn, user: me, ...extra };
    setRefreshCookie(reply, COOKIE, COOKIE_PATH, t.refreshToken, ctx.env.REFRESH_TOKEN_TTL_DAYS * 86400, secure);
    return { accessToken: t.accessToken, expiresIn: t.expiresIn, user: me, ...extra };
  }

  app.post('/auth/register', strict, async (req, reply) => {
    const b = parse(registerSchema, req.body);
    return respond(req, reply, await ctx.auth.register(b.email, b.password, clientMeta(req)));
  });

  app.post('/auth/login', strict, async (req, reply) => {
    const b = parse(loginSchema, req.body);
    return respond(req, reply, await ctx.auth.login(b.email, b.password, clientMeta(req)));
  });

  app.post('/auth/google', strict, async (req, reply) => {
    const b = parse(z.object({ idToken: z.string().min(20).max(4096) }), req.body);
    const t = await ctx.auth.loginWithGoogle(b.idToken, clientMeta(req));
    return respond(req, reply, t, { created: t.created });
  });

  app.post('/auth/passkey/login/options', strict, async () => ctx.passkeys.loginOptions());

  app.post('/auth/passkey/login/verify', strict, async (req, reply) => {
    const b = parse(z.object({ challengeId: z.string().max(64), response: z.any() }), req.body);
    return respond(req, reply, await ctx.passkeys.verifyLogin(b.challengeId, b.response, clientMeta(req)));
  });

  app.post('/auth/passkey/register/options', { preHandler: requireUser(ctx) }, async (req) => ctx.passkeys.registrationOptions(uid(req)));

  app.post('/auth/passkey/register/verify', { preHandler: requireUser(ctx) }, async (req) => {
    const b = parse(z.object({ challengeId: z.string().max(64), response: z.any(), name: z.string().max(80).optional() }), req.body);
    return ctx.passkeys.verifyRegistration(uid(req), b.challengeId, b.response, b.name);
  });

  app.get('/auth/passkeys', { preHandler: requireUser(ctx) }, async (req) => ({ items: await ctx.passkeys.list(uid(req)) }));
  app.delete('/auth/passkeys/:id', { preHandler: requireUser(ctx) }, async (req) => {
    await ctx.passkeys.remove(uid(req), Number((req.params as any).id));
    return { ok: true };
  });

  app.post('/auth/refresh', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = (req.body ?? {}) as { refreshToken?: string };
    let token = isNative(req) ? body.refreshToken : undefined;
    if (!token) {
      requireCsrfHeader(req);
      token = req.cookies[COOKIE];
    }
    if (!token) throw unauthorized();
    try {
      return await respond(req, reply, await ctx.auth.refresh(token, clientMeta(req)));
    } catch (err: any) {
      if (err?.statusCode === 401 || err?.status === 401) clearRefreshCookie(reply, COOKIE, COOKIE_PATH, secure);
      throw err;
    }
  });

  app.post('/auth/logout', async (req, reply) => {
    const body = (req.body ?? {}) as { refreshToken?: string };
    const token = isNative(req) ? body.refreshToken : (requireCsrfHeader(req), req.cookies[COOKIE]);
    if (token) await ctx.auth.logoutByRefresh(token);
    clearRefreshCookie(reply, COOKIE, COOKIE_PATH, secure);
    return { ok: true };
  });

  app.post('/auth/logout-all', { preHandler: requireUser(ctx) }, async (req, reply) => {
    await ctx.auth.revokeAllSessions(uid(req), 'logout_all');
    clearRefreshCookie(reply, COOKIE, COOKIE_PATH, secure);
    return { ok: true };
  });

  app.get('/auth/sessions', { preHandler: requireUser(ctx) }, async (req) => ({ items: await ctx.auth.listSessions(uid(req), req.user!.sid) }));
  app.delete('/auth/sessions/:id', { preHandler: requireUser(ctx) }, async (req) => {
    await ctx.auth.revokeSession(uid(req), Number((req.params as any).id));
    return { ok: true };
  });
  app.get('/auth/login-history', { preHandler: requireUser(ctx) }, async (req) => ({ items: await ctx.auth.loginHistory(uid(req)) }));

  app.post('/auth/verify-email', strict, async (req) => {
    const b = parse(z.object({ token: z.string().min(10).max(200) }), req.body);
    await ctx.auth.verifyEmail(b.token);
    return { ok: true };
  });
  app.post('/auth/resend-verification', { preHandler: requireUser(ctx), ...strict }, async (req) => {
    await ctx.auth.resendVerification(uid(req));
    return { ok: true };
  });
  app.post('/auth/forgot-password', { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } }, async (req) => {
    const b = parse(z.object({ email: emailSchema }), req.body);
    await ctx.auth.forgotPassword(b.email);
    return { ok: true };
  });
  app.post('/auth/reset-password', strict, async (req) => {
    const b = parse(z.object({ token: z.string().min(10).max(200), password: passwordSchema }), req.body);
    await ctx.auth.resetPassword(b.token, b.password);
    return { ok: true };
  });
  app.post('/auth/change-password', { preHandler: requireUser(ctx), ...strict }, async (req) => {
    const b = parse(z.object({ currentPassword: z.string().max(128).nullable().optional(), newPassword: passwordSchema }), req.body);
    await ctx.auth.changePassword(uid(req), b.currentPassword ?? null, b.newPassword, req.user!.sid);
    return { ok: true };
  });

  app.delete('/auth/account', { preHandler: requireUser(ctx), ...strict }, async (req, reply) => {
    const b = parse(z.object({ password: z.string().max(128).nullable().optional(), confirmation: z.string() }), req.body);
    const userId = uid(req);
    await ctx.auth.verifyDeletion(userId, b.password ?? null, b.confirmation);
    ctx.matchmaking.leave(userId);
    const live = ctx.engine.activeMatchOf(userId);
    if (live) await ctx.engine.forfeit(live.id, userId);
    await ctx.squads.leave(userId);
    await ctx.profile.removeAvatar(userId).catch(() => undefined);
    await ctx.auth.deleteAccount(userId, b.password ?? null, b.confirmation);
    clearRefreshCookie(reply, COOKIE, COOKIE_PATH, secure);
    return { ok: true };
  });
}
