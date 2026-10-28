// Enforces the rules in docs/CONTRACTS/i18n-keys.json.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readJson } from './lib.mjs';

const contract = readJson('docs/CONTRACTS/i18n-keys.json');
const langs = readJson('shared/i18n/languages.json').languages.map((l) => l.code);
const FULL = ['en', 'bn'];
const errors = [];
const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const contractKeys = Object.keys(contract.keys);

if (langs.length !== 8) errors.push(`expected 8 languages, found ${langs.length}`);
for (const need of ['en', 'bn', 'hi', 'ur', 'ar', 'es', 'id', 'ms']) if (!langs.includes(need)) errors.push(`missing language ${need}`);

const files = {};
for (const code of langs) {
  const p = path.join(ROOT, 'shared/i18n', `${code}.json`);
  if (!fs.existsSync(p)) { errors.push(`missing shared/i18n/${code}.json`); continue; }
  files[code] = JSON.parse(fs.readFileSync(p, 'utf8'));
}
const en = files.en || {};
const enKeys = Object.keys(en).sort();
if (JSON.stringify(enKeys) !== JSON.stringify([...contractKeys].sort()))
  errors.push('en.json keys differ from docs/CONTRACTS/i18n-keys.json (regenerate the contract)');

for (const [code, strings] of Object.entries(files)) {
  for (const [k, v] of Object.entries(strings)) {
    if (!(k in en)) errors.push(`${code}: unknown key ${k}`);
    else if (ph(v) !== ph(en[k])) errors.push(`${code}: placeholders differ for ${k}`);
    if (typeof v !== 'string' || !v.trim()) errors.push(`${code}: empty value for ${k}`);
  }
  if (FULL.includes(code)) for (const k of enKeys) if (!(k in strings)) errors.push(`${code}: missing ${k} (must be complete)`);
}

// Bengali text never appears in non-Bengali files (and vice versa for Latin-only checks).
const BENGALI = /[ঀ-৿]/;
for (const [code, strings] of Object.entries(files)) {
  if (code === 'bn') continue;
  for (const [k, v] of Object.entries(strings)) if (BENGALI.test(v)) errors.push(`${code}: Bengali script in ${k}`);
}
// Malay and Indonesian must be maintained separately (not copies of each other).
if (files.ms && files.id) {
  const shared = Object.keys(files.ms).filter((k) => !k.startsWith('common.app_name') && files.id[k] === files.ms[k]);
  const total = Object.keys(files.ms).length;
  if (total > 4 && shared.length / total > 0.6) errors.push(`ms.json looks copied from id.json (${shared.length}/${total} identical)`);
  if (files.ms['greeting.afternoon'] !== 'Selamat tengah hari,') errors.push('ms: afternoon greeting must use Malaysian phrasing');
}
// Every screen namespace exists.
const namespaces = new Set(enKeys.map((k) => k.split('.')[0]));
for (const [screen, nss] of Object.entries(contract.screens))
  for (const ns of nss) if (!namespaces.has(ns)) errors.push(`screen ${screen}: unknown namespace ${ns}`);

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`i18n: ${langs.length} languages, ${enKeys.length} keys, rules ok`);
