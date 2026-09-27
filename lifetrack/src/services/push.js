'use strict';
/**
 * Push delivery: standard Web Push (VAPID) and Firebase Cloud Messaging HTTP v1.
 * FCM access tokens are minted from the admin-supplied service account (RS256 JWT).
 */
const crypto = require('crypto');
const webpush = require('web-push');
const db = require('../db');
const settings = require('./settings');

function vapidReady() {
  const pub = settings.get('vapid_public'); const priv = settings.get('vapid_private');
  if (!pub || !priv) return false;
  webpush.setVapidDetails(settings.get('vapid_subject') || 'mailto:admin@example.com', pub, priv);
  return true;
}

let fcmToken = null; let fcmTokenExp = 0;
function serviceAccount() {
  try { const s = settings.get('firebase_service_account'); return s ? JSON.parse(s) : null; } catch { return null; }
}
async function fcmAccessToken() {
  if (fcmToken && Date.now() < fcmTokenExp - 60000) return fcmToken;
  const sa = serviceAccount();
  if (!sa || !sa.private_key || !sa.client_email) throw new Error('Firebase service account not configured');
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || 'FCM token error');
  fcmToken = j.access_token; fcmTokenExp = Date.now() + j.expires_in * 1000;
  return fcmToken;
}

async function sendFcm(token, payload) {
  const sa = serviceAccount();
  const access = await fcmAccessToken();
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message: {
      token,
      notification: { title: payload.title, body: payload.body },
      data: { link: payload.link || '/app', tag: payload.tag || 'lifetrack' },
      webpush: { fcm_options: { link: payload.link || '/app' }, notification: { icon: '/icons/icon-192.png', badge: '/icons/badge-72.png' } },
    } }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const e = new Error(j.error?.message || `FCM ${r.status}`);
    e.expired = r.status === 404 || /UNREGISTERED|not a valid FCM/i.test(e.message);
    throw e;
  }
}

async function logPush(userId, kind, status, error) {
  try { await db.q('INSERT INTO push_logs (user_id, kind, status, error) VALUES (?,?,?,?)', [userId, kind, status, error ? String(error).slice(0, 500) : null]); } catch {}
}

/** Send to every subscription the user has. Expired endpoints are pruned. */
async function sendToUser(userId, payload) {
  if (!settings.bool('push_enabled')) return 0;
  const subs = await db.q('SELECT * FROM push_subscriptions WHERE user_id=?', [userId]);
  let sent = 0;
  const hasVapid = vapidReady();
  for (const s of subs) {
    try {
      if (s.kind === 'webpush') {
        if (!hasVapid) continue;
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86400 });
      } else {
        if (!settings.bool('firebase_enabled')) continue;
        await sendFcm(s.endpoint, payload);
      }
      sent++;
      await db.q('UPDATE push_subscriptions SET last_success_at=NOW() WHERE id=?', [s.id]);
      await logPush(userId, s.kind, 'sent');
    } catch (e) {
      const expired = e.expired || e.statusCode === 404 || e.statusCode === 410;
      if (expired) await db.q('DELETE FROM push_subscriptions WHERE id=?', [s.id]);
      await logPush(userId, s.kind, expired ? 'expired' : 'failed', e.body || e.message);
    }
  }
  return sent;
}

function generateVapid() { return webpush.generateVAPIDKeys(); }

module.exports = { sendToUser, generateVapid, vapidReady };
