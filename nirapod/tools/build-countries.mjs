// Localized country names (CLDR via Node's ICU) for every ISO 3166 code, in all 8 app languages.
// Output: shared/geo/countries.json and app/assets/geo/countries.json
// Names depend on the CLDR version bundled with Node, so the file records it. When --check runs on a
// Node with a different CLDR, it checks structure only (same codes, same languages, identical copies).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, CHECK, emit, done, readJson } from './lib.mjs';

const langs = readJson('shared/i18n/languages.json').languages.map((l) => l.code);
const codes = fs.readFileSync(path.join(ROOT, 'shared/tz/iso3166.tab'), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0]);
const cldr = process.versions.cldr;
const targets = ['shared/geo/countries.json', 'app/assets/geo/countries.json'];
const label = `countries (${codes.length} x ${langs.length} languages)`;

const existing = fs.existsSync(path.join(ROOT, targets[0])) ? readJson(targets[0]) : null;
if (CHECK && existing && existing.cldr !== cldr) {
  const problems = [];
  const a = fs.readFileSync(path.join(ROOT, targets[0]), 'utf8');
  const b = fs.existsSync(path.join(ROOT, targets[1])) ? fs.readFileSync(path.join(ROOT, targets[1]), 'utf8') : '';
  if (a !== b) problems.push(`${targets[1]} differs from ${targets[0]}`);
  for (const lang of langs) {
    const names = existing.names?.[lang];
    if (!names) { problems.push(`missing language ${lang}`); continue; }
    const have = Object.keys(names);
    if (have.length !== codes.length || codes.some((cc) => typeof names[cc] !== 'string' || !names[cc])) {
      problems.push(`language ${lang}: country codes do not match shared/tz/iso3166.tab`);
    }
  }
  if (problems.length) {
    problems.forEach((p) => console.error(`OUT OF DATE: ${p} (run: cd nirapod/tools && npm run build)`));
    console.error(`${label}: structure check failed`);
    process.exit(1);
  }
  console.log(`${label}: structure ok (file CLDR ${existing.cldr}, this Node CLDR ${cldr})`);
  process.exit(0);
}

const out = {};
for (const lang of langs) {
  const dn = new Intl.DisplayNames([lang], { type: 'region' });
  out[lang] = Object.fromEntries(codes.map((cc) => [cc, dn.of(cc) ?? cc]));
}
const json = JSON.stringify({ _source: 'CLDR via Node Intl.DisplayNames; regenerate with npm run countries', cldr, names: out }) + '\n';
for (const t of targets) emit(t, json);
done(label);
