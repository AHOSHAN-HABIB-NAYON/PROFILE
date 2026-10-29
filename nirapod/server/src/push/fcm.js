// Firebase Cloud Messaging (HTTP v1). The service account JSON is set in admin (encrypted at rest) or by
// FCM_SERVICE_ACCOUNT_JSON_PATH. Without it pushes are skipped (realtime + email still work).
// Tokens live on sessions.fcm_token; invalid tokens are cleared. Nothing about locations is logged.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { getSecret } from '../settings.js';
import { t } from './strings.js';

export const CHANNELS = { safety: 'nirapod_safety', family: 'nirapod_family', account: 'nirapod_account', marketing: 'nirapod_marketing' };

const b64url = (b) => Buffer.from(b).toString('base64url');

/** Default HTTP transport (overridable in tests). */
async function httpPost(url, { headers, body }) {
  const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) });
  let json = null;
  try { json = await r.json(); } catch { /* empty */ }
  return { status: r.status, json };
}

export function createPusher({ db, cfg, logger, clock, transport = httpPost }) {
  let token = null; // { access, exp, project }

  async function serviceAccount() {
    const fromAdmin = await getSecret(db, cfg, 'fcm_service_account');
    let raw = fromAdmin;
    if (!raw && cfg.FCM_SERVICE_ACCOUNT_JSON_PATH) {
      try { raw = fs.readFileSync(cfg.FCM_SERVICE_ACCOUNT_JSON_PATH, 'utf8'); } catch { raw = null; }
    }
    if (!raw) return null;
    try {
      const j = JSON.parse(raw);
      return j.client_email && j.private_key && j.project_id ? j : null;
    } catch {
      return null;
    }
  }

  async function accessToken() {
    const now = Math.floor(clock.now().getTime() / 1000);
    if (token && token.exp - 60 > now) return token;
    const sa = await serviceAccount();
    if (!sa) return null;
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({
      iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    }));
    const sig = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key);
    const r = await transport('https://oauth2.googleapis.com/token', {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(sig)}` }).toString(),
    });
    if (r.status !== 200 || !r.json?.access_token) {
      logger.warn({ status: r.status }, 'fcm auth failed');
      return null;
    }
    token = { access: r.json.access_token, exp: now + (r.json.expires_in || 3600), project: sa.project_id };
    return token;
  }

  /** Sends one message to one device token. Returns 'sent' | 'invalid' | 'failed' | 'disabled'. */
  async function sendToToken(fcmToken, { title, body, data = {}, category = 'family', highPriority = false }) {
    const tok = await accessToken();
    if (!tok) return 'disabled';
    const message = {
      token: fcmToken,
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v == null ? '' : String(v)])),
      android: {
        priority: highPriority ? 'HIGH' : 'NORMAL',
        ttl: highPriority ? '600s' : '86400s',
        notification: title ? { title, body: body || '', channel_id: CHANNELS[category] || CHANNELS.family, ...(highPriority ? { notification_priority: 'PRIORITY_MAX', default_sound: true, default_vibrate_timings: true } : {}) } : undefined,
      },
    };
    const r = await transport(`https://fcm.googleapis.com/v1/projects/${tok.project}/messages:send`, {
      headers: { authorization: `Bearer ${tok.access}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (r.status === 200) return 'sent';
    const code = r.json?.error?.details?.find?.((d) => d.errorCode)?.errorCode || r.json?.error?.status;
    if (r.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') return 'invalid';
    logger.warn({ status: r.status, code }, 'fcm send failed');
    return 'failed';
  }

  /**
   * Push to users (by id), localized from an i18n key. Respects each user's category preferences
   * (safety is always on). Returns the number of devices reached.
   */
  async function notifyUsers(userIds, { category = 'family', type, titleKey, params = {}, bodyKey = null, data = {}, highPriority = false }) {
    if (!userIds?.length) return 0;
    const rows = await db('sessions as s').join('users as u', 'u.id', 's.user_id')
      .whereIn('s.user_id', userIds).whereNull('s.revoked_at').whereNotNull('s.fcm_token').where('u.status', 'active')
      .select('s.id as sid', 's.fcm_token', 'u.id as uid', 'u.language', 'u.notify_prefs');
    let n = 0;
    for (const r of rows) {
      let prefs = {};
      try { prefs = typeof r.notify_prefs === 'string' ? JSON.parse(r.notify_prefs) : (r.notify_prefs || {}); } catch { prefs = {}; }
      if (category !== 'safety' && prefs?.push?.[category] === false) continue;
      const title = t(r.language, titleKey, params);
      const body = bodyKey ? t(r.language, bodyKey, params) : '';
      const result = await sendToToken(r.fcm_token, { title, body, category, highPriority, data: { type: type || '', category, ...data } });
      if (result === 'invalid') await db('sessions').where({ id: r.sid }).update({ fcm_token: null });
      if (result === 'sent') n += 1;
      if (result === 'disabled') break;
    }
    return n;
  }

  /** Data-only wake-up for a child device (e.g. "Request update now"). */
  async function wakeUsers(userIds, data) {
    if (!userIds?.length) return 0;
    const rows = await db('sessions').whereIn('user_id', userIds).whereNull('revoked_at').whereNotNull('fcm_token').select('id', 'fcm_token');
    let n = 0;
    for (const r of rows) {
      const res = await sendToToken(r.fcm_token, { data, highPriority: true });
      if (res === 'invalid') await db('sessions').where({ id: r.id }).update({ fcm_token: null });
      if (res === 'sent') n += 1;
    }
    return n;
  }

  return { notifyUsers, wakeUsers, sendToToken, enabled: async () => (await serviceAccount()) != null };
}
