'use strict';
/** Access Services: service catalogue, resource allocation, serial search. */
const db = require('../config/database');
const quota = require('../services/quota');
const settings = require('../models/settings');
const notifications = require('../models/notification');
const realtime = require('../services/realtime');
const v = require('../utils/validate');
const { E } = require('../utils/errors');
const { paginate, meta } = require('../utils/pagination');

const SERVICE_COLS = `s.id, s.country_name, s.country_code, s.flag_code, s.app_name, s.app_code, s.app_icon, s.description, s.status, s.sort_order`;

async function servicesWithCounts(where = "s.status <> 'inactive'", params = []) {
  const rows = await db.query(
    `SELECT ${SERVICE_COLS},
            COALESCE(s.manual_available, (SELECT COUNT(*) FROM authorized_resources r WHERE r.service_id = s.id AND r.status = 'available')) AS available
     FROM services s WHERE ${where} ORDER BY s.sort_order, s.id`, params,
  );
  return rows.map((r) => ({ ...r, available: Number(r.available) }));
}

exports.list = async (req, res) => {
  const [services, limits] = await Promise.all([servicesWithCounts(), quota.limitsFor(req.user.id)]);
  // Users only see whether numbers are available, never how many.
  const out = req.user.role === 'admin' ? services : services.map(({ available, ...s }) => ({ ...s, available: available > 0 }));
  res.json({ ok: true, services: out, limits, return_minutes: await settings.getInt('assignment_timeout_minutes', 10) });
};

/** Allocate one available resource (or a specific one when claiming from search). */
async function allocate(req, { serviceId = null, resourceId = null }) {
  const uid = req.user.id;
  await quota.checkInterval(uid);
  const result = await db.transaction(async (tx) => {
    await tx.one('SELECT id FROM users WHERE id = ? FOR UPDATE', [uid]); // serialise per-user allocation
    const limits = await quota.enforce(tx, uid);
    let resource;
    if (resourceId) {
      resource = await tx.one(
        `SELECT r.id, r.service_id, r.resource_value FROM authorized_resources r JOIN services s ON s.id = r.service_id
         WHERE r.id = ? AND r.status = 'available' AND s.status = 'active' FOR UPDATE SKIP LOCKED`, [resourceId],
      );
      if (!resource) throw E.conflict('That resource is no longer available');
    } else {
      const svc = await tx.one('SELECT id, status FROM services WHERE id = ?', [serviceId]);
      if (!svc) throw E.notFound('Service not found');
      if (svc.status !== 'active') throw E.badRequest('This service is not available right now');
      resource = await tx.one(
        `SELECT id, service_id, resource_value FROM authorized_resources
         WHERE service_id = ? AND status = 'available' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED`, [serviceId],
      );
      if (!resource) throw E.conflict('No resources available for this service right now. Please try again later.', { code: 'EMPTY' });
    }
    const upd = await tx.run(
      "UPDATE authorized_resources SET status = 'assigned', assigned_user_id = ? WHERE id = ? AND status = 'available'", [uid, resource.id],
    );
    if (!upd.affectedRows) throw E.conflict('That resource was just taken — please try again');
    // uq_assign_active_resource makes a duplicate active assignment impossible at the DB level.
    const ins = await tx.run('INSERT INTO resource_assignments (user_id, resource_id, service_id) VALUES (?,?,?)', [uid, resource.id, resource.service_id]);
    return { assignmentId: ins.insertId, resource, limits };
  });
  const row = await db.one(
    `SELECT a.id, a.status, a.assigned_at, a.last_code, r.resource_value, s.country_code, s.flag_code, s.app_code, s.app_name, s.country_name
     FROM resource_assignments a JOIN authorized_resources r ON r.id = a.resource_id JOIN services s ON s.id = a.service_id WHERE a.id = ?`,
    [result.assignmentId],
  );
  notifications.notify(uid, { type: 'resource', title: 'New resource assigned', body: `${row.country_code} ${row.app_code} · ${row.resource_value}`, link: '/access' }).catch(() => {});
  realtime.broadcast('service:count', { service_id: result.resource.service_id });
  return { assignment: row, limits: await quota.limitsFor(uid) };
}

exports.assign = async (req, res) => {
  const serviceId = v.id(req.body.service_id, 'service_id');
  const out = await allocate(req, { serviceId });
  res.status(201).json({ ok: true, message: 'Resource assigned', ...out });
};

exports.claim = async (req, res) => {
  const resourceId = v.id(req.body.resource_id, 'resource_id');
  const out = await allocate(req, { resourceId });
  res.status(201).json({ ok: true, message: 'Resource assigned', ...out });
};

exports.mine = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const active = req.query.scope !== 'all';
  // Active numbers plus the ones auto-returned in the last 24h (shown as "Return").
  const where = `a.user_id = ? ${active ? "AND (a.released_at IS NULL OR (a.status = 'returned' AND a.released_at > UTC_TIMESTAMP() - INTERVAL 1 DAY))" : ''}`;
  const [items, [{ n }]] = await Promise.all([
    db.query(
      `SELECT a.id, a.status, a.assigned_at, a.last_code, a.released_at, r.resource_value, s.country_code, s.flag_code, s.app_code, s.app_name
       FROM resource_assignments a JOIN authorized_resources r ON r.id = a.resource_id JOIN services s ON s.id = a.service_id
       WHERE ${where} ORDER BY a.released_at IS NULL DESC, a.id DESC LIMIT ? OFFSET ?`, [req.user.id, p.size, p.offset],
    ),
    db.query(`SELECT COUNT(*) AS n FROM resource_assignments a WHERE ${where}`, [req.user.id]),
  ]);
  res.json({ ok: true, items, pagination: meta(n, p) });
};

exports.release = async (req, res) => {
  const id = v.id(req.params.id);
  await db.transaction(async (tx) => {
    const a = await tx.one('SELECT id, resource_id, status FROM resource_assignments WHERE id = ? AND user_id = ? AND released_at IS NULL FOR UPDATE', [id, req.user.id]);
    if (!a) throw E.notFound('Assignment not found');
    // No OTP yet → the number goes back to the pool. Already used → retired so old codes never reach someone else.
    const unused = a.status === 'pending';
    await tx.run('UPDATE resource_assignments SET released_at = UTC_TIMESTAMP(), status = ? WHERE id = ?', [unused ? 'returned' : 'released', a.id]);
    await tx.run('UPDATE authorized_resources SET status = ?, assigned_user_id = NULL WHERE id = ?', [unused ? 'available' : 'retired', a.resource_id]);
  });
  res.json({ ok: true, message: 'Resource released' });
};

/**
 * Serial search: 5–8 digit identifier. Returns only resources this user may
 * access — their own assignments, or currently-available authorized resources.
 */
exports.search = async (req, res) => {
  const serial = v.str(req.query.serial, { name: 'Serial', required: true, pattern: /^\d{5,8}$/ });
  const serviceId = req.query.service_id ? v.id(req.query.service_id, 'service_id') : null;
  const like = `%${serial}%`;
  const svc = serviceId ? 'AND r.service_id = ?' : '';
  const rows = await db.query(
    `SELECT r.id, r.resource_value, r.status, r.assigned_user_id = ? AS mine, s.id AS service_id, s.country_code, s.flag_code, s.app_code, s.app_name
     FROM authorized_resources r JOIN services s ON s.id = r.service_id
     WHERE r.serial_digits LIKE ? ${svc} AND s.status = 'active'
       AND ((r.status = 'assigned' AND r.assigned_user_id = ?) OR r.status = 'available')
     ORDER BY mine DESC, r.id LIMIT 20`,
    serviceId ? [req.user.id, like, serviceId, req.user.id] : [req.user.id, like, req.user.id],
  );
  res.json({
    ok: true,
    count: rows.length,
    message: rows.length ? 'Matching resources found' : 'No matching resources',
    items: rows.map((r) => ({ ...r, mine: !!r.mine })),
  });
};

exports.servicesWithCounts = servicesWithCounts;
