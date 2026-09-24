'use strict';
/**
 * Authorized resource import from CSV / XLSX.
 * Expected columns (header row, case-insensitive): country, service, resource, status
 *   PK,TG,TEST-100001,available
 */
const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');
const db = require('../config/database');
const { E } = require('../utils/errors');

const MAX_ROWS = 50_000;
const STATUS = new Set(['available', 'disabled', 'retired']);

function normalizeRows(records) {
  return records.map((r, i) => {
    const lower = Object.fromEntries(Object.entries(r).map(([k, v]) => [String(k).trim().toLowerCase(), v]));
    return {
      line: i + 2,
      country: String(lower.country ?? lower.country_code ?? '').trim().toUpperCase(),
      service: String(lower.service ?? lower.app ?? lower.app_code ?? '').trim().toUpperCase(),
      resource: String(lower.resource ?? lower.number ?? lower.value ?? '').trim(),
      status: String(lower.status ?? 'available').trim().toLowerCase() || 'available',
    };
  });
}

function parseCsv(buf) {
  const text = buf.toString('utf8').replace(/^﻿/, '');
  return parse(text, { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true, to: MAX_ROWS + 1 });
}

async function parseXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers = [];
  const out = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    const values = row.values.slice(1).map((c) => (c && typeof c === 'object' ? (c.text ?? c.result ?? '') : c ?? ''));
    if (n === 1) { values.forEach((h) => headers.push(String(h).trim())); return; }
    if (out.length > MAX_ROWS) return;
    out.push(Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])));
  });
  return out;
}

/**
 * @param {Buffer} buf  @param {'csv'|'xlsx'} kind
 * @param {{createMissing:boolean, serviceId?:number}} opts
 */
async function importResources(buf, kind, { createMissing = false, serviceId = null } = {}) {
  const records = kind === 'xlsx' ? await parseXlsx(buf) : parseCsv(buf);
  if (records.length > MAX_ROWS) throw E.badRequest(`Too many rows (max ${MAX_ROWS})`);
  const rows = normalizeRows(records);
  const batch = `imp-${Date.now().toString(36)}`;
  const report = { batch, total: rows.length, inserted: 0, duplicates: 0, invalid: 0, created_services: 0, errors: [] };

  const services = new Map();
  for (const s of await db.query('SELECT id, country_code, app_code FROM services')) services.set(`${s.country_code}|${s.app_code}`, s.id);
  const fixed = serviceId ? await db.one('SELECT id FROM services WHERE id = ?', [serviceId]) : null;
  if (serviceId && !fixed) throw E.notFound('Target service not found');

  const values = [];
  for (const r of rows) {
    if (!r.resource || r.resource.length > 64 || !/^[\w+\-. ]+$/.test(r.resource)) {
      report.invalid += 1; if (report.errors.length < 20) report.errors.push(`Line ${r.line}: invalid resource value`); continue;
    }
    if (!STATUS.has(r.status)) r.status = 'available';
    let sid = fixed?.id;
    if (!sid) {
      if (!/^[A-Z]{2,3}$/.test(r.country) || !/^[A-Z0-9]{1,16}$/.test(r.service)) {
        report.invalid += 1; if (report.errors.length < 20) report.errors.push(`Line ${r.line}: invalid country/service`); continue;
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
      if (!sid) { report.invalid += 1; if (report.errors.length < 20) report.errors.push(`Line ${r.line}: unknown service ${r.country} ${r.service}`); continue; }
    }
    values.push([sid, r.resource, r.resource.replace(/\D+/g, '').slice(0, 64), r.status, batch]);
  }

  for (let i = 0; i < values.length; i += 1000) {
    const chunk = values.slice(i, i + 1000);
    const res = await db.run('INSERT IGNORE INTO authorized_resources (service_id, resource_value, serial_digits, status, import_batch) VALUES ?', [chunk]);
    report.inserted += res.affectedRows;
    report.duplicates += chunk.length - res.affectedRows;
  }
  return report;
}

module.exports = { importResources, parseCsv, parseXlsx };
