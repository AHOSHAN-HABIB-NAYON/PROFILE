import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHECK = process.argv.includes('--check');
let drift = 0;

/** Writes a generated file, or in --check mode reports drift without writing. */
export function emit(rel, content) {
  const p = path.join(ROOT, rel);
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const old = fs.existsSync(p) ? fs.readFileSync(p) : null;
  if (old && old.equals(buf)) return;
  if (CHECK) {
    console.error(`OUT OF DATE: ${rel} (run: cd nirapod/tools && npm run ${process.env.npm_lifecycle_event || 'build'})`);
    drift++;
    return;
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, buf);
}

/** In --check mode, also reports generated files that should no longer exist. */
export function prune(relDir, keep) {
  const dir = path.join(ROOT, relDir);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (keep.has(f)) continue;
    if (CHECK) { console.error(`STALE: ${relDir}/${f}`); drift++; }
    else fs.rmSync(path.join(dir, f));
  }
}

export function done(label) {
  if (CHECK && drift) { console.error(`${label}: ${drift} generated file(s) out of date`); process.exit(1); }
  console.log(`${label}: ${CHECK ? 'up to date' : 'written'}`);
}

export const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
