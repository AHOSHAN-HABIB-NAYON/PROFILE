// /me, /me/profile, /me/photo, /me/consents
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse, limiter } from '../http.js';
import { HOUR } from '../clock.js';
import { language, displayName } from '../auth/schemas.js';
import { isValidIanaZone, isValidIso2 } from '../tz/index.js';
import { presentMe, membershipOf } from '../users/presenter.js';
import { processAvatar, storeAvatar, deleteStored, MAX_PHOTO_BYTES } from '../media/avatars.js';
import { SENSITIVE_KEY } from '../logger.js';

export const PHOTO_UPLOADS_PER_HOUR = 10;

const profileSchema = z
  .strictObject({
    name: displayName.optional(),
    country_iso2: z.string().length(2).transform((s) => s.toUpperCase()).refine(isValidIso2, 'Unknown country.').nullable().optional(),
    timezone: z.string().max(64).refine(isValidIanaZone, 'Unknown time zone.').nullable().optional(),
    tz_auto: z.boolean().optional(),
    detected_source: z.enum(['timezone', 'locale', 'ip', 'manual']).nullable().optional(),
    language: language.optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'Nothing to update.');

const CONSENT_TYPES = ['age_18_terms_privacy', 'child_location_sharing', 'adult_location_sharing',
  'background_location_disclosure', 'ai_chat_notice', 'email_marketing'];

/** Consent details may hold ids and flags only: reject location-like or personal keys, cap the size. */
function safeDetails(d) {
  if (d == null) return null;
  const walk = (v, depth) => {
    if (depth > 4) return false;
    if (Array.isArray(v)) return v.every((x) => walk(x, depth + 1));
    if (v && typeof v === 'object') return Object.entries(v).every(([k, x]) => !SENSITIVE_KEY.test(k) && walk(x, depth + 1));
    return true;
  };
  const json = JSON.stringify(d);
  return json.length <= 2048 && walk(d, 0) ? json : undefined;
}

export function meRouter(ctx) {
  const { db, cfg, clock, requireAuth } = ctx;
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 5 } });
  const photoLimit = limiter({ windowMs: HOUR, limit: PHOTO_UPLOADS_PER_HOUR, keyGenerator: (req) => `u:${req.user.id}` });

  const me = async (userId) => presentMe(db, cfg, await db('users').where({ id: userId }).first());

  r.get('/me', requireAuth, ah(async (req, res) => {
    res.set('cache-control', 'no-store').json(await me(req.user.id));
  }));

  r.patch('/me/profile', requireAuth, ah(async (req, res) => {
    const b = parse(profileSchema, req.body);
    await db('users').where({ id: req.user.id }).update(b);
    res.json(await me(req.user.id));
  }));

  r.post('/me/photo', requireAuth, photoLimit, (req, res, next) => {
    upload.single('photo')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError('PAYLOAD_TOO_LARGE', { message: 'The photo is larger than 10 MB.' }));
      return next(new ApiError('VALIDATION_FAILED', { details: { fields: { photo: 'Send one file in the "photo" field.' } } }));
    });
  }, ah(async (req, res) => {
    if (!req.file?.buffer?.length) throw new ApiError('VALIDATION_FAILED', { details: { fields: { photo: 'Required.' } } });
    const images = await processAvatar(req.file.buffer);
    const stored = await storeAvatar(cfg.UPLOAD_DIR, images);
    const old = await db('users').where({ id: req.user.id }).first('avatar_url', 'avatar_thumb_url');
    await db('users').where({ id: req.user.id }).update(stored);
    await deleteStored(cfg.UPLOAD_DIR, old?.avatar_url, old?.avatar_thumb_url);
    const out = await me(req.user.id);
    res.json({ avatar_url: out.avatar_url, avatar_thumb_url: out.avatar_thumb_url });
  }));

  r.delete('/me/photo', requireAuth, ah(async (req, res) => {
    const old = await db('users').where({ id: req.user.id }).first('avatar_url', 'avatar_thumb_url');
    await db('users').where({ id: req.user.id }).update({ avatar_url: null, avatar_thumb_url: null });
    await deleteStored(cfg.UPLOAD_DIR, old?.avatar_url, old?.avatar_thumb_url);
    res.status(204).end();
  }));

  r.post('/me/consents', requireAuth, ah(async (req, res) => {
    const b = parse(z.strictObject({
      type: z.enum(CONSENT_TYPES),
      version: z.string().trim().min(1).max(20),
      granted: z.boolean(),
      details: z.record(z.string(), z.unknown()).optional(),
    }), req.body);
    const details = safeDetails(b.details);
    if (details === undefined) {
      throw new ApiError('VALIDATION_FAILED', { details: { fields: { details: 'Only ids and flags are allowed (max 2 KB).' } } });
    }
    if (b.type === 'age_18_terms_privacy' && req.session.isChildDevice) throw new ApiError('FORBIDDEN');
    const m = await membershipOf(db, req.user.id);
    const now = clock.now();
    await db('consents').insert({
      user_id: req.user.id, family_id: m?.family_id ?? null, type: b.type, version: b.version, granted: b.granted,
      details, created_at: now,
    });
    res.status(201).json({ type: b.type, version: b.version, granted: b.granted, created_at: now.toISOString() });
  }));

  return r;
}
