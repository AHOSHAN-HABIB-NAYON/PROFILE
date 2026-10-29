// Alerts list (bell), read state, push token and notification/email preferences (Phase 5).
import { Router } from 'express';
import { z } from 'zod';
import { ah, parse } from '../http.js';
import { fromJson } from '../db/json.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

export const EMAIL_TYPES = ['family_joined', 'new_device_login', 'sos_summary', 'subscription', 'gift', 'daily_summary', 'chat', 'announcements'];
export const PUSH_CATEGORIES = ['family', 'account', 'marketing'];

export function readPrefs(raw) {
  const p = fromJson(raw) || {};
  return {
    push: Object.fromEntries(PUSH_CATEGORIES.map((c) => [c, p.push?.[c] !== false && !(c === 'marketing' && p.push?.[c] == null)])),
    email: Object.fromEntries(EMAIL_TYPES.map((e) => [e, p.email?.[e] !== false && !(e === 'announcements' && p.email?.[e] == null)])),
  };
}

/** May this user receive email of `type`? (Verification / password reset are always sent.) */
export async function emailAllowed(db, userId, type) {
  const u = await db('users').where({ id: userId }).first('notify_prefs');
  return readPrefs(u?.notify_prefs).email[type] !== false;
}

export function notificationsRouter(ctx) {
  const { db, clock, requireAuth } = ctx;
  const r = Router();

  r.get('/notifications', requireAuth, ah(async (req, res) => {
    const q = parse(z.object({
      category: z.enum(['safety', 'family', 'account', 'marketing']).optional(),
      before: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }), req.query);
    let qb = db('notifications').where({ user_id: req.user.id }).whereNot('type', 'update_requested');
    if (q.category) qb = qb.where({ category: q.category });
    if (q.before) qb = qb.where('id', '<', q.before);
    const rows = await qb.orderBy('id', 'desc').limit(q.limit);
    const unread = Number((await db('notifications').where({ user_id: req.user.id }).whereNull('read_at').whereNot('type', 'update_requested').count({ n: '*' }).first()).n);
    res.set('cache-control', 'no-store').json({
      unread,
      items: rows.map((n) => {
        const params = fromJson(n.params) || {};
        delete params.sos_id;
        return { id: String(n.id), category: n.category, type: n.type, title_key: n.title_key, params, read: n.read_at != null, created_at: iso(n.created_at), sos_id: fromJson(n.params)?.sos_id ?? null };
      }),
    });
  }));

  r.post('/notifications/read', requireAuth, ah(async (req, res) => {
    const b = parse(z.object({ ids: z.array(z.string().regex(/^\d+$/)).max(200).optional(), all: z.boolean().optional() }), req.body);
    let qb = db('notifications').where({ user_id: req.user.id }).whereNull('read_at');
    if (!b.all) qb = qb.whereIn('id', (b.ids ?? []).map(Number));
    const n = await qb.update({ read_at: clock.now() });
    res.json({ updated: n });
  }));

  r.post('/me/push-token', requireAuth, ah(async (req, res) => {
    const b = parse(z.object({ token: z.string().min(20).max(255).nullable() }), req.body);
    if (req.session?.id) await db('sessions').where({ id: req.session.id }).update({ fcm_token: b.token });
    if (b.token) await db('sessions').where({ fcm_token: b.token }).whereNot({ id: req.session?.id ?? 0 }).update({ fcm_token: null });
    res.status(204).end();
  }));

  r.get('/me/notification-prefs', requireAuth, ah(async (req, res) => {
    const u = await db('users').where({ id: req.user.id }).first('notify_prefs', 'daily_summary_hour');
    res.json({ ...readPrefs(u?.notify_prefs), daily_summary_hour: u?.daily_summary_hour ?? null });
  }));

  r.patch('/me/notification-prefs', requireAuth, ah(async (req, res) => {
    const b = parse(z.object({
      push: z.object(Object.fromEntries(PUSH_CATEGORIES.map((c) => [c, z.boolean().optional()]))).optional(),
      email: z.object(Object.fromEntries(EMAIL_TYPES.map((c) => [c, z.boolean().optional()]))).optional(),
      daily_summary_hour: z.number().int().min(0).max(23).nullable().optional(),
    }), req.body);
    const u = await db('users').where({ id: req.user.id }).first('notify_prefs');
    const cur = fromJson(u?.notify_prefs) || {};
    const next = { push: { ...(cur.push || {}), ...(b.push || {}) }, email: { ...(cur.email || {}), ...(b.email || {}) } };
    const upd = { notify_prefs: JSON.stringify(next) };
    if (b.daily_summary_hour !== undefined) upd.daily_summary_hour = b.daily_summary_hour;
    await db('users').where({ id: req.user.id }).update(upd);
    const after = await db('users').where({ id: req.user.id }).first('notify_prefs', 'daily_summary_hour');
    res.json({ ...readPrefs(after.notify_prefs), daily_summary_hour: after.daily_summary_hour ?? null });
  }));

  return r;
}
