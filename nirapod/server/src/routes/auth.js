// /auth/*: register, verify email, resend code, login, Google, child code, refresh, forgot/reset, logout, sessions.
import { Router } from 'express';
import { notifyFamilyJoined } from '../family/joined.js';
import { emailAllowed } from './notifications.js';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse, limiter } from '../http.js';
import { addMs, secondsUntil, MINUTE } from '../clock.js';
import { audit } from '../audit.js';
import { email, device, language, sixDigitCode, displayName } from '../auth/schemas.js';
import { passwordProblems, hashPassword, verifyPassword } from '../auth/passwords.js';
import { FAMILY_CODE_RE, normalizeFamilyCode } from '../auth/join-codes.js';
import { presentMe, familyPlan, countActive } from '../users/presenter.js';
import { isValidIanaZone, isValidIso2 } from '../tz/index.js';

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_MS = 15 * MINUTE;

const password = z.string().max(1024);
function assertPasswordRules(pw, field = 'password') {
  const rules = passwordProblems(pw);
  if (rules.length) {
    throw new ApiError('VALIDATION_FAILED', {
      message: 'The password does not meet the rules.',
      details: { fields: { [field]: 'The password does not meet the rules.' }, rules },
    });
  }
}

export function authRouter(ctx) {
  const { db, cfg, clock, sessions, codes, throttle, mailer, google, requireAuth } = ctx;
  const r = Router();
  const authLimit = () => limiter({ windowMs: cfg.RATE_LIMIT_WINDOW_MS, limit: cfg.AUTH_RATE_LIMIT_MAX });

  const findByEmail = (e) => db('users').where({ email: e }).whereNot('status', 'deleted').first();

  async function sessionResponse(user, dev, { isChildDevice = false, extra = {}, action = 'auth.login' } = {}) {
    const fresh = await db('users').where({ id: user.id }).first();
    const priorSessions = await db('sessions').where({ user_id: user.id }).count({ n: '*' }).first();
    const { tokens, session, isNewDevice } = await sessions.create(fresh, dev, { isChildDevice });
    await db('users').where({ id: user.id }).update({ last_login_at: clock.now() });
    await audit(db, { actorId: user.id, action, targetType: 'session', targetId: session.uuid, now: clock.now() });
    if (!isChildDevice && isNewDevice && Number(priorSessions.n) > 0 && await emailAllowed(db, fresh.id, 'new_device_login')) await mailer.sendNewDeviceLogin(fresh, dev);
    return {
      ...tokens,
      session_id: session.uuid,
      user: await presentMe(db, cfg, fresh),
      needs_profile_setup: !fresh.name,
      ...extra,
    };
  }

  /** Sends a code unless a DB-side limit blocks it (silently: callers never reveal whether the account exists). */
  async function sendCode(user, purpose) {
    const out = await codes.issue(user.id, purpose);
    if (out.code) await mailer.sendCode(purpose, user, out.code);
    return out;
  }

  // ---- register ----
  r.post('/auth/register', authLimit(), ah(async (req, res) => {
    const b = parse(z.object({
      email, password, adult_and_terms_confirmed: z.boolean(), language: language.optional(), device,
    }), req.body);
    if (b.adult_and_terms_confirmed !== true) {
      throw new ApiError('CONSENT_REQUIRED', { message: 'Please confirm you are 18 or older and accept the Terms.', details: { needs: 'age_terms' } });
    }
    assertPasswordRules(b.password);
    if (await db('users').where({ email: b.email }).first('id')) {
      throw new ApiError('CONFLICT', { message: 'An account with this email already exists. Please log in.' });
    }
    const now = clock.now();
    const hash = await hashPassword(b.password, cfg.BCRYPT_COST);
    let userId;
    try {
      [userId] = await db('users').insert({
        uuid: crypto.randomUUID(), email: b.email, password_hash: hash, auth_provider: 'email',
        language: b.language ?? 'en', adult_confirmed_at: now, terms_accepted_at: now, terms_version: cfg.TERMS_VERSION,
        created_at: now,
      });
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') throw new ApiError('CONFLICT', { message: 'An account with this email already exists. Please log in.' });
      throw e;
    }
    await db('consents').insert({ user_id: userId, type: 'age_18_terms_privacy', version: cfg.TERMS_VERSION, granted: true, created_at: now });
    await audit(db, { actorId: userId, action: 'auth.register', targetType: 'user', targetId: userId, now });
    const user = await db('users').where({ id: userId }).first();
    throttle.record('verify_email', b.email);
    await sendCode(user, 'verify_email');
    res.status(201).json({ email: b.email, code_expires_in_s: 600, resend_after_s: 30 });
  }));

  // ---- verify email ----
  r.post('/auth/verify-email', authLimit(), ah(async (req, res) => {
    const b = parse(z.object({ email, code: sixDigitCode, device }), req.body);
    const user = await findByEmail(b.email);
    if (!user || user.email_verified_at || user.auth_provider === 'device') throw new ApiError('CODE_INVALID');
    await codes.verify(user.id, 'verify_email', b.code);
    await db('users').where({ id: user.id }).update({ email_verified_at: clock.now() });
    if (user.status !== 'active') throw new ApiError('FORBIDDEN', { details: { reason: 'account_suspended' } });
    const out = await sessionResponse(user, b.device, { action: 'auth.email_verified_login' });
    await mailer.sendWelcome({ ...user, email_verified_at: clock.now() });
    res.json(out);
  }));

  // ---- resend code (no enumeration: same answer for unknown emails) ----
  r.post('/auth/resend-code', authLimit(), ah(async (req, res) => {
    const b = parse(z.object({ email, purpose: z.enum(['verify_email', 'reset_password']) }), req.body);
    const wait = throttle.retryAfter(b.purpose, b.email);
    if (wait) throw new ApiError('RATE_LIMITED', { message: 'Please wait before asking for a new code.', details: { retry_after_s: wait } });
    throttle.record(b.purpose, b.email);
    const user = await findByEmail(b.email);
    const eligible = user && user.status === 'active' && user.auth_provider !== 'device'
      && (b.purpose === 'reset_password' || !user.email_verified_at);
    if (eligible) await sendCode(user, b.purpose);
    res.status(202).json({ accepted: true, resend_after_s: 30 });
  }));

  // ---- login ----
  r.post('/auth/login', authLimit(), ah(async (req, res) => {
    const b = parse(z.object({ email, password: z.string().min(1).max(1024), device }), req.body);
    const now = clock.now();
    const user = await findByEmail(b.email);
    if (user?.locked_until && user.locked_until > now) {
      throw new ApiError('AUTH_LOCKED', { details: { retry_after_s: secondsUntil(now, user.locked_until), locked_until: user.locked_until } });
    }
    const ok = await verifyPassword(b.password, user?.password_hash, cfg.BCRYPT_COST);
    if (!user || !ok) {
      if (user) {
        const failures = user.failed_login_count + 1;
        if (failures >= LOGIN_MAX_FAILURES) {
          const until = addMs(now, LOGIN_LOCK_MS);
          await db('users').where({ id: user.id }).update({ failed_login_count: 0, locked_until: until });
          await audit(db, { actorId: user.id, action: 'auth.login_locked', targetType: 'user', targetId: user.id, now });
          throw new ApiError('AUTH_LOCKED', { details: { retry_after_s: secondsUntil(now, until), locked_until: until } });
        }
        await db('users').where({ id: user.id }).update({ failed_login_count: failures });
      }
      throw new ApiError('AUTH_INVALID_CREDENTIALS');
    }
    await db('users').where({ id: user.id }).update({ failed_login_count: 0, locked_until: null });
    if (user.status !== 'active') throw new ApiError('FORBIDDEN', { message: 'This account is suspended.', details: { reason: 'account_suspended' } });
    if (!user.email_verified_at) {
      let sent = false;
      if (!throttle.retryAfter('verify_email', b.email)) {
        throttle.record('verify_email', b.email);
        sent = !!(await sendCode(user, 'verify_email')).code;
      }
      throw new ApiError('AUTH_EMAIL_NOT_VERIFIED', { details: { code_sent: sent } });
    }
    res.json(await sessionResponse(user, b.device));
  }));

  // ---- Google ----
  r.post('/auth/google', authLimit(), ah(async (req, res) => {
    const b = parse(z.object({
      id_token: z.string().min(10).max(4096), adult_and_terms_confirmed: z.boolean().optional(),
      language: language.optional(), device,
    }), req.body);
    const g = await google(b.id_token);
    if (!g.email || !g.email_verified) {
      throw new ApiError('AUTH_EMAIL_NOT_VERIFIED', { message: 'Your Google email is not verified.' });
    }
    const gEmail = String(g.email).trim().toLowerCase();
    const now = clock.now();
    const name = g.name ? Array.from(String(g.name).trim()).slice(0, 60).join('') || null : null;
    const picture = typeof g.picture === 'string' && /^https:\/\//.test(g.picture) ? g.picture.slice(0, 500) : null;

    let user = await db('users').where({ google_sub: g.sub }).whereNot('status', 'deleted').first();
    let isNew = false;
    if (!user) {
      const byEmail = await findByEmail(gEmail);
      if (byEmail && byEmail.auth_provider !== 'device') {
        const patch = { google_sub: g.sub };
        if (!byEmail.name && name) patch.name = name;
        if (!byEmail.avatar_url && picture) Object.assign(patch, { avatar_url: picture, avatar_thumb_url: picture });
        if (!byEmail.email_verified_at) {
          // An unverified email account was never proven to belong to this person: drop its password and sessions.
          Object.assign(patch, { email_verified_at: now, password_hash: null });
          await sessions.revokeAllForUser(byEmail.id, 'google_link');
        }
        await db('users').where({ id: byEmail.id }).update(patch);
        user = await db('users').where({ id: byEmail.id }).first();
      } else {
        if (b.adult_and_terms_confirmed !== true) {
          throw new ApiError('CONSENT_REQUIRED', { message: 'Please confirm you are 18 or older and accept the Terms.', details: { needs: 'age_terms' } });
        }
        const [id] = await db('users').insert({
          uuid: crypto.randomUUID(), email: gEmail, auth_provider: 'google', google_sub: g.sub, name,
          avatar_url: picture, avatar_thumb_url: picture, language: b.language ?? 'en', email_verified_at: now,
          adult_confirmed_at: now, terms_accepted_at: now, terms_version: cfg.TERMS_VERSION, created_at: now,
        });
        await db('consents').insert({ user_id: id, type: 'age_18_terms_privacy', version: cfg.TERMS_VERSION, granted: true, created_at: now });
        await audit(db, { actorId: id, action: 'auth.register_google', targetType: 'user', targetId: id, now });
        user = await db('users').where({ id }).first();
        isNew = true;
      }
    }
    if (user.status !== 'active') throw new ApiError('FORBIDDEN', { message: 'This account is suspended.', details: { reason: 'account_suspended' } });
    const out = await sessionResponse(user, b.device, { action: 'auth.login_google', extra: { is_new_account: isNew } });
    if (isNew) {
      out.needs_profile_setup = true; // name and photo are prefilled from Google, the user confirms them
      await mailer.sendWelcome(user);
    }
    res.json(out);
  }));

  // ---- child joins with a family code ----
  r.post('/auth/child', authLimit(), ah(async (req, res) => {
    const b = parse(z.object({
      code: z.string().max(20).transform(normalizeFamilyCode).pipe(z.string().regex(FAMILY_CODE_RE, 'The code is not valid.')),
      first_name: displayName,
      device: z.object({
        device_id: z.string().trim().min(1).max(64), model: z.string().trim().max(100).optional(),
        manufacturer: z.string().trim().max(60).optional(), os_version: z.string().trim().max(40).optional(),
        app_version: z.string().trim().max(20).optional(),
      }),
      timezone: z.string().max(64).refine(isValidIanaZone, 'Unknown time zone.').optional(),
      country_iso2: z.string().length(2).transform((s) => s.toUpperCase()).refine(isValidIso2, 'Unknown country.').optional(),
      language: language.optional(),
    }), req.body);
    const now = clock.now();
    const result = await db.transaction(async (trx) => {
      const jc = await trx('join_codes').where({ code: b.code }).forUpdate().first();
      if (!jc || jc.used_at || jc.revoked_at) throw new ApiError('CODE_INVALID');
      if (jc.expires_at <= now) throw new ApiError('CODE_EXPIRED');
      const plan = await familyPlan(trx, jc.family_id, now);
      const children = await countActive(trx, jc.family_id, ['child']);
      if (plan?.max_children != null && children >= plan.max_children) {
        throw new ApiError('PLAN_LIMIT_REACHED', { details: { limit: 'max_children', max: plan.max_children, current: children, plan: plan.code } });
      }
      const [userId] = await trx('users').insert({
        uuid: crypto.randomUUID(), auth_provider: 'device', name: b.first_name, timezone: b.timezone ?? null,
        country_iso2: b.country_iso2 ?? null, detected_source: b.timezone ? 'timezone' : (b.country_iso2 ? 'locale' : null),
        language: b.language ?? 'en', created_at: now,
      });
      await trx('family_members').insert({
        family_id: jc.family_id, user_id: userId, role: 'child', sharing_status: 'active', sharing_changed_at: now,
        joined_at: now, created_at: now,
      });
      await trx('join_codes').where({ id: jc.id }).update({ used_at: now, used_by_user_id: userId });
      const user = await trx('users').where({ id: userId }).first();
      const s = await sessions.create(user, b.device, { isChildDevice: true, trx });
      await trx('child_devices').insert({
        user_id: userId, family_id: jc.family_id, session_id: s.session.id, device_id: b.device.device_id,
        device_model: b.device.model ?? null, manufacturer: b.device.manufacturer ?? null,
        os_version: b.device.os_version ?? null, app_version: b.device.app_version ?? null, bound_at: now,
        last_seen_at: now, created_at: now,
      });
      await audit(trx, { actorId: userId, action: 'auth.child_join', targetType: 'session', targetId: s.session.uuid, now });
      return { user, s, familyId: jc.family_id };
    });
    await notifyFamilyJoined(ctx, { familyId: result.familyId, userId: result.user.id, role: 'child' });
    res.json({
      ...result.s.tokens,
      session_id: result.s.session.uuid,
      user: await presentMe(db, cfg, result.user),
      needs_profile_setup: false,
    });
  }));

  // ---- refresh ----
  r.post('/auth/refresh', limiter({ windowMs: cfg.RATE_LIMIT_WINDOW_MS, limit: cfg.REFRESH_RATE_LIMIT_MAX }), ah(async (req, res) => {
    const b = parse(z.object({ refresh_token: z.string().min(20).max(200) }), req.body);
    res.json(await sessions.refresh(b.refresh_token, req.get('x-device-id') || null));
  }));

  // ---- forgot / reset ----
  r.post('/auth/forgot', authLimit(), ah(async (req, res) => {
    const b = parse(z.object({ email }), req.body);
    // Always the same answer; a throttled request is silently not sent.
    if (!throttle.retryAfter('reset_password', b.email)) {
      throttle.record('reset_password', b.email);
      const user = await findByEmail(b.email);
      if (user && user.status === 'active' && user.auth_provider !== 'device') await sendCode(user, 'reset_password');
    }
    res.status(202).json({ accepted: true });
  }));

  r.post('/auth/reset', authLimit(), ah(async (req, res) => {
    const b = parse(z.object({ email, code: sixDigitCode, new_password: password }), req.body);
    assertPasswordRules(b.new_password, 'new_password');
    const user = await findByEmail(b.email);
    if (!user || user.status !== 'active' || user.auth_provider === 'device') throw new ApiError('CODE_INVALID');
    await codes.verify(user.id, 'reset_password', b.code);
    const now = clock.now();
    await db('users').where({ id: user.id }).update({
      password_hash: await hashPassword(b.new_password, cfg.BCRYPT_COST),
      failed_login_count: 0, locked_until: null, email_verified_at: user.email_verified_at ?? now,
    });
    const revoked = await sessions.revokeAllForUser(user.id, 'password_reset');
    await audit(db, { actorId: user.id, action: 'auth.password_reset', targetType: 'user', targetId: user.id, metadata: { sessions_revoked: revoked }, now });
    res.status(204).end();
  }));

  // ---- signed-in ----
  r.post('/auth/logout', requireAuth, ah(async (req, res) => {
    await sessions.revokeOne(req.session.id, 'logout');
    await audit(db, { actorId: req.user.id, action: 'auth.logout', targetType: 'session', targetId: req.session.uuid, now: clock.now() });
    res.status(204).end();
  }));

  // Change password while signed in (email accounts): current password required; other devices are signed out.
  r.post('/auth/change-password', requireAuth, authLimit(), ah(async (req, res) => {
    const b = parse(z.object({ current_password: z.string().max(200), new_password: password }), req.body);
    const user = await db('users').where({ id: req.user.id }).first();
    if (!user.password_hash) throw new ApiError('BAD_REQUEST', { message: 'This account signs in with Google.' });
    if (!(await verifyPassword(b.current_password, user.password_hash, cfg.BCRYPT_COST))) {
      throw new ApiError('AUTH_INVALID_CREDENTIALS', { message: 'The current password is not right.', details: { fields: { current_password: 'wrong' } } });
    }
    assertPasswordRules(b.new_password, 'new_password');
    await db('users').where({ id: user.id }).update({ password_hash: await hashPassword(b.new_password, cfg.BCRYPT_COST) });
    const others = await db('sessions').where({ user_id: user.id }).whereNull('revoked_at').whereNot({ id: req.session.id }).pluck('id');
    for (const id of others) await sessions.revokeOne(id, 'password_changed');
    await audit(db, { actorId: user.id, action: 'auth.password_changed', targetType: 'user', targetId: user.id, metadata: { sessions_revoked: others.length }, now: clock.now() });
    res.json({ other_sessions_signed_out: others.length });
  }));

  r.get('/auth/sessions', requireAuth, ah(async (req, res) => {
    res.set('cache-control', 'no-store').json(await sessions.list(req.user.id, req.session.id));
  }));

  r.delete('/auth/sessions/:sessionId', requireAuth, ah(async (req, res) => {
    const id = parse(z.uuid(), req.params.sessionId);
    const s = await db('sessions').where({ uuid: id, user_id: req.user.id }).whereNull('revoked_at').first('id', 'uuid');
    if (!s) throw new ApiError('NOT_FOUND');
    await sessions.revokeOne(s.id, 'remote_sign_out');
    await audit(db, { actorId: req.user.id, action: 'auth.session_revoked', targetType: 'session', targetId: s.uuid, now: clock.now() });
    res.status(204).end();
  }));

  return r;
}

