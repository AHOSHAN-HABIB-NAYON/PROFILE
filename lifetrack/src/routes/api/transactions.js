'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const { ah, ok, err } = require('../../lib/http');
const { validate } = require('../../lib/validate');
const ledger = require('../../services/ledger');
const upload = require('../../services/uploads');

const r = express.Router();
const USER_TYPES = ['income', 'expense', 'investment', 'transfer', 'deposit'];
const SELECT = `SELECT t.id, t.uuid, t.type, t.amount, t.to_amount, t.currency, t.occurred_at, t.note, t.tags, t.ref_type, t.ref_id,
  t.attachment_path IS NOT NULL has_attachment, t.account_id, t.to_account_id, t.category_id, t.created_at, t.updated_at,
  a.name account_name, a.type account_type, ta.name to_account_name, ta.type to_account_type,
  c.name category_name, c.icon category_icon, c.color category_color
  FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN accounts ta ON ta.id=t.to_account_id LEFT JOIN categories c ON c.id=t.category_id`;

r.get('/', ah(async (req, res) => {
  const q = req.query;
  const where = ['t.user_id=?', 't.deleted_at IS NULL']; const params = [req.user.id];
  if (q.type && ledger.TYPES.includes(q.type)) { where.push('t.type=?'); params.push(q.type); }
  if (q.types) { const ts = String(q.types).split(',').filter((x) => ledger.TYPES.includes(x)); if (ts.length) { where.push('t.type IN (?)'); params.push(ts); } }
  if (q.account_id) { where.push('(t.account_id=? OR t.to_account_id=?)'); params.push(Number(q.account_id) || 0, Number(q.account_id) || 0); }
  if (q.category_id) { where.push('t.category_id=?'); params.push(Number(q.category_id) || 0); }
  if (q.from && !isNaN(Date.parse(q.from))) { where.push('t.occurred_at >= ?'); params.push(new Date(q.from)); }
  if (q.to && !isNaN(Date.parse(q.to))) { where.push('t.occurred_at < ?'); params.push(new Date(q.to)); }
  if (q.q) { const s = `%${String(q.q).slice(0, 60).replace(/[%_\\]/g, '\\$&')}%`; where.push('(t.note LIKE ? OR t.tags LIKE ? OR c.name LIKE ? OR a.name LIKE ?)'); params.push(s, s, s, s); }
  if (q.tag) { where.push('FIND_IN_SET(?, t.tags)'); params.push(String(q.tag).slice(0, 40)); }
  if (q.min && !isNaN(q.min)) { where.push('t.amount >= ?'); params.push(Number(q.min)); }
  if (q.max && !isNaN(q.max)) { where.push('t.amount <= ?'); params.push(Number(q.max)); }
  const sort = { date_desc: 't.occurred_at DESC, t.id DESC', date_asc: 't.occurred_at ASC, t.id ASC', amount_desc: 't.amount DESC', amount_asc: 't.amount ASC' }[q.sort] || 't.occurred_at DESC, t.id DESC';
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 30));
  const page = Math.max(1, Number(q.page) || 1);
  const w = where.join(' AND ');
  const [items, agg] = await Promise.all([
    db.q(`${SELECT} WHERE ${w} ORDER BY ${sort} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]),
    db.one(`SELECT COUNT(*) n,
        COALESCE(SUM(CASE WHEN t.type IN ('income','deposit','borrow','repay_in') THEN t.amount END),0) inflow,
        COALESCE(SUM(CASE WHEN t.type IN ('expense','investment','lend','repay_out') THEN t.amount END),0) outflow
      FROM transactions t JOIN accounts a ON a.id=t.account_id LEFT JOIN categories c ON c.id=t.category_id WHERE ${w}`, params),
  ]);
  ok(res, { items, total: Number(agg.n), page, pages: Math.ceil(Number(agg.n) / limit), inflow: agg.inflow, outflow: agg.outflow });
}));

r.get('/:id', ah(async (req, res) => {
  const t = await db.one(`${SELECT} WHERE t.id=? AND t.user_id=? AND t.deleted_at IS NULL`, [Number(req.params.id) || 0, req.user.id]);
  if (!t) throw err(404, 'not_found', 'Transaction not found');
  ok(res, t);
}));

r.post('/', ah(async (req, res) => {
  const b = validate(req.body, {
    type: ['enum', { values: USER_TYPES }], account_id: ['id'], to_account_id: ['id', { optional: true, nullable: true }],
    amount: ['amount'], to_amount: ['amount', { optional: true, nullable: true }], category_id: ['id', { optional: true, nullable: true }],
    occurred_at: ['instant', { optional: true }], note: ['str', { max: 500, optional: true }], tags: ['tags', { optional: true }],
    investment_name: ['str', { max: 120, optional: true }], investment_kind: ['str', { max: 40, optional: true }],
  });
  const key = String(req.get('idempotency-key') || req.body.idempotency_key || '').slice(0, 64) || null;
  const out = await ledger.create(req.user.id, { ...b, idempotency_key: key });
  const full = await db.one(`${SELECT} WHERE t.id=?`, [out.tx.id]);
  ok(res, { ...full, duplicate: out.duplicate }, out.duplicate ? 200 : 201);
}));

r.patch('/:id', ah(async (req, res) => {
  const b = validate(req.body, {
    amount: ['amount', { optional: true }], account_id: ['id', { optional: true }], category_id: ['id', { optional: true, nullable: true }],
    occurred_at: ['instant', { optional: true }], note: ['str', { max: 500, optional: true }], tags: ['tags', { optional: true }],
  });
  const patch = {}; for (const k of Object.keys(b)) if (k in (req.body || {})) patch[k] = b[k];
  const t = await ledger.update(req.user.id, Number(req.params.id) || 0, patch);
  ok(res, await db.one(`${SELECT} WHERE t.id=?`, [t.id]));
}));

r.delete('/:id', ah(async (req, res) => {
  await ledger.remove(req.user.id, Number(req.params.id) || 0);
  ok(res, { deleted: true });
}));

r.post('/:id/attachment', upload.attachment('file'), ah(async (req, res) => {
  const t = await db.one('SELECT id, attachment_path FROM transactions WHERE id=? AND user_id=? AND deleted_at IS NULL', [Number(req.params.id) || 0, req.user.id]);
  if (!t) throw err(404, 'not_found', 'Transaction not found');
  if (!req.file) throw err(422, 'validation_failed', 'Choose a file');
  const saved = await upload.savePrivate(req.file);
  await db.q('UPDATE transactions SET attachment_path=?, attachment_mime=? WHERE id=?', [saved.path, saved.mime, t.id]);
  if (t.attachment_path) fs.rm(path.join(upload.UPLOAD_ROOT, 'attachments', path.basename(t.attachment_path)), () => {});
  ok(res, { attached: true });
}));

/** Ownership-checked private file download */
r.get('/:id/attachment', ah(async (req, res) => {
  const t = await db.one('SELECT attachment_path, attachment_mime FROM transactions WHERE id=? AND user_id=? AND deleted_at IS NULL', [Number(req.params.id) || 0, req.user.id]);
  if (!t || !t.attachment_path) throw err(404, 'not_found', 'No attachment');
  res.setHeader('Content-Type', t.attachment_mime || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(path.join(upload.UPLOAD_ROOT, 'attachments', path.basename(t.attachment_path)));
}));

module.exports = r;
