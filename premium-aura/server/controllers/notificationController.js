'use strict';
const db = require('../config/database');
const v = require('../utils/validate');
const { paginate, meta } = require('../utils/pagination');

exports.list = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 20, maxSize: 50 });
  const unreadOnly = req.query.unread === '1';
  const where = `user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''}`;
  const [items, [{ n }], [{ u }]] = await Promise.all([
    db.query(`SELECT id, type, title, body, link, is_read, created_at FROM notifications WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [req.user.id, p.size, p.offset]),
    db.query(`SELECT COUNT(*) AS n FROM notifications WHERE ${where}`, [req.user.id]),
    db.query('SELECT COUNT(*) AS u FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]),
  ]);
  res.json({ ok: true, items, unread: Number(u), pagination: meta(n, p) });
};

exports.read = async (req, res) => {
  const id = v.id(req.params.id);
  await db.run('UPDATE notifications SET is_read = 1, read_at = UTC_TIMESTAMP() WHERE id = ? AND user_id = ?', [id, req.user.id]);
  const [{ u }] = await db.query('SELECT COUNT(*) AS u FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ ok: true, unread: Number(u) });
};

exports.readAll = async (req, res) => {
  await db.run('UPDATE notifications SET is_read = 1, read_at = UTC_TIMESTAMP() WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ ok: true, unread: 0 });
};
