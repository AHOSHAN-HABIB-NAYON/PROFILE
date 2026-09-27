'use strict';
/** Server-side i18n: JSON dictionaries in public/i18n + admin overrides in `translations`. */
const fs = require('fs');
const path = require('path');
const db = require('../db');

const DIR = path.join(__dirname, '..', '..', 'public', 'i18n');
const LOCALES = ['en', 'bn', 'hi'];
const META = {
  en: { name: 'English', native: 'English', flag: 'gb', dir: 'ltr' },
  bn: { name: 'Bengali', native: 'বাংলা', flag: 'bd', dir: 'ltr' },
  hi: { name: 'Hindi', native: 'हिन्दी', flag: 'in', dir: 'ltr' },
};
const base = {};
let overrides = {};

function loadFiles() {
  for (const l of LOCALES) {
    try { base[l] = JSON.parse(fs.readFileSync(path.join(DIR, `${l}.json`), 'utf8')); } catch { base[l] = {}; }
  }
}
loadFiles();

async function loadOverrides() {
  try {
    const rows = await db.q('SELECT locale, `key`, value FROM translations');
    const o = {};
    for (const r of rows) (o[r.locale] = o[r.locale] || {})[r.key] = r.value;
    overrides = o;
  } catch { /* before install */ }
}

function dict(locale) {
  const l = LOCALES.includes(locale) ? locale : 'en';
  return { ...base.en, ...base[l], ...(overrides.en && l === 'en' ? overrides.en : {}), ...(overrides[l] || {}) };
}

function t(locale, key, vars = {}) {
  const d = dict(locale);
  let s = d[key] ?? base.en[key] ?? key;
  return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{${k}}`));
}

module.exports = { LOCALES, META, dict, t, loadOverrides, loadFiles, base: () => base };
