'use strict';
const db = require('../db');
const settings = require('./settings');
const { randomToken } = require('../lib/crypto');

/** Relying party derived from the configured site URL (falls back to request host). */
function rp(req) {
  const origin = settings.siteUrl(req);
  const rpID = new URL(origin).hostname;
  return { rpID, origin, rpName: settings.get('site_name') || 'LifeTrack' };
}
async function saveChallenge(userId, purpose, challenge) {
  const id = randomToken(32);
  await db.q('INSERT INTO auth_challenges (id, user_id, purpose, challenge, expires_at) VALUES (?,?,?,?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))', [id, userId, purpose, challenge]);
  return id;
}
/** One-time use: fetch + delete */
async function takeChallenge(id, purpose, userId = null) {
  if (!id || typeof id !== 'string' || id.length > 64) return null;
  const row = await db.one('SELECT * FROM auth_challenges WHERE id=? AND purpose=? AND expires_at > NOW()', [id, purpose]);
  await db.q('DELETE FROM auth_challenges WHERE id=?', [id]);
  if (!row) return null;
  if (userId !== null && Number(row.user_id) !== Number(userId)) return null;
  return row;
}
module.exports = { rp, saveChallenge, takeChallenge };
