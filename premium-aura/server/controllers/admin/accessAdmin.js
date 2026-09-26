'use strict';
const db = require('../../config/database');
const audit = require('../../models/auditLog');
const notifications = require('../../models/notification');
const importer = require('../../services/importer');
const fileStorage = require('../../services/fileStorage');
const quota = require('../../services/quota');
const realtime = require('../../services/realtime');
const { servicesWithCounts } = require('../accessController');
const v = require('../../utils/validate');
const { E } = require('../../utils/errors');
const { paginate, meta } = require('../../utils/pagination');

function serviceInput(b) {
  return {
    country_name: v.str(b.country_name, { name: 'Country', required: true, max: 80 }),
    country_code: v.str(b.country_code, { name: 'Country short name', required: true, max: 8, pattern: /^[A-Za-z]{2,3}$/ }).toUpperCase(),
    flag_code: v.str(b.flag_code || b.country_code, { name: 'Flag', required: true, max: 8, pattern: /^[A-Za-z]{2}(-[A-Za-z]+)?$/ }).toLowerCase(),
    app_name: v.str(b.app_name, { name: 'Application', required: true, max: 80 }),
    app_code: v.str(b.app_code, { name: 'App short code', required: true, max: 16, pattern: /^[A-Za-z0-9]{1,16}$/ }).toUpperCase(),
    app_icon: v.str(b.app_icon, { name: 'App icon', max: 255, pattern: /^([a-z0-9-]{1,40}|\/uploads\/public\/[\w.-]+)$/ }) || null,
    description: v.str(b.description, { name: 'Description', max: 255 }) || null,
    status: v.oneOf(b.status, ['active', 'inactive', 'maintenance'], { def: 'active' }),
    manual_available: b.manual_available === '' || b.manual_available === null || b.manual_available === undefined ? null : v.int(b.manual_available, { name: 'Available count', min: 0, max: 10_000_000 }),
    sort_order: v.int(b.sort_order, { name: 'Sort order', min: -1000, max: 100000, def: 0 }),
  };
}

exports.services = async (req, res) => {
  const rows = await servicesWithCounts('1=1');
  const stats = await db.query(`SELECT service_id, SUM(status='assigned') AS assigned, SUM(status='disabled') AS disabled, SUM(status='retired') AS retired, COUNT(*) AS total
                                FROM authorized_resources GROUP BY service_id`);
  const m = new Map(stats.map((s) => [s.service_id, s]));
  res.json({ ok: true, items: rows.map((r) => ({ ...r, stats: { assigned: Number(m.get(r.id)?.assigned || 0), total: Number(m.get(r.id)?.total || 0) } })) });
};

exports.createService = async (req, res) => {
  const s = serviceInput(req.body);
  const dupe = await db.one('SELECT id FROM services WHERE country_code = ? AND app_code = ?', [s.country_code, s.app_code]);
  if (dupe) throw E.conflict('A service with this country and app code already exists');
  const r = await db.run('INSERT INTO services SET ?', [s]);
  await audit.log(req, 'service.create', { targetType: 'service', targetId: r.insertId, details: s });
  if (s.status === 'active' && v.bool(req.body.notify)) {
    await notifications.broadcast({ type: 'service', title: 'New service available', body: `${s.country_code} ${s.app_code} · ${s.country_name} ${s.app_name}`, link: '/access' });
  }
  res.status(201).json({ ok: true, id: r.insertId, message: 'Service created' });
};

exports.updateService = async (req, res) => {
  const id = v.id(req.params.id);
  const s = serviceInput(req.body);
  const dupe = await db.one('SELECT id FROM services WHERE country_code = ? AND app_code = ? AND id <> ?', [s.country_code, s.app_code, id]);
  if (dupe) throw E.conflict('Another service already uses this country and app code');
  const r = await db.run('UPDATE services SET ? WHERE id = ?', [s, id]);
  if (!r.affectedRows) throw E.notFound('Service not found');
  await audit.log(req, 'service.update', { targetType: 'service', targetId: id, details: s });
  res.json({ ok: true, message: 'Service updated' });
};

exports.deleteService = async (req, res) => {
  const id = v.id(req.params.id);
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM resource_assignments WHERE service_id = ?', [id]);
    await tx.run('DELETE FROM authorized_resources WHERE service_id = ?', [id]);
    const r = await tx.run('DELETE FROM services WHERE id = ?', [id]);
    if (!r.affectedRows) throw E.notFound('Service not found');
  });
  await audit.log(req, 'service.delete', { targetType: 'service', targetId: id });
  res.json({ ok: true, message: 'Service deleted' });
};

/** Delete the old numbers of a service without deleting the service itself. */
exports.clearService = async (req, res) => {
  const id = v.id(req.params.id);
  const svc = await db.one('SELECT id, country_code, app_code FROM services WHERE id = ?', [id]);
  if (!svc) throw E.notFound('Service not found');
  const r = await importer.clearService(id);
  await audit.log(req, 'service.clear_numbers', { targetType: 'service', targetId: id, details: r });
  realtime.broadcast('service:count', {});
  res.json({ ok: true, ...r, message: `${r.removed} number(s) deleted${r.retired ? `, ${r.retired} in use will disappear after the user finishes` : ''}` });
};

exports.resources = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const where = ['1=1'];
  const params = [];
  if (req.query.service_id) { where.push('r.service_id = ?'); params.push(v.id(req.query.service_id)); }
  if (['available', 'assigned', 'disabled', 'retired'].includes(req.query.status)) { where.push('r.status = ?'); params.push(req.query.status); }
  if (req.query.q) { where.push('(r.resource_value LIKE ? OR r.serial_digits LIKE ?)'); const q = `%${String(req.query.q).slice(0, 64)}%`; params.push(q, q); }
  if (req.query.batch) { where.push('r.import_batch = ?'); params.push(String(req.query.batch).slice(0, 40)); }
  const [items, [{ n }]] = await Promise.all([
    db.query(`SELECT r.id, r.resource_value, r.status, r.import_batch, r.created_at, r.assigned_user_id, u.email AS assigned_email,
                     s.country_code, s.app_code, s.flag_code
              FROM authorized_resources r JOIN services s ON s.id = r.service_id LEFT JOIN users u ON u.id = r.assigned_user_id
              WHERE ${where.join(' AND ')} ORDER BY r.id DESC LIMIT ? OFFSET ?`, [...params, p.size, p.offset]),
    db.query(`SELECT COUNT(*) AS n FROM authorized_resources r WHERE ${where.join(' AND ')}`, params),
  ]);
  res.json({ ok: true, items, pagination: meta(n, p) });
};

exports.addResources = async (req, res) => {
  const serviceId = v.id(req.body.service_id, 'service_id');
  const list = String(req.body.resources || '').split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 5000);
  if (!list.length) throw E.badRequest('Enter at least one resource value');
  const bad = list.find((x) => x.length > 64 || !/^[\w+\-. ]+$/.test(x));
  if (bad) throw E.badRequest(`Invalid resource value: ${bad.slice(0, 30)}`);
  const svc = await db.one('SELECT id FROM services WHERE id = ?', [serviceId]);
  if (!svc) throw E.notFound('Service not found');
  const r = await db.run('INSERT IGNORE INTO authorized_resources (service_id, resource_value, serial_digits, status, import_batch) VALUES ?',
    [list.map((x) => [serviceId, x, x.replace(/\D+/g, ''), 'available', 'manual'])]);
  await audit.log(req, 'resource.add', { targetType: 'service', targetId: serviceId, details: { count: r.affectedRows } });
  res.status(201).json({ ok: true, message: `${r.affectedRows} added, ${list.length - r.affectedRows} duplicate(s) skipped` });
};

exports.importResources = async (req, res) => {
  if (!req.file) throw E.badRequest('Choose a CSV, XLSX or PDF file');
  const saved = await fileStorage.saveDocument(req.file, { userId: req.user.id, purpose: 'resource_import' });
  if (saved.kind === 'pdf') {
    await audit.log(req, 'resource.pdf_archived', { targetType: 'file', targetId: saved.id });
    return res.json({ ok: true, archived: true, file_id: saved.id, message: 'PDF archived for reference. Use CSV or XLSX for structured allocation.' });
  }
  const report = await importer.importResources(req.file.buffer, saved.kind, {
    createMissing: v.bool(req.body.create_missing),
    serviceId: req.body.service_id ? v.id(req.body.service_id) : null,
    replace: !!req.body.service_id && v.bool(req.body.replace),
  });
  await audit.log(req, 'resource.import', { targetType: 'file', targetId: saved.id, details: { ...report, errors: report.errors.length } });
  if (report.inserted && v.bool(req.body.notify)) {
    // Tell users *where* numbers were added — never how many.
    const svcs = report.service_ids.length
      ? await db.query("SELECT country_code, app_code, country_name, app_name FROM services WHERE id IN (?) AND status = 'active' LIMIT 6", [report.service_ids]) : [];
    const where = svcs.map((x) => `${x.country_code} ${x.app_code}`).join(', ');
    await notifications.broadcast({
      type: 'resource', title: 'New numbers available',
      body: where ? `Fresh numbers added: ${where}. Get yours now!` : 'Fresh numbers were added. Get yours now!', link: '/access',
    });
  }
  delete report.service_ids;
  const replaced = report.replaced ? ` · ${report.replaced.removed} old number(s) removed` : '';
  res.json({ ok: true, report, message: `Imported ${report.inserted} resource(s)${replaced}` });
};

exports.bulkResources = async (req, res) => {
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map((x) => v.id(x)).slice(0, 5000);
  const action = v.oneOf(req.body.action, ['available', 'disabled', 'retired', 'delete', 'release'], { name: 'Action' });
  if (!ids.length) throw E.badRequest('Select at least one resource');
  let affected = 0;
  await db.transaction(async (tx) => {
    if (action === 'delete' || action === 'release' || action === 'available' || action === 'retired' || action === 'disabled') {
      await tx.run("UPDATE resource_assignments SET released_at = UTC_TIMESTAMP(), status = 'released' WHERE resource_id IN (?) AND released_at IS NULL", [ids]);
    }
    if (action === 'delete') {
      await tx.run('DELETE FROM resource_assignments WHERE resource_id IN (?)', [ids]);
      affected = (await tx.run('DELETE FROM authorized_resources WHERE id IN (?)', [ids])).affectedRows;
    } else {
      const status = action === 'release' ? 'retired' : action;
      affected = (await tx.run('UPDATE authorized_resources SET status = ?, assigned_user_id = NULL WHERE id IN (?)', [status, ids])).affectedRows;
    }
  });
  await audit.log(req, `resource.bulk_${action}`, { targetType: 'resource', details: { count: ids.length } });
  res.json({ ok: true, message: `${affected} resource(s) updated` });
};

exports.getRateLimits = async (req, res) => {
  res.json({ ok: true, limits: await quota.rateConfig() });
};

exports.setRateLimits = async (req, res) => {
  const b = req.body;
  const cfg = {
    interval_seconds: v.int(b.interval_seconds, { name: 'Request interval', min: 0, max: 3600 }),
    hourly_limit: v.int(b.hourly_limit, { name: 'Hourly limit', min: 1, max: 100000 }),
    daily_limit: v.int(b.daily_limit, { name: 'Daily limit', min: 1, max: 1000000 }),
    enabled: v.bool(b.enabled) ? 1 : 0,
  };
  await db.run(`INSERT INTO rate_limits (scope, interval_seconds, hourly_limit, daily_limit, enabled) VALUES ('resource_assign', ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE interval_seconds = VALUES(interval_seconds), hourly_limit = VALUES(hourly_limit), daily_limit = VALUES(daily_limit), enabled = VALUES(enabled)`,
  [cfg.interval_seconds, cfg.hourly_limit, cfg.daily_limit, cfg.enabled]);
  await audit.log(req, 'rate_limits.update', { details: cfg });
  res.json({ ok: true, message: 'Rate limits saved' });
};

exports.assignments = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const [items, [{ n }]] = await Promise.all([
    db.query(`SELECT a.id, a.status, a.assigned_at, a.released_at, a.last_code, r.resource_value, s.country_code, s.app_code, u.email
              FROM resource_assignments a JOIN authorized_resources r ON r.id = a.resource_id JOIN services s ON s.id = a.service_id
              JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT ? OFFSET ?`, [p.size, p.offset]),
    db.query('SELECT COUNT(*) AS n FROM resource_assignments'),
  ]);
  res.json({ ok: true, items, pagination: meta(n, p) });
};
