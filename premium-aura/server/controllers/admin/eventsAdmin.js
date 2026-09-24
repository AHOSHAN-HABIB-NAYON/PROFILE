'use strict';
const db = require('../../config/database');
const settings = require('../../models/settings');
const audit = require('../../models/auditLog');
const demo = require('../../services/demoGenerator');
const events = require('../../services/events');
const money = require('../../utils/money');
const v = require('../../utils/validate');
const { E } = require('../../utils/errors');
const { paginate, meta } = require('../../utils/pagination');

exports.list = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const where = ['1=1'];
  const params = [];
  if (['received', 'expired', 'rejected'].includes(req.query.status)) { where.push('e.status = ?'); params.push(req.query.status); }
  if (req.query.provider_id) { where.push('e.provider_id = ?'); params.push(v.id(req.query.provider_id)); }
  if (req.query.app && /^[A-Z0-9]{1,12}$/i.test(req.query.app)) { where.push('e.application = ?'); params.push(req.query.app.toUpperCase()); }
  if (req.query.q) { where.push('(e.code LIKE ? OR e.resource_value LIKE ?)'); const q = `%${String(req.query.q).slice(0, 40)}%`; params.push(q, q); }
  const [items, [{ n }]] = await Promise.all([
    db.query(`SELECT e.id, e.application, e.country_code, e.code, e.status, e.resource_value, e.reward_amount, e.received_at, e.expires_at, e.external_id,
                     p.name AS provider, u.email AS user_email
              FROM event_records e LEFT JOIN api_providers p ON p.id = e.provider_id LEFT JOIN users u ON u.id = e.user_id
              WHERE ${where.join(' AND ')} ORDER BY e.id DESC LIMIT ? OFFSET ?`, [...params, p.size, p.offset]),
    db.query(`SELECT COUNT(*) AS n FROM event_records e WHERE ${where.join(' AND ')}`, params),
  ]);
  res.json({ ok: true, items: items.map((i) => ({ ...i, reward_amount: money.display(i.reward_amount) })), pagination: meta(n, p) });
};

exports.expire = async (req, res) => {
  const scope = v.oneOf(req.body.scope, ['ids', 'all_live', 'all_demo'], { name: 'Scope' });
  let r;
  if (scope === 'ids') {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).map((x) => v.id(x)).slice(0, 5000);
    if (!ids.length) throw E.badRequest('Select events to expire');
    r = await db.run("UPDATE event_records SET status = 'expired', expires_at = LEAST(expires_at, UTC_TIMESTAMP()) WHERE id IN (?) AND status = 'received'", [ids]);
  } else if (scope === 'all_live') {
    r = await db.run("UPDATE event_records SET status = 'expired', expires_at = LEAST(expires_at, UTC_TIMESTAMP()) WHERE status = 'received'");
  } else {
    r = await db.run("UPDATE demo_event_logs SET status = 'expired' WHERE status = 'DEMO'");
  }
  await audit.log(req, 'events.expire', { details: { scope, count: r.affectedRows } });
  require('../../services/realtime').broadcast('events:expired', { manual: true });
  res.json({ ok: true, message: `${r.affectedRows} event(s) expired` });
};

exports.getConfig = async (req, res) => {
  res.json({
    ok: true,
    expiration_hours: await events.expirationHours(),
    event_reward: money.normalize(await settings.get('event_reward')),
    demo: demo.status(),
  });
};

exports.setConfig = async (req, res) => {
  const hours = v.int(req.body.expiration_hours, { name: 'Expiration', min: 1, max: 48 });
  if (![1, 6, 12, 24, 48].includes(hours)) throw E.badRequest('Expiration must be 1, 6, 12, 24 or 48 hours');
  const reward = String(req.body.event_reward ?? '').trim();
  if (!money.isMoney(reward) || money.cmp(reward, '0') < 0 || money.cmp(reward, '100') > 0) throw E.badRequest('Reward must be between 0 and 100');
  await settings.set({ event_expiration_hours: hours, event_reward: money.normalize(reward) });
  await audit.log(req, 'events.config', { details: { hours, reward } });
  res.json({ ok: true, message: 'Event settings saved' });
};

exports.setDemo = async (req, res) => {
  const b = req.body;
  const eps = v.int(b.events_per_second, { name: 'Events per second', min: 1, max: 5 });
  if (![1, 2, 5].includes(eps)) throw E.badRequest('Events per second must be 1, 2 or 5');
  const interval = v.int(b.interval_ms, { name: 'Generation interval', min: 200, max: 60000, def: 1000 });
  const apps = (Array.isArray(b.applications) ? b.applications : String(b.applications || '').split(','))
    .map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z0-9]{1,12}$/.test(x)).slice(0, 30);
  const countries = (Array.isArray(b.countries) ? b.countries : String(b.countries || '').split(','))
    .map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{2,3}$/.test(x)).slice(0, 60);
  if (!apps.length) throw E.badRequest('Choose at least one application');
  if (!countries.length) throw E.badRequest('Choose at least one country');
  const exp = v.int(b.expiration_hours, { name: 'Expiration', min: 1, max: 48, def: 24 });
  const start = v.int(b.starting_count, { name: 'Starting count', min: 0, max: 1e12, def: 0 });
  const enabled = v.bool(b.enabled) ? 1 : 0;
  await db.run(
    `UPDATE demo_event_settings SET enabled = ?, events_per_second = ?, interval_ms = ?, applications = ?, countries = ?, expiration_hours = ?,
       starting_count = ?, generated_total = IF(? <> starting_count, 0, generated_total) WHERE id = 1`,
    [enabled, eps, interval, JSON.stringify(apps), JSON.stringify(countries), exp, start, start],
  );
  const status = await demo.refresh();
  await audit.log(req, enabled ? 'demo.start' : 'demo.stop', { details: { eps, interval, apps, countries, exp } });
  res.json({ ok: true, message: enabled ? 'Demo generator running' : 'Demo generator stopped', demo: status });
};

exports.toggleDemo = async (req, res) => {
  const enabled = v.bool(req.body.enabled) ? 1 : 0;
  await db.run('UPDATE demo_event_settings SET enabled = ? WHERE id = 1', [enabled]);
  const status = await demo.refresh();
  await audit.log(req, enabled ? 'demo.start' : 'demo.stop');
  res.json({ ok: true, message: enabled ? 'Demo generator started' : 'Demo generator stopped', demo: status });
};

exports.purgeDemo = async (req, res) => {
  const r = await db.run('DELETE FROM demo_event_logs');
  await audit.log(req, 'demo.purge', { details: { count: r.affectedRows } });
  require('../../services/realtime').broadcast('events:expired', { purge: true });
  res.json({ ok: true, message: `${r.affectedRows} demo event(s) deleted` });
};
