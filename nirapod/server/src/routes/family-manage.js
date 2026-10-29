// Family management (Phase 2): invites, member changes (sharing consent, pause/stop), remove/leave,
// ownership transfer, misuse reports. No location data here.
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse, limiter } from '../http.js';
import { addMs, DAY } from '../clock.js';
import { audit } from '../audit.js';
import { newFamilyCode } from '../auth/join-codes.js';
import { familyPlan, countActive, presentFamily } from '../users/presenter.js';
import { familyForMember, memberOf, isAdultRole, adultOnly } from '../family/access.js';
import { isValidIanaZone } from '../tz/index.js';

export const INVITE_TTL_MS = 7 * DAY;

export function familyManageRouter(ctx) {
  const { db, cfg, clock, requireAuth, mailer } = ctx;
  const r = Router();
  const inviteLimit = () => limiter({ windowMs: cfg.RATE_LIMIT_WINDOW_MS, limit: cfg.AUTH_RATE_LIMIT_MAX });

  // Invite an adult by email and/or a 6-character code.
  r.post('/families/:familyId/invites', requireAuth, inviteLimit(), ah(async (req, res) => {
    adultOnly(req);
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    if (!isAdultRole(f.my_role)) throw new ApiError('FORBIDDEN');
    const b = parse(z.object({
      email: z.email().max(254).transform((e) => e.toLowerCase()).optional(),
      role: z.enum(['parent', 'guardian']).default('guardian'),
      is_overseas: z.boolean().default(false),
      timezone: z.string().max(64).refine(isValidIanaZone, 'Unknown time zone').optional(),
    }), req.body);
    const now = clock.now();
    const plan = await familyPlan(db, f.id, now);
    const adults = await countActive(db, f.id, ['parent', 'guardian']);
    if (plan?.max_members != null && adults >= plan.max_members) {
      throw new ApiError('PLAN_LIMIT_REACHED', { details: { limit: 'max_members', max: plan.max_members, current: adults, plan: plan.code } });
    }
    const expires = addMs(now, INVITE_TTL_MS);
    let code;
    for (let i = 0; i < 8 && !code; i++) {
      const candidate = newFamilyCode();
      try {
        await db('invites').insert({
          family_id: f.id, invited_by_user_id: req.user.id, email: b.email ?? null, code: candidate, role: b.role,
          is_overseas: b.is_overseas, timezone: b.timezone ?? null, expires_at: expires, created_at: now,
        });
        code = candidate;
      } catch (e) {
        if (e?.code !== 'ER_DUP_ENTRY') throw e;
      }
    }
    if (!code) throw new ApiError('INTERNAL');
    if (b.email) {
      // The invitee may not have an account yet: send in the inviter's language.
      await mailer.send('family_invite', { email: b.email, language: req.user.language }, { code, inviter: req.user.name || '' });
    }
    await audit(db, { actorId: req.user.id, action: 'family.invite_created', targetType: 'family', targetId: f.id, now });
    const host = new URL(cfg.PUBLIC_BASE_URL).host;
    res.status(201).set('cache-control', 'no-store').json({
      code, role: b.role, is_overseas: b.is_overseas, expires_at: expires.toISOString(),
      invite_url: `https://${host}/join?invite=${code}`, email_sent: !!b.email,
    });
  }));

  // Change a member. Self: sharing_status (adults: accept = active, pause, stop), daily summary settings.
  // Parents/guardians: relationship and overseas flag of others. Nobody can change a child's sharing here
  // (a parent removes the child device to stop sharing).
  r.patch('/families/:familyId/members/:memberId', requireAuth, ah(async (req, res) => {
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    const m = await memberOf(db, f.id, req.params.memberId);
    const self = m.user_id === req.user.id;
    const b = parse(z.object({
      sharing_status: z.enum(['active', 'paused', 'stopped']).optional(),
      relationship: z.string().trim().max(40).nullable().optional(),
      is_overseas: z.boolean().optional(),
      daily_summary_enabled: z.boolean().optional(),
      daily_summary_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
    }).strict(), req.body);
    const patch = {};
    if (b.sharing_status !== undefined) {
      if (!self || m.role === 'child') throw new ApiError('FORBIDDEN');
      patch.sharing_status = b.sharing_status;
      patch.sharing_changed_at = clock.now();
    }
    if (b.daily_summary_enabled !== undefined || b.daily_summary_time !== undefined) {
      if (!self || m.role === 'child') throw new ApiError('FORBIDDEN');
      if (b.daily_summary_enabled !== undefined) patch.daily_summary_enabled = b.daily_summary_enabled;
      if (b.daily_summary_time !== undefined) patch.daily_summary_time = b.daily_summary_time;
    }
    if (b.relationship !== undefined || b.is_overseas !== undefined) {
      if (!self && !isAdultRole(f.my_role)) throw new ApiError('FORBIDDEN');
      if (b.relationship !== undefined) patch.relationship = b.relationship;
      if (b.is_overseas !== undefined) patch.is_overseas = b.is_overseas;
    }
    if (!Object.keys(patch).length) throw new ApiError('VALIDATION_FAILED', { details: { fields: { _: 'Nothing to change' } } });
    const now = clock.now();
    await db('family_members').where({ id: m.id }).update(patch);
    if (patch.sharing_status) {
      // Pause / stop also ends "share when the app is closed": the phone's background key stops working.
      if (patch.sharing_status !== 'active') {
        await db('child_devices').where({ user_id: req.user.id }).whereNull('revoked_at').update({ revoked_at: now, upload_key_hash: null });
      }
      await audit(db, { actorId: req.user.id, action: `sharing.${patch.sharing_status}`, targetType: 'family', targetId: f.id, now });
      await db('consents').insert({
        user_id: req.user.id, family_id: f.id, type: 'adult_location_sharing', version: cfg.TERMS_VERSION,
        granted: patch.sharing_status === 'active', details: JSON.stringify({ status: patch.sharing_status }), created_at: now,
      });
    }
    res.json(await presentFamily(db, cfg, await db('families').where({ id: f.id }).first(), now));
  }));

  // Remove a member (parent/guardian removes a child or another non-owner adult) or leave (self).
  r.delete('/families/:familyId/members/:memberId', requireAuth, ah(async (req, res) => {
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    const m = await memberOf(db, f.id, req.params.memberId);
    const self = m.user_id === req.user.id;
    const now = clock.now();
    if (self) {
      if (m.role === 'child') throw new ApiError('FORBIDDEN'); // a parent removes the child device instead
      const others = await db('family_members').where({ family_id: f.id }).whereNull('left_at').whereNot({ user_id: m.user_id });
      if (f.owner_user_id === m.user_id) {
        const otherAdults = others.filter((o) => isAdultRole(o.role));
        if (otherAdults.length) throw new ApiError('CONFLICT', { message: 'Transfer ownership before leaving.', details: { reason: 'owner_must_transfer' } });
      }
    } else {
      if (!isAdultRole(f.my_role) || req.session.isChildDevice) throw new ApiError('FORBIDDEN');
      if (m.user_id === f.owner_user_id) throw new ApiError('FORBIDDEN');
    }
    await db.transaction(async (trx) => {
      await trx('family_members').where({ id: m.id }).update({ left_at: now, sharing_status: 'stopped', sharing_changed_at: now });
      if (m.role === 'child') {
        // Stop sharing for good: revoke the child's device sessions and bindings.
        await trx('sessions').where({ user_id: m.user_id }).whereNull('revoked_at').update({ revoked_at: now, revoked_reason: 'removed' });
        await trx('child_devices').where({ user_id: m.user_id }).whereNull('revoked_at').update({ revoked_at: now });
      }
      if (self && f.owner_user_id === m.user_id) {
        // Owner leaving with no other adults: the family ends.
        await trx('families').where({ id: f.id }).update({ deleted_at: now, owner_user_id: null });
        await trx('family_members').where({ family_id: f.id }).whereNull('left_at').update({ left_at: now, sharing_status: 'stopped' });
        await trx('sessions').whereIn('user_id', trx('family_members').where({ family_id: f.id, role: 'child' }).select('user_id'))
          .whereNull('revoked_at').update({ revoked_at: now, revoked_reason: 'family_deleted' });
      }
      await audit(trx, { actorId: req.user.id, action: self ? 'family.leave' : 'family.member_removed', targetType: 'family', targetId: f.id, now });
    });
    res.status(204).end();
  }));

  r.post('/families/:familyId/transfer', requireAuth, ah(async (req, res) => {
    adultOnly(req);
    const f = await familyForMember(db, req.params.familyId, req.user.id);
    if (f.owner_user_id !== req.user.id) throw new ApiError('FORBIDDEN');
    const b = parse(z.object({ new_owner_member_id: z.uuid() }), req.body);
    const m = await memberOf(db, f.id, b.new_owner_member_id);
    if (!isAdultRole(m.role) || m.user_id === req.user.id) throw new ApiError('VALIDATION_FAILED', { details: { fields: { new_owner_member_id: 'Choose another adult member' } } });
    const now = clock.now();
    await db.transaction(async (trx) => {
      await trx('families').where({ id: f.id }).update({ owner_user_id: m.user_id });
      await trx('family_members').where({ id: m.id }).update({ role: 'parent' });
      await audit(trx, { actorId: req.user.id, action: 'family.owner_transferred', targetType: 'family', targetId: f.id, now });
    });
    res.json(await presentFamily(db, cfg, await db('families').where({ id: f.id }).first(), now));
  }));

  r.post('/abuse-reports', requireAuth, inviteLimit(), ah(async (req, res) => {
    const b = parse(z.object({
      category: z.enum(['covert_tracking', 'harassment', 'unwanted_sharing', 'other']),
      details: z.string().trim().max(2000).optional(),
      reported_member_id: z.uuid().optional(),
    }), req.body);
    const now = clock.now();
    const membership = await db('family_members').where({ user_id: req.user.id }).whereNull('left_at').first();
    let reported = null;
    if (b.reported_member_id && membership) {
      const u = await db('users').where({ uuid: b.reported_member_id }).first('id');
      reported = u?.id ?? null;
    }
    const [id] = await db('abuse_reports').insert({
      reporter_user_id: req.user.id, family_id: membership?.family_id ?? null, reported_user_id: reported,
      category: b.category, details: b.details ?? null, status: 'open', created_at: now,
    });
    await audit(db, { actorId: req.user.id, action: 'abuse_report.created', targetType: 'abuse_report', targetId: id, now });
    res.status(201).json({ id: crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 12), status: 'open' });
  }));

  return r;
}
