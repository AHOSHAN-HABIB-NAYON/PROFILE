'use strict';
const express = require('express');
const db = require('../../db');
const { ah, ok, err } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const reminders = require('../../services/reminders');
const { notify } = require('../../services/notify');
const upload = require('../../services/uploads');

const r = express.Router();
const KINDS = ['phone', 'bike', 'car', 'emergency', 'travel', 'education', 'home', 'wedding', 'laptop', 'custom'];
const schema = (partial) => ({
  name: ['str', { min: 1, max: 120, optional: partial }], kind: ['enum', { values: KINDS, optional: true, default: partial ? undefined : 'custom' }],
  icon: ['str', { max: 40, optional: true, pattern: /^[a-z0-9-]+$/ }], color: ['color', { optional: true, nullable: true }],
  target_amount: ['amount', { optional: partial }], current_amount: ['amount', { optional: true, allowZero: true }],
  currency: ['currency', { optional: true }], deadline: ['date', { optional: true, nullable: true }], note: ['str', { max: 500, optional: true }],
});
const decorate = (g) => {
  const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100 || 0);
  const days = g.deadline ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 864e5) : null;
  return { ...g, progress: Math.round(pct * 10) / 10, remaining: Math.max(0, Number(g.target_amount) - Number(g.current_amount)).toFixed(2), days_left: days };
};

r.get('/', ah(async (req, res) => {
  const rows = await db.q('SELECT * FROM goals WHERE user_id=? AND archived_at IS NULL ORDER BY completed_at IS NOT NULL, deadline IS NULL, deadline, id DESC', [req.user.id]);
  ok(res, rows.map(decorate));
}));

r.post('/', ah(async (req, res) => {
  const b = validate(req.body, schema(false));
  const p = await db.one('SELECT currency FROM user_profiles WHERE user_id=?', [req.user.id]);
  const id = await db.tx(async (t) => {
    const out = await t.q('INSERT INTO goals (user_id, name, kind, icon, color, target_amount, current_amount, currency, deadline, note) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [req.user.id, b.name, b.kind || 'custom', b.icon || b.kind || 'target', b.color || null, b.target_amount, b.current_amount || '0.00', b.currency || p.currency, b.deadline, b.note || null]);
    if (b.deadline) await reminders.scheduleForDue(t, req.user.id, { type: 'goal', title: `Goal deadline: ${b.name}`, body: `Your goal "${b.name}" deadline is approaching.`, dueDate: b.deadline, refType: 'goal', refId: out.insertId });
    return out.insertId;
  });
  ok(res, decorate(await db.one('SELECT * FROM goals WHERE id=?', [id])), 201);
}));

r.patch('/:id', ah(async (req, res) => {
  const b = validate(req.body, schema(true));
  const g = await db.one('SELECT * FROM goals WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]);
  if (!g) throw err(404, 'not_found', 'Goal not found');
  const raw = req.body || {}; const set = []; const vals = [];
  for (const k of ['name', 'kind', 'icon', 'color', 'target_amount', 'currency', 'deadline', 'note']) if (k in raw && b[k] !== undefined) { set.push(`${k}=?`); vals.push(b[k]); }
  if (set.length) await db.q(`UPDATE goals SET ${set.join(',')} WHERE id=? AND user_id=?`, [...vals, g.id, req.user.id]);
  if ('deadline' in raw) {
    await db.tx(async (t) => {
      await reminders.cancelForRef(t, req.user.id, 'goal', g.id);
      if (b.deadline) await reminders.scheduleForDue(t, req.user.id, { type: 'goal', title: `Goal deadline: ${b.name || g.name}`, dueDate: b.deadline, refType: 'goal', refId: g.id });
    });
  }
  ok(res, decorate(await db.one('SELECT * FROM goals WHERE id=?', [g.id])));
}));

/** Add (or withdraw with negative amount) savings to a goal — atomic, never below zero */
r.post('/:id/contribute', ah(async (req, res) => {
  const b = validate(req.body, { amount: ['signedAmount'] });
  if (Number(b.amount) === 0) throw err(422, 'validation_failed', 'Enter an amount', { fields: { amount: 'invalid_amount' } });
  let reached = false;
  const g = await db.tx(async (t) => {
    const cur = await t.one('SELECT * FROM goals WHERE id=? AND user_id=? AND archived_at IS NULL FOR UPDATE', [Number(req.params.id) || 0, req.user.id]);
    if (!cur) throw err(404, 'not_found', 'Goal not found');
    const next = Number(cur.current_amount) + Number(b.amount);
    if (next < 0) throw err(422, 'validation_failed', 'Cannot withdraw more than saved', { fields: { amount: 'too_large' } });
    reached = !cur.completed_at && next >= Number(cur.target_amount);
    await t.q('UPDATE goals SET current_amount=?, completed_at=IF(? >= target_amount, COALESCE(completed_at, NOW()), NULL) WHERE id=?', [next.toFixed(2), next, cur.id]);
    if (reached) await reminders.cancelForRef(t, req.user.id, 'goal', cur.id);
    return t.one('SELECT * FROM goals WHERE id=?', [cur.id]);
  });
  if (reached) notify(req.user.id, { type: 'goal', titleKey: 'notif.goal_reached.title', bodyKey: 'notif.goal_reached.body', vars: { goal: g.name }, link: '/app/goals' }).catch(() => {});
  ok(res, decorate(g));
}));

r.post('/:id/image', upload.image('file'), ah(async (req, res) => {
  const g = await db.one('SELECT id FROM goals WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]);
  if (!g) throw err(404, 'not_found', 'Goal not found');
  if (!req.file) throw err(422, 'validation_failed', 'Choose an image');
  const url = await upload.saveImage(req.file, 'goals', { maxSize: 480 });
  await db.q('UPDATE goals SET image_path=? WHERE id=?', [url, g.id]);
  ok(res, { image: url });
}));

r.delete('/:id', ah(async (req, res) => {
  const out = await db.q('UPDATE goals SET archived_at=NOW() WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]);
  if (!out.affectedRows) throw err(404, 'not_found', 'Goal not found');
  await db.q("UPDATE reminders SET done_at=NOW() WHERE user_id=? AND ref_type='goal' AND ref_id=? AND done_at IS NULL", [req.user.id, Number(req.params.id)]);
  ok(res, { deleted: true });
}));

module.exports = r;
