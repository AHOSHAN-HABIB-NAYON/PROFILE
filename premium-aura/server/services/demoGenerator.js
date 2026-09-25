'use strict';
/**
 * ADMIN-ONLY demo/test event generator for UI development. Every generated
 * event is stored in demo_event_logs (separate from real events) with status
 * "DEMO" and is always rendered with a DEMO badge. Demo events never credit
 * wallets and are never presented as genuine third-party messages.
 */
const crypto = require('crypto');
const db = require('../config/database');
const realtime = require('./realtime');
const logger = require('../utils/logger');
const { publicEvent } = require('./events');

let timer = null;
let current = null;
let busy = false;

async function loadSettings() {
  const s = await db.one('SELECT * FROM demo_event_settings WHERE id = 1');
  if (!s) return null;
  const parse = (v, d) => { if (Array.isArray(v)) return v; try { return JSON.parse(v) || d; } catch { return d; } };
  return {
    ...s,
    enabled: !!s.enabled,
    applications: parse(s.applications, ['TG', 'WS']),
    countries: parse(s.countries, ['PK']),
    starting_count: Number(s.starting_count),
    generated_total: Number(s.generated_total),
  };
}

function pick(list) { return list[crypto.randomInt(list.length)]; }

async function tick() {
  if (busy || !current) return;
  busy = true;
  try {
    const perTick = Math.max(1, Math.round((current.events_per_second * current.interval_ms) / 1000));
    const now = new Date();
    const expires = new Date(now.getTime() + current.expiration_hours * 3600_000);
    const base = current.starting_count + current.generated_total;
    const rows = [];
    for (let i = 0; i < perTick; i += 1) {
      rows.push([base + i + 1, pick(current.applications), pick(current.countries), String(crypto.randomInt(10000, 99999)), 'DEMO', now, expires]);
    }
    const res = await db.run(
      'INSERT INTO demo_event_logs (sequence_no, application, country_code, code, status, received_at, expires_at) VALUES ?', [rows],
    );
    current.generated_total += rows.length;
    await db.run('UPDATE demo_event_settings SET generated_total = generated_total + ? WHERE id = 1', [rows.length]);
    rows.forEach((r, i) => {
      realtime.toAdmins('event:new', publicEvent({
        id: res.insertId + i, kind: 'demo', application: r[1], country_code: r[2], code: r[3], status: 'DEMO', received_at: now, created_at: now,
      }));
    });
  } catch (err) {
    logger.error(`demo generator: ${err.message}`);
  } finally {
    busy = false;
  }
}

function stopTimer() { if (timer) clearInterval(timer); timer = null; }

/** (Re)apply settings from DB: starts/stops the generator accordingly. */
async function refresh() {
  stopTimer();
  current = await loadSettings();
  if (current?.enabled) {
    const interval = Math.min(60_000, Math.max(200, current.interval_ms || 1000));
    timer = setInterval(tick, interval);
    logger.info(`Demo generator running: ${current.events_per_second} event(s)/s every ${interval}ms`);
  }
  return status();
}

function status() {
  return { running: !!timer, settings: current };
}

module.exports = { refresh, status, stop: stopTimer, tick };
