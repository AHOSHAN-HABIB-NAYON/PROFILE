'use strict';
const express = require('express');
const db = require('../../db');
const { ah, ok, err } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const r = express.Router();
const KINDS = ['income', 'expense', 'investment', 'other'];

r.get('/', ah(async (req, res) => {
  ok(res, await db.q('SELECT id, name, kind, icon, color, user_id IS NULL AS system FROM categories WHERE (user_id=? OR user_id IS NULL) AND archived_at IS NULL ORDER BY kind, name', [req.user.id]));
}));
r.post('/', ah(async (req, res) => {
  const b = validate(req.body, { name: ['str', { min: 1, max: 60 }], kind: ['enum', { values: KINDS }], icon: ['str', { max: 40, optional: true, default: 'tag', pattern: /^[a-z0-9-]+$/ }], color: ['color', { optional: true, default: '#3B82F6' }] });
  const n = await db.one('SELECT COUNT(*) n FROM categories WHERE user_id=?', [req.user.id]);
  if (Number(n.n) >= 300) throw err(409, 'limit_reached', 'Category limit reached');
  const out = await db.q('INSERT INTO categories (user_id, name, kind, icon, color) VALUES (?,?,?,?,?)', [req.user.id, b.name, b.kind, b.icon, b.color]);
  ok(res, await db.one('SELECT id, name, kind, icon, color FROM categories WHERE id=?', [out.insertId]), 201);
}));
r.patch('/:id', ah(async (req, res) => {
  const b = validate(req.body, { name: ['str', { min: 1, max: 60 }], icon: ['str', { max: 40, optional: true, default: 'tag', pattern: /^[a-z0-9-]+$/ }], color: ['color', { optional: true, default: '#3B82F6' }] });
  const out = await db.q('UPDATE categories SET name=?, icon=?, color=? WHERE id=? AND user_id=?', [b.name, b.icon, b.color, Number(req.params.id) || 0, req.user.id]);
  if (!out.affectedRows) throw err(404, 'not_found', 'Category not found');
  ok(res, { updated: true });
}));
r.delete('/:id', ah(async (req, res) => {
  const out = await db.q('UPDATE categories SET archived_at=NOW() WHERE id=? AND user_id=?', [Number(req.params.id) || 0, req.user.id]);
  if (!out.affectedRows) throw err(404, 'not_found', 'Category not found');
  ok(res, { archived: true });
}));
module.exports = r;
