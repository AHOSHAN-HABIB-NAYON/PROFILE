// The signed-in user's own profile and private payout details.
const express = require('express');
const { query, one } = require('../db');
const { ah, str, oneOf, bad } = require('../lib/util');
const { requireReady, privateUser } = require('../lib/auth');
const { saveDataUrl, removeUpload } = require('../lib/uploads');
const { sendEmail, esc } = require('../lib/mail');
const audit = require('../lib/audit');
const risk = require('../lib/risk');

const router = express.Router();
router.use(requireReady);

const METHOD_TYPES = ['bkash', 'nagad', 'rocket', 'bank', 'crypto'];
const METHOD_NAMES = { bkash: 'bKash', nagad: 'Nagad', rocket: 'Rocket', bank: 'Bank', crypto: 'Crypto wallet' };

router.get('/', ah(async (req, res) => {
  const [methods, paid] = await Promise.all([
    query('SELECT id, type, account, holder, network, is_default FROM payment_methods WHERE user_id = ? ORDER BY is_default DESC, type', [req.user.id]),
    one("SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM payments WHERE user_id = ? AND status = 'paid'", [req.user.id]),
  ]);
  res.json({ user: privateUser(req.user), payment_methods: methods, total_paid: paid.total, payments_count: paid.n });
}));

router.put('/', ah(async (req, res) => {
  const fields = {
    name: str(req.body.name, { field: 'Name', min: 2, max: 120, required: true }),
    phone: str(req.body.phone, { field: 'Phone', max: 40 }),
    address: str(req.body.address, { field: 'Address', max: 255 }),
    reminder_emails: req.body.reminder_emails === false ? 0 : 1,
  };
  if (fields.phone && !/^[+\d][\d\s-]{5,}$/.test(fields.phone)) throw bad('Enter a valid phone number');
  await query('UPDATE users SET name = ?, phone = ?, address = ?, reminder_emails = ? WHERE id = ?',
    [fields.name, fields.phone, fields.address, fields.reminder_emails, req.user.id]);
  const changed = ['name', 'phone', 'address'].filter((k) => (req.user[k] || null) !== fields[k]);
  if (req.user.phone && changed.includes('phone')) await risk.flag(req, req.user, 'Phone number changed');
  if (changed.length) {
    await sendEmail(req.user, 'security', {
      subject: 'Your OryzenX BD profile was updated', title: 'Profile updated',
      body: `These details were changed: <b>${esc(changed.join(', '))}</b>. If this was not you, change your password and tell an admin.`,
    });
  }
  const user = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: privateUser(user) });
}));

router.post('/avatar', ah(async (req, res) => {
  const url = await saveDataUrl(req.body.image, 'avatars', {
    allow: ['image/webp', 'image/jpeg', 'image/png'], maxBytes: 400 * 1024, ownerId: req.user.id,
  });
  await query('UPDATE users SET avatar_url = ? WHERE id = ?', [url, req.user.id]);
  await removeUpload(req.user.avatar_url);
  res.json({ avatar_url: url });
}));

router.put('/payment-methods/:type', ah(async (req, res) => {
  const type = oneOf(req.params.type, METHOD_TYPES, 'Method');
  const account = str(req.body.account, { field: type === 'crypto' ? 'Wallet address' : 'Account', max: 190, required: true, min: 4 });
  const holder = str(req.body.holder, { field: 'Account holder', max: 120 });
  const network = type === 'crypto' ? str(req.body.network, { field: 'Network', max: 40, required: true }) : str(req.body.network, { field: 'Bank / branch', max: 40 });
  const existing = await one('SELECT id FROM payment_methods WHERE user_id = ? AND type = ?', [req.user.id, type]);
  if (req.body.is_default) await query('UPDATE payment_methods SET is_default = 0 WHERE user_id = ?', [req.user.id]);
  await query(
    `INSERT INTO payment_methods (user_id, type, account, holder, network, is_default) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE account = VALUES(account), holder = VALUES(holder), network = VALUES(network), is_default = VALUES(is_default)`,
    [req.user.id, type, account, holder, network, req.body.is_default ? 1 : 0],
  );
  await sendEmail(req.user, 'payment_method', {
    subject: `Payment method ${existing ? 'changed' : 'added'}: ${METHOD_NAMES[type]}`,
    title: `Payment method ${existing ? 'changed' : 'added'}`,
    body: `Your <b>${METHOD_NAMES[type]}</b> payout details were ${existing ? 'updated' : 'added'}. If this was not you, change your password and tell an admin right away.`,
  });
  await audit(req, existing ? 'payment_method_change' : 'payment_method_add', 'user', req.user.id, { type });
  if (existing) await risk.flag(req, req.user, 'Payment method changed');
  res.json({ ok: true });
}));

router.delete('/payment-methods/:type', ah(async (req, res) => {
  const type = oneOf(req.params.type, METHOD_TYPES, 'Method');
  await query('DELETE FROM payment_methods WHERE user_id = ? AND type = ?', [req.user.id, type]);
  await audit(req, 'payment_method_remove', 'user', req.user.id, { type });
  res.json({ ok: true });
}));

// Push notification token from the Android app.
router.post('/push-token', ah(async (req, res) => {
  const token = str(req.body.token, { field: 'Token', max: 255, required: true, min: 20 });
  await query('INSERT INTO push_tokens (token, user_id, platform) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), updated_at = NOW()',
    [token, req.user.id, req.body.platform === 'ios' ? 'ios' : 'android']);
  res.json({ ok: true });
}));

router.delete('/push-token', ah(async (req, res) => {
  await query('DELETE FROM push_tokens WHERE token = ? AND user_id = ?', [String(req.body.token || ''), req.user.id]);
  res.json({ ok: true });
}));

module.exports = { router, METHOD_TYPES, METHOD_NAMES };
