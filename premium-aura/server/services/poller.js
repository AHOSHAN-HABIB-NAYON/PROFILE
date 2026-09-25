'use strict';
/**
 * API polling engine. Every second it checks which enabled providers are due
 * (per-provider polling interval, default 5s), fetches, normalizes, validates,
 * de-duplicates (external_id + hash) and ingests. Provider health is tracked.
 */
const db = require('../config/database');
const providers = require('../providers');
const events = require('./events');
const realtime = require('./realtime');
const logger = require('../utils/logger');
const { decrypt } = require('../utils/crypto');

let timer = null;
let list = [];
let listAt = 0;
const nextDue = new Map();
const inFlight = new Set();
const lastLogged = new Map();
const rateHits = new Map(); // provider id → consecutive HTTP 429 responses

function credentialFor(row) {
  try {
    if (row.credential_encrypted) return decrypt(row.credential_encrypted);
  } catch (err) {
    logger.warn(`provider ${row.id}: cannot decrypt credential (${err.message})`);
  }
  if (row.credential_env && /^[A-Z0-9_]{2,80}$/.test(row.credential_env)) return process.env[row.credential_env] || null;
  return null;
}

async function instance(row) {
  const mappings = await db.query('SELECT provider_field, system_field, transform FROM api_field_mappings WHERE provider_id = ?', [row.id]);
  return providers.create(row, { credential: credentialFor(row), mappings });
}

async function sourceIdFor(row) {
  await db.run("INSERT IGNORE INTO event_sources (source_type, provider_id, label) VALUES ('provider', ?, ?)", [row.id, row.name]);
  const s = await db.one('SELECT id FROM event_sources WHERE provider_id = ?', [row.id]);
  return s?.id || null;
}

async function writeLog(providerId, entry, force = false) {
  const last = lastLogged.get(providerId) || 0;
  if (!force && Date.now() - last < 60_000) return;
  lastLogged.set(providerId, Date.now());
  await db.run(
    `INSERT INTO api_provider_logs (provider_id, level, http_status, duration_ms, fetched_count, inserted_count, duplicate_count, message)
     VALUES (?,?,?,?,?,?,?,?)`,
    [providerId, entry.level, entry.httpStatus ?? null, entry.durationMs ?? null, entry.fetched || 0, entry.inserted || 0, entry.duplicates || 0,
      (entry.message || '').slice(0, 500)],
  ).catch(() => {});
}

async function pollOne(row) {
  if (inFlight.has(row.id)) return null;
  inFlight.add(row.id);
  try {
    const p = await instance(row);
    if (!p.credential && row.auth_type !== 'none') {
      await db.run("UPDATE api_providers SET health_status = 'error', last_checked_at = UTC_TIMESTAMP(), last_error = ? WHERE id = ?",
        [`No credential configured (${row.credential_env || 'set one in API Management'})`, row.id]);
      return { error: 'missing credential' };
    }
    const { records, httpStatus, durationMs } = await p.fetch();
    rateHits.delete(row.id);
    const valid = [];
    let skipped = 0;
    for (const rec of records.slice(0, 500)) {
      const ev = p.normalize(rec);
      if (p.validate(ev).ok) valid.push(ev); else skipped += 1;
    }
    const stats = await events.ingest(row, valid, await sourceIdFor(row));
    await db.run(
      `UPDATE api_providers SET health_status = 'online', last_checked_at = UTC_TIMESTAMP(), last_success_at = UTC_TIMESTAMP(),
       last_error = NULL, total_fetched = total_fetched + ? WHERE id = ?`, [stats.inserted, row.id],
    );
    const summary = { level: 'info', httpStatus, durationMs, fetched: records.length, inserted: stats.inserted, duplicates: stats.duplicates,
      message: `fetched ${records.length}, new ${stats.inserted}, duplicates ${stats.duplicates}, unlisted ${stats.unlisted}, unauthorized ${stats.unauthorized}, invalid ${skipped}` };
    await writeLog(row.id, summary, stats.inserted > 0);
    realtime.toAdmins('provider:health', { id: row.id, health_status: 'online', last_checked_at: new Date().toISOString() });
    return { ...stats, fetched: records.length, invalid: skipped };
  } catch (err) {
    const status = err.httpStatus ? 'error' : 'offline';
    let msg = err.name === 'AbortError' ? 'Request timed out' : err.message;
    if (err.httpStatus === 429) {
      // The provider asked us to slow down: back off (Retry-After, else 30s, 60s … up to 5 min) instead of hammering it.
      const n = (rateHits.get(row.id) || 0) + 1;
      rateHits.set(row.id, n);
      const wait = Math.min(300, Math.max(err.retryAfter || 0, 30 * 2 ** (n - 1)));
      nextDue.set(row.id, Date.now() + wait * 1000);
      msg = `HTTP 429 — rate limited, next poll in ${wait}s. Increase the polling interval for this provider.`;
    }
    await db.run('UPDATE api_providers SET health_status = ?, last_checked_at = UTC_TIMESTAMP(), last_error = ? WHERE id = ?', [status, msg.slice(0, 500), row.id]);
    await writeLog(row.id, { level: 'error', httpStatus: err.httpStatus, durationMs: err.durationMs, message: msg }, true);
    realtime.toAdmins('provider:health', { id: row.id, health_status: status, last_error: msg });
    return { error: msg };
  } finally {
    inFlight.delete(row.id);
  }
}

async function refreshList(force = false) {
  if (!force && Date.now() - listAt < 10_000) return list;
  list = await db.query('SELECT * FROM api_providers WHERE enabled = 1');
  listAt = Date.now();
  return list;
}

async function tick() {
  try {
    const rows = await refreshList();
    const now = Date.now();
    for (const row of rows) {
      const due = nextDue.get(row.id) || 0;
      if (now < due) continue;
      nextDue.set(row.id, now + Math.max(1, row.polling_interval_sec || 5) * 1000);
      pollOne(row).catch((err) => logger.error(`poll ${row.name}: ${err.message}`));
    }
  } catch (err) {
    logger.error(`poller tick: ${err.message}`);
  }
}

function start() {
  if (timer) return;
  timer = setInterval(tick, 1000);
  logger.info('API poller started');
}

function stop() { if (timer) clearInterval(timer); timer = null; }

function invalidate() { listAt = 0; }

async function testProvider(row) {
  const p = await instance(row);
  const health = await p.healthCheck();
  await db.run('UPDATE api_providers SET health_status = ?, last_checked_at = UTC_TIMESTAMP(), last_error = ? WHERE id = ?',
    [health.status, health.status === 'online' ? null : (health.message || '').slice(0, 500), row.id]);
  await writeLog(row.id, { level: health.status === 'online' ? 'info' : 'error', httpStatus: health.httpStatus, message: `Health check: ${health.message}` }, true);
  return health;
}

module.exports = { start, stop, invalidate, pollOne, testProvider, credentialFor, instance };
