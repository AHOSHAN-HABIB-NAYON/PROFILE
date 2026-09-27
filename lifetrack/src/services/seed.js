'use strict';
const settings = require('./settings');
const push = require('./push');

/** Idempotent defaults run after every migration / install. */
async function defaults() {
  await settings.loadAll();
  // Check value used to detect a changed APP_KEY on reconnect
  if (!settings.get('app_key_check')) await settings.set('app_key_check', 'lifetrack-ok');
  if (!settings.get('vapid_public') || !settings.get('vapid_private')) {
    const k = push.generateVapid();
    await settings.set('vapid_public', k.publicKey);
    await settings.set('vapid_private', k.privateKey);
  }
}
/** Permanent marker in the database: once set, the installer is locked for good. */
async function markInstalled() { if (!settings.get('installed_at')) await settings.set('installed_at', new Date().toISOString()); }
module.exports = { defaults, markInstalled };
