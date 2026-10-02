'use strict';
/**
 * Browser push (Web Push / VAPID). Keys are generated once and kept in
 * system_settings (the private key encrypted). Dead subscriptions are removed.
 */
const webpush = require('web-push');
const db = require('../config/database');
const config = require('../config/env');
const settings = require('../models/settings');
const logger = require('../utils/logger');
const { encrypt, decrypt, sha256 } = require('../utils/crypto');

let keys = null;

async function vapid() {
  if (keys) return keys;
  const all = await settings.loadAll(true);
  let pub = all.vapid_public_key;
  let priv = all.vapid_private_key ? decrypt(all.vapid_private_key) : '';
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    pub = k.publicKey; priv = k.privateKey;
    await settings.set({ vapid_public_key: pub, vapid_private_key: encrypt(priv) });
  }
  const host = (() => { try { return new URL(config.appUrl).hostname; } catch { return 'localhost'; } })();
  webpush.setVapidDetails(`mailto:admin@${host}`, pub, priv);
  keys = { publicKey: pub };
  return keys;
}

async function publicKey() { return (await vapid()).publicKey; }

async function subscribe(userId, sub, userAgent) {
  const endpoint = String(sub?.endpoint || '');
  const p256dh = String(sub?.keys?.p256dh || '');
  const auth = String(sub?.keys?.auth || '');
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 2000 || !p256dh || !auth || p256dh.length > 255 || auth.length > 255) return false;
  await db.run(
    `INSERT INTO push_subscriptions (user_id, endpoint_hash, endpoint, p256dh, auth, user_agent) VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
    [userId, sha256(endpoint), endpoint, p256dh, auth, String(userAgent || '').slice(0, 255)],
  );
  return true;
}

async function unsubscribe(userId, endpoint) {
  await db.run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint_hash = ?', [userId, sha256(String(endpoint || ''))]);
}

/** Send to the given users (only those who allow push). Never throws. */
async function sendToUsers(userIds, { title, body = '', link = '/', tag = null }) {
  try {
    if (!userIds.length) return 0;
    await vapid();
    const subs = await db.query(
      `SELECT s.id, s.endpoint, s.p256dh, s.auth FROM push_subscriptions s JOIN users u ON u.id = s.user_id
       WHERE s.user_id IN (?) AND u.notify_push = 1 AND u.status = 'active'`, [userIds],
    );
    const payload = JSON.stringify({ title: String(title).slice(0, 120), body: String(body || '').slice(0, 300), link, tag });
    let sent = 0;
    for (let i = 0; i < subs.length; i += 20) {
      await Promise.all(subs.slice(i, i + 20).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
          sent += 1;
          db.run('UPDATE push_subscriptions SET last_used_at = UTC_TIMESTAMP() WHERE id = ?', [s.id]).catch(() => {});
        } catch (err) {
          if ([404, 410].includes(err.statusCode)) await db.run('DELETE FROM push_subscriptions WHERE id = ?', [s.id]).catch(() => {});
          else logger.warn(`push failed: ${err.statusCode || ''} ${err.message}`);
        }
      }));
    }
    return sent;
  } catch (err) {
    logger.warn(`push: ${err.message}`);
    return 0;
  }
}

async function sendToUser(userId, msg) { return sendToUsers([userId], msg); }

async function sendToAll(msg) {
  const ids = (await db.query("SELECT DISTINCT s.user_id AS id FROM push_subscriptions s JOIN users u ON u.id = s.user_id WHERE u.status = 'active' AND u.notify_push = 1")).map((r) => r.id);
  return sendToUsers(ids, msg);
}

module.exports = { publicKey, subscribe, unsubscribe, sendToUser, sendToUsers, sendToAll };
