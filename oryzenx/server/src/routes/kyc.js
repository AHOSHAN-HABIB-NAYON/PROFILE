// Member KYC: consent, ID card photos (front and back), then a live face check.
// The phone does the face analysis; the server checks the challenge, timing and match, stores
// everything encrypted, and an admin makes the final decision.
const express = require('express');
const crypto = require('crypto');
const { query, one } = require('../db');
const { ah, bad, HttpError } = require('../lib/util');
const { requireLogin, stageOf, privateUser } = require('../lib/auth');
const { parseDataUrl } = require('../lib/uploads');
const { encrypt, encryptJson, decryptJson } = require('../lib/crypto');
const { sendEmail, esc } = require('../lib/mail');
const notify = require('../lib/notify');

const router = express.Router();
router.use(requireLogin);

const PROMPTS = ['look_left', 'look_right', 'look_up', 'nod_down', 'smile', 'blink', 'eyes_closed'];
const MATCH_THRESHOLD = 0.55; // face descriptor distance; lower = more similar
const MAX_FAILS = 3;

const distance = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
function descriptor(v, field) {
  if (!Array.isArray(v) || v.length !== 128 || !v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 2)) {
    throw bad(`${field} is not a valid face template`);
  }
  return v.map((x) => Math.round(x * 1e6) / 1e6);
}

async function logEvent(req, kind, result, detail) {
  await query('INSERT INTO kyc_events (user_id, kind, result, detail, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)', [
    req.user.id, kind, result, detail ? JSON.stringify(detail) : null, req.ip, String(req.get('user-agent') || '').slice(0, 255),
  ]);
}

// Only allow changes while the member is in the KYC step.
function inKyc(req) {
  if (stageOf(req.user) !== 'kyc') throw new HttpError(409, 'Your verification is not open for changes right now');
}

router.get('/status', ah(async (req, res) => {
  const files = await query('SELECT kind FROM kyc_files WHERE user_id = ?', [req.user.id]);
  const prof = await one('SELECT id_template IS NOT NULL AS has_template FROM kyc_profiles WHERE user_id = ?', [req.user.id]);
  res.json({
    stage: stageOf(req.user),
    kyc_status: req.user.kyc_status,
    note: req.user.kyc_note,
    consent: !!req.user.kyc_consent_at,
    id_front: files.some((f) => f.kind === 'id_front') && !!prof?.has_template,
    id_back: files.some((f) => f.kind === 'id_back'),
    fails: req.user.kyc_fail_count,
    max_fails: MAX_FAILS,
  });
}));

router.post('/consent', ah(async (req, res) => {
  inKyc(req);
  if (!req.body.accept) throw bad('Please accept to continue');
  await query('UPDATE users SET kyc_consent_at = NOW() WHERE id = ?', [req.user.id]);
  await logEvent(req, 'consent', 'ok');
  res.json({ ok: true });
}));

router.post('/id', ah(async (req, res) => {
  inKyc(req);
  if (!req.user.kyc_consent_at) throw bad('Please accept the consent first');
  const side = req.body.side === 'back' ? 'back' : req.body.side === 'front' ? 'front' : null;
  if (!side) throw bad('Side must be front or back');
  const { mime, buf } = parseDataUrl(req.body.image, { allow: ['image/jpeg', 'image/webp'], maxBytes: 1500 * 1024 });
  if (buf.length < 15 * 1024) throw bad('The photo is too small. Please retake it closer to the card.');
  await query(
    'INSERT INTO kyc_files (user_id, kind, mime, data) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data), created_at = NOW()',
    [req.user.id, `id_${side}`, mime, encrypt(buf)],
  );
  if (side === 'front') {
    const tpl = descriptor(req.body.descriptor, 'Card photo');
    await query(
      'INSERT INTO kyc_profiles (user_id, id_template) VALUES (?, ?) ON DUPLICATE KEY UPDATE id_template = VALUES(id_template)',
      [req.user.id, encryptJson(tpl)],
    );
  }
  await logEvent(req, `id_${side}`, 'uploaded', { bytes: buf.length, quality: req.body.quality || null });
  res.json({ ok: true });
}));

router.post('/face/start', ah(async (req, res) => {
  inKyc(req);
  const prof = await one('SELECT id_template FROM kyc_profiles WHERE user_id = ?', [req.user.id]);
  const back = await one("SELECT 1 AS ok FROM kyc_files WHERE user_id = ? AND kind = 'id_back'", [req.user.id]);
  if (!prof?.id_template || !back) throw bad('Please take photos of both sides of your ID card first');
  const pool = [...PROMPTS];
  for (let i = pool.length - 1; i > 0; i -= 1) { const j = crypto.randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const prompts = pool.slice(0, 4); // 4 random prompts in random order
  const nonce = crypto.randomBytes(32).toString('hex');
  await query(
    `INSERT INTO kyc_challenges (user_id, nonce, prompts, issued_at, expires_at) VALUES (?, ?, ?, NOW(), NOW() + INTERVAL 10 MINUTE)
     ON DUPLICATE KEY UPDATE nonce = VALUES(nonce), prompts = VALUES(prompts), issued_at = NOW(), expires_at = VALUES(expires_at)`,
    [req.user.id, nonce, JSON.stringify(prompts)],
  );
  await logEvent(req, 'face_start', 'issued', { prompts });
  // The ID template is the member's own data; the phone needs it to compare faces live.
  res.json({ nonce, prompts, id_template: decryptJson(prof.id_template), threshold: MATCH_THRESHOLD });
}));

router.post('/face/submit', ah(async (req, res) => {
  inKyc(req);
  const ch = await one('SELECT *, TIMESTAMPDIFF(MICROSECOND, issued_at, NOW()) / 1000 AS elapsed_ms, expires_at > NOW() AS fresh FROM kyc_challenges WHERE user_id = ?', [req.user.id]);
  if (!ch || ch.nonce !== req.body.nonce || !ch.fresh) throw bad('This face check expired. Please start again.');
  await query('DELETE FROM kyc_challenges WHERE user_id = ?', [req.user.id]); // single use
  const prompts = typeof ch.prompts === 'string' ? JSON.parse(ch.prompts) : ch.prompts;

  // Liveness: every prompt done, in the server's order, at human speed.
  const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
  const timingOk = steps.length === prompts.length
    && steps.every((s, i) => s && s.prompt === prompts[i] && s.ok === true && Number(s.ms) >= 250 && Number(s.ms) <= 20000)
    && ch.elapsed_ms + 3000 >= steps.reduce((t, s) => t + Number(s.ms), 0);
  const face = descriptor(req.body.descriptor, 'Face');
  const endFace = req.body.end_descriptor ? descriptor(req.body.end_descriptor, 'Face') : face;
  const sameFace = distance(face, endFace) < 0.5; // same person from start to end of the check
  const prof = await one('SELECT id_template FROM kyc_profiles WHERE user_id = ?', [req.user.id]);
  const dist = distance(face, decryptJson(prof.id_template));
  const matched = dist <= MATCH_THRESHOLD;
  const { mime, buf } = parseDataUrl(req.body.snapshot, { allow: ['image/jpeg', 'image/webp'], maxBytes: 800 * 1024 });

  const liveness = {
    prompts, steps: steps.map((s) => ({ prompt: s.prompt, ms: Math.round(Number(s.ms)) })), timing_ok: timingOk, same_face: sameFace,
    lighting: req.body.lighting ?? null, device: String(req.get('user-agent') || '').slice(0, 200),
  };
  const save = async () => {
    await query(
      'INSERT INTO kyc_files (user_id, kind, mime, data) VALUES (?, \'face\', ?, ?) ON DUPLICATE KEY UPDATE mime = VALUES(mime), data = VALUES(data), created_at = NOW()',
      [req.user.id, mime, encrypt(buf)],
    );
    await query('UPDATE kyc_profiles SET face_template = ?, match_distance = ?, liveness = ? WHERE user_id = ?',
      [encryptJson(face), dist, JSON.stringify(liveness), req.user.id]);
  };

  if (!timingOk || !sameFace) {
    await logEvent(req, 'face_attempt', 'liveness_failed', { distance: dist, timing_ok: timingOk, same_face: sameFace });
    throw bad('The live check did not pass. Please try again in good light and follow each prompt.');
  }

  if (!matched) {
    const fails = req.user.kyc_fail_count + 1;
    await logEvent(req, 'face_attempt', 'mismatch', { distance: dist, fails });
    if (fails >= MAX_FAILS) {
      // Too many mismatches: keep the evidence and send to an admin. No automatic ban.
      await save();
      await query("UPDATE users SET kyc_fail_count = ?, kyc_status = 'review', kyc_submitted_at = NOW(), kyc_note = 'Face did not match after several tries' WHERE id = ?", [fails, req.user.id]);
      await sendEmail(req.user, 'kyc', {
        subject: 'Your verification needs a manual review', title: 'Manual review',
        body: `Hi ${esc(req.user.name)},<br>We could not automatically match your face to your ID card. An admin will review your verification and contact you.`,
      });
      await notify.admins('KYC needs manual review', `${req.user.name}'s face did not match their ID after ${fails} tries.`);
      const u = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
      return res.json({ result: 'review', user: privateUser(u), stage: stageOf(u) });
    }
    await query('UPDATE users SET kyc_fail_count = ? WHERE id = ?', [fails, req.user.id]);
    return res.json({ result: 'mismatch', attempts_left: MAX_FAILS - fails });
  }

  await save();
  await query("UPDATE users SET kyc_status = 'submitted', kyc_submitted_at = NOW(), kyc_note = NULL WHERE id = ?", [req.user.id]);
  await logEvent(req, 'face_attempt', 'matched', { distance: dist });
  await sendEmail(req.user, 'kyc', {
    subject: 'Verification submitted', title: 'Thanks! Your verification was submitted',
    body: `Hi ${esc(req.user.name)},<br>Your ID card and face check were received. An admin will review them soon. We'll email you when it's done.`,
  });
  await notify.admins('KYC ready for review', `${req.user.name} submitted their ID and face check.`);
  const u = await one('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ result: 'submitted', user: privateUser(u), stage: stageOf(u) });
}));

module.exports = router;
module.exports.distance = distance;
