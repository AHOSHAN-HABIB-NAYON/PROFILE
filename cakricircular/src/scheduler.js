'use strict';
/**
 * In-process scheduler (one Node process on shared hosting ⇒ no extra workers).
 * Every job is guarded so a slow/failed job never blocks the others.
 */
const db = require('./db');
const cache = require('./cache');
const settings = require('./settings');
const analytics = require('./analytics');
const automation = require('./automation');
const notify = require('./notify');
const uploads = require('./util/uploads');

const timers = [];
const busy = new Set();
let lastAuto = 0;

function every(name, ms, fn, initialDelay = 5000) {
  const run = async () => {
    if (busy.has(name) || !db.ready()) return;
    busy.add(name);
    try { await fn(); } catch (e) { console.error(`[scheduler:${name}]`, e.message); } finally { busy.delete(name); }
  };
  timers.push(setTimeout(() => { run(); timers.push(setInterval(run, ms)); }, initialDelay));
}

async function housekeeping() {
  // expired notices are removed automatically
  const n = await db.query('DELETE FROM notices WHERE expires_at IS NOT NULL AND expires_at < NOW()');
  // premium expiry
  const p = await db.query('UPDATE posts SET is_premium = 0 WHERE is_premium = 1 AND premium_until IS NOT NULL AND premium_until < NOW()');
  // empty trash after N days
  const days = settings.int('trash_days', 30);
  const old = await db.query(`SELECT id, thumbnail, pdf FROM posts WHERE status = 'trash' AND deleted_at < DATE_SUB(NOW(), INTERVAL ${Number(days)} DAY) LIMIT 200`);
  for (const r of old) { uploads.removeFile(r.thumbnail); uploads.removeFile(r.pdf); }
  if (old.length) await db.raw('DELETE FROM posts WHERE id IN (?)', [old.map((r) => r.id)]);
  await db.query('DELETE FROM sessions WHERE expires_at < NOW()');
  await db.query('DELETE FROM login_attempts WHERE updated_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
  await db.query('DELETE FROM admin_notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 60 DAY)');
  if (n.affectedRows || p.affectedRows || old.length) cache.clear();
}

function start() {
  every('analytics', 30000, () => analytics.flush(), 30000);
  every('publish-due', 60000, async () => { if (await notify.publishDue()) cache.clear(); }, 10000);
  every('automation', 60000, async () => {
    if (!settings.bool('auto_enabled')) return;
    const interval = settings.int('auto_interval_min', 60) * 60000;
    if (!lastAuto) {
      const last = await db.one('SELECT started_at FROM automation_runs ORDER BY id DESC LIMIT 1');
      lastAuto = last ? new Date(last.started_at).getTime() : 0;
    }
    if (Date.now() - lastAuto < interval) return;
    lastAuto = Date.now();
    await automation.start('scheduler');
  }, 20000);
  every('reap', 5 * 60000, () => automation.reapStale(), 60000);
  every('housekeeping', 60 * 60000, housekeeping, 30000);
  every('reminders', 60 * 60000, () => notify.deadlineReminders(), 90000);
  every('digest', 15 * 60000, () => notify.sendDigest(false), 120000);
  every('analytics-purge', 24 * 3600000, () => analytics.purgeOld(), 300000);
}

function stop() { for (const t of timers) { clearTimeout(t); clearInterval(t); } timers.length = 0; }

module.exports = { start, stop, housekeeping };
