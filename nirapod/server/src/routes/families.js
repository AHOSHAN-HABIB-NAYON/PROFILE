// /families, /families/{id}, /families/{id}/child-code, /invites/accept. No location data here.
import { Router } from 'express';
import { notifyFamilyJoined } from '../family/joined.js';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse, limiter } from '../http.js';
import { addMs, DAY } from '../clock.js';
import { audit } from '../audit.js';
import { newFamilyCode, normalizeFamilyCode, FAMILY_CODE_RE } from '../auth/join-codes.js';
import { membershipOf, presentFamily, familyPlan, countActive } from '../users/presenter.js';

export const CHILD_CODE_TTL_MS = DAY;

export function familiesRouter(ctx) {
  const { db, cfg, clock, requireAuth } = ctx;
  const r = Router();
  const codeLimit = () => limiter({ windowMs: cfg.RATE_LIMIT_WINDOW_MS, limit: cfg.AUTH_RATE_LIMIT_MAX });

  const adultOnly = (req) => {
    if (req.session.isChildDevice || req.user.auth_provider === 'device') throw new ApiError('FORBIDDEN');
  };

  /** The family if the caller is an active member of it; NOT_FOUND otherwise (existence is not revealed). */
  async function familyForMember(familyUuid, userId) {
    const id = z.uuid().safeParse(familyUuid);
    if (!id.success) throw new ApiError('NOT_FOUND');
    const row = await db('families as f')
      .join('family_members as m', 'm.family_id', 'f.id')
      .where({ 'f.uuid': id.data, 'm.user_id': userId })
      .whereNull('m.left_at')
      .whereNull('f.deleted_at')
      .first('f.*', 'm.role as my_role');
    if (!row) throw new ApiError('NOT_FOUND');
    return row;
  }

  r.post('/families', requireAuth, ah(async (req, res) => {
    adultOnly(req);
    const b = parse(z.object({ name: z.string().trim().min(1).max(120).optional() }), req.body);
    if (await membershipOf(db, req.user.id)) {
      throw new ApiError('CONFLICT', { message: 'You are already in a family.' });
    }
    const now = clock.now();
    const family = await db.transaction(async (trx) => {
      const [id] = await trx('families').insert({ uuid: crypto.randomUUID(), name: b.name ?? null, owner_user_id: req.user.id, created_at: now });
      // Adult consent rule: an adult's location is visible to other adults only after they accept (starts pending).
      await trx('family_members').insert({ family_id: id, user_id: req.user.id, role: 'parent', sharing_status: 'pending', joined_at: now, created_at: now });
      await audit(trx, { actorId: req.user.id, action: 'family.create', targetType: 'family', targetId: id, now });
      return trx('families').where({ id }).first();
    });
    res.status(201).json(await presentFamily(db, cfg, family, now));
  }));

  r.get('/families/:familyId', requireAuth, ah(async (req, res) => {
    const f = await familyForMember(req.params.familyId, req.user.id);
    res.set('cache-control', 'no-store').json(await presentFamily(db, cfg, f, clock.now()));
  }));

  r.post('/families/:familyId/child-code', requireAuth, codeLimit(), ah(async (req, res) => {
    adultOnly(req);
    const f = await familyForMember(req.params.familyId, req.user.id);
    if (!['parent', 'guardian'].includes(f.my_role)) throw new ApiError('FORBIDDEN');
    const now = clock.now();
    const plan = await familyPlan(db, f.id, now);
    const children = await countActive(db, f.id, ['child']);
    if (plan?.max_children != null && children >= plan.max_children) {
      throw new ApiError('PLAN_LIMIT_REACHED', {
        details: { limit: 'max_children', max: plan.max_children, current: children, plan: plan.code },
      });
    }
    const expires = addMs(now, CHILD_CODE_TTL_MS);
    let code;
    await db.transaction(async (trx) => {
      await trx('join_codes').where({ family_id: f.id }).whereNull('used_at').whereNull('revoked_at').update({ revoked_at: now });
      for (let i = 0; i < 8 && !code; i++) {
        const candidate = newFamilyCode();
        try {
          await trx('join_codes').insert({ family_id: f.id, created_by_user_id: req.user.id, code: candidate, expires_at: expires, created_at: now });
          code = candidate;
        } catch (e) {
          if (e?.code !== 'ER_DUP_ENTRY') throw e;
        }
      }
      if (!code) throw new ApiError('INTERNAL');
    });
    await audit(db, { actorId: req.user.id, action: 'family.child_code_created', targetType: 'family', targetId: f.id, now });
    const host = new URL(cfg.PUBLIC_BASE_URL).host;
    res.status(201).set('cache-control', 'no-store').json({
      code, expires_at: expires.toISOString(), join_url: `https://${host}/join?code=${code}`,
    });
  }));

  r.post('/invites/accept', requireAuth, codeLimit(), ah(async (req, res) => {
    adultOnly(req);
    const b = parse(z.object({
      code: z.string().max(20).transform(normalizeFamilyCode).pipe(z.string().regex(FAMILY_CODE_RE, 'The code is not valid.')),
    }), req.body);
    const now = clock.now();
    const out = await db.transaction(async (trx) => {
      const inv = await trx('invites').where({ code: b.code }).forUpdate().first();
      if (!inv || inv.accepted_at || inv.revoked_at) throw new ApiError('CODE_INVALID');
      if (inv.email && inv.email !== req.user.email) throw new ApiError('CODE_INVALID');
      if (inv.expires_at <= now) throw new ApiError('CODE_EXPIRED');
      if (await membershipOf(trx, req.user.id)) throw new ApiError('CONFLICT', { message: 'You are already in a family.' });
      const plan = await familyPlan(trx, inv.family_id, now);
      const adults = await countActive(trx, inv.family_id, ['parent', 'guardian']);
      if (plan?.max_members != null && adults >= plan.max_members) {
        throw new ApiError('PLAN_LIMIT_REACHED', { details: { limit: 'max_members', max: plan.max_members, current: adults, plan: plan.code } });
      }
      await trx('family_members').insert({
        family_id: inv.family_id, user_id: req.user.id, role: inv.role, is_overseas: inv.is_overseas,
        sharing_status: 'pending', joined_at: now, created_at: now,
      });
      await trx('invites').where({ id: inv.id }).update({ accepted_at: now, accepted_by_user_id: req.user.id });
      await audit(trx, { actorId: req.user.id, action: 'family.invite_accepted', targetType: 'family', targetId: inv.family_id, now });
      return { family: await trx('families').where({ id: inv.family_id }).first(), role: inv.role };
    });
    await notifyFamilyJoined(ctx, { familyId: out.family.id, userId: req.user.id, role: out.role });
    res.json({ role: out.role, sharing_status: 'pending', family: await presentFamily(db, cfg, out.family, now) });
  }));

  return r;
}
