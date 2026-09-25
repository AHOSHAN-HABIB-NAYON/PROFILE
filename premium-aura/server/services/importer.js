'use strict';
/**
 * Authorized resource import from CSV / TXT / XLSX.
 * Preferred columns (header row, any order, case-insensitive): country, service, resource, status
 *   PK,TG,TEST-100001,available
 * Also accepted: a plain list of numbers (one per line, with "Import into" set),
 * ; / tab / | delimiters, and aliases like "number" or "phone".
 */
const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');
const db = require('../config/database');
const { E } = require('../utils/errors');

const MAX_ROWS = 50_000;
const STATUS = new Set(['available', 'disabled', 'retired']);

const HEADER_ALIASES = {
  country: ['country', 'country_code', 'countrycode', 'cc'],
  service: ['service', 'app', 'app_code', 'application'],
  resource: ['resource', 'number', 'numbers', 'phone', 'phone_number', 'phonenumber', 'msisdn', 'mobile', 'value', 'resource_value'],
  status: ['status', 'state'],
};
const HEADER_WORDS = new Set(Object.values(HEADER_ALIASES).flat());
const cleanCell = (v) => String(v ?? '').replace(/^\uFEFF/, '').trim().replace(/^["']|["']$/g, '').trim();

/**
 * Turn raw rows (arrays of cells) into {line, country, service, resource, status}.
 * Accepts: a header row (any order, common aliases), or no header at all —
 * one column = just numbers, 3–4 columns = country,service,resource[,status].
 */
function normalizeRows(raw) {
  const rows = raw.map((r) => r.map(cleanCell)).filter((r) => r.some(Boolean));
  if (!rows.length) return { rows: [], hasHeader: false };
  const first = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const hasHeader = first.some((h) => HEADER_WORDS.has(h));
  const idx = {};
  if (hasHeader) {
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) idx[field] = first.findIndex((h) => aliases.includes(h));
  }
  const body = hasHeader ? rows.slice(1) : rows;
  const out = body.map((r, i) => {
    const line = i + (hasHeader ? 2 : 1);
    let country = '';
    let service = '';
    let resource = '';
    let status = '';
    if (hasHeader) {
      country = idx.country >= 0 ? r[idx.country] : '';
      service = idx.service >= 0 ? r[idx.service] : '';
      resource = idx.resource >= 0 ? r[idx.resource] : '';
      status = idx.status >= 0 ? r[idx.status] : '';
      if (!resource) { const filled = r.filter(Boolean); if (filled.length === 1) [resource] = filled; }
    } else if (r.filter(Boolean).length === 1) {
      [resource] = r.filter(Boolean);
    } else {
      [country = '', service = '', resource = '', status = ''] = r;
    }
    // Phone-like values: drop spaces, dashes, brackets and dots ("+211 927-455 905" → "+211927455905").
    if (/^[+\d\s()\-.]+$/.test(resource) && /\d{5,}/.test(resource.replace(/\D/g, ''))) resource = resource.replace(/[\s()\-.]/g, '');
    return {
      line,
      country: country.toUpperCase(),
      service: service.toUpperCase(),
      resource,
      status: (status || 'available').toLowerCase(),
    };
  });
  return { rows: out, hasHeader, columns: idx };
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (const ch of firstLine) if (ch in counts) counts[ch] += 1;
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : ',';
}

function parseCsv(buf) {
  const text = buf.toString('utf8').replace(/^\uFEFF/, '');
  return parse(text, {
    delimiter: detectDelimiter(text), columns: false, skip_empty_lines: true, trim: true,
    relax_column_count: true, relax_quotes: true, to: MAX_ROWS + 1,
  });
}

async function parseXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (out.length > MAX_ROWS) return;
    const cells = [];
    for (let c = 1; c <= row.cellCount; c += 1) {
      const cell = row.getCell(c);
      let v = cell.value;
      if (v && typeof v === 'object') v = v.text ?? v.result ?? (Array.isArray(v.richText) ? v.richText.map((t) => t.text).join('') : '');
      // Large numbers stored as numbers: print all digits, never scientific notation.
      if (typeof v === 'number') v = Number.isInteger(v) ? BigInt(Math.round(v)).toString() : String(v);
      cells.push(v ?? '');
    }
    out.push(cells);
  });
  return out;
}

/**
 * @param {Buffer} buf  @param {'csv'|'xlsx'} kind
 * @param {{createMissing:boolean, serviceId?:number}} opts
 */
async function importResources(buf, kind, { createMissing = false, serviceId = null } = {}) {
  const records = kind === 'xlsx' ? await parseXlsx(buf) : parseCsv(buf);
  if (records.length > MAX_ROWS + 1) throw E.badRequest(`Too many rows (max ${MAX_ROWS})`);
  const { rows, hasHeader, columns } = normalizeRows(records);
  if (!rows.length) throw E.badRequest('The file is empty');
  if (hasHeader && columns.resource < 0 && rows.every((r) => !r.resource)) {
    throw E.badRequest('No number column found. Name it "resource" or "number", or upload a plain list with one number per line.');
  }
  const needsService = !serviceId && rows.some((r) => !r.country || !r.service);
  if (needsService && rows.every((r) => !r.country && !r.service)) {
    throw E.badRequest('This file has only numbers. Choose the target service in "Import into", or add country and service columns.');
  }
  const batch = `imp-${Date.now().toString(36)}`;
  const report = { batch, total: rows.length, inserted: 0, duplicates: 0, invalid: 0, created_services: 0, errors: [] };

  const services = new Map();
  for (const s of await db.query('SELECT id, country_code, app_code FROM services')) services.set(`${s.country_code}|${s.app_code}`, s.id);
  const fixed = serviceId ? await db.one('SELECT id FROM services WHERE id = ?', [serviceId]) : null;
  if (serviceId && !fixed) throw E.notFound('Target service not found');

  const values = [];
  const touched = new Set();
  for (const r of rows) {
    const bad = (msg) => { report.invalid += 1; if (report.errors.length < 20) report.errors.push(`Line ${r.line}: ${msg}`); };
    if (!r.resource) { bad('empty number/resource'); continue; }
    if (/^\d+(\.\d+)?e\+\d+$/i.test(r.resource)) { bad(`"${r.resource}" is in Excel scientific format — format the column as Text and export again`); continue; }
    if (r.resource.length > 64 || !/^[\w+\-. ]+$/.test(r.resource)) { bad(`"${r.resource.slice(0, 30)}" contains unsupported characters`); continue; }
    if (!STATUS.has(r.status)) r.status = 'available';
    let sid = fixed?.id;
    if (!sid) {
      if (!/^[A-Z]{2,3}$/.test(r.country) || !/^[A-Z0-9]{1,16}$/.test(r.service)) {
        bad(`country/service missing or invalid ("${r.country}" / "${r.service}") — choose a service in "Import into"`); continue;
      }
      const key = `${r.country}|${r.service}`;
      sid = services.get(key);
      if (!sid && createMissing) {
        const ins = await db.run(
          "INSERT INTO services (country_name, country_code, flag_code, app_name, app_code, app_icon, status) VALUES (?,?,?,?,?,?, 'active')",
          [r.country, r.country, r.country.toLowerCase().slice(0, 2), r.service, r.service, r.service.toLowerCase()],
        );
        sid = ins.insertId; services.set(key, sid); report.created_services += 1;
      }
      if (!sid) { bad(`service ${r.country} ${r.service} does not exist — create it first or enable "Create missing services"`); continue; }
    }
    values.push([sid, r.resource, r.resource.replace(/\D+/g, '').slice(0, 64), r.status, batch]);
  }

  for (let i = 0; i < values.length; i += 1000) {
    const chunk = values.slice(i, i + 1000);
    const res = await db.run('INSERT IGNORE INTO authorized_resources (service_id, resource_value, serial_digits, status, import_batch) VALUES ?', [chunk]);
    if (res.affectedRows) chunk.forEach((c) => touched.add(c[0]));
    report.inserted += res.affectedRows;
    report.duplicates += chunk.length - res.affectedRows;
  }
  report.service_ids = [...touched];
  return report;
}

module.exports = { importResources, parseCsv, parseXlsx };
