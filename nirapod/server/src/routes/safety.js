// Safety (Phase 4): SOS with per-recipient delivery status, "I arrived safely", and safe walk home (trips).
// SOS is never behind a paywall. Recipients: every parent/guardian of the family (realtime + email; push is
// added in Phase 5) and the family's emergency contacts (email only, no SMS). The map link and the position go
// only to those recipients; nothing about the position is logged.
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse, limiter } from '../http.js';
import { familyForMember, isAdultRole } from '../family/access.js';
import { raiseAlert, familyAdults } from '../tracking/alerts.js';
import { finishTrip, placesFor } from '../tracking/fences.js';
import { distanceM } from '../safety/geo.js';
import { deviceOrUserAuth } from './locations.js';
import { formatLocalTime } from '../tz/index.js';
import { emailAllowed } from './notifications.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
const num = (v) => (v == null ? null : Number(v));
const RECENT_POINT_MS = 15 * 60_000;
const STATUS_ORDER = ['queued', 'sent', 'delivered', 'seen', 'responded'];

export const mapUrl = (lat, lng) => (lat == null ? null : `https://maps.google.com/?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`);

async function membershipOf(db, userId) {
  const m = await db('family_members as m').join('families as f', 'f.id', 'm.family_id')
    .where({ 'm.user_id': userId }).whereNull('m.left_at').whereNull('f.deleted_at').first('m.*', 'f.uuid as family_uuid');
  if (!m) throw new ApiError('FORBIDDEN', { details: { reason: 'no_family' } });
  return m;
}

async function lastPoint(db, userId, now) {
  const p = await db('locations').where({ user_id: userId }).orderBy('recorded_at', 'desc').first('lat', 'lng', 'accuracy_m', 'recorded_at');
  if (!p || now - new Date(p.recorded_at) > RECENT_POINT_MS) return null;
  return p;
}

export function safetyRouter(ctx) {
  const { db, clock, requireAuth, realtime, mailer } = ctx;
  const r = Router();
  const deviceAuth = deviceOrUserAuth(ctx);

  async function presentSos(ev) {
    const sender = await db('users').where({ id: ev.user_id }).first('uuid', 'name', 'country_iso2');
    const deliveries = await db('sos_deliveries as d').leftJoin('users as u', 'u.id', 'd.recipient_user_id')
      .where({ 'd.sos_event_id': ev.id }).orderBy('d.id').select('d.*', 'u.uuid as user_uuid', 'u.name as user_name');
    const contacts = new Map((await db('emergency_contacts').where({ family_id: ev.family_id })).map((c) => [c.email, c.name]));
    return {
      id: ev.uuid, status: ev.status, trigger: ev.trigger,
      member: { id: sender?.uuid ?? null, name: sender?.name ?? '' },
      started_at: iso(ev.started_at), resolved_at: iso(ev.resolved_at),
      lat: num(ev.lat), lng: num(ev.lng), accuracy_m: num(ev.accuracy_m), map_url: mapUrl(ev.lat, ev.lng),
      deliveries: deliveries.map((d) => ({
        recipient: d.user_uuid ? { type: 'member', id: d.user_uuid, name: d.user_name ?? '' }
          : { type: 'contact', name: contacts.get(d.recipient_email) ?? '', email: d.recipient_email },
        channel: d.channel, status: d.status,
        sent_at: iso(d.sent_at), delivered_at: iso(d.delivered_at), seen_at: iso(d.seen_at), responded_at: iso(d.responded_at),
      })),
    };
  }

  async function sosFor(req) {
    const id = z.uuid().safeParse(req.params.sosId);
    if (!id.success) throw new ApiError('NOT_FOUND');
    const ev = await db('sos_events').where({ uuid: id.data }).first();
    if (!ev) throw new ApiError('NOT_FOUND');
    const m = await db('family_members').where({ family_id: ev.family_id, user_id: req.user.id }).whereNull('left_at').first();
    // The sender and the family's adults; nobody else learns it exists.
    if (!m || (ev.user_id !== req.user.id && !isAdultRole(m.role))) throw new ApiError('NOT_FOUND');
    return { ev, me: m };
  }

  async function notifySosChange(ev, now) {
    const adults = await familyAdults(db, ev.family_id);
    const sender = await db('users').where({ id: ev.user_id }).first('uuid');
    realtime?.emitToUsers([...adults.map((a) => a.uuid), sender?.uuid].filter(Boolean), 'sos.updated', await presentSos(ev), now);
  }

  // ---- SOS ----
  r.post('/sos', deviceAuth, limiter({ windowMs: 60_000, limit: 10 }), ah(async (req, res) => {
    const b = parse(z.object({
      trigger: z.enum(['button', 'shake']).default('button'),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      accuracy_m: z.number().min(0).max(100_000).optional(),
    }), req.body);
    const now = clock.now();
    const m = await membershipOf(db, req.user.id);
    const open = await db('sos_events').where({ user_id: req.user.id }).whereIn('status', ['sending', 'active']).first();
    if (open) return res.status(200).json(await presentSos(open)); // one open SOS per person (double taps, retries)

    const pos = b.lat != null && b.lng != null ? { lat: b.lat, lng: b.lng, accuracy_m: b.accuracy_m ?? null } : await lastPoint(db, req.user.id, now);
    const uuid = crypto.randomUUID();
    const [evId] = await db('sos_events').insert({
      uuid, family_id: m.family_id, user_id: req.user.id, trigger: b.trigger, status: 'active',
      lat: pos?.lat ?? null, lng: pos?.lng ?? null, accuracy_m: pos?.accuracy_m ?? null, started_at: now,
    });
    const ev = await db('sos_events').where({ id: evId }).first();
    const subject = { id: req.user.id, uuid: req.user.uuid, name: req.user.name };
    const adults = await raiseAlert(ctx, { familyId: m.family_id, subject, type: 'sos', category: 'safety', now, data: { sos_id: uuid } });

    // Realtime to every adult now (the app shows the full-screen SOS alert and acknowledges delivery).
    if (adults.length) {
      await db('sos_deliveries').insert(adults.map((a) => ({ sos_event_id: evId, recipient_user_id: a.id, channel: 'socket', status: 'sent', sent_at: now })));
    }
    const payload = await presentSos(ev);
    realtime?.emitToUsers(adults.map((a) => a.uuid), 'sos.new', payload, now);

    // Email to adults and emergency contacts, in their language (contacts get the sender's language).
    const sender = await db('users').where({ id: req.user.id }).first('name', 'language', 'timezone', 'country_iso2');
    const numbers = sender?.country_iso2 ? await db('emergency_numbers').where({ country_iso2: sender.country_iso2 }).orderBy('service') : [];
    const label = { general: 'Emergency', police: 'Police', ambulance: 'Ambulance', fire: 'Fire' };
    const emergency = numbers.map((e) => `${label[e.service] ?? e.service} ${e.number}`).join(', ');
    const time = formatLocalTime(now, sender?.timezone || 'UTC', { language: 'en', hour24: false });
    const vars = { name: sender?.name || '', time, map_url: mapUrl(ev.lat, ev.lng), emergency };
    const adultUsers = adults.length ? await db('users').whereIn('id', adults.map((a) => a.id)).select('id', 'email', 'language') : [];
    const contacts = await db('emergency_contacts').where({ family_id: m.family_id });
    const targets = [
      ...adultUsers.map((u) => ({ row: { sos_event_id: evId, recipient_user_id: u.id, channel: 'email' }, user: u })),
      ...contacts.map((c) => ({ row: { sos_event_id: evId, recipient_email: c.email, channel: 'email' }, user: { email: c.email, language: sender?.language } })),
    ];
    await Promise.all(targets.map(async (t) => {
      const ok = await mailer.send('sos_alert', t.user, vars);
      await db('sos_deliveries').insert({ ...t.row, status: ok ? 'sent' : 'failed', sent_at: ok ? now : null, error: ok ? null : 'email_failed' });
    }));
    res.status(201).json(await presentSos(ev));
  }));

  r.get('/sos/:sosId', requireAuth, ah(async (req, res) => {
    const { ev } = await sosFor(req);
    res.set('cache-control', 'no-store').json(await presentSos(ev));
  }));

  r.get('/families/:familyId/sos', requireAuth, ah(async (req, res) => {
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    let q = db('sos_events').where({ family_id: f.id }).whereIn('status', ['sending', 'active']).orderBy('started_at', 'desc');
    if (!isAdultRole(f.my_role)) q = q.where({ user_id: req.user.id });
    res.set('cache-control', 'no-store').json(await Promise.all((await q).map(presentSos)));
  }));

  // A recipient's app reports delivered (alert received), seen (opened) or responded ("I'm coming").
  r.post('/sos/:sosId/ack', requireAuth, ah(async (req, res) => {
    const b = parse(z.object({ state: z.enum(['delivered', 'seen', 'responded']) }), req.body);
    const { ev } = await sosFor(req);
    const now = clock.now();
    const row = await db('sos_deliveries').where({ sos_event_id: ev.id, recipient_user_id: req.user.id, channel: 'socket' }).first();
    if (!row) throw new ApiError('FORBIDDEN');
    // Status only moves forward; earlier steps are filled in when skipped (seen implies delivered).
    const target = STATUS_ORDER.indexOf(b.state);
    if (STATUS_ORDER.indexOf(row.status) < target) {
      const upd = { status: b.state };
      if (target >= 2 && !row.delivered_at) upd.delivered_at = now;
      if (target >= 3 && !row.seen_at) upd.seen_at = now;
      if (target >= 4) upd.responded_at = now;
      await db('sos_deliveries').where({ id: row.id }).update(upd);
      await notifySosChange(ev, now);
    }
    res.json(await presentSos(ev));
  }));

  // The sender ("I'm safe now") or an adult ends the SOS.
  r.post('/sos/:sosId/resolve', requireAuth, ah(async (req, res) => {
    const { ev } = await sosFor(req);
    const now = clock.now();
    if (ev.status === 'active' || ev.status === 'sending') {
      await db('sos_events').where({ id: ev.id }).update({ status: 'resolved', resolved_at: now, resolved_by_user_id: req.user.id });
      const subject = await db('users').where({ id: ev.user_id }).first('id', 'uuid', 'name');
      const by = req.user.id === ev.user_id ? null : req.user.name;
      await raiseAlert(ctx, { familyId: ev.family_id, subject, type: 'sos_resolved', category: 'safety', now, data: { sos_id: ev.uuid, by_name: by } });
      await notifySosChange(await db('sos_events').where({ id: ev.id }).first(), now);
      // SOS summary email to the adults who allow it.
      const adultsAll = await familyAdults(db, ev.family_id);
      const users = adultsAll.length ? await db('users').whereIn('id', adultsAll.map((a) => a.id)).select('id', 'email', 'language', 'timezone') : [];
      for (const u of users) {
        if (!(await emailAllowed(db, u.id, 'sos_summary'))) continue;
        const zone = u.timezone || 'UTC';
        await mailer.send('sos_summary', u, {
          name: subject?.name || '',
          started: formatLocalTime(new Date(ev.started_at), zone, { language: 'en' }),
          ended: formatLocalTime(now, zone, { language: 'en' }),
        });
      }
    }
    res.json(await presentSos(await db('sos_events').where({ id: ev.id }).first()));
  }));

  // ---- "I arrived safely" ----
  r.post('/safe-arrival', requireAuth, limiter({ windowMs: 60_000, limit: 3 }), ah(async (req, res) => {
    const now = clock.now();
    const m = await membershipOf(db, req.user.id);
    const p = await lastPoint(db, req.user.id, now);
    let place = null;
    if (p) {
      const near = (await placesFor(db, m.family_id, req.user.uuid))
        .map((x) => ({ x, d: distanceM(Number(x.lat), Number(x.lng), Number(p.lat), Number(p.lng)) }))
        .filter((o) => o.d <= o.x.radius_m + 50)
        .sort((a, b) => a.d - b.d)[0];
      place = near?.x ?? null;
    }
    const subject = { id: req.user.id, uuid: req.user.uuid, name: req.user.name };
    await raiseAlert(ctx, {
      familyId: m.family_id, subject, type: 'safe_arrival', category: 'family', now, placeId: place?.id ?? null,
      data: { place: place?.name ?? null, at: now.toISOString() },
    });
    const trip = await db('trips').where({ user_id: req.user.id, status: 'active' }).first();
    if (trip) await finishTrip(ctx, { trip, subject, now, how: 'manual' });
    res.status(201).json({ sent: true, place: place?.name ?? null, at: now.toISOString() });
  }));

  // ---- safe walk home (trips) ----
  async function presentTrip(t) {
    const u = await db('users').where({ id: t.user_id }).first('uuid', 'name');
    const place = t.destination_place_id ? await db('places').where({ id: t.destination_place_id }).first('uuid', 'name', 'type') : null;
    const now = clock.now();
    return {
      id: t.uuid, status: t.status, member: { id: u?.uuid ?? null, name: u?.name ?? '' },
      destination: place ? { id: place.uuid, name: place.name, type: place.type } : null,
      started_at: iso(t.started_at), expected_arrival_at: iso(t.expected_arrival_at), ended_at: iso(t.ended_at),
      overdue: t.status === 'active' && new Date(t.expected_arrival_at) < now,
      stopped: t.status === 'active' && t.stopped_alerted_at != null,
    };
  }

  async function tripFor(req) {
    const id = z.uuid().safeParse(req.params.tripId);
    if (!id.success) throw new ApiError('NOT_FOUND');
    const t = await db('trips').where({ uuid: id.data }).first();
    if (!t) throw new ApiError('NOT_FOUND');
    const m = await db('family_members').where({ family_id: t.family_id, user_id: req.user.id }).whereNull('left_at').first();
    if (!m || (t.user_id !== req.user.id && !isAdultRole(m.role))) throw new ApiError('NOT_FOUND');
    return t;
  }

  async function emitTrip(t, now) {
    const adults = await familyAdults(db, t.family_id);
    const u = await db('users').where({ id: t.user_id }).first('uuid');
    realtime?.emitToUsers([...adults.map((a) => a.uuid), u?.uuid].filter(Boolean), 'trip.updated', await presentTrip(t), now);
  }

  r.post('/trips', requireAuth, ah(async (req, res) => {
    const b = parse(z.object({
      minutes: z.number().int().min(5).max(240).optional(),
      expected_arrival_at: z.iso.datetime({ offset: true }).optional(),
      destination_place_id: z.uuid().optional(),
    }).refine((x) => x.minutes != null || x.expected_arrival_at, 'minutes or expected_arrival_at'), req.body);
    const now = clock.now();
    const m = await membershipOf(db, req.user.id);
    const expected = b.expected_arrival_at ? new Date(b.expected_arrival_at) : new Date(now.getTime() + b.minutes * 60_000);
    if (expected <= now || expected - now > 6 * 3600_000) throw new ApiError('VALIDATION_FAILED', { details: { field: 'expected_arrival_at' } });
    const mine = await placesFor(db, m.family_id, req.user.uuid);
    const dest = b.destination_place_id ? mine.find((p) => p.uuid === b.destination_place_id) : mine.find((p) => p.type === 'home');
    if (b.destination_place_id && !dest) throw new ApiError('VALIDATION_FAILED', { details: { field: 'destination_place_id' } });
    await db('trips').where({ user_id: req.user.id, status: 'active' }).update({ status: 'cancelled', ended_at: now });
    const uuid = crypto.randomUUID();
    await db('trips').insert({
      uuid, family_id: m.family_id, user_id: req.user.id, type: 'safe_walk', destination_place_id: dest?.id ?? null,
      expected_arrival_at: expected, status: 'active', started_at: now,
    });
    const t = await db('trips').where({ uuid }).first();
    // A destination we can detect: arrival there ends the walk on its own. Already inside? Forget the state so
    // the next confirmed points count again.
    const subject = { id: req.user.id, uuid: req.user.uuid, name: req.user.name };
    await raiseAlert(ctx, {
      familyId: m.family_id, subject, type: 'safe_walk_started', category: 'safety', now, placeId: dest?.id ?? null,
      data: { place: dest?.name ?? null, expected_at: expected.toISOString() },
    });
    await emitTrip(t, now);
    res.status(201).json(await presentTrip(t));
  }));

  r.get('/trips/active', requireAuth, ah(async (req, res) => {
    const t = await db('trips').where({ user_id: req.user.id, status: 'active' }).first();
    res.set('cache-control', 'no-store').json(t ? await presentTrip(t) : null);
  }));

  r.get('/families/:familyId/trips', requireAuth, ah(async (req, res) => {
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    let q = db('trips').where({ family_id: f.id, status: 'active' }).orderBy('started_at', 'desc');
    if (!isAdultRole(f.my_role)) q = q.where({ user_id: req.user.id });
    res.set('cache-control', 'no-store').json(await Promise.all((await q).map(presentTrip)));
  }));

  r.post('/trips/:tripId/arrive', requireAuth, ah(async (req, res) => {
    const t = await tripFor(req);
    if (t.user_id !== req.user.id) throw new ApiError('FORBIDDEN');
    const subject = { id: req.user.id, uuid: req.user.uuid, name: req.user.name };
    await finishTrip(ctx, { trip: t, subject, now: clock.now(), how: 'manual' });
    res.json(await presentTrip(await db('trips').where({ id: t.id }).first()));
  }));

  r.post('/trips/:tripId/cancel', requireAuth, ah(async (req, res) => {
    const t = await tripFor(req);
    const now = clock.now();
    const n = await db('trips').where({ id: t.id, status: 'active' }).update({ status: 'cancelled', ended_at: now });
    if (n) {
      const subject = await db('users').where({ id: t.user_id }).first('id', 'uuid', 'name');
      await raiseAlert(ctx, { familyId: t.family_id, subject, type: 'safe_walk_cancelled', category: 'family', now });
      await emitTrip(await db('trips').where({ id: t.id }).first(), now);
    }
    res.json(await presentTrip(await db('trips').where({ id: t.id }).first()));
  }));

  return r;
}
