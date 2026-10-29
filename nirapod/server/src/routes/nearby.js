// Nearby places via Google Places API (New) searchNearby, cached per coarse grid cell for 24 h.
// Limits: admin switch nearby_places_enabled, global daily cap, per-user daily limit (app_settings).
// The cache is keyed by grid cell only and is never linked to a user. Coordinates are never logged.
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse } from '../http.js';
import { fromJson } from '../db/json.js';

export const CATEGORIES = {
  school: ['school', 'primary_school', 'secondary_school'],
  hospital: ['hospital'],
  police: ['police'],
  pharmacy: ['pharmacy'],
  mosque: ['mosque'],
  store: ['supermarket', 'grocery_store', 'convenience_store'],
};
const CACHE_MS = 24 * 3600_000;
const RADIUS_M = 2000;

/** ~1.1 km cell. */
export const gridCell = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

export function haversineM(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** Default fetcher: Places API (New). Returns [{id, name, lat, lng, address}]. */
export function googlePlacesFetcher(apiKey) {
  return async ({ lat, lng, types, language }) => {
    if (!apiKey) throw new ApiError('FEATURE_DISABLED', { details: { reason: 'not_configured' } });
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
        'x-goog-fieldmask': 'places.id,places.displayName,places.location,places.shortFormattedAddress',
      },
      body: JSON.stringify({
        includedTypes: types,
        maxResultCount: 10,
        languageCode: language,
        locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: RADIUS_M } },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new ApiError('SERVICE_UNAVAILABLE', { details: { reason: 'places_error' } });
    const j = await res.json();
    return (j.places || []).map((p) => ({
      id: p.id, name: p.displayName?.text ?? '', lat: p.location?.latitude, lng: p.location?.longitude, address: p.shortFormattedAddress ?? null,
    }));
  };
}

export function nearbyRouter(ctx) {
  const { db, clock, requireAuth, placesFetcher } = ctx;
  const r = Router();
  const usage = { day: '', total: 0, perUser: new Map() }; // in-memory daily counters (single instance)

  async function setting(key, fallback) {
    const row = await db('app_settings').where({ key }).first();
    return row ? fromJson(row.value) : fallback;
  }

  r.get('/nearby', requireAuth, ah(async (req, res) => {
    const q = parse(z.object({
      lat: z.coerce.number().min(-90).max(90),
      lng: z.coerce.number().min(-180).max(180),
      categories: z.string().max(100).optional(),
    }), req.query);
    if (!(await setting('nearby_places_enabled', true))) throw new ApiError('FEATURE_DISABLED');
    const cats = (q.categories ? q.categories.split(',') : Object.keys(CATEGORIES)).map((c) => c.trim()).filter((c) => CATEGORIES[c]);
    if (!cats.length) throw new ApiError('VALIDATION_FAILED', { details: { fields: { categories: 'Unknown category' } } });
    const now = clock.now();
    const day = now.toISOString().slice(0, 10);
    if (usage.day !== day) Object.assign(usage, { day, total: 0, perUser: new Map() });
    const cell = gridCell(q.lat, q.lng);
    const language = req.user.language || 'en';
    const places = [];
    let fetched = false;
    for (const cat of cats) {
      const cached = await db('nearby_cache').where({ grid_cell: cell, category: cat, language }).where('expires_at', '>', now).first();
      if (cached) {
        places.push(...fromJson(cached.payload).map((p) => ({ ...p, category: cat })));
        continue;
      }
      const cap = await setting('nearby_places_daily_cap', 1000);
      const perUserMax = await setting('nearby_places_per_user_daily', 30);
      const mine = usage.perUser.get(req.user.id) ?? 0;
      if (usage.total >= cap || mine >= perUserMax) continue; // over limits: serve what is cached only
      const found = await placesFetcher({ lat: Number(cell.split(',')[0]), lng: Number(cell.split(',')[1]), types: CATEGORIES[cat], language });
      usage.total += 1;
      usage.perUser.set(req.user.id, mine + 1);
      fetched = true;
      await db('nearby_cache').insert({
        grid_cell: cell, category: cat, language, payload: JSON.stringify(found), fetched_at: now, expires_at: new Date(now.getTime() + CACHE_MS),
      }).onConflict(['grid_cell', 'category', 'language']).merge();
      places.push(...found.map((p) => ({ ...p, category: cat })));
    }
    const me = { lat: q.lat, lng: q.lng };
    const out = places
      .filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number')
      .map((p) => ({ ...p, distance_m: haversineM(me, p) }))
      .sort((a, b) => a.distance_m - b.distance_m);
    res.set('cache-control', 'private, max-age=300').json({ places: out, fetched });
  }));

  return r;
}
