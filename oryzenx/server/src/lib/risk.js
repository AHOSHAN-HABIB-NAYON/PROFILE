// Risk-based re-verification: after a risky event, a verified member must pass a quick live face
// check before using the app again. Triggers: new device, new network/location, many failed
// logins, password / phone / payment-method change. Every attempt is logged in kyc_events.
const { query, one } = require('../db');
const { sha256 } = require('./util');
const notify = require('./notify');

const deviceHash = (req) => {
  const id = String(req.get('x-device-id') || '');
  return /^[A-Za-z0-9-]{16,80}$/.test(id) ? sha256(id) : null;
};

function ipPrefix(ip) {
  const v = String(ip || '').replace(/^::ffff:/, '');
  if (v.includes('.')) return v.split('.').slice(0, 2).join('.');
  return v.split(':').slice(0, 3).join(':');
}

async function eligible(user) {
  if (user.role !== 'user' || user.kyc_status !== 'approved') return false;
  const p = await one('SELECT face_template IS NOT NULL AS ok FROM kyc_profiles WHERE user_id = ?', [user.id]);
  return !!p?.ok;
}

async function logEvent(req, userId, kind, result, detail) {
  await query('INSERT INTO kyc_events (user_id, kind, result, detail, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)', [
    userId, kind, result, detail ? JSON.stringify(detail) : null, req.ip, String(req.get('user-agent') || '').slice(0, 255),
  ]);
}

async function flag(req, user, reason) {
  if (!(await eligible(user))) return false;
  await query('UPDATE users SET reverify_reason = ? WHERE id = ? AND reverify_reason IS NULL', [reason.slice(0, 160), user.id]);
  await logEvent(req, user.id, 'reverify_required', 'flagged', { reason });
  return true;
}

async function trustDevice(req, userId) {
  const h = deviceHash(req);
  if (!h) return;
  await query(
    `INSERT INTO devices (user_id, device_id, user_agent, last_ip) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE last_seen = NOW(), last_ip = VALUES(last_ip), user_agent = VALUES(user_agent)`,
    [userId, h, String(req.get('user-agent') || '').slice(0, 255), req.ip],
  );
}

// Called after a successful login.
async function assessLogin(req, user) {
  const h = deviceHash(req);
  const devices = await query('SELECT device_id, last_ip FROM devices WHERE user_id = ? AND last_seen > NOW() - INTERVAL 180 DAY', [user.id]);
  const failed = await one(
    "SELECT COUNT(*) AS n FROM login_events WHERE email = ? AND success = 0 AND created_at > NOW() - INTERVAL 1 HOUR", [user.email],
  );
  const reasons = [];
  if (devices.length) {
    if (h && !devices.some((d) => d.device_id === h)) reasons.push('New device');
    if (!devices.some((d) => ipPrefix(d.last_ip) === ipPrefix(req.ip))) reasons.push('New network or location');
  }
  if (failed.n >= 5) reasons.push(`${failed.n} failed login attempts`);
  if (reasons.length) await flag(req, user, reasons.join(', '));
  await trustDevice(req, user.id);
  return reasons;
}

async function lockAfterFails(req, user) {
  await query("UPDATE users SET status = 'restricted' WHERE id = ?", [user.id]);
  await logEvent(req, user.id, 'reverify', 'locked', { reason: user.reverify_reason });
  await notify.admins('Account on hold', `${user.name} failed the security face check several times. Review in KYC.`, `admin/kyc/${user.id}`);
}

module.exports = { assessLogin, flag, trustDevice, logEvent, eligible, lockAfterFails, deviceHash };
