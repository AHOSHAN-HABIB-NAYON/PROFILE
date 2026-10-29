// Admin panel API (Phase 8), mounted at /api/v1/admin.
// HARD RULE: no endpoint here reads locations, places, trips, SOS positions, timeline or presence. In production
// `adminDb` is a MySQL user with no grants on those tables (tools/sql/admin-grants.sql); a test also checks this file.
// Auth: email + password + TOTP (2FA). Opaque session tokens (sha256 stored), 12 h. Roles: super_admin, support, finance.
// Every write is audit-logged with the admin's name and time.
import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse, limiter } from '../http.js';
import { hashPassword, verifyPassword, passwordProblems } from '../auth/passwords.js';
import { sha256 } from '../auth/tokens.js';
import { newTotpSecret, verifyTotp, otpauthUrl } from '../auth/totp.js';
import { encryptSecret, decryptSecret, maskSecret } from '../crypto/secrets.js';
import { getSetting, setSetting, getSecret, setSecret } from '../settings.js';
import { audit } from '../audit.js';
import { familyPlan } from '../users/presenter.js';
import { extendFamily, notifyFamilySubscription, redeemHash, normalizeRedeem } from './billing.js';
import { deleteUserData } from './data-rights.js';
import { processAvatar, storeAvatar, MAX_PHOTO_BYTES } from '../media/avatars.js';
import { agentJoin, handBack, closeConversation, addMessage, loadMessages, chatDir } from '../chat/service.js';
import { safeSummary, createOpenAiProvider, aiSettings } from '../chat/assistant.js';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const iso = (d) => (d ? new Date(d).toISOString() : null);
const page = (q) => ({ limit: Math.min(Number(q.limit) || 50, 200), offset: Math.max(Number(q.offset) || 0, 0) });

// Admin-editable settings (public app-config and server behaviour). Secrets are separate (encrypted).
export const SETTING_KEYS = {
  min_version: z.string().max(20), latest_version: z.string().max(20), play_store_url: z.string().url().max(300),
  update_message: z.record(z.string(), z.string().max(300)),
  whatsapp_number: z.string().max(30), landing_ai_chat_enabled: z.boolean(), payment_banner_enabled: z.boolean(), payment_banner_show_logos: z.boolean(),
  payment_banner_countries: z.array(z.string().length(2)).max(60), payment_banner_text: z.record(z.string(), z.string().max(300)),
  nearby_places_enabled: z.boolean(), nearby_places_daily_cap: z.number().int().min(0).max(1_000_000), nearby_places_per_user_daily: z.number().int().min(0).max(10_000),
  languages_enabled: z.record(z.string(), z.boolean()),
  free_plan_enabled: z.boolean(), trial_days: z.number().int().min(0).max(90),
  free_limits: z.object({ max_children: z.number().int().min(0), max_members: z.number().int().min(1), max_places: z.number().int().min(0), history_days: z.number().int().min(1) }).partial(),
  country_overrides: z.record(z.string(), z.any()),
  family_overrides: z.record(z.string(), z.any()),
  live_chat_human_for: z.enum(['all', 'premium']),
  legal_request_email: z.union([z.email(), z.literal('')]), support_emails: z.array(z.email()).max(5),
  chat_inactivity_warn_minutes: z.number().int().min(1).max(120), chat_autoclose_minutes: z.number().int().min(1).max(120),
  firebase_android: z.object({ api_key: z.string().max(100), app_id: z.string().max(100), project_id: z.string().max(100), sender_id: z.string().max(40) }).partial(),
};
export const SECRET_KEYS = ['fcm_service_account', 'play_service_account', 'play_rtdn_token', 'google_places_api_key'];
const ROLES = ['super_admin', 'support', 'finance'];

export function adminRouter(ctx) {
  const { cfg, clock, mailer } = ctx;
  const db = ctx.adminDb ?? ctx.db;
  const master = cfg.MASTER_KEY || cfg.JWT_ACCESS_SECRET;
  const r = Router();
  const loginLimit = limiter({ windowMs: 15 * 60_000, limit: 10 });

  // ---------- auth ----------
  async function requireAdmin(req, res, next) {
    try {
      const m = /^Bearer\s+(adm_\S+)$/i.exec(req.get('authorization') || '');
      if (!m) throw new ApiError('AUTH_REQUIRED');
      const s = await db('admin_sessions as s').join('admin_users as a', 'a.id', 's.admin_user_id')
        .where('s.token_hash', sha256(m[1])).whereNull('s.revoked_at').where('s.expires_at', '>', clock.now()).where('a.is_active', true)
        .first('a.*', 's.id as sid');
      if (!s) throw new ApiError('AUTH_REQUIRED');
      req.admin = s;
      next();
    } catch (e) {
      next(e);
    }
  }
  const role = (...allowed) => (req, res, next) => (req.admin.role === 'super_admin' || allowed.includes(req.admin.role) ? next() : next(new ApiError('FORBIDDEN')));
  // Writes need 2FA switched on (except setting it up).
  const twoFa = (req, res, next) => (req.admin.totp_enabled_at ? next() : next(new ApiError('FORBIDDEN', { message: 'Turn on two-factor sign-in first.', details: { reason: '2fa_required' } })));
  const log = (req, action, targetType = null, targetId = null, metadata = null) =>
    audit(db, { actorType: 'admin', actorId: req.admin.id, actorLabel: req.admin.name || req.admin.email, action, targetType, targetId, metadata, now: clock.now() });
  const presentAdmin = (a) => ({ id: String(a.id), email: a.email, name: a.name, role: a.role, two_factor: !!a.totp_enabled_at });

  r.get('/admin/setup', ah(async (req, res) => {
    const n = await db('admin_users').count({ n: '*' }).first();
    res.json({ needs_setup: Number(n.n) === 0, setup_enabled: !!cfg.ADMIN_SETUP_KEY });
  }));

  // First super admin: only while there is no admin, and only with ADMIN_SETUP_KEY from the server settings.
  r.post('/admin/setup', loginLimit, ah(async (req, res) => {
    const b = parse(z.object({ setup_key: z.string().min(8).max(200), email: z.email().max(254), password: z.string().min(10).max(72), name: z.string().trim().min(1).max(80) }), req.body);
    if (!cfg.ADMIN_SETUP_KEY) throw new ApiError('FEATURE_DISABLED', { message: 'Set ADMIN_SETUP_KEY in the server settings first.' });
    const key = Buffer.from(b.setup_key);
    const want = Buffer.from(cfg.ADMIN_SETUP_KEY);
    if (key.length !== want.length || !crypto.timingSafeEqual(key, want)) throw new ApiError('FORBIDDEN');
    if (passwordProblems(b.password).length) throw new ApiError('VALIDATION_FAILED', { details: { fields: { password: 'Choose a stronger password.' } } });
    const n = await db('admin_users').count({ n: '*' }).first();
    if (Number(n.n) > 0) throw new ApiError('CONFLICT', { message: 'Setup is already done.' });
    await db('admin_users').insert({ email: b.email.toLowerCase(), password_hash: await hashPassword(b.password, cfg.BCRYPT_COST), role: 'super_admin', name: b.name });
    res.status(201).json({ ok: true });
  }));

  r.post('/admin/auth/login', loginLimit, ah(async (req, res) => {
    const b = parse(z.object({ email: z.email().max(254), password: z.string().max(200), code: z.string().max(10).optional() }), req.body);
    const now = clock.now();
    const a = await db('admin_users').where({ email: b.email.toLowerCase() }).first();
    if (a?.locked_until && new Date(a.locked_until) > now) throw new ApiError('AUTH_LOCKED');
    const ok = await verifyPassword(b.password, a?.password_hash, cfg.BCRYPT_COST);
    if (!a || !ok || !a.is_active) {
      if (a) {
        const fails = (a.failed_login_count ?? 0) + 1;
        await db('admin_users').where({ id: a.id }).update({ failed_login_count: fails, locked_until: fails >= 5 ? new Date(now.getTime() + 15 * 60_000) : null });
      }
      throw new ApiError('AUTH_INVALID_CREDENTIALS');
    }
    if (a.totp_enabled_at) {
      if (!b.code) throw new ApiError('AUTH_INVALID_CREDENTIALS', { message: 'Enter the 6-digit code from your authenticator app.', details: { two_factor: 'required' } });
      if (!verifyTotp(decryptSecret(master, a.totp_secret_enc), b.code, now.getTime())) throw new ApiError('AUTH_INVALID_CREDENTIALS', { message: 'The code is not right.', details: { two_factor: 'invalid' } });
    }
    const token = `adm_${crypto.randomBytes(32).toString('base64url')}`;
    await db('admin_sessions').insert({ admin_user_id: a.id, token_hash: sha256(token), expires_at: new Date(now.getTime() + 12 * HOUR), created_at: now });
    await db('admin_users').where({ id: a.id }).update({ failed_login_count: 0, locked_until: null, last_login_at: now });
    await audit(db, { actorType: 'admin', actorId: a.id, actorLabel: a.name || a.email, action: 'admin.login', now });
    res.json({ token, admin: presentAdmin(a), needs_2fa_setup: !a.totp_enabled_at });
  }));

  const A = Router();
  A.use(requireAdmin);

  A.post('/auth/logout', ah(async (req, res) => {
    await db('admin_sessions').where({ id: req.admin.sid }).update({ revoked_at: clock.now() });
    res.status(204).end();
  }));
  A.get('/me', ah(async (req, res) => res.json(presentAdmin(req.admin))));

  A.post('/2fa/setup', ah(async (req, res) => {
    if (req.admin.totp_enabled_at) throw new ApiError('CONFLICT', { message: 'Two-factor sign-in is already on.' });
    const secret = newTotpSecret();
    await db('admin_users').where({ id: req.admin.id }).update({ totp_secret_enc: encryptSecret(master, secret) });
    res.json({ secret, otpauth_url: otpauthUrl(secret, req.admin.email) });
  }));
  A.post('/2fa/enable', ah(async (req, res) => {
    const b = parse(z.object({ code: z.string().max(10) }), req.body);
    const a = await db('admin_users').where({ id: req.admin.id }).first();
    if (!a.totp_secret_enc || !verifyTotp(decryptSecret(master, a.totp_secret_enc), b.code, clock.now().getTime())) throw new ApiError('CODE_INVALID');
    await db('admin_users').where({ id: a.id }).update({ totp_enabled_at: clock.now() });
    await log(req, 'admin.2fa_enabled', 'admin', a.id);
    res.json({ two_factor: true });
  }));
  A.post('/me/password', twoFa, ah(async (req, res) => {
    const b = parse(z.object({ current: z.string().max(200), new_password: z.string().min(10).max(72) }), req.body);
    if (!(await verifyPassword(b.current, req.admin.password_hash, cfg.BCRYPT_COST))) throw new ApiError('AUTH_INVALID_CREDENTIALS');
    if (passwordProblems(b.new_password).length) throw new ApiError('VALIDATION_FAILED', { details: { fields: { new_password: 'Choose a stronger password.' } } });
    await db('admin_users').where({ id: req.admin.id }).update({ password_hash: await hashPassword(b.new_password, cfg.BCRYPT_COST) });
    await db('admin_sessions').where({ admin_user_id: req.admin.id }).whereNot({ id: req.admin.sid }).update({ revoked_at: clock.now() });
    await log(req, 'admin.password_changed', 'admin', req.admin.id);
    res.status(204).end();
  }));

  // ---------- dashboard ----------
  A.get('/dashboard', ah(async (req, res) => {
    const now = clock.now();
    const count = async (q) => Number((await q.count({ n: '*' }).first()).n);
    const live = db('subscriptions').whereIn('status', ['trial', 'active', 'grace']).where((q) => q.whereNull('expires_at').orWhere('expires_at', '>', now));
    const subs = await live.clone().join('plans as p', 'p.id', 'subscriptions.plan_id').select('subscriptions.status', 'subscriptions.source', 'p.code');
    // Revenue estimate: active Play subscriptions x their default monthly price (USD list), shown as an estimate.
    const prices = await db('plan_prices as pp').join('plans as p', 'p.id', 'pp.plan_id').where({ 'pp.period': 'monthly', 'pp.currency': 'USD', 'pp.is_active': true }).whereNull('pp.country_iso2').select('p.code', 'pp.amount_minor');
    const usd = Object.fromEntries(prices.map((p) => [p.code, p.amount_minor]));
    const revenue = subs.filter((s) => s.source === 'play' && s.status === 'active').reduce((sum, s) => sum + (usd[s.code] || 0), 0);
    const byCountry = await db('users').whereNot({ status: 'deleted' }).whereNotNull('country_iso2').groupBy('country_iso2').select('country_iso2 as key').count({ n: '*' }).orderBy('n', 'desc').limit(12);
    const byVersion = await db('sessions').whereNull('revoked_at').whereNotNull('app_version').groupBy('app_version').select('app_version as key').count({ n: '*' }).orderBy('n', 'desc').limit(8);
    res.json({
      users: await count(db('users').whereNot({ status: 'deleted' }).whereNot({ auth_provider: 'device' })),
      children: await count(db('users').where({ auth_provider: 'device' }).whereNot({ status: 'deleted' })),
      new_users_7d: await count(db('users').where('created_at', '>', new Date(now - 7 * DAY)).whereNot({ status: 'deleted' })),
      families: await count(db('families').whereNull('deleted_at')),
      active_families_7d: Number((await db('child_devices').whereNull('revoked_at').where('last_seen_at', '>', new Date(now - 7 * DAY)).countDistinct({ n: 'family_id' }).first()).n),
      premium: subs.filter((s) => s.status !== 'trial').length,
      trials: subs.filter((s) => s.status === 'trial').length,
      revenue_estimate_usd_month: revenue / 100,
      open_chats: await count(db('chat_conversations').whereNot({ status: 'closed' })),
      waiting_chats: await count(db('chat_conversations').where({ status: 'needs_human' })),
      open_abuse: await count(db('abuse_reports').where({ status: 'open' })),
      by_country: byCountry.map((x) => ({ key: x.key, n: Number(x.n) })),
      by_app_version: byVersion.map((x) => ({ key: x.key, n: Number(x.n) })),
    });
  }));

  // ---------- users ----------
  async function userByUuid(uuid) {
    const u = await db('users').where({ uuid }).first();
    if (!u) throw new ApiError('NOT_FOUND');
    return u;
  }
  const presentUser = (u) => ({
    id: u.uuid, email: u.email, name: u.name, status: u.status, auth_provider: u.auth_provider, language: u.language,
    country: u.country_iso2, timezone: u.timezone, email_verified: !!u.email_verified_at, created_at: iso(u.created_at), last_login_at: iso(u.last_login_at),
  });

  A.get('/users', role('support', 'finance'), ah(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const { limit, offset } = page(req.query);
    const qb = db('users').whereNot({ status: 'deleted' }).orderBy('id', 'desc').limit(limit).offset(offset);
    if (q) qb.where((w) => w.where('email', 'like', `%${q}%`).orWhere('name', 'like', `%${q}%`).orWhere('uuid', q));
    res.json((await qb).map(presentUser));
  }));

  A.get('/users/:id', role('support', 'finance'), ah(async (req, res) => {
    const u = await userByUuid(req.params.id);
    const m = await db('family_members as m').join('families as f', 'f.id', 'm.family_id').where('m.user_id', u.id).whereNull('m.left_at')
      .first('m.role', 'm.is_overseas', 'm.sharing_status', 'f.id as fid', 'f.uuid as family_id', 'f.name as family_name', 'f.owner_user_id');
    let family = null;
    if (m) {
      const plan = await familyPlan(db, m.fid, clock.now());
      const members = await db('family_members as m').join('users as u', 'u.id', 'm.user_id').where('m.family_id', m.fid).whereNull('m.left_at')
        .select('u.uuid', 'u.name', 'm.role', 'm.sharing_status');
      const devices = await db('child_devices as d').join('users as u', 'u.id', 'd.user_id').where('d.family_id', m.fid).whereNull('d.revoked_at')
        .select('d.id', 'u.name', 'd.device_model', 'd.manufacturer', 'd.os_version', 'd.app_version', 'd.location_state', 'd.diagnostics', 'd.last_seen_at');
      const sub = await db('subscriptions as s').join('plans as p', 'p.id', 's.plan_id').where('s.family_id', m.fid).orderBy('s.id', 'desc').limit(5).select('p.code', 's.status', 's.source', 's.expires_at');
      family = {
        id: m.family_id, name: m.family_name, my_role: m.role, owner: m.owner_user_id === u.id,
        plan: plan?.code, limits: plan ? { max_children: plan.max_children, max_members: plan.max_members, max_places: plan.max_places, history_days: plan.history_days } : null,
        members: members.map((x) => ({ id: x.uuid, name: x.name, role: x.role, sharing: x.sharing_status })),
        devices: devices.map((d) => ({ id: String(d.id), child: d.name, model: [d.manufacturer, d.device_model].filter(Boolean).join(' '), android: d.os_version, app: d.app_version, location_state: d.location_state, diagnostics: typeof d.diagnostics === 'string' ? JSON.parse(d.diagnostics || '{}') : d.diagnostics, last_seen_at: iso(d.last_seen_at) })),
        subscriptions: sub.map((s) => ({ plan: s.code, status: s.status, source: s.source, expires_at: iso(s.expires_at) })),
      };
    }
    const sessions = await db('sessions').where({ user_id: u.id }).whereNull('revoked_at').orderBy('last_used_at', 'desc').limit(10).select('device_model', 'os_version', 'app_version', 'last_used_at');
    res.json({ ...presentUser(u), family, sessions: sessions.map((s) => ({ ...s, last_used_at: iso(s.last_used_at) })) });
  }));

  A.post('/users/:id/suspend', role('support'), twoFa, ah(async (req, res) => {
    const b = parse(z.object({ suspend: z.boolean() }), req.body);
    const u = await userByUuid(req.params.id);
    await db('users').where({ id: u.id }).update({ status: b.suspend ? 'suspended' : 'active' });
    if (b.suspend) await db('sessions').where({ user_id: u.id }).whereNull('revoked_at').update({ revoked_at: clock.now(), revoked_reason: 'suspended' });
    await log(req, b.suspend ? 'user.suspended' : 'user.unsuspended', 'user', u.id);
    res.json({ status: b.suspend ? 'suspended' : 'active' });
  }));

  A.post('/users/:id/delete', role('support'), twoFa, ah(async (req, res) => {
    const u = await userByUuid(req.params.id);
    const now = clock.now();
    await db('data_requests').insert({ user_id: u.id, type: 'delete', status: 'completed', source: 'support', completed_at: now, created_at: now });
    const out = await deleteUserData(ctx, u.id, { now, reason: 'support' });
    await log(req, 'user.deleted', 'user', u.id, { accounts: out.deleted.length });
    res.json({ deleted_accounts: out.deleted.length });
  }));

  A.post('/users/:id/email', role('support'), twoFa, ah(async (req, res) => {
    const b = parse(z.object({ kind: z.enum(['verify_email', 'reset_password']) }), req.body);
    const u = await userByUuid(req.params.id);
    if (!u.email || u.auth_provider === 'device') throw new ApiError('BAD_REQUEST', { message: 'This account has no email.' });
    const out = await ctx.codes.issue(u.id, b.kind);
    if (out.code) await mailer.sendCode(b.kind, u, out.code);
    await log(req, `user.email_${b.kind}`, 'user', u.id);
    res.json({ sent: !!out.code });
  }));

  A.post('/users/:id/language', role('support'), twoFa, ah(async (req, res) => {
    const b = parse(z.object({ language: z.enum(['en', 'bn', 'hi', 'ur', 'ar', 'es', 'id', 'ms']) }), req.body);
    const u = await userByUuid(req.params.id);
    await db('users').where({ id: u.id }).update({ language: b.language });
    await log(req, 'user.language', 'user', u.id, { language: b.language });
    res.status(204).end();
  }));

  // Remove a child device (consent noted by the agent).
  A.post('/devices/:id/revoke', role('support'), twoFa, ah(async (req, res) => {
    const b = parse(z.object({ consent_note: z.string().trim().min(3).max(300) }), req.body);
    const d = await db('child_devices').where({ id: Number(req.params.id) || 0 }).whereNull('revoked_at').first();
    if (!d) throw new ApiError('NOT_FOUND');
    await db('child_devices').where({ id: d.id }).update({ revoked_at: clock.now(), upload_key_hash: null });
    if (d.session_id) await db('sessions').where({ id: d.session_id }).update({ revoked_at: clock.now(), revoked_reason: 'support_removed' });
    await log(req, 'device.revoked', 'child_device', d.id, { note: b.consent_note });
    res.status(204).end();
  }));

  // ---------- families: grants and per-family limits ----------
  async function familyByUuid(uuid) {
    const f = await db('families').where({ uuid }).whereNull('deleted_at').first();
    if (!f) throw new ApiError('NOT_FOUND');
    return f;
  }

  A.post('/families/:id/grant', role('finance', 'support'), twoFa, ah(async (req, res) => {
    const b = parse(z.object({
      plan_code: z.string().max(32), days: z.number().int().min(1).max(3650), note: z.string().max(300).optional(),
      payment_reference: z.string().max(120).optional(), gift_from_name: z.string().max(80).optional(), gift_message: z.string().max(300).optional(),
    }), req.body);
    const f = await familyByUuid(req.params.id);
    const plan = await db('plans').where({ code: b.plan_code, is_free: false }).first();
    if (!plan) throw new ApiError('NOT_FOUND', { message: 'Unknown plan.' });
    const owner = await db('users').where({ id: f.owner_user_id }).first('email');
    const now = clock.now();
    const sub = await extendFamily(ctx.db, { familyId: f.id, planId: plan.id, days: b.days, source: 'grant', now });
    await db('grants').insert({
      family_id: f.id, target_user_email: owner?.email || '-', plan_id: plan.id, duration_days: b.days, note: b.note ?? null, payment_reference: b.payment_reference ?? null,
      gift_from_name: b.gift_from_name ?? null, gift_message: b.gift_message ?? null, granted_by_admin_id: req.admin.id, subscription_id: sub?.id ?? null,
    });
    await notifyFamilySubscription(ctx, f.id, b.gift_from_name
      ? { titleKey: 'notif.gift_received', params: { from: b.gift_from_name, plan: plan.name }, template: 'gift_received', vars: { from: b.gift_from_name, plan: plan.name, duration: `${b.days} days`, message: b.gift_message || '' }, emailType: 'gift' }
      : { titleKey: 'notif.plan_active', params: { plan: plan.name }, template: 'subscription', vars: { plan: plan.name, status: 'active', message: `${plan.name} is active for ${b.days} days.` } });
    await log(req, 'family.grant', 'family', f.id, { plan: plan.code, days: b.days });
    res.status(201).json({ expires_at: iso(sub?.expires_at) });
  }));

  A.put('/families/:id/limits', role('finance', 'support'), twoFa, ah(async (req, res) => {
    const b = parse(SETTING_KEYS.free_limits.nullable(), req.body?.limits ?? null);
    const f = await familyByUuid(req.params.id);
    const all = (await getSetting(db, 'family_overrides', {})) || {};
    if (b && Object.keys(b).length) all[f.uuid] = b;
    else delete all[f.uuid];
    await setSetting(db, 'family_overrides', all, req.admin.id);
    await log(req, 'family.limits', 'family', f.id, b);
    res.json({ limits: all[f.uuid] ?? null });
  }));

  // ---------- plans ----------
  A.get('/plans', role('finance'), ah(async (req, res) => {
    const plans = await db('plans').orderBy('sort_order');
    const prices = await db('plan_prices').orderBy('id');
    res.json({
      free_limits: await getSetting(db, 'free_limits', {}),
      free_plan_enabled: await getSetting(db, 'free_plan_enabled', true),
      plans: plans.map((p) => ({
        code: p.code, name: p.name, is_free: !!p.is_free, is_active: !!p.is_active, popular: !!p.is_popular, trial_days: p.trial_days,
        max_children: p.max_children, max_members: p.max_members, max_places: p.max_places, history_days: p.history_days,
        priority_support: !!p.priority_support, email_reports: !!p.email_reports,
        prices: prices.filter((x) => x.plan_id === p.id).map((x) => ({ id: String(x.id), period: x.period, months: x.duration_months, currency: x.currency, country: x.country_iso2, amount_minor: x.amount_minor, play_product_id: x.play_product_id, play_base_plan_id: x.play_base_plan_id, active: !!x.is_active })),
      })),
    });
  }));

  A.patch('/plans/:code', role('finance'), twoFa, ah(async (req, res) => {
    const b = parse(z.object({
      name: z.string().max(60), is_active: z.boolean(), is_popular: z.boolean(), trial_days: z.number().int().min(0).max(90),
      max_children: z.number().int().min(0).nullable(), max_members: z.number().int().min(1).nullable(), max_places: z.number().int().min(0).nullable(),
      history_days: z.number().int().min(1).max(3650), priority_support: z.boolean(), email_reports: z.boolean(),
    }).partial(), req.body);
    const n = await db('plans').where({ code: req.params.code }).update(b);
    if (!n) throw new ApiError('NOT_FOUND');
    await log(req, 'plan.updated', 'plan', req.params.code, b);
    res.status(204).end();
  }));

  A.put('/plans/:code/prices', role('finance'), twoFa, ah(async (req, res) => {
    const b = parse(z.array(z.object({
      period: z.enum(['monthly', 'yearly', 'one_time', 'multi_year']), months: z.number().int().min(1).max(120), currency: z.string().length(3),
      country: z.string().length(2).nullable().optional(), amount_minor: z.number().int().min(0), play_product_id: z.string().max(100).nullable().optional(),
      play_base_plan_id: z.string().max(100).nullable().optional(), active: z.boolean().default(true),
    })).max(60), req.body?.prices);
    const plan = await db('plans').where({ code: req.params.code }).first();
    if (!plan) throw new ApiError('NOT_FOUND');
    await db.transaction(async (trx) => {
      await trx('plan_prices').where({ plan_id: plan.id }).del();
      if (b.length) {
        await trx('plan_prices').insert(b.map((p) => ({
          plan_id: plan.id, period: p.period, duration_months: p.months, currency: p.currency.toUpperCase(), country_iso2: p.country?.toUpperCase() ?? null,
          amount_minor: p.amount_minor, play_product_id: p.play_product_id ?? null, play_base_plan_id: p.play_base_plan_id ?? null, is_active: p.active,
        })));
      }
    });
    await log(req, 'plan.prices', 'plan', plan.code, { count: b.length });
    res.status(204).end();
  }));

  // ---------- redeem codes ----------
  const genCode = () => {
    const A32 = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = () => Array.from(crypto.randomBytes(4), (x) => A32[x % A32.length]).join('');
    return `NRPD-${part()}-${part()}`;
  };
  A.get('/codes', role('finance'), ah(async (req, res) => {
    const { limit, offset } = page(req.query);
    const q = db('redeem_codes as c').join('plans as p', 'p.id', 'c.plan_id').orderBy('c.id', 'desc').limit(limit).offset(offset)
      .select('c.id', 'c.code_last4', 'c.duration_days', 'c.batch_name', 'c.gift_from_name', 'c.status', 'c.expires_at', 'c.created_at', 'p.code as plan');
    if (req.query.batch) q.where('c.batch_name', String(req.query.batch));
    res.json((await q).map((c) => ({ ...c, id: String(c.id), expires_at: iso(c.expires_at), created_at: iso(c.created_at) })));
  }));
  A.post('/codes', role('finance'), twoFa, ah(async (req, res) => {
    const b = parse(z.object({
      plan_code: z.string().max(32), days: z.number().int().min(1).max(3650), count: z.number().int().min(1).max(500),
      batch_name: z.string().max(80).optional(), gift_from_name: z.string().max(80).optional(), gift_message: z.string().max(300).optional(), expires_at: z.iso.datetime().optional(),
    }), req.body);
    const plan = await db('plans').where({ code: b.plan_code, is_free: false }).first();
    if (!plan) throw new ApiError('NOT_FOUND', { message: 'Unknown plan.' });
    const codes = [];
    for (let i = 0; i < b.count; i++) {
      const code = genCode();
      codes.push(code);
      await db('redeem_codes').insert({
        code_hash: redeemHash(code), code_enc: encryptSecret(master, code), code_last4: normalizeRedeem(code).slice(-4), plan_id: plan.id, duration_days: b.days,
        expires_at: b.expires_at ? new Date(b.expires_at) : null, batch_name: b.batch_name ?? null, gift_from_name: b.gift_from_name ?? null, gift_message: b.gift_message ?? null,
        created_by_admin_id: req.admin.id,
      });
    }
    await log(req, 'codes.created', 'plan', plan.code, { count: b.count, batch: b.batch_name ?? null });
    res.status(201).json({ codes }); // shown once; CSV export later decrypts again (audit-logged)
  }));
  A.get('/codes/export', role('finance'), twoFa, ah(async (req, res) => {
    const rows = await db('redeem_codes as c').join('plans as p', 'p.id', 'c.plan_id').where('c.batch_name', String(req.query.batch || '')).select('c.code_enc', 'c.status', 'c.duration_days', 'p.code as plan');
    await log(req, 'codes.exported', 'batch', String(req.query.batch || ''), { count: rows.length });
    const csv = ['code,plan,days,status', ...rows.map((x) => `${decryptSecret(master, x.code_enc)},${x.plan},${x.duration_days},${x.status}`)].join('\n');
    res.set({ 'content-type': 'text/csv', 'content-disposition': 'attachment; filename="codes.csv"', 'cache-control': 'no-store' }).send(csv);
  }));
  A.post('/codes/:id/revoke', role('finance'), twoFa, ah(async (req, res) => {
    const n = await db('redeem_codes').where({ id: Number(req.params.id) || 0, status: 'active' }).update({ status: 'revoked' });
    if (!n) throw new ApiError('NOT_FOUND');
    await log(req, 'code.revoked', 'redeem_code', req.params.id);
    res.status(204).end();
  }));
  A.get('/grants', role('finance', 'support'), ah(async (req, res) => {
    const rows = await db('grants as g').join('plans as p', 'p.id', 'g.plan_id').leftJoin('admin_users as a', 'a.id', 'g.granted_by_admin_id')
      .orderBy('g.id', 'desc').limit(200).select('g.id', 'g.target_user_email', 'g.duration_days', 'g.note', 'g.payment_reference', 'g.gift_from_name', 'g.created_at', 'p.code as plan', 'a.name as by');
    res.json(rows.map((x) => ({ ...x, id: String(x.id), created_at: iso(x.created_at) })));
  }));

  // ---------- settings and secrets ----------
  A.get('/settings', role(), ah(async (req, res) => {
    const out = {};
    for (const k of Object.keys(SETTING_KEYS)) out[k] = await getSetting(db, k, null);
    res.json(out);
  }));
  A.put('/settings', role(), twoFa, ah(async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const changed = [];
    for (const [k, v] of Object.entries(body)) {
      const schema = SETTING_KEYS[k];
      if (!schema) throw new ApiError('VALIDATION_FAILED', { details: { fields: { [k]: 'Unknown setting.' } } });
      const val = v === null ? null : parse(schema, v);
      if (val === null) await db('app_settings').where({ key: k }).del();
      else await setSetting(db, k, val, req.admin.id);
      changed.push(k);
    }
    await log(req, 'settings.updated', 'settings', null, { keys: changed });
    res.json({ updated: changed });
  }));
  A.get('/secrets', role(), ah(async (req, res) => {
    const out = {};
    for (const k of SECRET_KEYS) {
      const v = await getSecret(db, cfg, k);
      out[k] = v ? (k.endsWith('_account') ? `service account ${(() => { try { return JSON.parse(v).client_email; } catch { return 'set'; } })()}` : maskSecret(v)) : null;
    }
    const ai = await db('ai_settings').orderBy('id').first('api_key_enc');
    out.openai_api_key = ai?.api_key_enc ? maskSecret(decryptSecret(master, ai.api_key_enc)) : null;
    res.json(out);
  }));
  A.put('/secrets/:key', role(), twoFa, ah(async (req, res) => {
    const k = req.params.key;
    if (!SECRET_KEYS.includes(k)) throw new ApiError('NOT_FOUND');
    const b = parse(z.object({ value: z.string().max(20_000) }), req.body);
    if (k.endsWith('_account') && b.value) {
      let j;
      try { j = JSON.parse(b.value); } catch { j = null; }
      if (!j?.client_email || !j?.private_key) throw new ApiError('VALIDATION_FAILED', { message: 'Paste the whole service account JSON file.' });
    }
    if (b.value) await setSecret(db, cfg, k, b.value, req.admin.id);
    else await db('app_settings').where({ key: `secret.${k}` }).del();
    await log(req, 'secret.updated', 'secret', k);
    res.status(204).end();
  }));

  // ---------- AI assistant ----------
  A.get('/ai', role('support'), ah(async (req, res) => {
    const a = await db('ai_settings').orderBy('id').first();
    const day = clock.now().toISOString().slice(0, 10);
    const used = await db('ai_usage').where({ usage_date: day }).sum({ c: 'cost_usd_micros' }).count({ n: '*' }).first();
    res.json({
      provider: a?.provider ?? 'openai', enabled: !!a?.enabled, model: a?.model ?? 'gpt-4o-mini', temperature: Number(a?.temperature ?? 0.3), max_tokens: a?.max_tokens ?? 600,
      system_prompt: a?.system_prompt ?? '', daily_message_limit_per_user: a?.daily_message_limit_per_user ?? 50, global_daily_cost_cap_usd: Number(a?.global_daily_cost_cap_usd ?? 5),
      api_key: a?.api_key_enc ? maskSecret(decryptSecret(master, a.api_key_enc)) : null,
      today: { messages: Number(used?.n ?? 0), cost_usd: Number(used?.c ?? 0) / 1e6 },
    });
  }));
  A.put('/ai', role(), twoFa, ah(async (req, res) => {
    const b = parse(z.object({
      enabled: z.boolean(), model: z.string().trim().max(100), temperature: z.number().min(0).max(2), max_tokens: z.number().int().min(50).max(4000),
      system_prompt: z.string().max(8000), daily_message_limit_per_user: z.number().int().min(1).max(1000), global_daily_cost_cap_usd: z.number().min(0).max(10000),
      api_key: z.string().max(300),
    }).partial(), req.body);
    const { api_key: key, ...rest } = b;
    const patch = { ...rest };
    if (key !== undefined) patch.api_key_enc = key ? encryptSecret(master, key) : null;
    const row = await db('ai_settings').orderBy('id').first();
    if (row) await db('ai_settings').where({ id: row.id }).update(patch);
    else await db('ai_settings').insert(patch);
    await log(req, 'ai.settings', 'ai', null, { keys: Object.keys(b) });
    res.status(204).end();
  }));
  A.post('/ai/test', role(), ah(async (req, res) => {
    const ai = await aiSettings(db, cfg);
    if (!ai.apiKey) throw new ApiError('BAD_REQUEST', { message: 'Add the OpenAI API key first.' });
    const provider = ctx.aiProvider ?? createOpenAiProvider();
    try {
      const r2 = await provider.complete({ apiKey: ai.apiKey, model: ai.model, temperature: 0, maxTokens: 20, messages: [{ role: 'user', content: 'Reply with: OK' }] });
      res.json({ ok: true, reply: String(r2.text).slice(0, 100) });
    } catch (e) {
      res.json({ ok: false, status: e?.status ?? null });
    }
  }));
  A.get('/ai/usage', role('support'), ah(async (req, res) => {
    const rows = await db('ai_usage').groupBy('usage_date', 'model').select('usage_date', 'model').count({ messages: '*' }).sum({ prompt: 'prompt_tokens', completion: 'completion_tokens', cost: 'cost_usd_micros' }).orderBy('usage_date', 'desc').limit(60);
    res.json(rows.map((x) => ({ date: String(x.usage_date instanceof Date ? x.usage_date.toISOString().slice(0, 10) : x.usage_date), model: x.model, messages: Number(x.messages), prompt_tokens: Number(x.prompt), completion_tokens: Number(x.completion), cost_usd: Number(x.cost) / 1e6 })));
  }));

  // ---------- simple content tables (KB, changelog, emergency numbers, canned replies) ----------
  function crud(name, table, roles, schema, present = (x) => ({ ...x, id: String(x.id) })) {
    A.get(`/${name}`, role(...roles), ah(async (req, res) => res.json((await db(table).orderBy('id', 'desc').limit(1000)).map(present))));
    A.post(`/${name}`, role(...roles), twoFa, ah(async (req, res) => {
      const b = parse(schema, req.body);
      const [id] = await db(table).insert(b);
      await log(req, `${name}.created`, name, id);
      res.status(201).json(present(await db(table).where({ id }).first()));
    }));
    A.patch(`/${name}/:id`, role(...roles), twoFa, ah(async (req, res) => {
      const b = parse(schema.partial(), req.body);
      const n = await db(table).where({ id: Number(req.params.id) || 0 }).update(b);
      if (!n) throw new ApiError('NOT_FOUND');
      await log(req, `${name}.updated`, name, req.params.id);
      res.json(present(await db(table).where({ id: Number(req.params.id) }).first()));
    }));
    A.delete(`/${name}/:id`, role(...roles), twoFa, ah(async (req, res) => {
      const n = await db(table).where({ id: Number(req.params.id) || 0 }).del();
      if (!n) throw new ApiError('NOT_FOUND');
      await log(req, `${name}.deleted`, name, req.params.id);
      res.status(204).end();
    }));
  }
  const lang = z.enum(['en', 'bn', 'hi', 'ur', 'ar', 'es', 'id', 'ms']);
  crud('kb', 'kb_articles', ['support'], z.object({ language: lang, slug: z.string().regex(/^[a-z0-9-]{2,120}$/), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(20_000), category: z.string().max(60).nullable().optional(), is_published: z.boolean().default(true) }));
  crud('changelog', 'changelog', ['support'], z.object({ version: z.string().trim().min(1).max(20), language: lang.default('en'), title: z.string().trim().min(1).max(160), body: z.string().trim().min(1).max(5000), is_published: z.boolean().default(false), published_at: z.iso.datetime().transform((s) => new Date(s)).nullable().optional() }));
  crud('emergency-numbers', 'emergency_numbers', ['support'], z.object({ country_iso2: z.string().length(2).transform((s) => s.toUpperCase()), service: z.enum(['general', 'police', 'ambulance', 'fire']), number: z.string().trim().min(2).max(20), note: z.string().max(160).nullable().optional() }));
  crud('canned', 'canned_replies', ['support'], z.object({ language: lang.default('en'), title: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(4000) }));

  // ---------- campaigns (push and email announcements) ----------
  A.get('/campaigns', role('support'), ah(async (req, res) => res.json((await db('campaigns').orderBy('id', 'desc').limit(100)).map((c) => ({ ...c, id: String(c.id), sent_at: iso(c.sent_at), created_at: iso(c.created_at) })))));
  A.post('/campaigns', role(), twoFa, ah(async (req, res) => {
    const b = parse(z.object({ channel: z.enum(['push', 'email', 'both']), audience: z.string().regex(/^(all|free|premium|country:[A-Z]{2})$/), title: z.string().trim().min(1).max(160), body: z.string().trim().min(1).max(2000) }), req.body);
    const now = clock.now();
    const q = db('users as u').where('u.status', 'active').whereNot('u.auth_provider', 'device').select('u.id', 'u.email', 'u.language', 'u.notify_prefs');
    if (b.audience.startsWith('country:')) q.where('u.country_iso2', b.audience.slice(8));
    let users = await q;
    if (b.audience === 'free' || b.audience === 'premium') {
      const out = [];
      for (const u of users) {
        const m = await db('family_members').where({ user_id: u.id }).whereNull('left_at').first('family_id');
        const code = m ? (await familyPlan(db, m.family_id, now))?.code : 'free';
        if ((b.audience === 'premium') === (code !== 'free' && code !== 'none')) out.push(u);
      }
      users = out;
    }
    let sent = 0;
    for (const u of users) {
      let prefs = {};
      try { prefs = typeof u.notify_prefs === 'string' ? JSON.parse(u.notify_prefs) : (u.notify_prefs || {}); } catch { /* defaults */ }
      if (b.channel !== 'push' && u.email && prefs?.email?.announcements !== false) {
        if (await mailer.send('announcement', u, { title: b.title, body: b.body })) sent += 1;
      }
      if (b.channel !== 'email' && prefs?.push?.marketing !== false) {
        const rows = await ctx.db('sessions').where({ user_id: u.id }).whereNull('revoked_at').whereNotNull('fcm_token').select('fcm_token');
        for (const s of rows) {
          const r2 = await ctx.pusher.sendToToken(s.fcm_token, { title: b.title, body: b.body, category: 'marketing', data: { type: 'announcement' } }).catch(() => null);
          if (r2) sent += 1;
        }
      }
    }
    const [id] = await db('campaigns').insert({ ...b, sent_count: sent, created_by_admin_id: req.admin.id, sent_at: now, created_at: now });
    await log(req, 'campaign.sent', 'campaign', id, { audience: b.audience, channel: b.channel, sent });
    res.status(201).json({ id: String(id), sent });
  }));

  // ---------- live chat inbox ----------
  async function convByUuid(uuid) {
    const c = await db('chat_conversations').where({ uuid }).first();
    if (!c) throw new ApiError('NOT_FOUND');
    return c;
  }
  async function myAgent(req) {
    let a = await db('agents').where({ admin_user_id: req.admin.id, is_active: true }).first();
    if (!a) {
      const [id] = await db('agents').insert({ admin_user_id: req.admin.id, display_name: req.admin.name || req.admin.email.split('@')[0] });
      a = await db('agents').where({ id }).first();
    }
    return a;
  }
  A.get('/chats', role('support'), ah(async (req, res) => {
    const f = String(req.query.filter || 'active');
    const q = db('chat_conversations as c').join('users as u', 'u.id', 'c.user_id').leftJoin('agents as a', 'a.id', 'c.assigned_agent_id')
      .select('c.*', 'u.name as user_name', 'u.email as user_email', 'a.display_name as agent_name').limit(200);
    if (f === 'closed') q.where('c.status', 'closed').orderBy('c.closed_at', 'desc');
    else {
      q.whereNot('c.status', 'closed').orderBy('c.is_urgent', 'desc').orderBy('c.is_priority', 'desc').orderBy('c.last_message_at', 'desc');
      if (f === 'ai') q.where('c.status', 'ai');
      if (f === 'needs_human') q.where('c.status', 'needs_human');
      if (f === 'human') q.where('c.status', 'human');
      if (f === 'urgent') q.where('c.is_urgent', true);
      if (f === 'suspicious') q.where('c.is_suspicious', true);
    }
    const s = String(req.query.q || '').trim();
    if (s) q.where((w) => w.where('u.email', 'like', `%${s}%`).orWhere('u.name', 'like', `%${s}%`));
    const rows = await q;
    const ids = rows.map((x) => x.id);
    const last = ids.length ? await db('chat_messages').whereIn('conversation_id', ids).where({ is_internal_note: false }).whereIn('id', db('chat_messages').max('id').whereIn('conversation_id', ids).groupBy('conversation_id')).select('conversation_id', 'body', 'sender_type') : [];
    const unread = ids.length ? await db('chat_messages').whereIn('conversation_id', ids).where({ sender_type: 'user' }).whereNull('read_at').groupBy('conversation_id').select('conversation_id').count({ n: '*' }) : [];
    res.json(rows.map((c) => {
      const lm = last.find((x) => x.conversation_id === c.id);
      return {
        id: c.uuid, status: c.status, urgent: !!c.is_urgent, suspicious: !!c.is_suspicious, priority: !!c.is_priority, legal_hold: !!c.legal_hold,
        user: { name: c.user_name, email: c.user_email }, agent: c.agent_name, language: c.language, rating: c.rating,
        last_message: lm ? { sender: lm.sender_type, body: (lm.body || '').slice(0, 140) } : null,
        unread: Number(unread.find((x) => x.conversation_id === c.id)?.n ?? 0),
        last_message_at: iso(c.last_message_at), created_at: iso(c.created_at), closed_at: iso(c.closed_at),
      };
    }));
  }));
  A.get('/chats/:id', role('support'), ah(async (req, res) => {
    const c = await convByUuid(req.params.id);
    const u = await db('users').where({ id: c.user_id }).first();
    // Customer context: plan, family size, versions, diagnostics. NO location data.
    const context = await safeSummary(db, c.user_id, clock.now());
    await db('chat_messages').where({ conversation_id: c.id, sender_type: 'user' }).whereNull('read_at').update({ read_at: clock.now() });
    res.json({
      id: c.uuid, status: c.status, urgent: !!c.is_urgent, suspicious: !!c.is_suspicious, priority: !!c.is_priority, legal_hold: !!c.legal_hold, rating: c.rating,
      user: { id: u.uuid, name: u.name, email: u.email, language: u.language, country: u.country_iso2, timezone: u.timezone },
      context,
      messages: (await loadMessages(db, c.id, { internal: true })).map((m) => (m.image ? { ...m, image: { ...m.image, url: `/api/v1/admin/chats/${c.uuid}/images/${m.image.id}` } } : m)),
    });
  }));
  A.get('/chats/:id/images/:img', role('support'), ah(async (req, res) => {
    const c = await convByUuid(req.params.id);
    const a = await db('chat_attachments').where({ id: Number(req.params.img) || 0, conversation_id: c.id }).whereNull('purged_at').first();
    if (!a || !/^[0-9a-f-]{36}\.jpg$/.test(a.storage_key)) throw new ApiError('NOT_FOUND');
    res.set({ 'content-type': 'image/jpeg', 'cache-control': 'private, no-store' }).send(await fs.readFile(path.join(chatDir(cfg.UPLOAD_DIR), a.storage_key)));
  }));
  A.post('/chats/:id/join', role('support'), ah(async (req, res) => {
    const c = await convByUuid(req.params.id);
    if (c.status === 'closed') throw new ApiError('CONFLICT', { message: 'This chat is closed.' });
    const agent = await myAgent(req);
    await agentJoin(ctx, c, agent);
    await log(req, 'chat.joined', 'chat', c.id);
    res.status(204).end();
  }));
  A.post('/chats/:id/hand-back', role('support'), ah(async (req, res) => {
    const c = await convByUuid(req.params.id);
    await handBack(ctx, c);
    await log(req, 'chat.handed_back', 'chat', c.id);
    res.status(204).end();
  }));
  A.post('/chats/:id/close', role('support'), ah(async (req, res) => {
    const c = await convByUuid(req.params.id);
    if (c.status !== 'closed') await closeConversation(ctx, c, 'agent');
    await log(req, 'chat.closed', 'chat', c.id);
    res.status(204).end();
  }));
  A.post('/chats/:id/messages', role('support'), ah(async (req, res) => {
    const b = parse(z.object({ body: z.string().trim().min(1).max(4000), internal: z.boolean().default(false) }), req.body);
    const c = await convByUuid(req.params.id);
    if (c.status === 'closed') throw new ApiError('CONFLICT', { message: 'This chat is closed.' });
    const agent = await myAgent(req);
    if (!b.internal && c.status !== 'human') await agentJoin(ctx, c, agent);
    const m = await addMessage(ctx, c, { sender: b.internal ? 'system' : 'agent', agentId: agent.id, body: b.body, internal: b.internal });
    if (!b.internal) {
      await ctx.pusher.notifyUsers([c.user_id], { category: 'account', type: 'chat_reply', titleKey: 'notif.chat_reply', params: { name: agent.display_name }, data: { conversation_id: c.uuid } }).catch(() => null);
    }
    await log(req, b.internal ? 'chat.note' : 'chat.reply', 'chat', c.id);
    res.status(201).json(m);
  }));
  A.post('/chats/:id/flags', role('support'), ah(async (req, res) => {
    const b = parse(z.object({ urgent: z.boolean(), suspicious: z.boolean(), legal_hold: z.boolean() }).partial(), req.body);
    const c = await convByUuid(req.params.id);
    const patch = {};
    if (b.urgent !== undefined) patch.is_urgent = b.urgent;
    if (b.suspicious !== undefined) patch.is_suspicious = b.suspicious;
    if (b.legal_hold !== undefined) patch.legal_hold = b.legal_hold;
    await db('chat_conversations').where({ id: c.id }).update(patch);
    await log(req, 'chat.flags', 'chat', c.id, b);
    res.status(204).end();
  }));
  A.get('/chat-reports', role('support'), ah(async (req, res) => {
    const since = new Date(clock.now() - 30 * DAY);
    const convs = await db('chat_conversations').where('created_at', '>', since).select('id', 'status', 'rating', 'assigned_agent_id', 'created_at', 'closed_at');
    const ids = convs.map((c) => c.id);
    const firstAgent = ids.length ? await db('chat_messages').whereIn('conversation_id', ids).whereIn('sender_type', ['agent', 'ai']).groupBy('conversation_id').select('conversation_id').min({ at: 'created_at' }) : [];
    const resp = firstAgent.map((x) => new Date(x.at) - new Date(convs.find((c) => c.id === x.conversation_id).created_at)).filter((x) => x >= 0);
    const closed = convs.filter((c) => c.closed_at);
    const avg = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length / 1000) : null);
    res.json({
      conversations: convs.length,
      ai_resolved: closed.filter((c) => !c.assigned_agent_id).length,
      escalated: convs.filter((c) => c.assigned_agent_id || c.status === 'needs_human').length,
      first_response_s: avg(resp),
      resolution_s: avg(closed.map((c) => new Date(c.closed_at) - new Date(c.created_at))),
      satisfaction: { up: convs.filter((c) => c.rating === 'up').length, down: convs.filter((c) => c.rating === 'down').length },
    });
  }));

  // ---------- agents ----------
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } });
  A.get('/agents', role('support'), ah(async (req, res) => res.json((await db('agents').orderBy('id')).map((a) => ({ id: String(a.id), name: a.display_name, photo_url: a.photo_url, active: !!a.is_active, admin_id: String(a.admin_user_id) })))));
  A.patch('/agents/:id', role('support'), twoFa, ah(async (req, res) => {
    const b = parse(z.object({ name: z.string().trim().min(1).max(60), active: z.boolean() }).partial(), req.body);
    const a = await db('agents').where({ id: Number(req.params.id) || 0 }).first();
    if (!a || (req.admin.role !== 'super_admin' && a.admin_user_id !== req.admin.id)) throw new ApiError('NOT_FOUND');
    await db('agents').where({ id: a.id }).update({ ...(b.name ? { display_name: b.name } : {}), ...(b.active !== undefined ? { is_active: b.active } : {}) });
    await log(req, 'agent.updated', 'agent', a.id);
    res.status(204).end();
  }));
  A.post('/agents/me/photo', role('support'), upload.single('photo'), ah(async (req, res) => {
    if (!req.file?.buffer?.length) throw new ApiError('VALIDATION_FAILED');
    const agent = await myAgent(req);
    const stored = await storeAvatar(cfg.UPLOAD_DIR, await processAvatar(req.file.buffer));
    await db('agents').where({ id: agent.id }).update({ photo_url: stored.avatar_thumb_url });
    await log(req, 'agent.photo', 'agent', agent.id);
    res.json({ photo_url: stored.avatar_thumb_url });
  }));

  // ---------- tickets, abuse, data requests ----------
  A.get('/tickets', role('support'), ah(async (req, res) => {
    const rows = await db('support_tickets as t').join('users as u', 'u.id', 't.user_id').orderBy('t.is_premium', 'desc').orderBy('t.id', 'desc').limit(200).select('t.*', 'u.email', 'u.name');
    res.json(rows.map((x) => ({ id: String(x.id), subject: x.subject, body: x.body, premium: !!x.is_premium, status: x.status, user: { email: x.email, name: x.name }, created_at: iso(x.created_at) })));
  }));
  A.patch('/tickets/:id', role('support'), ah(async (req, res) => {
    const b = parse(z.object({ status: z.enum(['open', 'pending', 'resolved', 'closed']) }), req.body);
    await db('support_tickets').where({ id: Number(req.params.id) || 0 }).update(b);
    await log(req, 'ticket.updated', 'ticket', req.params.id, b);
    res.status(204).end();
  }));
  A.get('/abuse', role('support'), ah(async (req, res) => {
    const rows = await db('abuse_reports as r').leftJoin('users as a', 'a.id', 'r.reporter_user_id').leftJoin('users as b', 'b.id', 'r.reported_user_id')
      .orderBy('r.id', 'desc').limit(200).select('r.id', 'r.category', 'r.details', 'r.status', 'r.created_at', 'a.email as reporter', 'b.uuid as reported_id', 'b.email as reported');
    res.json(rows.map((x) => ({ ...x, id: String(x.id), created_at: iso(x.created_at) })));
  }));
  A.patch('/abuse/:id', role('support'), twoFa, ah(async (req, res) => {
    const b = parse(z.object({ status: z.enum(['open', 'investigating', 'resolved', 'dismissed']) }), req.body);
    await db('abuse_reports').where({ id: Number(req.params.id) || 0 }).update({ status: b.status, resolved_at: ['resolved', 'dismissed'].includes(b.status) ? clock.now() : null });
    await log(req, 'abuse.updated', 'abuse_report', req.params.id, b);
    res.status(204).end();
  }));
  A.get('/data-requests', role('support'), ah(async (req, res) => {
    const rows = await db('data_requests as d').leftJoin('users as u', 'u.id', 'd.user_id').orderBy('d.id', 'desc').limit(200)
      .select('d.id', 'd.type', 'd.status', 'd.source', 'd.created_at', 'd.completed_at', 'd.requester_email', 'u.email');
    res.json(rows.map((x) => ({ id: String(x.id), type: x.type, status: x.status, source: x.source, email: x.email || x.requester_email, created_at: iso(x.created_at), completed_at: iso(x.completed_at) })));
  }));

  // ---------- admins, audit, health ----------
  A.get('/admins', role(), ah(async (req, res) => res.json((await db('admin_users').orderBy('id')).map((a) => ({ ...presentAdmin(a), active: !!a.is_active, last_login_at: iso(a.last_login_at) })))));
  A.post('/admins', role(), twoFa, ah(async (req, res) => {
    const b = parse(z.object({ email: z.email().max(254), name: z.string().trim().min(1).max(80), role: z.enum(ROLES), password: z.string().min(10).max(72) }), req.body);
    if (passwordProblems(b.password).length) throw new ApiError('VALIDATION_FAILED', { details: { fields: { password: 'Choose a stronger password.' } } });
    if (await db('admin_users').where({ email: b.email.toLowerCase() }).first()) throw new ApiError('CONFLICT');
    const [id] = await db('admin_users').insert({ email: b.email.toLowerCase(), name: b.name, role: b.role, password_hash: await hashPassword(b.password, cfg.BCRYPT_COST) });
    await log(req, 'admin.created', 'admin', id, { role: b.role });
    res.status(201).json({ id: String(id) });
  }));
  A.patch('/admins/:id', role(), twoFa, ah(async (req, res) => {
    const b = parse(z.object({ role: z.enum(ROLES), active: z.boolean(), name: z.string().trim().min(1).max(80) }).partial(), req.body);
    const id = Number(req.params.id) || 0;
    if (id === req.admin.id && (b.active === false || (b.role && b.role !== 'super_admin'))) throw new ApiError('BAD_REQUEST', { message: 'You cannot remove your own access.' });
    const patch = { ...(b.role ? { role: b.role } : {}), ...(b.name ? { name: b.name } : {}), ...(b.active !== undefined ? { is_active: b.active } : {}) };
    const n = await db('admin_users').where({ id }).update(patch);
    if (!n) throw new ApiError('NOT_FOUND');
    if (b.active === false) await db('admin_sessions').where({ admin_user_id: id }).update({ revoked_at: clock.now() });
    await log(req, 'admin.updated', 'admin', id, b);
    res.status(204).end();
  }));
  A.get('/audit', role(), ah(async (req, res) => {
    const { limit, offset } = page(req.query);
    const rows = await db('audit_logs').orderBy('id', 'desc').limit(limit).offset(offset);
    res.json(rows.map((x) => ({ id: String(x.id), actor_type: x.actor_type, actor: x.actor_label || (x.actor_id ? `#${x.actor_id}` : null), action: x.action, target: x.target_type ? `${x.target_type}:${x.target_id ?? ''}` : null, metadata: typeof x.metadata === 'string' ? JSON.parse(x.metadata || 'null') : x.metadata, created_at: iso(x.created_at) })));
  }));
  A.get('/health', role(), ah(async (req, res) => {
    const now = clock.now();
    const jobs = await db('job_runs').whereIn('id', db('job_runs').max('id').groupBy('job')).select('job', 'status', 'affected', 'error', 'started_at', 'finished_at');
    const emails = await db('email_logs').where('created_at', '>', new Date(now - DAY)).groupBy('status').select('status').count({ n: '*' });
    const off = await db('child_devices').whereNull('revoked_at').whereIn('location_state', ['location_off', 'permission_removed']).count({ n: '*' }).first();
    const stale = await db('child_devices').whereNull('revoked_at').where('last_seen_at', '<', new Date(now - DAY)).count({ n: '*' }).first();
    const fcm = await db('sessions').whereNull('revoked_at').whereNotNull('fcm_token').count({ n: '*' }).first();
    res.json({
      jobs: jobs.map((j) => ({ ...j, started_at: iso(j.started_at), finished_at: iso(j.finished_at) })),
      emails_24h: Object.fromEntries(emails.map((e) => [e.status, Number(e.n)])),
      devices_location_off: Number(off.n), devices_not_seen_24h: Number(stale.n), push_tokens: Number(fcm.n),
      push_enabled: await ctx.pusher.enabled().catch(() => false), ai_enabled: (await aiSettings(db, cfg)).enabled,
    });
  }));

  r.use('/admin', A);
  return r;
}
