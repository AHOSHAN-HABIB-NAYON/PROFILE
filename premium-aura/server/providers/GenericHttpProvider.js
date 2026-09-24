'use strict';
/**
 * Config-driven HTTP JSON provider. Everything (URL, auth, headers, query,
 * record path, field mappings) comes from the api_providers row, so most
 * providers need no code at all. Subclasses override hooks for quirks.
 */
const ApiProviderInterface = require('./ApiProviderInterface');
const { get } = require('../utils/objectPath');
const { toAppCode, detectFromText } = require('./appCodes');

const CANDIDATES = {
  id: ['id', '_id', 'uuid', 'message_id', 'messageId', 'sms_id', 'smsId', 'record_id', 'mdr_id'],
  code: ['code', 'otp', 'otp_code', 'otpCode', 'verification_code', 'pin'],
  message: ['message', 'text', 'body', 'sms', 'content', 'msg', 'sms_text', 'payload'],
  application: ['application', 'app', 'service', 'service_name', 'sender', 'originator', 'cli', 'from', 'source'],
  service: ['service', 'service_name', 'app_name'],
  resource: ['number', 'phone', 'phone_number', 'msisdn', 'recipient', 'destination', 'did', 'to', 'mobile', 'test_number'],
  country: ['country', 'country_name', 'countryName'],
  country_code: ['country_code', 'countryCode', 'cc', 'iso', 'country_iso'],
  received_at: ['received_at', 'receivedAt', 'created_at', 'createdAt', 'date', 'datetime', 'timestamp', 'time', 'sent_at'],
  status: ['status', 'state'],
};

const CODE_PATTERNS = [
  /\b(\d{3})[-\s](\d{3})\b/, // 123-456
  /(?:code|otp|pin|verification)[^\d]{0,20}(\d{4,8})/i,
  /\b(\d{4,8})\b/,
];

function extractCode(text) {
  if (!text) return null;
  const s = String(text);
  for (const re of CODE_PATTERNS) {
    const m = s.match(re);
    if (m) return m[2] ? m[1] + m[2] : m[1];
  }
  return null;
}

function renderTemplate(value, vars) {
  if (typeof value !== 'string') return value;
  return value.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
}

function parseDate(v) {
  if (v === undefined || v === null || v === '') return new Date();
  if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  let s = String(v);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) s = `${s.replace(' ', 'T')}Z`; // naive → UTC
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

class GenericHttpProvider extends ApiProviderInterface {
  static type = 'generic';

  static label = 'Generic JSON (field mapping)';

  json(field) {
    const v = this.row[field];
    if (!v) return {};
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return {}; }
  }

  templateVars() {
    const now = new Date();
    const windowStart = new Date(now.getTime() - 60 * 60 * 1000);
    return {
      now: now.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      window_start: windowStart.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      today_start: `${now.toISOString().slice(0, 10)}T00:00:00Z`,
      today_end: `${now.toISOString().slice(0, 10)}T23:59:00Z`,
      unix: Math.floor(now.getTime() / 1000),
    };
  }

  connect() {
    const { row } = this;
    const base = String(row.base_url || '');
    const ep = String(row.endpoint || '');
    let url;
    if (/^https?:\/\//i.test(ep)) url = new URL(ep);
    else url = new URL(ep.replace(/^\//, ''), base.endsWith('/') ? base : `${base}/`);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Provider URL must be http(s)');

    const vars = this.templateVars();
    for (const [k, v] of Object.entries(this.json('query_json'))) url.searchParams.set(k, String(renderTemplate(v, vars)));

    const headers = { Accept: 'application/json', 'User-Agent': 'PremiumAura/1.0' };
    for (const [k, v] of Object.entries(this.json('headers_json'))) headers[k] = String(renderTemplate(v, vars));

    const cred = this.credential;
    if (cred) {
      switch (row.auth_type) {
        case 'bearer': headers.Authorization = `Bearer ${cred}`; break;
        case 'api_key': headers[row.auth_param_name || 'X-API-Key'] = cred; break;
        case 'custom_header': headers[row.auth_param_name || 'Authorization'] = cred; break;
        case 'query_token': url.searchParams.set(row.auth_param_name || 'token', cred); break;
        default: break;
      }
    }
    let body;
    if (row.http_method === 'POST') {
      const b = this.json('body_json');
      body = JSON.stringify(Object.fromEntries(Object.entries(b).map(([k, v]) => [k, renderTemplate(v, vars)])));
      headers['Content-Type'] = 'application/json';
    }
    return { url, method: row.http_method || 'GET', headers, body };
  }

  async request() {
    const req = this.connect();
    const started = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.row.timeout_ms || 8000);
    try {
      const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: ctrl.signal, redirect: 'follow' });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = null; }
      return { ok: res.ok, httpStatus: res.status, data, durationMs: Date.now() - started, isJson: data !== null };
    } finally {
      clearTimeout(timer);
    }
  }

  extractRecords(data) {
    if (!data) return [];
    const path = this.row.records_path;
    let recs = path ? get(data, path) : data;
    if (!Array.isArray(recs)) {
      // Common envelopes
      recs = [data.data, data.items, data.records, data.results, data.messages, data.rows, data.data?.items, data.data?.data, data.data?.docs, data.docs]
        .find(Array.isArray) || (Array.isArray(data) ? data : []);
    }
    return recs;
  }

  async fetch() {
    const r = await this.request();
    if (!r.ok) {
      const err = new Error(`HTTP ${r.httpStatus}`);
      err.httpStatus = r.httpStatus;
      err.durationMs = r.durationMs;
      throw err;
    }
    return { records: this.extractRecords(r.data), httpStatus: r.httpStatus, durationMs: r.durationMs };
  }

  pick(record, field) {
    const mapping = this.mappings.find((m) => m.system_field === field);
    if (mapping) return get(record, mapping.provider_field);
    for (const key of CANDIDATES[field] || []) {
      const v = get(record, key);
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }

  normalize(record) {
    if (!record || typeof record !== 'object') return null;
    const message = this.pick(record, 'message');
    let code = this.pick(record, 'code');
    if (code === undefined || code === null || code === '') code = extractCode(message);
    const appRaw = this.pick(record, 'application');
    const application = toAppCode(appRaw) || detectFromText(message) || 'SMS';
    const resourceRaw = this.pick(record, 'resource');
    const id = this.pick(record, 'id');
    return {
      id: id !== undefined && id !== null ? String(id).slice(0, 190) : null,
      country: this.pick(record, 'country') ? String(this.pick(record, 'country')).slice(0, 80) : null,
      country_code: this.pick(record, 'country_code') ? String(this.pick(record, 'country_code')).toUpperCase().slice(0, 8) : null,
      service: this.pick(record, 'service') ? String(this.pick(record, 'service')).slice(0, 80) : null,
      application: String(application).toUpperCase().slice(0, 40),
      code: code !== undefined && code !== null ? String(code).replace(/[\s-]/g, '').slice(0, 16) : null,
      resource: resourceRaw !== undefined && resourceRaw !== null ? String(resourceRaw).trim().slice(0, 64) : null,
      received_at: parseDate(this.pick(record, 'received_at')),
      status: 'received',
    };
    // NB: `message` is intentionally dropped here — bodies are never persisted.
  }

  // eslint-disable-next-line class-methods-use-this
  validate(ev) {
    if (!ev) return { ok: false, reason: 'empty' };
    if (!ev.code || !/^[A-Za-z0-9]{3,12}$/.test(ev.code)) return { ok: false, reason: 'no_code' };
    if (!ev.resource) return { ok: false, reason: 'no_resource' };
    if (ev.received_at.getTime() > Date.now() + 5 * 60_000) ev.received_at = new Date();
    return { ok: true };
  }

  async healthCheck() {
    try {
      const r = await this.request();
      if (r.ok) return { status: 'online', httpStatus: r.httpStatus, message: `OK in ${r.durationMs}ms${r.isJson ? '' : ' (non-JSON body)'}` };
      if ([401, 403].includes(r.httpStatus)) return { status: 'error', httpStatus: r.httpStatus, message: 'Authentication rejected — check the credential' };
      return { status: 'error', httpStatus: r.httpStatus, message: `HTTP ${r.httpStatus}` };
    } catch (err) {
      return { status: 'offline', httpStatus: null, message: err.name === 'AbortError' ? 'Timed out' : err.message };
    }
  }
}

module.exports = GenericHttpProvider;
module.exports.extractCode = extractCode;
module.exports.parseDate = parseDate;
