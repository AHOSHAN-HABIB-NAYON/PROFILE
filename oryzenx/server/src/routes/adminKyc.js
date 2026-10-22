// Admin KYC review: ID front/back and the live face side by side, approve / reject / ask to redo.
// Every view of KYC data is written to the audit log.
const express = require('express');
const config = require('../config');
const { query, one } = require('../db');
const { ah, bad, HttpError, str } = require('../lib/util');
const { requireAdmin, privateUser } = require('../lib/auth');
const { decrypt } = require('../lib/crypto');
const { sendEmail, esc } = require('../lib/mail');
const notify = require('../lib/notify');
const audit = require('../lib/audit');

const router = express.Router();
router.use(requireAdmin);

async function member(id) {
  const u = await one('SELECT * FROM users WHERE id = ?', [Number(id)]);
  if (!u) throw new HttpError(404, 'User not found');
  return u;
}

async function event(req, userId, kind, result, detail) {
  await query('INSERT INTO kyc_events (user_id, kind, result, detail, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)', [
    userId, kind, result, detail ? JSON.stringify(detail) : null, req.ip, String(req.get('user-agent') || '').slice(0, 255),
  ]);
}

router.get('/', ah(async (req, res) => {
  const filter = req.query.status || 'pending';
  const where = {
    pending: "kyc_status IN ('submitted','review')",
    approved: "kyc_status = 'approved'",
    rejected: "kyc_status IN ('rejected','resubmit')",
    waiting: "kyc_status = 'none' AND role = 'user' AND status <> 'disabled'",
  }[filter];
  if (!where) throw bad('Unknown filter');
  const rows = await query(
    `SELECT u.*, p.match_distance FROM users u LEFT JOIN kyc_profiles p ON p.user_id = u.id
      WHERE ${where} ORDER BY u.kyc_submitted_at DESC, u.created_at DESC LIMIT 200`,
  );
  res.json({ rows: rows.map((u) => ({ ...privateUser(u), match_distance: u.match_distance, kyc_submitted_at: u.kyc_submitted_at })) });
}));

router.get('/:id', ah(async (req, res) => {
  const u = await member(req.params.id);
  const [prof, files, events] = await Promise.all([
    one('SELECT match_distance, liveness, updated_at FROM kyc_profiles WHERE user_id = ?', [u.id]),
    query('SELECT kind, created_at FROM kyc_files WHERE user_id = ?', [u.id]),
    query('SELECT kind, result, detail, ip, user_agent, created_at FROM kyc_events WHERE user_id = ? ORDER BY id DESC LIMIT 100', [u.id]),
  ]);
  await audit(req, 'kyc_view', 'user', u.id);
  res.json({
    user: { ...privateUser(u), kyc_submitted_at: u.kyc_submitted_at },
    profile: prof ? { ...prof, liveness: typeof prof.liveness === 'string' ? JSON.parse(prof.liveness) : prof.liveness } : null,
    files: files.map((f) => f.kind),
    events,
  });
}));

router.get('/:id/file/:kind', ah(async (req, res) => {
  const kind = ['id_front', 'id_back', 'face'].includes(req.params.kind) ? req.params.kind : null;
  if (!kind) throw bad('Unknown file');
  const f = await one('SELECT mime, data FROM kyc_files WHERE user_id = ? AND kind = ?', [Number(req.params.id), kind]);
  if (!f) throw new HttpError(404, 'Not found');
  await audit(req, 'kyc_file_view', 'user', req.params.id, { kind });
  res.set({ 'Content-Type': f.mime, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'" });
  res.send(decrypt(f.data));
}));

router.post('/:id/approve', ah(async (req, res) => {
  const u = await member(req.params.id);
  await query("UPDATE users SET kyc_status = 'approved', kyc_note = NULL, kyc_fail_count = 0, status = IF(status = 'pending', 'active', status) WHERE id = ?", [u.id]);
  await event(req, u.id, 'admin_decision', 'approved');
  await audit(req, 'kyc_approve', 'user', u.id);
  await notify(u.id, 'Verification approved', 'Your identity was verified. Welcome to OryzenX BD!');
  await sendEmail(u, 'kyc', {
    subject: 'Your verification is approved', title: 'You are verified',
    body: `Hi ${esc(u.name)},<br>Your ID and face check were approved. You can now open the dashboard.`,
    cta: { label: 'Open OryzenX BD', url: config.appUrl },
  });
  res.json({ ok: true });
}));

router.post('/:id/reject', ah(async (req, res) => {
  const u = await member(req.params.id);
  const reason = str(req.body.reason, { field: 'Reason', max: 255, required: true, min: 3 });
  const redo = !!req.body.resubmit;
  await query('UPDATE users SET kyc_status = ?, kyc_note = ?, kyc_fail_count = 0 WHERE id = ?', [redo ? 'resubmit' : 'rejected', reason, u.id]);
  await event(req, u.id, 'admin_decision', redo ? 'resubmit' : 'rejected', { reason });
  await audit(req, redo ? 'kyc_resubmit' : 'kyc_reject', 'user', u.id, { reason });
  await sendEmail(u, 'kyc', {
    subject: redo ? 'Please redo your verification' : 'Your verification was not approved',
    title: redo ? 'Please submit your verification again' : 'Verification not approved',
    body: `Hi ${esc(u.name)},<br>${redo ? 'An admin asked you to submit your ID and face check again.' : 'An admin could not approve your verification.'}<br><b>Reason:</b> ${esc(reason)}`,
    cta: redo ? { label: 'Verify again', url: config.appUrl } : undefined,
  });
  res.json({ ok: true });
}));

// Delete a member's KYC data on request. They will need to verify again to use the app.
router.delete('/:id/data', ah(async (req, res) => {
  const u = await member(req.params.id);
  await query('DELETE FROM kyc_files WHERE user_id = ?', [u.id]);
  await query('DELETE FROM kyc_profiles WHERE user_id = ?', [u.id]);
  await query('DELETE FROM kyc_challenges WHERE user_id = ?', [u.id]);
  if (u.role === 'user') await query("UPDATE users SET kyc_status = 'none', kyc_consent_at = NULL, kyc_fail_count = 0, kyc_note = 'KYC data deleted on request' WHERE id = ?", [u.id]);
  await event(req, u.id, 'admin_decision', 'data_deleted');
  await audit(req, 'kyc_delete', 'user', u.id);
  res.json({ ok: true });
}));

module.exports = router;
