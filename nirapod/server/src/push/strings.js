// Push/email text on the server comes from the same shared/i18n tables as the app (notif.* keys), in the
// recipient's language with English fallback (never mixed inside one message).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../shared/i18n');
const cache = new Map();
function table(lang) {
  if (!cache.has(lang)) {
    try {
      cache.set(lang, JSON.parse(fs.readFileSync(path.join(dir, `${lang}.json`), 'utf8')));
    } catch {
      cache.set(lang, null);
    }
  }
  return cache.get(lang);
}

export function t(lang, key, params = {}) {
  const tab = table(lang);
  const en = table('en') || {};
  let s = (tab && tab[key]) || en[key] || key;
  for (const [k, v] of Object.entries(params || {})) s = s.replaceAll(`{${k}}`, v == null ? '' : String(v));
  return s.replace(/\{\w+\}/g, '').replace(/\s{2,}/g, ' ').trim();
}
