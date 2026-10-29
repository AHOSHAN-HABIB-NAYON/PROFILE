// Distance and geofence helpers (Phase 4). Pure functions: easy to test, no I/O, nothing logged.

const R = 6_371_000;
const rad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceM(aLat, aLng, bLat, bLng) {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Points the device reports with worse accuracy than this are ignored for geofencing. */
export const MAX_FENCE_ACCURACY_M = 150;
/** Outside needs this much margin beyond the radius (avoids flapping on the edge). */
export const EXIT_MARGIN_M = 25;
/** Consecutive agreeing points needed before a state change counts. */
export const DEBOUNCE_POINTS = 2;

/** inside / outside / null (in the edge band or too inaccurate to tell). */
export function observe(place, p) {
  if (p.accuracy_m > Math.max(MAX_FENCE_ACCURACY_M, place.radius_m)) return null;
  const d = distanceM(Number(place.lat), Number(place.lng), p.lat, p.lng);
  if (d <= place.radius_m) return 'inside';
  if (d > place.radius_m + EXIT_MARGIN_M) return 'outside';
  return null;
}

/**
 * Debounced state machine for one place and one person.
 * @param prev {state, pending_state, pending_count} (state null = never confirmed yet)
 * @param points sorted oldest first, each {lat, lng, accuracy_m, at}
 * @returns {{next, events: Array<{type: 'arrival'|'departure', at: Date}>}}
 * The very first confirmed state is silent (creating a place while the child is at home is not an "arrival").
 */
export function stepFence(place, prev, points) {
  let state = prev?.state ?? null;
  let pending = prev?.pending_state ?? null;
  let count = prev?.pending_count ?? 0;
  let changedAt = null;
  const events = [];
  for (const p of points) {
    const obs = observe(place, p);
    if (obs == null) continue;
    if (obs === state) {
      pending = null;
      count = 0;
      continue;
    }
    if (pending === obs) count += 1;
    else {
      pending = obs;
      count = 1;
    }
    if (count >= DEBOUNCE_POINTS) {
      if (state != null) events.push({ type: obs === 'inside' ? 'arrival' : 'departure', at: p.at });
      state = obs;
      pending = null;
      count = 0;
      changedAt = p.at;
    }
  }
  return { next: { state, pending_state: pending, pending_count: count, changedAt }, events };
}

/** True when every point of the window stays within `radiusM` of the first (the person has not moved). */
export function stayedWithin(points, radiusM) {
  if (points.length < 2) return false;
  const [a] = points;
  return points.every((p) => distanceM(Number(a.lat), Number(a.lng), Number(p.lat), Number(p.lng)) <= radiusM);
}
