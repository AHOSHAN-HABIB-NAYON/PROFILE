'use strict';
/**
 * Event ingestion + feed. Authorized events only: an incoming provider event
 * is accepted only when its resource matches an admin-uploaded authorized
 * resource. Only {application, code, time, status} are ever exposed.
 */
const db = require('../config/database');
const settings = require('../models/settings');
const wallet = require('../models/wallet');
const realtime = require('./realtime');
const money = require('../utils/money');
const { sha256 } = require('../utils/crypto');

const digits = (s) => String(s || '').replace(/\D+/g, '');

async function expirationHours() {
  const h = await settings.getInt('event_expiration_hours', 24);
  return [1, 6, 12, 24, 48].includes(h) ? h : 24;
}

/**
 * Match an incoming event to an authorized resource. The same number may be
 * authorized for several services, so prefer the service whose app matches
 * the event, then an actively assigned resource, then an exact value match.
 */
async function findResource(value, application = null) {
  const d = digits(value);
  const byDigits = d.length >= 5;
  return db.one(
    `SELECT r.id, r.service_id, r.resource_value, r.assigned_user_id, s.country_code, s.country_name, s.app_code, s.app_name
     FROM authorized_resources r JOIN services s ON s.id = r.service_id
     WHERE (r.resource_value = ? ${byDigits ? 'OR r.serial_digits = ?' : ''})
     ORDER BY s.app_code = ? DESC, r.status = 'assigned' DESC, r.resource_value = ? DESC, r.id DESC LIMIT 1`,
    byDigits ? [String(value), d, application || '', String(value)] : [String(value), application || '', String(value)],
  );
}

/** 211927455905 → 2119••••5905 */
function maskNumber(v) {
  const s = String(v || '');
  if (s.length <= 6) return s ? `${s.slice(0, 1)}••••${s.slice(-1)}` : '';
  return `${s.slice(0, 4)}••••${s.slice(-4)}`;
}

function publicEvent(row, { forAdmin = false } = {}) {
  const e = {
    key: `${row.kind === 'demo' ? 'd' : 'e'}${row.id}`,
    id: row.id,
    kind: row.kind,
    application: row.application,
    country_code: row.country_code,
    code: row.code,
    status: row.kind === 'demo' ? 'DEMO' : row.status,
    is_demo: row.kind === 'demo',
    received_at: new Date(row.received_at).toISOString(),
    created_at: new Date(row.created_at || row.received_at).toISOString(),
    number: row.resource_value ? maskNumber(row.resource_value) : null,
  };
  if (forAdmin) {
    e.user_id = row.user_id ?? null;
    e.provider = row.provider_name ?? null;
    e.resource_value = row.resource_value ?? null;
  }
  return e;
}

/**
 * Ingest normalized events from a provider. Returns counters.
 * @param {{id:number,name:string}} provider
 * @param {Array} events normalized & validated events
 */
async function ingest(provider, events, sourceId = null) {
  const stats = { inserted: 0, duplicates: 0, unauthorized: 0, credited: 0 };
  if (!events.length) return stats;
  const hours = await expirationHours();
  const reward = money.normalize(await settings.get('event_reward') || '0.01');

  for (const ev of events) {
    const resource = await findResource(ev.resource, ev.application);
    if (!resource) { stats.unauthorized += 1; continue; }
    const externalId = ev.id || null;
    const hash = sha256([provider.id, externalId || '', digits(ev.resource) || ev.resource, ev.code,
      externalId ? '' : ev.received_at.toISOString().slice(0, 16)].join('|'));
    const receivedAt = ev.received_at;
    const expiresAt = new Date(receivedAt.getTime() + hours * 3600_000);
    const expired = expiresAt.getTime() <= Date.now();

    const result = await db.transaction(async (tx) => {
      const assignment = await tx.one(
        'SELECT id, user_id FROM resource_assignments WHERE resource_id = ? AND released_at IS NULL LIMIT 1 FOR UPDATE',
        [resource.id],
      );
      const userId = assignment?.user_id || null;
      const creditable = userId && !expired && money.cmp(reward, '0') > 0;
      const normalized = {
        country: ev.country || resource.country_name, country_code: ev.country_code || resource.country_code,
        service: ev.service || resource.app_name, application: ev.application, code: ev.code,
        received_at: receivedAt.toISOString(), status: expired ? 'expired' : 'received',
      };
      const ins = await tx.run(
        `INSERT IGNORE INTO event_records
          (source_id, provider_id, external_id, hash, country, country_code, service, application, code, resource_value, resource_id,
           user_id, status, reward_amount, normalized_data, received_at, expires_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [sourceId, provider.id, externalId, hash, normalized.country, normalized.country_code, normalized.service,
          ev.application === 'SMS' ? resource.app_code : ev.application, ev.code, resource.resource_value, resource.id,
          userId, expired ? 'expired' : 'received', creditable ? reward : '0', JSON.stringify(normalized), receivedAt, expiresAt],
      );
      if (!ins.affectedRows) return { duplicate: true };
      let balance = null;
      if (creditable) {
        const t = await wallet.apply(tx, userId, reward, {
          type: 'credit', description: `Event reward · ${normalized.application} ${ev.code.slice(0, 2)}•••`, eventId: ins.insertId,
        });
        balance = t.balance;
      }
      if (assignment) {
        await tx.run("UPDATE resource_assignments SET status = 'received', last_code = ? WHERE id = ?", [ev.code, assignment.id]);
      }
      return { id: ins.insertId, userId, balance };
    });

    if (result.duplicate) { stats.duplicates += 1; continue; }
    stats.inserted += 1;
    const row = await db.one(
      `SELECT e.*, 'live' AS kind, p.name AS provider_name FROM event_records e LEFT JOIN api_providers p ON p.id = e.provider_id WHERE e.id = ?`,
      [result.id],
    );
    if (result.userId) {
      realtime.toUser(result.userId, 'event:new', publicEvent(row));
      if (result.balance !== null) { stats.credited += 1; wallet.emitBalance(result.userId, result.balance); }
    }
    realtime.toAdmins('admin:event', publicEvent(row, { forAdmin: true }));
  }
  return stats;
}

/**
 * Paginated live feed: the user's own authorized events + DEMO events.
 * Admins see everything.
 */
async function feed(user, { page = 1, size = 30, app = null, q = null } = {}) {
  const isAdmin = user.role === 'admin';
  const limit = page * size;
  const offset = (page - 1) * size;
  const appFilter = app && /^[A-Z0-9]{1,12}$/.test(app) ? app : null;
  const codeFilter = q && /^[A-Za-z0-9]{1,12}$/.test(q) ? `%${q}%` : null;

  const liveWhere = ["e.status = 'received'"];
  const liveParams = [];
  if (!isAdmin) { liveWhere.push('e.user_id = ?'); liveParams.push(user.id); }
  if (appFilter) { liveWhere.push('e.application = ?'); liveParams.push(appFilter); }
  if (codeFilter) { liveWhere.push('e.code LIKE ?'); liveParams.push(codeFilter); }

  // Demo/test events are an admin-only tool: users never see them.
  const demoWhere = [isAdmin ? "d.status = 'DEMO'" : '0 = 1'];
  const demoParams = [];
  if (appFilter) { demoWhere.push('d.application = ?'); demoParams.push(appFilter); }
  if (codeFilter) { demoWhere.push('d.code LIKE ?'); demoParams.push(codeFilter); }

  const rows = await db.query(
    `SELECT * FROM (
       (SELECT e.id, 'live' AS kind, e.application, e.country_code, e.code, e.status, e.received_at, e.created_at,
               e.user_id, e.resource_value, p.name AS provider_name
          FROM event_records e LEFT JOIN api_providers p ON p.id = e.provider_id
         WHERE ${liveWhere.join(' AND ')} ORDER BY e.id DESC LIMIT ?)
       UNION ALL
       (SELECT d.id, 'demo' AS kind, d.application, d.country_code, d.code, d.status, d.received_at, d.created_at,
               NULL AS user_id, NULL AS resource_value, 'Demo generator' AS provider_name
          FROM demo_event_logs d WHERE ${demoWhere.join(' AND ')} ORDER BY d.id DESC LIMIT ?)
     ) f ORDER BY f.created_at DESC, f.id DESC LIMIT ? OFFSET ?`,
    [...liveParams, limit, ...demoParams, limit, size, offset],
  );
  const [live] = await db.query(`SELECT COUNT(*) AS n FROM event_records e WHERE ${liveWhere.join(' AND ')}`, liveParams);
  const [demo] = await db.query(`SELECT COUNT(*) AS n FROM demo_event_logs d WHERE ${demoWhere.join(' AND ')}`, demoParams);
  const total = Number(live.n) + Number(demo.n);
  return {
    items: rows.map((r) => publicEvent(r, { forAdmin: isAdmin })),
    total,
    live_total: Number(live.n),
    demo_total: Number(demo.n),
  };
}

/** Mark expired events (feed removes them) — returns counts. */
async function expire() {
  const a = await db.run("UPDATE event_records SET status = 'expired' WHERE status = 'received' AND expires_at <= UTC_TIMESTAMP() LIMIT 5000");
  const b = await db.run("UPDATE demo_event_logs SET status = 'expired' WHERE status = 'DEMO' AND expires_at <= UTC_TIMESTAMP() LIMIT 20000");
  // Demo rows are pure test data: purge them 24h after expiry to keep the table small.
  await db.run("DELETE FROM demo_event_logs WHERE status = 'expired' AND expires_at <= UTC_TIMESTAMP() - INTERVAL 1 DAY LIMIT 20000");
  if (a.affectedRows || b.affectedRows) realtime.broadcast('events:expired', { live: a.affectedRows, demo: b.affectedRows });
  return { live: a.affectedRows, demo: b.affectedRows };
}

module.exports = { ingest, feed, expire, publicEvent, maskNumber, expirationHours, findResource, digits };
