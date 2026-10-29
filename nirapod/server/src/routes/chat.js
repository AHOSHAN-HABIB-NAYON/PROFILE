// Live chat, user side (Phase 7B). Adults only; children are told to ask a parent.
import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse, limiter } from '../http.js';
import { familyPlan } from '../users/presenter.js';
import { getSetting } from '../settings.js';
import {
  openConversation, presentConversation, userMessage, requestHuman, closeConversation, chatDir,
} from '../chat/service.js';

export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function chatRouter(ctx) {
  const { db, cfg, clock, requireAuth } = ctx;
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CHAT_IMAGE_BYTES, files: 1, fields: 4 } });
  const sendLimit = limiter({ windowMs: 60_000, limit: 20, keyGenerator: (req) => `chat:${req.user.id}` });

  async function adult(req) {
    const u = await db('users').where({ id: req.user.id }).first();
    const m = await db('family_members').where({ user_id: u.id }).whereNull('left_at').first('role', 'family_id');
    if (u.auth_provider === 'device' || m?.role === 'child') throw new ApiError('FORBIDDEN', { message: 'Ask your parent for help.', details: { reason: 'child' } });
    return { u, m };
  }

  r.get('/chat/current', requireAuth, ah(async (req, res) => {
    const { u } = await adult(req);
    const conv = await openConversation(db, u.id);
    const humanFor = await getSetting(db, 'live_chat_human_for', 'all');
    res.json({ conversation: conv ? await presentConversation(db, conv) : null, human_for: humanFor });
  }));

  r.post('/chat/messages', requireAuth, sendLimit, ah(async (req, res) => {
    const { u, m } = await adult(req);
    const b = parse(z.object({ body: z.string().trim().min(1).max(2000), priority: z.boolean().optional() }), req.body);
    const premium = m ? ['premium', 'family_plus'].includes((await familyPlan(db, m.family_id, clock.now()))?.code) : false;
    const out = await userMessage(ctx, u, { body: b.body, priority: !!b.priority && premium });
    res.status(201).json({ conversation: await presentConversation(db, out.conversation), added: out.added });
  }));

  // Image: type by magic bytes (JPEG/PNG/WebP, max 5 MB), re-encoded to JPEG (max 1600 px) so EXIF/GPS is removed.
  r.post('/chat/images', requireAuth, limiter({ windowMs: 3600_000, limit: 20, keyGenerator: (req) => `chatimg:${req.user.id}` }), (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError('PAYLOAD_TOO_LARGE', { message: 'The image is larger than 5 MB.' }));
      return next(new ApiError('VALIDATION_FAILED', { details: { fields: { image: 'Send one file in the "image" field.' } } }));
    });
  }, ah(async (req, res) => {
    const { u } = await adult(req);
    const buf = req.file?.buffer;
    if (!buf?.length) throw new ApiError('VALIDATION_FAILED', { details: { fields: { image: 'Required.' } } });
    const type = await fileTypeFromBuffer(buf);
    if (!type || !IMAGE_TYPES.has(type.mime)) throw new ApiError('UNSUPPORTED_MEDIA', { message: 'Please send a JPEG, PNG or WebP image.' });
    let out;
    try {
      out = await sharp(buf, { failOn: 'error', limitInputPixels: 40_000_000 }).rotate()
        .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    } catch {
      throw new ApiError('UNSUPPORTED_MEDIA', { message: 'This image could not be read.' });
    }
    const dir = chatDir(cfg.UPLOAD_DIR);
    await fs.mkdir(dir, { recursive: true });
    const key = `${crypto.randomUUID()}.jpg`;
    await fs.writeFile(path.join(dir, key), out, { flag: 'wx', mode: 0o600 });
    const caption = typeof req.body?.caption === 'string' ? req.body.caption.trim().slice(0, 500) : '';
    const result = await userMessage(ctx, u, { body: caption || null, attachment: { storage_key: key, mime: 'image/jpeg', size_bytes: out.length } });
    res.status(201).json({ conversation: await presentConversation(db, result.conversation), added: result.added });
  }));

  // Only the conversation's owner (admins use their own endpoint). Gone after 7 days.
  r.get('/chat/attachments/:id', requireAuth, ah(async (req, res) => {
    const a = await db('chat_attachments as a').join('chat_conversations as c', 'c.id', 'a.conversation_id')
      .where('a.id', Number(req.params.id) || 0).where('c.user_id', req.user.id).whereNot('c.status', 'closed').first('a.*');
    if (!a || a.purged_at || !/^[0-9a-f-]{36}\.jpg$/.test(a.storage_key)) throw new ApiError('NOT_FOUND');
    res.set({ 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=3600' });
    res.send(await fs.readFile(path.join(chatDir(cfg.UPLOAD_DIR), a.storage_key)));
  }));

  r.post('/chat/escalate', requireAuth, ah(async (req, res) => {
    const { u } = await adult(req);
    const conv = await openConversation(db, u.id);
    if (!conv) throw new ApiError('NOT_FOUND');
    await requestHuman(ctx, conv);
    res.json({ conversation: await presentConversation(db, conv) });
  }));

  r.post('/chat/read', requireAuth, ah(async (req, res) => {
    const conv = await openConversation(db, req.user.id);
    if (conv) await db('chat_messages').where({ conversation_id: conv.id }).whereNot({ sender_type: 'user' }).whereNull('read_at').update({ read_at: clock.now(), delivered_at: clock.now() });
    res.status(204).end();
  }));

  // Closing removes the whole chat from the user's side; it returns the id for the rating thumbs.
  r.post('/chat/close', requireAuth, ah(async (req, res) => {
    const conv = await openConversation(db, req.user.id);
    if (!conv) throw new ApiError('NOT_FOUND');
    await closeConversation(ctx, conv, 'user');
    res.json({ closed: conv.uuid });
  }));

  r.post('/chat/rate', requireAuth, ah(async (req, res) => {
    const b = parse(z.object({ conversation_id: z.uuid(), rating: z.enum(['up', 'down']) }), req.body);
    const n = await db('chat_conversations').where({ uuid: b.conversation_id, user_id: req.user.id }).update({ rating: b.rating });
    if (!n) throw new ApiError('NOT_FOUND');
    res.status(204).end();
  }));

  return r;
}
