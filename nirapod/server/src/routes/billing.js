// Plans, Premium and payments (Phase 6). Plans are per family: one adult buys, everyone benefits; limits are
// enforced on the server (familyPlan). Google Play Billing is verified server-side; redeem codes are single-use.
// The app never processes local payments (the WhatsApp banner only opens a chat).
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse, limiter } from '../http.js';
import { familyPlan } from '../users/presenter.js';
import { fromJson } from '../db/json.js';
import { audit } from '../audit.js';
import { getSetting, getSecret } from '../settings.js';
import { createPlayVerifier, statusFromPlay } from '../billing/play.js';
import { familyAdults } from '../tracking/alerts.js';
import { emailAllowed } from './notifications.js';
import { sha256 } from '../auth/tokens.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
const DAY = 24 * 3600_000;
export const normalizeRedeem = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const redeemHash = (c) => sha256(`redeem:${normalizeRedeem(c)}`);
const LIVE = ['trial', 'active', 'grace'];

export async function familyOf(db, userId) {
  return db('family_members as m').join('families as f', 'f.id', 'm.family_id')
    .where({ 'm.user_id': userId }).whereNull('m.left_at').whereNull('f.deleted_at').first('f.*', 'm.role as my_role');
}

/** Current paid/trial subscription (or null), its end, and the latest gift message. */
export async function currentSubscription(db, familyId, now) {
  return db('subscriptions as s').join('plans as p', 'p.id', 's.plan_id').where('s.family_id', familyId)
    .whereIn('s.status', LIVE).where((q) => q.whereNull('s.expires_at').orWhere('s.expires_at', '>', now))
    .orderBy('s.expires_at', 'desc').first('s.*', 'p.code as plan_code', 'p.name as plan_name');
}

/** Adds `days` of `planId` to the family, after any running period of the same plan (stacking). */
export async function extendFamily(db, { familyId, planId, days, source, userId = null, now }) {
  const cur = await db('subscriptions').where({ family_id: familyId, plan_id: planId }).whereIn('status', LIVE)
    .where((q) => q.whereNull('expires_at').orWhere('expires_at', '>', now)).orderBy('expires_at', 'desc').first();
  const start = cur?.expires_at && new Date(cur.expires_at) > now ? new Date(cur.expires_at) : now;
  const [id] = await db('subscriptions').insert({
    family_id: familyId, plan_id: planId, source, status: source === 'trial' ? 'trial' : 'active',
    starts_at: now, expires_at: new Date(start.getTime() + days * DAY), purchased_by_user_id: userId, created_at: now,
  });
  return db('subscriptions').where({ id }).first();
}

export async function notifyFamilySubscription(ctx, familyId, { titleKey, params, template, vars, emailType = 'subscription' }) {
  const { db, pusher, mailer, clock, logger } = ctx;
  try {
    const adults = await familyAdults(db, familyId);
    if (!adults.length) return;
    const now = clock.now();
    await db('notifications').insert(adults.map((a) => ({
      user_id: a.id, family_id: familyId, category: 'account', type: titleKey.replace('notif.', ''), title_key: titleKey, params: JSON.stringify(params), created_at: now,
    })));
    await pusher?.notifyUsers(adults.map((a) => a.id), { category: 'account', type: titleKey.replace('notif.', ''), titleKey, params });
    const users = await db('users').whereIn('id', adults.map((a) => a.id)).select('id', 'email', 'language');
    for (const u of users) if (u.email && (await emailAllowed(db, u.id, emailType))) await mailer.send(template, u, vars);
  } catch (e) {
    logger?.warn({ err: e }, 'subscription notice failed');
  }
}

export function billingRouter(ctx) {
  const { db, cfg, clock, requireAuth, logger } = ctx;
  const r = Router();
  const play = ctx.playVerifier ?? createPlayVerifier({ db, cfg, clock, transport: ctx.playTransport });
  const optionalAuth = (req, res, next) => (req.get('authorization') ? requireAuth(req, res, next) : next());

  async function presentPlans(country) {
    const plans = await db('plans').where({ is_active: true }).orderBy('sort_order');
    const prices = await db('plan_prices').where({ is_active: true });
    const freeLimits = await getSetting(db, 'free_limits', {});
    const freeEnabled = await getSetting(db, 'free_plan_enabled', true);
    const trialDefault = await getSetting(db, 'trial_days', 7);
    return plans.filter((p) => !(p.is_free && freeEnabled === false)).map((p) => {
      const mine = prices.filter((x) => x.plan_id === p.id);
      const local = mine.filter((x) => country && x.country_iso2 === country);
      const chosen = local.length ? local : mine.filter((x) => x.country_iso2 == null);
      const limits = p.is_free ? { ...p, ...freeLimits } : p;
      return {
        code: p.code, name: p.name, name_i18n: fromJson(p.name_i18n) || null, is_free: !!p.is_free, popular: !!p.is_popular,
        trial_days: p.is_free ? 0 : (p.trial_days || trialDefault),
        limits: { max_children: limits.max_children, max_members: limits.max_members, max_places: limits.max_places, history_days: limits.history_days },
        features: fromJson(p.features) || [], priority_support: !!p.priority_support, email_reports: !!p.email_reports,
        prices: chosen.map((x) => ({
          period: x.period, duration_months: x.duration_months, currency: x.currency, amount_minor: x.amount_minor,
          per_month_minor: x.duration_months > 1 ? Math.round(x.amount_minor / x.duration_months) : x.amount_minor,
          play_product_id: x.play_product_id, play_base_plan_id: x.play_base_plan_id, play_offer_id: x.play_offer_id,
        })),
      };
    });
  }

  r.get('/plans', optionalAuth, ah(async (req, res) => {
    const q = parse(z.object({ country: z.string().regex(/^[A-Za-z]{2}$/).optional() }), req.query);
    const country = (q.country || req.user?.country_iso2 || '').toUpperCase() || null;
    const out = { country, plans: await presentPlans(country), current: null, gift: null };
    if (req.user) {
      const now = clock.now();
      const fam = await familyOf(db, req.user.id);
      if (fam) {
        const plan = await familyPlan(db, fam.id, now);
        const sub = await currentSubscription(db, fam.id, now);
        const trialUsed = !!(await db('subscriptions').where({ family_id: fam.id, source: 'trial' }).first('id'));
        out.current = {
          plan: plan?.code ?? 'free', status: sub?.status ?? 'free', source: sub?.source ?? null, expires_at: iso(sub?.expires_at),
          auto_renew: !!sub?.auto_renew, trial_used: trialUsed, can_buy: fam.my_role !== 'child',
          priority_support: !!plan?.priority_support,
        };
        const g = await db('redemptions as d').join('redeem_codes as c', 'c.id', 'd.redeem_code_id').join('plans as p', 'p.id', 'c.plan_id')
          .where('d.family_id', fam.id).whereNotNull('c.gift_from_name').orderBy('d.redeemed_at', 'desc')
          .first('c.gift_from_name', 'c.gift_message', 'c.duration_days', 'p.name as plan_name', 'd.redeemed_at');
        const gr = await db('grants as g').join('plans as p', 'p.id', 'g.plan_id').where('g.family_id', fam.id).whereNull('g.revoked_at')
          .whereNotNull('g.gift_from_name').orderBy('g.created_at', 'desc').first('g.gift_from_name', 'g.gift_message', 'g.duration_days', 'p.name as plan_name', 'g.created_at');
        const gift = [g && { ...g, at: g.redeemed_at }, gr && { ...gr, at: gr.created_at }].filter(Boolean).sort((a, b) => new Date(b.at) - new Date(a.at))[0];
        if (gift && sub) out.gift = { from: gift.gift_from_name, message: gift.gift_message ?? null, plan: gift.plan_name, duration_days: gift.duration_days };
      }
    }
    res.set('cache-control', 'no-store').json(out);
  }));

  async function adultFamily(req) {
    if (req.session?.isChildDevice) throw new ApiError('FORBIDDEN');
    const fam = await familyOf(db, req.user.id);
    if (!fam) throw new ApiError('FORBIDDEN', { details: { reason: 'no_family' } });
    if (fam.my_role === 'child') throw new ApiError('FORBIDDEN');
    return fam;
  }

  // Trial: once per family, length from the plan (default 7 days).
  r.post('/billing/trial', requireAuth, ah(async (req, res) => {
    const b = parse(z.object({ plan_code: z.string().max(32) }), req.body);
    const fam = await adultFamily(req);
    const now = clock.now();
    const plan = await db('plans').where({ code: b.plan_code, is_active: true, is_free: false }).first();
    if (!plan) throw new ApiError('NOT_FOUND');
    if (await db('subscriptions').where({ family_id: fam.id, source: 'trial' }).first('id')) {
      throw new ApiError('CONFLICT', { message: 'This family has already used its free trial.' });
    }
    const days = plan.trial_days || (await getSetting(db, 'trial_days', 7));
    const sub = await extendFamily(db, { familyId: fam.id, planId: plan.id, days, source: 'trial', userId: req.user.id, now });
    await audit(db, { actorId: req.user.id, action: 'billing.trial_started', targetType: 'family', targetId: fam.id, now });
    await notifyFamilySubscription(ctx, fam.id, {
      titleKey: 'notif.trial_started', params: { plan: plan.name, days },
      template: 'subscription', vars: { plan: plan.name, status: 'trial', message: `Your ${days}-day trial of ${plan.name} has started.` },
    });
    res.status(201).json({ plan: plan.code, status: 'trial', expires_at: iso(sub.expires_at) });
  }));

  // Google Play: the app sends the purchase token; we verify with Google before granting anything.
  r.post('/billing/play/verify', requireAuth, limiter({ windowMs: 60_000, limit: 20 }), ah(async (req, res) => {
    const b = parse(z.object({
      product_id: z.string().min(1).max(100),
      purchase_token: z.string().min(10).max(4000),
      kind: z.enum(['subscription', 'product']).default('subscription'),
    }), req.body);
    const fam = await adultFamily(req);
    const now = clock.now();
    const price = await db('plan_prices').where({ play_product_id: b.product_id, is_active: true }).first();
    if (!price) throw new ApiError('VALIDATION_FAILED', { details: { field: 'product_id' } });
    const v = b.kind === 'subscription' ? await play.verifySubscription(b.purchase_token) : await play.verifyProduct(b.product_id, b.purchase_token);
    if (!v.ok) {
      if (v.status === 503) throw new ApiError('FEATURE_DISABLED', { details: { reason: 'play_not_configured' } });
      throw new ApiError('VALIDATION_FAILED', { message: 'The purchase could not be verified.', details: { reason: 'play_rejected' } });
    }
    const tokenHash = sha256(b.purchase_token);
    let status;
    let expiresAt;
    if (v.kind === 'subscription') {
      if (v.productId && v.productId !== b.product_id) throw new ApiError('VALIDATION_FAILED', { details: { field: 'product_id' } });
      status = statusFromPlay(v.state);
      expiresAt = v.expiresAt;
    } else {
      if (v.state !== 'PURCHASED') throw new ApiError('VALIDATION_FAILED', { details: { reason: 'not_purchased' } });
      status = 'active';
      const days = price.duration_months * 30;
      const cur = await currentSubscription(db, fam.id, now);
      const start = cur?.expires_at && new Date(cur.expires_at) > now ? new Date(cur.expires_at) : now;
      expiresAt = new Date(start.getTime() + days * DAY);
    }
    // The same token can only ever belong to one family.
    const existing = await db('subscriptions').where({ play_purchase_token_hash: tokenHash }).first();
    if (existing && existing.family_id !== fam.id) throw new ApiError('CONFLICT', { message: 'This purchase belongs to another family.' });
    const row = {
      family_id: fam.id, plan_id: price.plan_id, source: 'play', status, starts_at: now, expires_at: expiresAt,
      auto_renew: !!v.autoRenew, play_purchase_token_hash: tokenHash, play_order_id: v.orderId, play_product_id: b.product_id,
      purchased_by_user_id: req.user.id,
    };
    if (existing) await db('subscriptions').where({ id: existing.id }).update(row);
    else await db('subscriptions').insert({ ...row, created_at: now });
    // A replaced (upgraded/downgraded) subscription stops counting.
    if (v.linkedToken) await db('subscriptions').where({ play_purchase_token_hash: sha256(v.linkedToken) }).update({ status: 'expired' });
    if (!v.acknowledged) await play.acknowledge(v.kind, b.product_id, b.purchase_token);
    await audit(db, { actorId: req.user.id, action: 'billing.play_verified', targetType: 'family', targetId: fam.id, now });
    if (!existing) {
      const plan = await db('plans').where({ id: price.plan_id }).first('name');
      await notifyFamilySubscription(ctx, fam.id, {
        titleKey: 'notif.plan_active', params: { plan: plan.name },
        template: 'subscription', vars: { plan: plan.name, status: 'active', message: `${plan.name} is now active for your whole family.` },
      });
    }
    const plan = await familyPlan(db, fam.id, now);
    res.json({ plan: plan.code, status, expires_at: iso(expiresAt) });
  }));

  // Real-time developer notifications (Pub/Sub push). Protected by a shared token in the URL set in admin.
  r.post('/billing/play/rtdn', ah(async (req, res) => {
    const expected = (await getSecret(db, cfg, 'play_rtdn_token')) || process.env.PLAY_RTDN_TOKEN || '';
    const given = String(req.query.token || '');
    if (!expected || given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw new ApiError('FORBIDDEN');
    }
    let msg = {};
    try {
      msg = JSON.parse(Buffer.from(req.body?.message?.data || '', 'base64').toString('utf8') || '{}');
    } catch { msg = {}; }
    const now = clock.now();
    const sn = msg.subscriptionNotification;
    const voided = msg.voidedPurchaseNotification;
    if (sn?.purchaseToken) {
      const sub = await db('subscriptions').where({ play_purchase_token_hash: sha256(sn.purchaseToken) }).first();
      if (sub) {
        const v = await play.verifySubscription(sn.purchaseToken);
        if (v.ok) await db('subscriptions').where({ id: sub.id }).update({ status: statusFromPlay(v.state), expires_at: v.expiresAt, auto_renew: !!v.autoRenew, updated_at: now });
      }
    }
    if (voided?.purchaseToken) {
      await db('subscriptions').where({ play_purchase_token_hash: sha256(voided.purchaseToken) }).update({ status: 'refunded', updated_at: now });
    }
    res.status(204).end(); // always ack so Pub/Sub does not retry forever
  }));

  // Redeem code: single use, rate limited, logged.
  r.post('/redeem', requireAuth, limiter({ windowMs: 3600_000, limit: 10 }), ah(async (req, res) => {
    const b = parse(z.object({ code: z.string().min(6).max(40) }), req.body);
    const fam = await adultFamily(req);
    const now = clock.now();
    const out = await db.transaction(async (trx) => {
      const code = await trx('redeem_codes').where({ code_hash: redeemHash(b.code) }).forUpdate().first();
      if (!code || code.status !== 'active') throw new ApiError('CODE_INVALID');
      if (code.expires_at && new Date(code.expires_at) <= now) {
        await trx('redeem_codes').where({ id: code.id }).update({ status: 'expired' });
        throw new ApiError('CODE_EXPIRED');
      }
      const sub = await extendFamily(trx, { familyId: fam.id, planId: code.plan_id, days: code.duration_days, source: 'redeem', userId: req.user.id, now });
      await trx('redemptions').insert({ redeem_code_id: code.id, family_id: fam.id, user_id: req.user.id, subscription_id: sub.id, redeemed_at: now });
      await trx('redeem_codes').where({ id: code.id }).update({ status: 'redeemed' });
      await audit(trx, { actorId: req.user.id, action: 'billing.code_redeemed', targetType: 'family', targetId: fam.id, now });
      const plan = await trx('plans').where({ id: code.plan_id }).first('name', 'code');
      return { code, sub, plan };
    });
    const months = Math.round(out.code.duration_days / 30);
    const duration = out.code.duration_days >= 360 ? `${Math.round(out.code.duration_days / 365)} year(s)` : `${months || 1} month(s)`;
    if (out.code.gift_from_name) {
      await notifyFamilySubscription(ctx, fam.id, {
        titleKey: 'notif.gift_received', params: { from: out.code.gift_from_name, plan: out.plan.name },
        template: 'gift_received', vars: { from: out.code.gift_from_name, plan: out.plan.name, duration, message: out.code.gift_message || '' }, emailType: 'gift',
      });
    } else {
      await notifyFamilySubscription(ctx, fam.id, {
        titleKey: 'notif.plan_active', params: { plan: out.plan.name },
        template: 'subscription', vars: { plan: out.plan.name, status: 'active', message: `${out.plan.name} is active for ${duration}.` },
      });
    }
    logger?.info({ family: fam.id }, 'redeem ok');
    res.json({
      plan: out.plan.code, expires_at: iso(out.sub.expires_at),
      gift: out.code.gift_from_name ? { from: out.code.gift_from_name, message: out.code.gift_message ?? null, plan: out.plan.name, duration_days: out.code.duration_days } : null,
    });
  }));

  // Public changelog for the landing page.
  r.get('/changelog', ah(async (req, res) => {
    const q = parse(z.object({ language: z.string().max(8).default('en') }), req.query);
    let rows = await db('changelog').where({ is_published: true, language: q.language }).orderBy('published_at', 'desc').limit(20);
    if (!rows.length && q.language !== 'en') rows = await db('changelog').where({ is_published: true, language: 'en' }).orderBy('published_at', 'desc').limit(20);
    res.set('cache-control', 'public, max-age=300').json(rows.map((c) => ({ version: c.version, title: c.title, body: c.body, date: iso(c.published_at ?? c.created_at) })));
  }));

  return r;
}

/** Job: expire ended subscriptions and tell the family (once). */
export async function expireSubscriptions(ctx) {
  const { db, clock } = ctx;
  const now = clock.now();
  const ended = await db('subscriptions as s').join('plans as p', 'p.id', 's.plan_id').whereIn('s.status', LIVE)
    .whereNotNull('s.expires_at').where('s.expires_at', '<=', now).select('s.id', 's.family_id', 's.source', 'p.name');
  for (const s of ended) {
    await db('subscriptions').where({ id: s.id }).update({ status: 'expired' });
    const still = await currentSubscription(db, s.family_id, now);
    if (!still) {
      await notifyFamilySubscription(ctx, s.family_id, {
        titleKey: 'notif.plan_ended', params: { plan: s.name },
        template: 'subscription', vars: { plan: s.name, status: 'ended', message: `${s.name} has ended. Your family is back on the Free plan; live location and SOS keep working.` },
      });
    }
  }
  return ended.length;
}

/** Job: remind the family 3 days before a trial or a non-renewing plan ends (push + email, once). */
export async function remindExpiring(ctx) {
  const { db, clock } = ctx;
  const now = clock.now();
  const soon = new Date(now.getTime() + 3 * DAY);
  const rows = await db('subscriptions as s').join('plans as p', 'p.id', 's.plan_id').whereIn('s.status', ['trial', 'active'])
    .where('s.auto_renew', false).whereNull('s.reminder_sent_at').whereNotNull('s.expires_at').where('s.expires_at', '>', now).where('s.expires_at', '<=', soon)
    .select('s.id', 's.family_id', 's.status', 's.expires_at', 'p.name');
  for (const s of rows) {
    const days = Math.max(1, Math.ceil((new Date(s.expires_at) - now) / DAY));
    await db('subscriptions').where({ id: s.id }).update({ reminder_sent_at: now });
    await notifyFamilySubscription(ctx, s.family_id, {
      titleKey: s.status === 'trial' ? 'notif.trial_ending' : 'notif.plan_ending', params: { plan: s.name, days },
      template: 'subscription', vars: { plan: s.name, status: s.status === 'trial' ? 'trial ends soon' : 'ends soon', message: `${s.name} ends in ${days} day(s). Renew to keep premium features; live location and SOS always stay free.` },
    });
  }
  return rows.length;
}
