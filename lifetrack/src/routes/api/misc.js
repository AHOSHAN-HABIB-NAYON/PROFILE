'use strict';
/** Investments, reminders, notifications, push subscriptions, moods and notes. */
const express = require('express');
const db = require('../../db');
const { ah, ok, err, ua } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const { sha256 } = require('../../lib/crypto');
const push = require('../../services/push');
const settings = require('../../services/settings');

const investments = express.Router();
investments.get('/', ah(async (req, res) => {
  const rows = await db.q('SELECT * FROM investments WHERE user_id=? ORDER BY closed_at IS NOT NULL, started_at DESC LIMIT 300', [req.user.id]);
  ok(res, rows);
}));
investments.patch('/:id', ah(async (req, res) => {
  const b = validate(req.body, { name: ['str', { min: 1, max: 120, optional: true }], current_value: ['amount', { optional: true, allowZero: true }], kind: ['str', { max: 40, optional: true }], note: ['str', { max: 500, optional: true }] });
  const inv = await db.one('SELECT id FROM investments WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]);
  if (!inv) throw err(404, 'not_found', 'Investment not found');
  const raw = req.body || {}; const set = []; const vals = [];
  for (const k of ['name', 'current_value', 'kind', 'note']) if (k in raw && b[k] !== undefined) { set.push(`${k}=?`); vals.push(b[k]); }
  if (set.length) await db.q(`UPDATE investments SET ${set.join(',')} WHERE id=?`, [...vals, inv.id]);
  ok(res, await db.one('SELECT * FROM investments WHERE id=?', [inv.id]));
}));

const rem = express.Router();
rem.get('/', ah(async (req, res) => {
  const done = req.query.scope === 'done';
  const rows = await db.q(`SELECT id, type, title, body, amount, due_at, remind_at, repeat_rule, ref_type, ref_id, sent_at, done_at
    FROM reminders WHERE user_id=? AND ${done ? 'done_at IS NOT NULL' : 'done_at IS NULL'} ORDER BY due_at ${done ? 'DESC' : 'ASC'}, remind_at DESC LIMIT 300`, [req.user.id]);
  // Loans/goals create a "days before" + "on the day" pair — show one entry per item
  const seen = new Set();
  ok(res, rows.filter((r) => { if (!r.ref_type) return true; const k = r.ref_type + ':' + r.ref_id; if (seen.has(k)) return false; seen.add(k); return true; }));
}));
const remSchema = {
  type: ['enum', { values: ['bill', 'payment', 'custom'], optional: true, default: 'custom' }], title: ['str', { min: 1, max: 160 }], body: ['str', { max: 500, optional: true }],
  amount: ['amount', { optional: true, nullable: true }], due_at: ['instant'], remind_before_min: ['int', { min: 0, max: 60 * 24 * 14, optional: true, default: 0 }],
  repeat_rule: ['enum', { values: ['none', 'daily', 'weekly', 'monthly', 'yearly'], optional: true, default: 'none' }],
};
rem.post('/', ah(async (req, res) => {
  const b = validate(req.body, remSchema);
  const remindAt = new Date(Math.max(Date.now() + 30e3, b.due_at.getTime() - b.remind_before_min * 60e3));
  const out = await db.q('INSERT INTO reminders (user_id, type, title, body, amount, due_at, remind_at, repeat_rule) VALUES (?,?,?,?,?,?,?,?)',
    [req.user.id, b.type, b.title, b.body || null, b.amount, b.due_at, remindAt, b.repeat_rule]);
  ok(res, await db.one('SELECT * FROM reminders WHERE id=?', [out.insertId]), 201);
}));
rem.patch('/:id', ah(async (req, res) => {
  const b = validate(req.body, remSchema);
  const remindAt = new Date(Math.max(Date.now() + 30e3, b.due_at.getTime() - b.remind_before_min * 60e3));
  const out = await db.q('UPDATE reminders SET type=?, title=?, body=?, amount=?, due_at=?, remind_at=?, repeat_rule=?, sent_at=NULL WHERE id=? AND user_id=? AND ref_type IS NULL',
    [b.type, b.title, b.body || null, b.amount, b.due_at, remindAt, b.repeat_rule, Number(req.params.id) || 0, req.user.id]);
  if (!out.affectedRows) throw err(404, 'not_found', 'Reminder not found');
  ok(res, { updated: true });
}));
rem.post('/:id/done', ah(async (req, res) => {
  const out = await db.q('UPDATE reminders SET done_at=IF(done_at IS NULL, NOW(), NULL) WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]);
  if (!out.affectedRows) throw err(404, 'not_found', 'Reminder not found');
  ok(res, { toggled: true });
}));
rem.delete('/:id', ah(async (req, res) => {
  const out = await db.q('DELETE FROM reminders WHERE id=? AND user_id=? AND ref_type IS NULL', [Number(req.params.id) || 0, req.user.id]);
  if (!out.affectedRows) throw err(404, 'not_found', 'Reminder not found');
  ok(res, { deleted: true });
}));

const notif = express.Router();
notif.get('/', ah(async (req, res) => {
  const limit = Math.min(50, Number(req.query.limit) || 30);
  const before = Number(req.query.before) || 0;
  const rows = await db.q(`SELECT id, type, title, body, link, read_at, created_at FROM notifications WHERE user_id=? ${before ? 'AND id<?' : ''} ORDER BY id DESC LIMIT ?`,
    before ? [req.user.id, before, limit] : [req.user.id, limit]);
  const unread = await db.one('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', [req.user.id]);
  ok(res, { items: rows, unread: Number(unread.n), more: rows.length === limit });
}));
notif.get('/unread', ah(async (req, res) => {
  const unread = await db.one('SELECT COUNT(*) n FROM notifications WHERE user_id=? AND read_at IS NULL', [req.user.id]);
  ok(res, { unread: Number(unread.n) });
}));
notif.post('/read-all', ah(async (req, res) => { await db.q('UPDATE notifications SET read_at=NOW() WHERE user_id=? AND read_at IS NULL', [req.user.id]); ok(res, { done: true }); }));
notif.post('/:id/read', ah(async (req, res) => { await db.q('UPDATE notifications SET read_at=COALESCE(read_at, NOW()) WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]); ok(res, { done: true }); }));
notif.delete('/:id', ah(async (req, res) => { await db.q('DELETE FROM notifications WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]); ok(res, { deleted: true }); }));

const pushR = express.Router();
pushR.post('/subscribe', ah(async (req, res) => {
  const kind = req.body?.kind === 'fcm' ? 'fcm' : 'webpush';
  let endpoint; let p256dh = null; let auth = null;
  if (kind === 'webpush') {
    const s = req.body?.subscription || {};
    endpoint = String(s.endpoint || '');
    p256dh = String(s.keys?.p256dh || '').slice(0, 255); auth = String(s.keys?.auth || '').slice(0, 255);
    if (!/^https:\/\//.test(endpoint) || endpoint.length > 2000 || !p256dh || !auth) throw err(422, 'validation_failed', 'Invalid subscription');
  } else {
    endpoint = String(req.body?.token || '');
    if (!/^[\w:.-]{20,4096}$/.test(endpoint)) throw err(422, 'validation_failed', 'Invalid FCM token');
  }
  await db.q(`INSERT INTO push_subscriptions (user_id, kind, endpoint_hash, endpoint, p256dh, auth, user_agent) VALUES (?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), p256dh=VALUES(p256dh), auth=VALUES(auth), user_agent=VALUES(user_agent)`,
  [req.user.id, kind, sha256(endpoint), endpoint, p256dh, auth, ua(req)]);
  ok(res, { subscribed: true });
}));
pushR.post('/unsubscribe', ah(async (req, res) => {
  const endpoint = String(req.body?.endpoint || req.body?.token || '');
  await db.q('DELETE FROM push_subscriptions WHERE endpoint_hash=? AND user_id=?', [sha256(endpoint), req.user.id]);
  ok(res, { unsubscribed: true });
}));
pushR.post('/test', ah(async (req, res) => {
  const n = await push.sendToUser(req.user.id, { title: settings.get('site_name'), body: '🔔 Push notifications are working!', link: '/app/notifications', tag: 'test' });
  ok(res, { delivered: n });
}));

const moods = express.Router();
moods.get('/', ah(async (req, res) => {
  const m = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
  const rows = await db.q("SELECT id, mood, DATE_FORMAT(entry_date, '%Y-%m-%d') date, activity, note FROM moods WHERE user_id=? AND entry_date >= ? AND entry_date < DATE_ADD(?, INTERVAL 1 MONTH) ORDER BY entry_date DESC", [req.user.id, m + '-01', m + '-01']);
  const recent = await db.q("SELECT id, mood, DATE_FORMAT(entry_date, '%Y-%m-%d') date, activity, note FROM moods WHERE user_id=? ORDER BY entry_date DESC LIMIT 14", [req.user.id]);
  const avg = rows.length ? rows.reduce((s, r) => s + r.mood, 0) / rows.length : null;
  ok(res, { month: m, items: rows, recent, average: avg && Math.round(avg * 10) / 10 });
}));
moods.post('/', ah(async (req, res) => {
  const b = validate(req.body, { mood: ['int', { min: 1, max: 5 }], date: ['date'], activity: ['str', { max: 60, optional: true }], note: ['str', { max: 300, optional: true }] });
  await db.q('INSERT INTO moods (user_id, mood, entry_date, activity, note) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE mood=VALUES(mood), activity=VALUES(activity), note=VALUES(note)',
    [req.user.id, b.mood, b.date, b.activity || null, b.note || null]);
  ok(res, { saved: true });
}));
moods.delete('/:id', ah(async (req, res) => { await db.q('DELETE FROM moods WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]); ok(res, { deleted: true }); }));

const notes = express.Router();
notes.get('/', ah(async (req, res) => ok(res, await db.q('SELECT * FROM notes WHERE user_id=? ORDER BY pinned DESC, updated_at DESC LIMIT 200', [req.user.id]))));
notes.post('/', ah(async (req, res) => {
  const b = validate(req.body, { title: ['str', { min: 1, max: 160 }], body: ['str', { max: 5000, optional: true }], pinned: ['bool', { optional: true, default: false }] });
  const out = await db.q('INSERT INTO notes (user_id, title, body, pinned) VALUES (?,?,?,?)', [req.user.id, b.title, b.body || null, b.pinned ? 1 : 0]);
  ok(res, await db.one('SELECT * FROM notes WHERE id=?', [out.insertId]), 201);
}));
notes.patch('/:id', ah(async (req, res) => {
  const b = validate(req.body, { title: ['str', { min: 1, max: 160 }], body: ['str', { max: 5000, optional: true }], pinned: ['bool', { optional: true, default: false }] });
  const out = await db.q('UPDATE notes SET title=?, body=?, pinned=? WHERE id=? AND user_id=?', [b.title, b.body || null, b.pinned ? 1 : 0, Number(req.params.id) || 0, req.user.id]);
  if (!out.affectedRows) throw err(404, 'not_found', 'Note not found');
  ok(res, { updated: true });
}));
notes.delete('/:id', ah(async (req, res) => { await db.q('DELETE FROM notes WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]); ok(res, { deleted: true }); }));

module.exports = { investments, rem, notif, pushR, moods, notes };
