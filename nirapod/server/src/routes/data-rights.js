// Data rights (Phase 7): "Download my data" and "Delete my account and data", in the app and on the web.
// Export: a JSON file with the user's own data, available through a one-time link (7 days) sent by email.
// Delete: personal data, photos, own location history, chat data and tokens are removed; devices revoked.
// Cascade (documented in docs/data-deletion.md): an owner hands the family to another adult; with no other
// adult the family and its children's accounts are deleted too. Requests are tracked in data_requests.
import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ah, parse, limiter } from '../http.js';
import { verifyPassword } from '../auth/passwords.js';
import { deleteStored } from '../media/avatars.js';
import { sha256 } from '../auth/tokens.js';
import { audit } from '../audit.js';
import { fromJson } from '../db/json.js';

const iso = (d) => (d ? new Date(d).toISOString() : null);
const DAY = 24 * 3600_000;

/** Removes one user's personal data. Never throws halfway silently: runs in a transaction. */
export async function deleteUserData(ctx, userId, { now, reason = 'user' }) {
  const { db, cfg, realtime } = ctx;
  const user = await db('users').where({ id: userId }).first();
  if (!user || user.status === 'deleted') return { deleted: [] };
  const deleted = [userId];
  const files = [user.avatar_url, user.avatar_thumb_url];
  await db.transaction(async (trx) => {
    const m = await trx('family_members').where({ user_id: userId }).whereNull('left_at').first();
    if (m) {
      const fam = await trx('families').where({ id: m.family_id }).first();
      const others = await trx('family_members').where({ family_id: m.family_id }).whereNull('left_at').whereNot({ user_id: userId });
      const otherAdults = others.filter((o) => o.role !== 'child');
      if (fam.owner_user_id === userId && otherAdults.length) {
        // Hand the family to the longest-standing other adult (parents first).
        const next = otherAdults.sort((a, b) => (a.role === 'parent' ? -1 : 1) - (b.role === 'parent' ? -1 : 1) || a.id - b.id)[0];
        await trx('families').where({ id: fam.id }).update({ owner_user_id: next.user_id });
      }
      if (!otherAdults.length) {
        // Nobody left to look after the family: delete it and its children's accounts.
        for (const kid of others.filter((o) => o.role === 'child')) deleted.push(kid.user_id);
        await trx('families').where({ id: fam.id }).update({ deleted_at: now, owner_user_id: null });
        await trx('places').where({ family_id: fam.id }).del();
        await trx('emergency_contacts').where({ family_id: fam.id }).del();
        await trx('join_codes').where({ family_id: fam.id }).del();
        await trx('invites').where({ family_id: fam.id }).del();
      }
      await trx('family_members').whereIn('user_id', deleted).whereNull('left_at').update({ left_at: now });
    }
    for (const id of deleted) {
      const u = id === userId ? user : await trx('users').where({ id }).first();
      if (u && id !== userId) files.push(u.avatar_url, u.avatar_thumb_url);
      await trx('locations').where({ user_id: id }).del();
      await trx('timeline_events').where({ user_id: id }).del();
      await trx('place_presence').where({ user_id: id }).del();
      await trx('trips').where({ user_id: id }).del();
      await trx('notifications').where({ user_id: id }).del();
      const convs = await trx('chat_conversations').where({ user_id: id }).pluck('id');
      if (convs.length) {
        await trx('chat_attachments').whereIn('conversation_id', convs).del();
        await trx('chat_messages').whereIn('conversation_id', convs).del();
        await trx('chat_conversations').whereIn('id', convs).del();
      }
      await trx('sessions').where({ user_id: id }).whereNull('revoked_at').update({ revoked_at: now, revoked_reason: 'account_deleted', fcm_token: null });
      await trx('child_devices').where({ user_id: id }).whereNull('revoked_at').update({ revoked_at: now, upload_key_hash: null });
      await trx('users').where({ id }).update({
        status: 'deleted', email: null, password_hash: null, google_sub: null, name: null, avatar_url: null, avatar_thumb_url: null,
        notify_prefs: null, daily_summary_hour: null, deleted_at: now,
      });
    }
    await audit(trx, { actorId: userId, action: `account.deleted.${reason}`, targetType: 'user', targetId: userId, now });
  });
  await deleteStored(cfg.UPLOAD_DIR, ...files);
  realtime?.disconnectUsers?.([user.uuid]);
  return { deleted };
}

async function buildExport(db, userId, now) {
  const u = await db('users').where({ id: userId }).first();
  const m = await db('family_members as m').join('families as f', 'f.id', 'm.family_id').where('m.user_id', userId).whereNull('m.left_at').first('m.*', 'f.uuid as family_uuid', 'f.name as family_name');
  const since = new Date(now.getTime() - 90 * DAY);
  const pick = (r, keys) => Object.fromEntries(keys.map((k) => [k, r[k] instanceof Date ? iso(r[k]) : r[k]]));
  return {
    generated_at: iso(now),
    note: 'Your Nirapod data. Location points are your own; other family members are not included.',
    profile: pick(u, ['uuid', 'email', 'name', 'country_iso2', 'timezone', 'language', 'auth_provider', 'created_at']),
    family: m ? { id: m.family_uuid, name: m.family_name, role: m.role, sharing_status: m.sharing_status, joined_at: iso(m.joined_at) } : null,
    consents: (await db('consents').where({ user_id: userId })).map((c) => pick(c, ['type', 'version', 'created_at'])),
    sessions: (await db('sessions').where({ user_id: userId })).map((s) => pick(s, ['device_model', 'os_version', 'app_version', 'created_at', 'last_used_at', 'revoked_at'])),
    locations: (await db('locations').where({ user_id: userId }).where('recorded_at', '>=', since).orderBy('recorded_at'))
      .map((p) => ({ recorded_at: iso(p.recorded_at), lat: Number(p.lat), lng: Number(p.lng), accuracy_m: Number(p.accuracy_m), battery_pct: p.battery_pct })),
    alerts: (await db('notifications').where({ user_id: userId }).orderBy('id', 'desc').limit(1000)).map((n) => ({ type: n.type, params: fromJson(n.params), created_at: iso(n.created_at) })),
    notification_settings: fromJson(u.notify_prefs),
  };
}

export function dataRightsRouter(ctx) {
  const { db, cfg, clock, requireAuth, mailer } = ctx;
  const r = Router();
  const exportDir = path.join(cfg.UPLOAD_DIR, 'exports');

  r.post('/me/data-export', requireAuth, limiter({ windowMs: 3600_000, limit: 3 }), ah(async (req, res) => {
    const now = clock.now();
    const token = crypto.randomBytes(24).toString('base64url');
    const key = `${sha256(token)}.json`;
    await fs.mkdir(exportDir, { recursive: true });
    await fs.writeFile(path.join(exportDir, key), JSON.stringify(await buildExport(db, req.user.id, now), null, 2), { mode: 0o600 });
    const [id] = await db('data_requests').insert({
      user_id: req.user.id, type: 'export', status: 'completed', source: 'app', export_file_key: key,
      export_expires_at: new Date(now.getTime() + 7 * DAY), completed_at: now, created_at: now,
    });
    const url = `${cfg.PUBLIC_BASE_URL.replace(/\/$/, '')}/api/v1/data-export/${token}`;
    const user = await db('users').where({ id: req.user.id }).first('id', 'email', 'language');
    const emailed = user?.email ? await mailer.send('data_export', user, { url }) : false;
    res.status(201).json({ id: String(id), emailed, expires_at: iso(new Date(now.getTime() + 7 * DAY)) });
  }));

  // One-time download link from the email (no login; expires after 7 days; deleted after download).
  r.get('/data-export/:token', ah(async (req, res) => {
    const key = `${sha256(String(req.params.token))}.json`;
    const row = await db('data_requests').where({ export_file_key: key, type: 'export' }).first();
    if (!row || !row.export_expires_at || new Date(row.export_expires_at) < clock.now()) throw new ApiError('NOT_FOUND');
    const file = path.join(exportDir, key);
    let body;
    try { body = await fs.readFile(file); } catch { throw new ApiError('NOT_FOUND'); }
    await fs.rm(file, { force: true });
    await db('data_requests').where({ id: row.id }).update({ export_expires_at: clock.now() });
    res.set({ 'content-type': 'application/json', 'content-disposition': 'attachment; filename="nirapod-data.json"', 'cache-control': 'no-store' }).send(body);
  }));

  // Delete in the app: email accounts confirm with the password; Google/child accounts type DELETE.
  r.post('/me/delete', requireAuth, limiter({ windowMs: 3600_000, limit: 5 }), ah(async (req, res) => {
    const b = parse(z.object({ password: z.string().max(200).optional(), confirm: z.string().max(20).optional() }), req.body);
    const user = await db('users').where({ id: req.user.id }).first();
    if (user.password_hash) {
      if (!b.password || !(await verifyPassword(b.password, user.password_hash, cfg.BCRYPT_COST))) throw new ApiError('AUTH_INVALID_CREDENTIALS');
    } else if ((b.confirm || '').toUpperCase() !== 'DELETE') {
      throw new ApiError('VALIDATION_FAILED', { details: { field: 'confirm' } });
    }
    const now = clock.now();
    await db('data_requests').insert({ user_id: user.id, type: 'delete', status: 'completed', source: 'app', completed_at: now, created_at: now });
    const out = await deleteUserData(ctx, user.id, { now, reason: 'app' });
    res.json({ deleted_accounts: out.deleted.length });
  }));

  // Web deletion (public page): we email a confirmation link; nothing happens without clicking it.
  r.post('/account-deletion-requests', limiter({ windowMs: 3600_000, limit: 5 }), ah(async (req, res) => {
    const b = parse(z.object({ email: z.email().max(254) }), req.body);
    const now = clock.now();
    const user = await db('users').where({ email: b.email.toLowerCase() }).whereNot('status', 'deleted').first();
    if (user) {
      const token = crypto.randomBytes(24).toString('base64url');
      await db('data_requests').insert({
        user_id: user.id, requester_email: b.email.toLowerCase(), type: 'delete', status: 'pending', source: 'web',
        export_file_key: `del:${sha256(token)}`, export_expires_at: new Date(now.getTime() + DAY), created_at: now,
      });
      await mailer.send('delete_confirm', user, { url: `${cfg.PUBLIC_BASE_URL.replace(/\/$/, '')}/delete-account/?token=${token}` });
    }
    res.status(202).json({ sent: true }); // same answer whether or not the email exists
  }));

  r.post('/account-deletion/confirm', limiter({ windowMs: 3600_000, limit: 10 }), ah(async (req, res) => {
    const b = parse(z.object({ token: z.string().min(10).max(100) }), req.body);
    const now = clock.now();
    const row = await db('data_requests').where({ export_file_key: `del:${sha256(b.token)}`, type: 'delete', status: 'pending' }).first();
    if (!row || new Date(row.export_expires_at) < now) throw new ApiError('CODE_INVALID');
    await deleteUserData(ctx, row.user_id, { now, reason: 'web' });
    await db('data_requests').where({ id: row.id }).update({ status: 'completed', completed_at: now, export_file_key: null });
    res.json({ deleted: true });
  }));

  // Help center / FAQ articles (also the AI's knowledge base), per language with English fallback.
  r.get('/help/articles', ah(async (req, res) => {
    const q = parse(z.object({ language: z.string().max(8).default('en') }), req.query);
    let rows = await db('kb_articles').where({ is_published: true, language: q.language }).orderBy('category').orderBy('id');
    if (!rows.length) rows = await db('kb_articles').where({ is_published: true, language: 'en' }).orderBy('category').orderBy('id');
    res.set('cache-control', 'public, max-age=300').json(rows.map((a) => ({ slug: a.slug, title: a.title, body: a.body, category: a.category })));
  }));

  return r;
}

/** Job: remove expired export files. */
export async function purgeExports(ctx) {
  const { db, cfg, clock } = ctx;
  const rows = await db('data_requests').where({ type: 'export' }).whereNotNull('export_file_key').where('export_expires_at', '<', clock.now());
  for (const r of rows) {
    await fs.rm(path.join(cfg.UPLOAD_DIR, 'exports', r.export_file_key), { force: true });
    await db('data_requests').where({ id: r.id }).update({ export_file_key: null });
  }
  return rows.length;
}
