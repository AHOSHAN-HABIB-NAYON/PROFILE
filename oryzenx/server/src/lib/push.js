// Push notifications through Firebase Cloud Messaging (HTTP v1).
// Enabled when FCM_SERVICE_ACCOUNT holds the Firebase service-account JSON (plain or base64).
const { GoogleAuth } = require('google-auth-library');
const { query } = require('../db');

let auth = null; let projectId = null;
function setup() {
  if (auth !== null) return !!projectId;
  auth = false;
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return false;
  try {
    const json = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
    projectId = json.project_id;
    auth = new GoogleAuth({ credentials: json, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
  } catch (err) {
    console.error('FCM_SERVICE_ACCOUNT is not valid JSON:', err.message);
  }
  return !!projectId;
}

const enabled = () => setup();

// userIds: array of ids, or null for everyone active.
async function sendPush(userIds, title, body, data = {}) {
  if (!setup()) return 0;
  const rows = userIds === null
    ? await query("SELECT t.token FROM push_tokens t JOIN users u ON u.id = t.user_id WHERE u.status IN ('active','restricted')")
    : userIds.length ? await query('SELECT token FROM push_tokens WHERE user_id IN (?)', [userIds]) : [];
  if (!rows.length) return 0;
  const client = await auth.getClient();
  const { token: access } = await client.getAccessToken();
  let sent = 0;
  for (const { token } of rows) {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: title.slice(0, 100), body: body.slice(0, 240) },
          data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
          android: { priority: 'high', notification: { color: '#2f6bff', sound: 'default' } },
        },
      }),
    }).catch(() => null);
    if (res?.ok) sent += 1;
    else if (res && (res.status === 404 || res.status === 400)) await query('DELETE FROM push_tokens WHERE token = ?', [token]); // stale token
  }
  return sent;
}

module.exports = { sendPush, enabled };
