// Places (Phase 4): home / school / coaching / custom with a 100-300 m radius and the children they apply to.
// Adults manage places; a child lists only the places that apply to them (its phone registers geofences).
// The number of places follows the family plan (free: 2) and the limit answers PLAN_LIMIT_REACHED (upsell).
// Also: emergency contacts (email only, no SMS) and the admin-editable emergency numbers by country.
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse } from '../http.js';
import { familyForMember, isAdultRole } from '../family/access.js';
import { activeMembers } from '../family/visibility.js';
import { familyPlan } from '../users/presenter.js';
import { fromJson } from '../db/json.js';
import { audit } from '../audit.js';
import { placesFor } from '../tracking/fences.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);

export function presentPlace(p) {
  const to = fromJson(p.applies_to_user_uuids);
  return {
    id: p.uuid, name: p.name, type: p.type, lat: Number(p.lat), lng: Number(p.lng), radius_m: p.radius_m,
    applies_to: Array.isArray(to) ? to : [], created_at: iso(p.created_at),
  };
}

const placeBody = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(['home', 'school', 'coaching', 'custom']).default('custom'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.number().int().min(100).max(300).default(150),
  // Child member ids; empty = every child of the family.
  applies_to: z.array(z.uuid()).max(20).default([]),
});

export function placesRouter(ctx) {
  const { db, clock, requireAuth } = ctx;
  const r = Router();

  async function adultFamily(req) {
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    if (!isAdultRole(f.my_role) || req.session.isChildDevice) throw new ApiError('FORBIDDEN');
    return f;
  }

  async function checkChildren(familyId, ids) {
    if (!ids.length) return;
    const kids = new Set((await activeMembers(db, familyId)).filter((m) => m.role === 'child').map((m) => m.uuid));
    if (ids.some((id) => !kids.has(id))) throw new ApiError('VALIDATION_FAILED', { details: { field: 'applies_to' } });
  }

  r.get('/families/:familyId/places', requireAuth, ah(async (req, res) => {
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    const now = clock.now();
    const plan = await familyPlan(db, f.id, now);
    const rows = f.my_role === 'child'
      ? await placesFor(db, f.id, req.user.uuid)
      : await db('places').where({ family_id: f.id }).orderBy('id', 'asc');
    res.set('cache-control', 'no-store').json({
      places: rows.map(presentPlace),
      max_places: plan?.max_places ?? null,
      plan: plan?.code ?? 'free',
    });
  }));

  r.post('/families/:familyId/places', requireAuth, ah(async (req, res) => {
    const f = await adultFamily(req);
    const b = parse(placeBody, req.body);
    await checkChildren(f.id, b.applies_to);
    const now = clock.now();
    const plan = await familyPlan(db, f.id, now);
    const count = Number((await db('places').where({ family_id: f.id }).count({ n: '*' }).first()).n);
    if (plan?.max_places != null && count >= plan.max_places) {
      throw new ApiError('PLAN_LIMIT_REACHED', { details: { limit: 'places', max: plan.max_places, plan: plan.code } });
    }
    const uuid = crypto.randomUUID();
    await db('places').insert({
      uuid, family_id: f.id, name: b.name, type: b.type, lat: b.lat, lng: b.lng, radius_m: b.radius_m,
      applies_to_user_uuids: b.applies_to.length ? JSON.stringify(b.applies_to) : null, created_by_user_id: req.user.id,
    });
    await audit(db, { actorId: req.user.id, action: 'place.created', targetType: 'family', targetId: f.id, now });
    res.status(201).json(presentPlace(await db('places').where({ uuid }).first()));
  }));

  r.patch('/families/:familyId/places/:placeId', requireAuth, ah(async (req, res) => {
    const f = await adultFamily(req);
    const b = parse(placeBody.partial(), req.body);
    const place = await db('places').where({ family_id: f.id, uuid: z.uuid().safeParse(req.params.placeId).data ?? '' }).first();
    if (!place) throw new ApiError('NOT_FOUND');
    if (b.applies_to) await checkChildren(f.id, b.applies_to);
    const upd = {};
    for (const k of ['name', 'type', 'lat', 'lng', 'radius_m']) if (b[k] !== undefined) upd[k] = b[k];
    if (b.applies_to) upd.applies_to_user_uuids = b.applies_to.length ? JSON.stringify(b.applies_to) : null;
    if (Object.keys(upd).length) await db('places').where({ id: place.id }).update(upd);
    // Moving the place or its radius restarts the inside/outside state (no false arrival).
    if (upd.lat !== undefined || upd.lng !== undefined || upd.radius_m !== undefined) {
      await db('place_presence').where({ place_id: place.id }).del();
    }
    res.json(presentPlace(await db('places').where({ id: place.id }).first()));
  }));

  r.delete('/families/:familyId/places/:placeId', requireAuth, ah(async (req, res) => {
    const f = await adultFamily(req);
    const n = await db('places').where({ family_id: f.id, uuid: z.uuid().safeParse(req.params.placeId).data ?? '' }).del();
    if (!n) throw new ApiError('NOT_FOUND');
    await audit(db, { actorId: req.user.id, action: 'place.deleted', targetType: 'family', targetId: f.id, now: clock.now() });
    res.status(204).end();
  }));

  // ---- emergency contacts (email only) ----
  const contactBody = z.object({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    relationship: z.string().trim().max(40).optional(),
  });
  const presentContact = (c) => ({ id: String(c.id), name: c.name, email: c.email, relationship: c.relationship ?? null });

  r.get('/families/:familyId/emergency-contacts', requireAuth, ah(async (req, res) => {
    const f = await adultFamily(req);
    res.json((await db('emergency_contacts').where({ family_id: f.id }).orderBy('id')).map(presentContact));
  }));

  r.post('/families/:familyId/emergency-contacts', requireAuth, ah(async (req, res) => {
    const f = await adultFamily(req);
    const b = parse(contactBody, req.body);
    const count = Number((await db('emergency_contacts').where({ family_id: f.id }).count({ n: '*' }).first()).n);
    if (count >= 5) throw new ApiError('VALIDATION_FAILED', { details: { reason: 'max_contacts', max: 5 } });
    const [id] = await db('emergency_contacts').insert({ family_id: f.id, name: b.name, email: b.email.toLowerCase(), relationship: b.relationship ?? null });
    res.status(201).json(presentContact(await db('emergency_contacts').where({ id }).first()));
  }));

  r.delete('/families/:familyId/emergency-contacts/:contactId', requireAuth, ah(async (req, res) => {
    const f = await adultFamily(req);
    const n = await db('emergency_contacts').where({ family_id: f.id, id: Number(req.params.contactId) || 0 }).del();
    if (!n) throw new ApiError('NOT_FOUND');
    res.status(204).end();
  }));

  // ---- emergency service numbers (admin-editable table, never hardcoded) ----
  r.get('/emergency-numbers', requireAuth, ah(async (req, res) => {
    const q = parse(z.object({ country: z.string().regex(/^[A-Za-z]{2}$/).optional() }), req.query);
    const country = (q.country || req.user.country_iso2 || '').toUpperCase();
    const rows = country ? await db('emergency_numbers').where({ country_iso2: country }).orderBy('service') : [];
    res.json({ country: country || null, numbers: rows.map((e) => ({ service: e.service, number: e.number, note: e.note ?? null })) });
  }));

  return r;
}
