// Country flags (4x3) for every ISO 3166 code in shared/tz/iso3166.tab and round (1x1) flags for the
// language button. Source: lipis/flag-icons (MIT). Optimized with SVGO.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { optimize } from 'svgo';
import { ROOT, emit, prune, done, readJson } from './lib.mjs';

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve('flag-icons/package.json'));
const codes = fs.readFileSync(path.join(ROOT, 'shared/tz/iso3166.tab'), 'utf8')
  .split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split('\t')[0].toLowerCase());
const langFlags = readJson('shared/i18n/languages.json').languages.map((l) => l.flag);
// Flags are drawn small (24-40 dp) on a 640x480 viewBox: one decimal is visually lossless and halves the size.
const cfg = {
  multipass: true,
  floatPrecision: 1,
  plugins: [{ name: 'preset-default', params: { overrides: { convertPathData: { floatPrecision: 1 }, cleanupNumericValues: { floatPrecision: 1 } } } }, 'removeDimensions'],
};

const keep43 = new Set();
const missing = [];
for (const cc of codes) {
  const src = path.join(pkgDir, 'flags/4x3', `${cc}.svg`);
  if (!fs.existsSync(src)) { missing.push(cc); continue; }
  const out = optimize(fs.readFileSync(src, 'utf8'), { ...cfg, path: src }).data;
  emit(`app/assets/flags/4x3/${cc}.svg`, out + '\n');
  keep43.add(`${cc}.svg`);
}
const keep11 = new Set();
for (const cc of langFlags) {
  const src = path.join(pkgDir, 'flags/1x1', `${cc}.svg`);
  const out = optimize(fs.readFileSync(src, 'utf8'), { ...cfg, path: src }).data;
  emit(`app/assets/flags/1x1/${cc}.svg`, out + '\n');
  emit(`shared/web/flags/1x1/${cc}.svg`, out + '\n');
  keep11.add(`${cc}.svg`);
}
prune('app/assets/flags/4x3', keep43);
prune('app/assets/flags/1x1', keep11);
emit('app/assets/flags/LICENSE.txt', fs.readFileSync(path.join(pkgDir, 'LICENSE')));
if (missing.length) console.warn(`No flag in flag-icons for: ${missing.join(', ')} (UI falls back to the globe icon)`);
done(`flags (${keep43.size} country, ${keep11.size} language)`);
