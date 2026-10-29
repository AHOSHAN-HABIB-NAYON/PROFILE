// Places geofencing on the server (Phase 4): every upload is checked against the family's places that apply
// to this child, with a 2-point debounce (safety/geo.js). Confirmed transitions become arrival/departure
// alerts; arriving at a safe-walk destination ends the walk. The device also registers Android geofences that
// only *wake it up* to send fresh points sooner; the decision is always made here.
import { stepFence } from '../safety/geo.js';
import { fromJson } from '../db/json.js';
import { raiseAlert } from './alerts.js';

export async function placesFor(db, familyId, userUuid) {
  const rows = await db('places').where({ family_id: familyId });
  return rows.filter((p) => {
    const to = fromJson(p.applies_to_user_uuids);
    return !Array.isArray(to) || to.length === 0 || to.includes(userUuid);
  });
}

/** Ends an active safe walk as arrived (geofence or "I arrived"). Returns the trip or null. */
export async function finishTrip(ctx, { trip, subject, now, how }) {
  const { db, realtime } = ctx;
  const n = await db('trips').where({ id: trip.id, status: 'active' }).update({ status: 'arrived', ended_at: now });
  if (!n) return null;
  const place = trip.destination_place_id ? await db('places').where({ id: trip.destination_place_id }).first('name') : null;
  const adults = await raiseAlert(ctx, {
    familyId: trip.family_id, subject, type: 'safe_walk_arrived', category: 'safety', now,
    placeId: trip.destination_place_id ?? null, data: { place: place?.name ?? null, how },
  });
  realtime?.emitToUsers([...adults.map((a) => a.uuid), subject.uuid], 'trip.updated', { id: trip.uuid, status: 'arrived' }, now);
  return trip;
}

export async function applyFences(ctx, { familyId, subject, points, now }) {
  const { db } = ctx;
  if (!points.length) return [];
  const places = await placesFor(db, familyId, subject.uuid);
  if (!places.length) return [];
  const pts = points.map((p) => ({ lat: Number(p.lat), lng: Number(p.lng), accuracy_m: Number(p.accuracy_m), at: p.recorded_at }));
  const presence = new Map((await db('place_presence').where({ user_id: subject.id }).whereIn('place_id', places.map((p) => p.id)))
    .map((r) => [r.place_id, r]));
  const fired = [];
  for (const place of places) {
    const prev = presence.get(place.id);
    const { next, events } = stepFence(place, prev, pts);
    const row = { state: next.state, pending_state: next.pending_state, pending_count: next.pending_count };
    if (next.changedAt) row.changed_at = next.changedAt;
    if (prev) await db('place_presence').where({ id: prev.id }).update(row);
    else await db('place_presence').insert({ place_id: place.id, user_id: subject.id, ...row });
    for (const e of events) {
      await raiseAlert(ctx, {
        familyId, subject, type: e.type, category: 'family', now, placeId: place.id,
        data: { place: place.name, place_type: place.type, at: new Date(e.at).toISOString() },
      });
      fired.push({ ...e, place_id: place.id });
      if (e.type === 'arrival') {
        const trip = await db('trips').where({ user_id: subject.id, status: 'active', destination_place_id: place.id }).first();
        if (trip) await finishTrip(ctx, { trip, subject, now, how: 'geofence' });
      }
    }
  }
  return fired;
}
