// Localized country names (CLDR via Node's ICU) for every ISO 3166 code, in all 8 app languages.
// Output: shared/geo/countries.json and app/assets/geo/countries.json
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, emit, done, readJson } from './lib.mjs';

const langs = readJson('shared/i18n/languages.json').languages.map((l) => l.code);
const codes = fs.readFileSync(path.join(ROOT, 'shared/tz/iso3166.tab'), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0]);
const out = {};
for (const lang of langs) {
  const dn = new Intl.DisplayNames([lang], { type: 'region' });
  out[lang] = Object.fromEntries(codes.map((cc) => [cc, dn.of(cc) ?? cc]));
}
const json = JSON.stringify({ _source: 'CLDR via Node Intl.DisplayNames; regenerate with npm run countries', names: out }) + '\n';
emit('shared/geo/countries.json', json);
emit('app/assets/geo/countries.json', json);
done(`countries (${codes.length} x ${langs.length} languages)`);
