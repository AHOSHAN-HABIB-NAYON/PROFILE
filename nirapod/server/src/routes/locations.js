// Location upload, live view, request-update, nearby places (Phase 2).
// Coordinates are never logged. Visibility follows family/visibility.js (adult consent rule).
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse, limiter } from '../http.js';
import { familyForMember, memberOf, isAdultRole } from '../family/access.js';
import { visibleMembers, viewersOf, activeMembers, canSee } from '../family/visibility.js';
import { familyPlan } from '../users/presenter.js';
import { zonedTimeToUtc } from '../tz/index.js';
import { audit } from '../audit.js';
import { fromJson } from '../db/json.js';
import { sha256 } from '../auth/tokens.js';
import { raiseAlert, batteryAlert } from '../tracking/alerts.js';
import { applyFences } from '../tracking/fences.js';
import crypto from 'node:crypto';

export const ONLINE_WINDOW_MS = 5 * 60_000;
export const REQUEST_UPDATE_INTERVAL_MS = 2 * 60_000;
const MAX_PAST_MS = 7 * 24 * 3600_000;
const MAX_FUTURE_MS = 2 * 60_000;

const point = z.object({
  recorded_at: z.iso.datetime({ offset: true }),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy_m: z.number().min(0).max(100_000),
  speed_mps: z.number().min(0).max(150).optional(),
  heading_deg: z.number().min(0).max(360).optional(),
  battery_pct: z.number().int().min(0).max(100).optional(),
  is_moving: z.boolean().optional(),
});

const diagnostics = z.object({
  notifications_allowed: z.boolean().optional(),
  location_allowed: z.boolean().optional(),
  background_allowed: z.boolean().optional(),
  battery_optimization_on: z.boolean().optional(),
  location_services_on: z.boolean().optional(),
  battery_saver_on: z.boolean().optional(),
}).strict();

const iso = (d) => (d ? new Date(d).toISOString() : null);
const num = (v) => (v == null ? null : Number(v));

/** Unavailable reason from the device diagnostics / state (never from coordinates). */
export function unavailableReason(device, lastPointAt, now) {
  if (!device) return lastPointAt ? null : 'phone_off';
  const d = fromJson(device.diagnostics) || {};
  if (d.location_allowed === false) return 'permission_removed';
  if (d.location_services_on === false || device.location_state === 'location_off') return 'location_off';
  if (device.location_state === 'permission_removed') return 'permission_removed';
  const seen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
  if (now.getTime() - seen > 15 * 60_000) return d.battery_saver_on ? 'battery_saver' : 'phone_off';
  return null;
}

/**
 * Uploads authenticate with the user's access token, or (child background service) with
 * `Authorization: Device <upload_key>` plus `x-device-id`. The device key only works on the routes that use
 * this middleware (location upload and shake-to-SOS).
 */
export function deviceOrUserAuth(ctx) {
  const { db, requireAuth } = ctx;
  return ah(async (req, res, next) => {
    const m = /^Device\s+(\S{20,200})$/.exec(req.get('authorization') || '');
    if (!m) return requireAuth(req, res, next);
    const deviceId = req.get('x-device-id') || '';
    const row = await db('child_devices as d').join('users as u', 'u.id', 'd.user_id')
      .where({ 'd.upload_key_hash': sha256(m[1]) }).whereNull('d.revoked_at').first('u.*', 'd.device_id');
    if (!row || row.device_id !== deviceId || row.status !== 'active') throw new ApiError('AUTH_REFRESH_INVALID');
    const { device_id: _d, ...user } = row;
    req.user = user;
    req.session = { isChildDevice: true, deviceId };
    next();
  });
}

const LIVE_SECONDS = 300;
const LIVE_WAKE_EVERY_MS = 90_000;

export function locationsRouter(ctx) {
  const { db, cfg, clock, requireAuth, realtime } = ctx;
  const r = Router();

  const uploader = deviceOrUserAuth(ctx);

  // A child session creates (or rotates) the device upload key for its native background service.
  // Adults may opt in to "share when the app is closed" too, but only while their sharing is active (consent).
  r.post('/devices/upload-key', requireAuth, ah(async (req, res) => {
    if (!req.session.isChildDevice) {
      const m = await db('family_members').where({ user_id: req.user.id }).whereNull('left_at').first();
      if (!m || m.role === 'child' || m.sharing_status !== 'active' || !req.session.deviceId) {
        throw new ApiError('FORBIDDEN', { details: { reason: 'sharing_not_active' } });
      }
      const has = await db('child_devices').where({ user_id: req.user.id, device_id: req.session.deviceId }).whereNull('revoked_at').first('id');
      if (!has) {
        const now = clock.now();
        await db('child_devices').insert({
          user_id: req.user.id, family_id: m.family_id, session_id: req.session.id ?? null, device_id: req.session.deviceId,
          bound_at: now, last_seen_at: now, created_at: now,
        });
      }
    }
    const key = crypto.randomBytes(32).toString('base64url');
    const n = await db('child_devices').where({ user_id: req.user.id, device_id: req.session.deviceId }).whereNull('revoked_at')
      .update({ upload_key_hash: sha256(key), upload_key_created_at: clock.now() });
    if (!n) throw new ApiError('FORBIDDEN', { details: { reason: 'device_not_bound' } });
    res.status(201).set('cache-control', 'no-store').json({ upload_key: key });
  }));

  // Batch upload from the device's offline queue. A state-only report (no points) is allowed, e.g.
  // "location turned off".
  r.post('/locations', uploader, limiter({ windowMs: 60_000, limit: 60 }), ah(async (req, res) => {
    const b = parse(z.object({ points: z.array(point).max(200).default([]), device_state: diagnostics.optional() })
      .refine((x) => x.points.length > 0 || x.device_state, 'points or device_state required'), req.body);
    const membership = await db('family_members').where({ user_id: req.user.id }).whereNull('left_at').first();
    if (!membership) throw new ApiError('FORBIDDEN', { details: { reason: 'no_family' } });
    // Adults share only after consenting (active); paused/stopped adults' points are not collected.
    if (membership.role !== 'child' && membership.sharing_status !== 'active') {
      throw new ApiError('CONSENT_REQUIRED', { details: { sharing_status: membership.sharing_status } });
    }
    const now = clock.now();
    const rows = b.points
      .map((p) => ({ ...p, at: new Date(p.recorded_at) }))
      .filter((p) => now - p.at <= MAX_PAST_MS && p.at - now <= MAX_FUTURE_MS)
      .sort((a, x) => a.at - x.at)
      .map((p) => ({
        family_id: membership.family_id, user_id: req.user.id, recorded_at: p.at, received_at: now,
        lat: p.lat, lng: p.lng, accuracy_m: p.accuracy_m, speed_mps: p.speed_mps ?? null, heading_deg: p.heading_deg ?? null,
        battery_pct: p.battery_pct ?? null, is_moving: p.is_moving ?? null, source: 'fused',
      }));
    if (rows.length) await db('locations').insert(rows);
    const last = rows.at(-1);
    let updateRequest = null;
    if (membership.role === 'child') {
      const device = await db('child_devices').where({ user_id: req.user.id }).whereNull('revoked_at').orderBy('id', 'desc').first();
      const upd = { last_seen_at: now, location_state: 'ok' };
      if (last?.battery_pct != null) upd.battery_pct = last.battery_pct;
      if (b.device_state) {
        upd.diagnostics = JSON.stringify(b.device_state);
        if (b.device_state.location_allowed === false) upd.location_state = 'permission_removed';
        else if (b.device_state.location_services_on === false) upd.location_state = 'location_off';
        else if (b.device_state.battery_saver_on) upd.location_state = 'battery_saver';
      }
      if (device) {
        // Alerts, once per crossing / transition.
        const bat = batteryAlert(last?.battery_pct ?? null, device.battery_alert_level ?? null);
        upd.battery_alert_level = bat.next;
        upd.offline_alerted_at = null; // back online re-arms the offline alert
        const subject = { id: req.user.id, uuid: req.user.uuid, name: req.user.name };
        if (bat.alert) {
          await raiseAlert(ctx, { familyId: membership.family_id, subject, type: bat.alert, data: { battery_pct: last.battery_pct }, now });
        }
        if ((upd.location_state === 'location_off' || upd.location_state === 'permission_removed') && device.location_state !== upd.location_state) {
          await raiseAlert(ctx, { familyId: membership.family_id, subject, type: upd.location_state, now });
        }
        await db('child_devices').where({ id: device.id }).update(upd);
      }
      // Places: arrival / departure (debounced), safe-walk arrival.
      await applyFences(ctx, { familyId: membership.family_id, subject: { id: req.user.id, uuid: req.user.uuid, name: req.user.name }, points: rows, now });
      // "Request update now": tell the device (piggybacked on uploads until FCM arrives in Phase 5).
      const pending = await db('notifications').where({ user_id: req.user.id, type: 'update_requested' }).whereNull('read_at').orderBy('id', 'desc').first();
      if (pending) {
        await db('notifications').where({ user_id: req.user.id, type: 'update_requested' }).whereNull('read_at').update({ read_at: now });
        updateRequest = { by_name: fromJson(pending.params)?.by_name ?? '' };
      }
    }
    if (last) {
      const viewers = await viewersOf(db, membership.family_id, req.user.id);
      realtime.emitToUsers(viewers, 'location.update', {
        member_id: req.user.uuid,
        point: {
          recorded_at: last.recorded_at.toISOString(), lat: last.lat, lng: last.lng, accuracy_m: last.accuracy_m,
          speed_mps: last.speed_mps, heading_deg: last.heading_deg, battery_pct: last.battery_pct, is_moving: last.is_moving,
        },
        battery_pct: last.battery_pct,
      }, now);
    }
    res.status(202).json({ accepted: rows.length, dropped: b.points.length - rows.length, update_requested: updateRequest });
  }));

  // Latest position of every member the caller may see.
  r.get('/families/:familyId/live', requireAuth, ah(async (req, res) => {
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    const now = clock.now();
    const members = await visibleMembers(db, f.id, req.user.id);
    const out = [];
    for (const m of members) {
      const p = await db('locations').where({ user_id: m.user_id, family_id: f.id }).orderBy('recorded_at', 'desc').first();
      const device = m.role === 'child' ? await db('child_devices').where({ user_id: m.user_id }).whereNull('revoked_at').orderBy('id', 'desc').first() : null;
      const lastAt = p ? new Date(p.recorded_at) : null;
      const seen = device?.last_seen_at ? new Date(device.last_seen_at) : lastAt;
      out.push({
        member_id: m.uuid,
        point: p ? {
          recorded_at: iso(p.recorded_at), lat: num(p.lat), lng: num(p.lng), accuracy_m: num(p.accuracy_m),
          speed_mps: num(p.speed_mps), heading_deg: num(p.heading_deg), battery_pct: p.battery_pct, is_moving: p.is_moving == null ? null : !!p.is_moving,
        } : null,
        last_update_at: iso(lastAt),
        battery_pct: device?.battery_pct ?? p?.battery_pct ?? null,
        online: !!seen && now - seen <= ONLINE_WINDOW_MS,
        unavailable_reason: m.role === 'child' ? unavailableReason(device, lastAt, now) : (p ? null : 'no_data'),
        place_name: null, // Phase 4 (geofences)
      });
    }
    res.set('cache-control', 'no-store').json(out);
  }));

  // Live watch: an adult has the family map open. Phones that share in the background (children, and adults
  // who opted in) send fast updates for a few minutes. Silent (the sharing notice is already visible); at most
  // one wake per family every 90 s, whoever is watching.
  const liveWoken = new Map();
  r.post('/families/:familyId/live-watch', requireAuth, limiter({ windowMs: 60_000, limit: 10 }), ah(async (req, res) => {
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    if (!isAdultRole(f.my_role) || req.session.isChildDevice) throw new ApiError('FORBIDDEN');
    const now = clock.now().getTime();
    const last = liveWoken.get(f.id) || 0;
    if (now - last < LIVE_WAKE_EVERY_MS) return res.status(202).json({ live_seconds: LIVE_SECONDS, woken: 0 });
    liveWoken.set(f.id, now);
    const rows = await db('child_devices as d')
      .join('family_members as m', function join() { this.on('m.user_id', 'd.user_id').andOn('m.family_id', 'd.family_id'); })
      .where('d.family_id', f.id).whereNull('d.revoked_at').whereNull('m.left_at').whereNotNull('d.upload_key_hash')
      .whereNot('d.user_id', req.user.id)
      .where(function sharing() { this.where('m.role', 'child').orWhere('m.sharing_status', 'active'); })
      .distinct('d.user_id');
    let woken = 0;
    try { woken = await ctx.pusher?.wakeUsers(rows.map((x) => x.user_id), { type: 'live', seconds: String(LIVE_SECONDS) }) ?? 0; } catch { /* push optional */ }
    res.status(202).json({ live_seconds: LIVE_SECONDS, woken });
  }));

  // "Request update now": wakes the child's location service (push in Phase 5, socket now); the child sees a notice.
  r.post('/families/:familyId/members/:memberId/request-update', requireAuth, ah(async (req, res) => {
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    if (!isAdultRole(f.my_role) || req.session.isChildDevice) throw new ApiError('FORBIDDEN');
    const m = await memberOf(db, f.id, req.params.memberId);
    if (m.role !== 'child') throw new ApiError('FORBIDDEN', { details: { reason: 'children_only' } });
    const now = clock.now();
    const recent = await db('timeline_events').where({ family_id: f.id, user_id: m.user_id, type: 'update_requested' })
      .where('occurred_at', '>', new Date(now.getTime() - REQUEST_UPDATE_INTERVAL_MS)).first();
    if (recent) {
      const retry = Math.ceil((new Date(recent.occurred_at).getTime() + REQUEST_UPDATE_INTERVAL_MS - now.getTime()) / 1000);
      throw new ApiError('RATE_LIMITED', { details: { retry_after_s: Math.max(1, retry) } });
    }
    const byName = req.user.name || '';
    await db('timeline_events').insert({ family_id: f.id, user_id: m.user_id, type: 'update_requested', data: JSON.stringify({ by: req.user.uuid }), occurred_at: now });
    await db('notifications').insert({
      user_id: m.user_id, family_id: f.id, category: 'family', type: 'update_requested',
      title_key: 'notif.update_requested', params: JSON.stringify({ by_name: byName }), created_at: now,
    });
    realtime.emitToUsers([m.uuid], 'update.requested', { by_name: byName }, now);
    // Wake the child phone even when the app is closed (FCM data message -> native service).
    try { await ctx.pusher?.wakeUsers([m.user_id], { type: 'update_requested', by_name: byName }); } catch { /* push optional */ }
    await audit(db, { actorId: req.user.id, action: 'location.update_requested', targetType: 'family', targetId: f.id, now });
    res.status(202).json({ requested: true });
  }));

  // Route for one calendar day in the member's saved zone. History depth follows the family plan.
  r.get('/families/:familyId/members/:memberId/route', requireAuth, ah(async (req, res) => {
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    const q = parse(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.query);
    const m = await memberOf(db, f.id, req.params.memberId);
    const all = await activeMembers(db, f.id);
    const viewer = all.find((x) => x.user_id === req.user.id);
    const subject = all.find((x) => x.user_id === m.user_id);
    if (!viewer || !subject || !canSee(viewer, subject)) throw new ApiError('NOT_FOUND');
    const now = clock.now();
    const subjectUser = await db('users').where({ id: m.user_id }).first('timezone');
    const zone = subjectUser?.timezone || 'UTC';
    const [y, mo, d] = q.date.split('-').map(Number);
    const start = zonedTimeToUtc({ year: y, month: mo, day: d }, zone);
    const end = new Date(zonedTimeToUtc({ year: y, month: mo, day: d + 1 }, zone).getTime());
    const plan = await familyPlan(db, f.id, now);
    const historyDays = plan?.history_days ?? 3;
    if (now.getTime() - end.getTime() > historyDays * 24 * 3600_000) {
      throw new ApiError('PLAN_LIMIT_REACHED', { details: { limit: 'history_days', max: historyDays, plan: plan?.code ?? 'free' } });
    }
    const rows = await db('locations').where({ user_id: m.user_id, family_id: f.id })
      .where('recorded_at', '>=', start).where('recorded_at', '<', end).orderBy('recorded_at', 'asc')
      .select('recorded_at', 'lat', 'lng', 'accuracy_m', 'battery_pct').limit(5000);
    res.set('cache-control', 'no-store').json({
      member_id: m.uuid, date: q.date, timezone: zone, history_days: historyDays,
      points: rows.map((p) => ({ recorded_at: iso(p.recorded_at), lat: num(p.lat), lng: num(p.lng), accuracy_m: num(p.accuracy_m), battery_pct: p.battery_pct })),
    });
  }));

  // Timeline: arrivals, departures, SOS, battery, offline, location-off events (newest first).
  const CATEGORY = {
    safety: ['sos', 'sos_resolved', 'battery_low', 'battery_critical', 'offline', 'location_off', 'permission_removed', 'safe_walk_overdue', 'safe_walk_stopped'],
    family: ['arrival', 'departure', 'safe_arrival', 'safe_walk_started', 'safe_walk_arrived', 'safe_walk_cancelled', 'update_requested'],
  };
  r.get('/families/:familyId/timeline', requireAuth, ah(async (req, res) => {
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    const q = parse(z.object({
      before: z.iso.datetime({ offset: true }).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      category: z.enum(['safety', 'family']).optional(),
    }), req.query);
    const visible = await visibleMembers(db, f.id, req.user.id);
    const ids = visible.map((v) => v.user_id);
    const byId = new Map(visible.map((v) => [v.user_id, v]));
    const now = clock.now();
    const plan = await familyPlan(db, f.id, now);
    const since = new Date(now.getTime() - (plan?.history_days ?? 3) * 24 * 3600_000);
    let qb = db('timeline_events').where({ family_id: f.id }).whereIn('user_id', ids.length ? ids : [0]).where('occurred_at', '>=', since);
    if (q.before) qb = qb.where('occurred_at', '<', new Date(q.before));
    if (q.category) qb = qb.whereIn('type', CATEGORY[q.category]);
    const rows = await qb.orderBy('occurred_at', 'desc').orderBy('id', 'desc').limit(q.limit);
    res.set('cache-control', 'no-store').json(rows.map((e) => {
      const data = fromJson(e.data) || {};
      delete data.by; // never expose internal ids
      return {
        id: String(e.id), type: e.type, member_id: byId.get(e.user_id)?.uuid ?? null, member_name: byId.get(e.user_id)?.name ?? '',
        occurred_at: iso(e.occurred_at), data,
      };
    }));
  }));

  return r;
}
