'use strict';
const webpush = require('web-push');
const db = require('../db');
const settings = require('../settings');
const { sha256 } = require('./security');

async function ensureKeys() {
  if (settings.get('vapid_public') && settings.get('vapid_private')) return;
  const keys = webpush.generateVAPIDKeys();
  await settings.set({ vapid_public: keys.publicKey, vapid_private: keys.privateKey });
}

function configure() {
  const pub = settings.get('vapid_public'); const priv = settings.get('vapid_private');
  if (!pub || !priv) return false;
  const contact = settings.get('contact_email') || 'admin@example.com';
  webpush.setVapidDetails(`mailto:${contact}`, pub, priv);
  return true;
}

async function subscribe(sub, savedIds = []) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) throw new Error('invalid subscription');
  if (!/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 2000) throw new Error('invalid endpoint');
  const h = sha256(sub.endpoint);
  const ids = JSON.stringify((savedIds || []).map(Number).filter(Boolean).slice(0, 200));
  await db.query(
    `INSERT INTO push_subs (endpoint_hash, endpoint, p256dh, auth, saved_ids, last_seen) VALUES (?,?,?,?,?,NOW())
     ON DUPLICATE KEY UPDATE p256dh=VALUES(p256dh), auth=VALUES(auth), saved_ids=VALUES(saved_ids), last_seen=NOW()`,
    [h, sub.endpoint, String(sub.keys.p256dh).slice(0, 255), String(sub.keys.auth).slice(0, 255), ids],
  );
}
async function unsubscribe(endpoint) {
  await db.query('DELETE FROM push_subs WHERE endpoint_hash=?', [sha256(endpoint)]);
}

async function sendOne(row, payload) {
  try {
    await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload), { TTL: 86400, urgency: 'normal' });
    return true;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) await db.query('DELETE FROM push_subs WHERE id=?', [row.id]);
    return false;
  }
}

/** Broadcast to all subscribers in small batches (keeps memory & sockets low on shared hosting). */
async function broadcast(payload) {
  if (!settings.bool('push_enabled') || !configure()) return { sent: 0 };
  let lastId = 0; let sent = 0;
  for (;;) {
    const rows = await db.query('SELECT id, endpoint, p256dh, auth FROM push_subs WHERE id > ? ORDER BY id LIMIT 100', [lastId]);
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;
    const results = await Promise.all(rows.map((r) => sendOne(r, payload)));
    sent += results.filter(Boolean).length;
  }
  return { sent };
}

module.exports = { ensureKeys, configure, subscribe, unsubscribe, broadcast, sendOne };
