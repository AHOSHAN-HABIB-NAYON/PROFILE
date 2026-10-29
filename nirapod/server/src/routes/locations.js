// Location upload, live view, request-update, nearby places (Phase 2).
// Coordinates are never logged. Visibility follows family/visibility.js (adult consent rule).
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse, limiter } from '../http.js';
import { familyForMember, memberOf, isAdultRole } from '../family/access.js';
import { visibleMembers, viewersOf } from '../family/visibility.js';
import { audit } from '../audit.js';
import { fromJson } from '../db/json.js';

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

export function locationsRouter(ctx) {
  const { db, cfg, clock, requireAuth, realtime } = ctx;
  const r = Router();

  // Batch upload from the device's offline queue.
  r.post('/locations', requireAuth, limiter({ windowMs: 60_000, limit: 60 }), ah(async (req, res) => {
    const b = parse(z.object({ points: z.array(point).min(1).max(200), device_state: diagnostics.optional() }), req.body);
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
    if (membership.role === 'child') {
      const upd = { last_seen_at: now, location_state: 'ok' };
      if (last?.battery_pct != null) upd.battery_pct = last.battery_pct;
      if (b.device_state) {
        upd.diagnostics = JSON.stringify(b.device_state);
        if (b.device_state.location_allowed === false) upd.location_state = 'permission_removed';
        else if (b.device_state.location_services_on === false) upd.location_state = 'location_off';
        else if (b.device_state.battery_saver_on) upd.location_state = 'battery_saver';
      }
      await db('child_devices').where({ user_id: req.user.id }).whereNull('revoked_at').update(upd);
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
    res.status(202).json({ accepted: rows.length, dropped: b.points.length - rows.length });
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
    await audit(db, { actorId: req.user.id, action: 'location.update_requested', targetType: 'family', targetId: f.id, now });
    res.status(202).json({ requested: true });
  }));

  return r;
}
