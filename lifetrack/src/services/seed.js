'use strict';
const settings = require('./settings');
const push = require('./push');

/** Idempotent defaults run after every migration / install. */
async function defaults() {
  await settings.loadAll();
  if (!settings.get('vapid_public') || !settings.get('vapid_private')) {
    const k = push.generateVapid();
    await settings.set('vapid_public', k.publicKey);
    await settings.set('vapid_private', k.privateKey);
  }
}
module.exports = { defaults };
