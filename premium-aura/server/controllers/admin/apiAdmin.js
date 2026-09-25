'use strict';
/**
 * API Management. Credentials are write-only: they are encrypted at rest (or
 * referenced by .env variable name) and NEVER returned to the browser.
 */
const db = require('../../config/database');
const audit = require('../../models/auditLog');
const poller = require('../../services/poller');
const providers = require('../../providers');
const { encrypt } = require('../../utils/crypto');
const v = require('../../utils/validate');
const { E } = require('../../utils/errors');
const { paginate, meta } = require('../../utils/pagination');

const SYSTEM_FIELDS = ['id', 'country', 'country_code', 'service', 'application', 'code', 'resource', 'received_at', 'status', 'message'];

function safe(row) {
  const parse = (x) => (typeof x === 'string' ? JSON.parse(x || 'null') : x);
  return {
    id: row.id, name: row.name, provider_type: row.provider_type, base_url: row.base_url, endpoint: row.endpoint,
    http_method: row.http_method, auth_type: row.auth_type, auth_param_name: row.auth_param_name,
    credential_env: row.credential_env,
    has_credential: !!(row.credential_encrypted || (row.credential_env && process.env[row.credential_env])),
    credential_source: row.credential_encrypted ? 'encrypted' : (row.credential_env && process.env[row.credential_env] ? 'env' : 'none'),
    headers_json: parse(row.headers_json) || {}, query_json: parse(row.query_json) || {}, body_json: parse(row.body_json) || {},
    records_path: row.records_path, polling_interval_sec: row.polling_interval_sec, timeout_ms: row.timeout_ms,
    enabled: !!row.enabled, health_status: row.health_status, last_checked_at: row.last_checked_at, last_success_at: row.last_success_at,
    last_error: row.last_error, total_fetched: Number(row.total_fetched), created_at: row.created_at,
  };
}

function headerMap(x, name) {
  const obj = v.json(x, { name, def: {} }) || {};
  if (typeof obj !== 'object' || Array.isArray(obj)) throw E.badRequest(`${name} must be a JSON object`);
  const out = {};
  for (const [k, val] of Object.entries(obj).slice(0, 30)) {
    if (!/^[\w-]{1,80}$/.test(k)) throw E.badRequest(`${name}: invalid key "${k}"`);
    out[k] = String(val).slice(0, 500);
  }
  return out;
}

function input(b) {
  const types = providers.types().map((t) => t.type);
  return {
    name: v.str(b.name, { name: 'Name', required: true, max: 120 }),
    provider_type: v.oneOf(b.provider_type, types, { name: 'Provider', def: 'generic' }),
    base_url: v.url(b.base_url, { name: 'Base URL', required: true, allowRelative: false }),
    endpoint: v.str(b.endpoint, { name: 'Endpoint', max: 500 }),
    http_method: v.oneOf(b.http_method, ['GET', 'POST'], { def: 'GET' }),
    auth_type: v.oneOf(b.auth_type, ['none', 'bearer', 'api_key', 'query_token', 'custom_header'], { def: 'bearer' }),
    auth_param_name: v.str(b.auth_param_name, { name: 'Auth parameter name', max: 80, pattern: /^[\w-]+$/ }) || null,
    credential_env: v.str(b.credential_env, { name: 'Credential env variable', max: 80, pattern: /^[A-Z][A-Z0-9_]{1,79}$/ }) || null,
    headers_json: JSON.stringify(headerMap(b.headers_json, 'Headers')),
    query_json: JSON.stringify(headerMap(b.query_json, 'Query parameters')),
    body_json: JSON.stringify(headerMap(b.body_json, 'Body')),
    records_path: v.str(b.records_path, { name: 'Records path', max: 190, pattern: /^[\w.[\]]+$/ }) || null,
    polling_interval_sec: v.int(b.polling_interval_sec, { name: 'Polling interval', min: 1, max: 3600, def: 5 }),
    timeout_ms: v.int(b.timeout_ms, { name: 'Timeout', min: 1000, max: 60000, def: 8000 }),
    enabled: v.bool(b.enabled) ? 1 : 0,
  };
}

exports.list = async (req, res) => {
  const rows = await db.query('SELECT * FROM api_providers ORDER BY id');
  res.json({ ok: true, items: rows.map(safe), types: providers.types(), system_fields: SYSTEM_FIELDS });
};

exports.show = async (req, res) => {
  const id = v.id(req.params.id);
  const row = await db.one('SELECT * FROM api_providers WHERE id = ?', [id]);
  if (!row) throw E.notFound('Provider not found');
  const [mappings, logs] = await Promise.all([
    db.query('SELECT id, provider_field, system_field, transform FROM api_field_mappings WHERE provider_id = ? ORDER BY id', [id]),
    db.query('SELECT id, level, http_status, duration_ms, fetched_count, inserted_count, duplicate_count, message, created_at FROM api_provider_logs WHERE provider_id = ? ORDER BY id DESC LIMIT 30', [id]),
  ]);
  res.json({ ok: true, item: safe(row), mappings, logs, system_fields: SYSTEM_FIELDS });
};

async function setCredential(id, b) {
  if (v.bool(b.clear_credential)) await db.run('UPDATE api_providers SET credential_encrypted = NULL WHERE id = ?', [id]);
  const cred = typeof b.credential === 'string' ? b.credential.trim() : '';
  if (cred) {
    if (cred.length > 1000) throw E.badRequest('Credential is too long');
    await db.run('UPDATE api_providers SET credential_encrypted = ? WHERE id = ?', [encrypt(cred), id]);
  }
}

exports.create = async (req, res) => {
  const data = input(req.body);
  const dupe = await db.one('SELECT id FROM api_providers WHERE name = ?', [data.name]);
  if (dupe) throw E.conflict('A provider with this name already exists');
  const r = await db.run('INSERT INTO api_providers SET ?', [data]);
  await setCredential(r.insertId, req.body);
  await db.run("INSERT IGNORE INTO event_sources (source_type, provider_id, label) VALUES ('provider', ?, ?)", [r.insertId, data.name]);
  poller.invalidate();
  await audit.log(req, 'api.create', { targetType: 'provider', targetId: r.insertId, details: { ...data, credential_set: !!req.body.credential } });
  res.status(201).json({ ok: true, id: r.insertId, message: 'Provider created' });
};

exports.update = async (req, res) => {
  const id = v.id(req.params.id);
  const data = input(req.body);
  const dupe = await db.one('SELECT id FROM api_providers WHERE name = ? AND id <> ?', [data.name, id]);
  if (dupe) throw E.conflict('Another provider uses this name');
  const r = await db.run('UPDATE api_providers SET ? WHERE id = ?', [data, id]);
  if (!r.affectedRows) throw E.notFound('Provider not found');
  await setCredential(id, req.body);
  poller.invalidate();
  await audit.log(req, 'api.update', { targetType: 'provider', targetId: id, details: { ...data, credential_changed: !!req.body.credential } });
  res.json({ ok: true, message: 'Provider saved' });
};

exports.toggle = async (req, res) => {
  const id = v.id(req.params.id);
  const enabled = v.bool(req.body.enabled) ? 1 : 0;
  await db.run('UPDATE api_providers SET enabled = ? WHERE id = ?', [enabled, id]);
  poller.invalidate();
  await audit.log(req, enabled ? 'api.enable' : 'api.disable', { targetType: 'provider', targetId: id });
  res.json({ ok: true, message: enabled ? 'Provider enabled' : 'Provider disabled' });
};

exports.remove = async (req, res) => {
  const id = v.id(req.params.id);
  await db.run('DELETE FROM api_providers WHERE id = ?', [id]);
  poller.invalidate();
  await audit.log(req, 'api.delete', { targetType: 'provider', targetId: id });
  res.json({ ok: true, message: 'Provider deleted' });
};

exports.test = async (req, res) => {
  const id = v.id(req.params.id);
  const row = await db.one('SELECT * FROM api_providers WHERE id = ?', [id]);
  if (!row) throw E.notFound('Provider not found');
  const health = await poller.testProvider(row);
  res.json({ ok: true, health });
};

exports.pollNow = async (req, res) => {
  const id = v.id(req.params.id);
  const row = await db.one('SELECT * FROM api_providers WHERE id = ?', [id]);
  if (!row) throw E.notFound('Provider not found');
  const result = await poller.pollOne(row);
  await audit.log(req, 'api.poll_now', { targetType: 'provider', targetId: id });
  res.json({ ok: true, result });
};

exports.saveMappings = async (req, res) => {
  const id = v.id(req.params.id);
  const list = Array.isArray(req.body.mappings) ? req.body.mappings.slice(0, SYSTEM_FIELDS.length) : [];
  const rows = list.filter((m) => m && m.provider_field).map((m) => [
    id,
    v.str(m.provider_field, { name: 'Provider field', required: true, max: 190, pattern: /^[\w.[\]-]+$/ }),
    v.oneOf(m.system_field, SYSTEM_FIELDS, { name: 'System field' }),
    null,
  ]);
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM api_field_mappings WHERE provider_id = ?', [id]);
    if (rows.length) await tx.run('INSERT INTO api_field_mappings (provider_id, provider_field, system_field, transform) VALUES ?', [rows]);
  });
  await audit.log(req, 'api.mappings', { targetType: 'provider', targetId: id, details: { count: rows.length } });
  res.json({ ok: true, message: `${rows.length} mapping(s) saved` });
};

/** Dry-run: normalize a pasted sample JSON with the current mappings (no network, nothing stored). */
exports.preview = async (req, res) => {
  const id = v.id(req.params.id);
  const row = await db.one('SELECT * FROM api_providers WHERE id = ?', [id]);
  if (!row) throw E.notFound('Provider not found');
  const sample = v.json(req.body.sample, { name: 'Sample JSON' });
  const p = await poller.instance({ ...row, credential_encrypted: null });
  const records = p.extractRecords(sample).slice(0, 20);
  const normalized = records.map((r) => { const e = p.normalize(r); return { event: e, valid: p.validate(e) }; });
  res.json({ ok: true, count: records.length, normalized });
};

/** Last raw records fetched from this provider (memory only) — to help map fields. */
exports.sample = async (req, res) => {
  const id = v.id(req.params.id);
  const last = poller.lastResponse(id);
  if (!last) throw E.notFound('No response yet — press "Poll now" first, then try again.');
  res.json({ ok: true, ...last });
};

exports.logs = async (req, res) => {
  const p = paginate(req.query, { defaultSize: 30 });
  const pid = req.query.provider_id ? v.id(req.query.provider_id) : null;
  const where = pid ? 'WHERE l.provider_id = ?' : '';
  const params = pid ? [pid] : [];
  const [items, [{ n }]] = await Promise.all([
    db.query(`SELECT l.*, p.name AS provider FROM api_provider_logs l JOIN api_providers p ON p.id = l.provider_id ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`, [...params, p.size, p.offset]),
    db.query(`SELECT COUNT(*) AS n FROM api_provider_logs l ${where}`, params),
  ]);
  res.json({ ok: true, items, pagination: meta(n, p) });
};
