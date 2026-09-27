// Builds a signed update package from the current build output:
//   npm run build && npm run package:update -- --changelog "Fixed X" --changelog "Added Y" [--min 1.0.0]
// Output: updates/shopigo-update-<version>.tar.gz and updates/latest.json (feed entry)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as tar from 'tar';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : [])).filter(Boolean);
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const INCLUDE = ['app.js', 'package.json', 'package-lock.json', 'server/package.json', 'server/dist', 'server/update-public-key.pem', 'client/package.json', 'client/dist', 'scripts', 'README.md', 'DEPLOYMENT.md', '.env.example', 'android-twa'];
for (const need of ['server/dist/index.js', 'server/dist/cli.js', 'client/dist/index.html']) {
  if (!fs.existsSync(path.join(root, need))) { console.error(`Missing ${need} — run npm run build first`); process.exit(1); }
}

const staging = path.join(root, 'updates', `.staging-${version}`);
fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(path.join(staging, 'release'), { recursive: true });
for (const item of INCLUDE) {
  const src = path.join(root, item);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(staging, 'release', item), { recursive: true });
}

const files = {};
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile()) files[path.relative(staging, full).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  }
};
walk(path.join(staging, 'release'));

const migrationsDir = path.join(root, 'server', 'dist', 'db', 'migrations');
const manifest = {
  name: 'shopigo',
  version,
  releaseDate: new Date().toISOString().slice(0, 10),
  minVersion: flag('min')[0] ?? undefined,
  changelog: flag('changelog'),
  migrations: fs.existsSync(migrationsDir) ? fs.readdirSync(migrationsDir).filter((f) => /^\d{4}_.*\.js$/.test(f)).map((f) => f.replace(/\.js$/, '')) : [],
  files,
};
const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
fs.writeFileSync(path.join(staging, 'manifest.json'), manifestBytes);

const keyFile = process.env.SHOPIGO_UPDATE_KEY ?? path.join(root, 'keys', 'update-private.pem');
const entries = ['manifest.json', 'release'];
if (fs.existsSync(keyFile)) {
  const sig = crypto.sign(null, manifestBytes, crypto.createPrivateKey(fs.readFileSync(keyFile)));
  fs.writeFileSync(path.join(staging, 'manifest.sig'), sig.toString('base64'));
  entries.push('manifest.sig');
} else {
  console.warn('WARNING: no signing key found — the package is UNSIGNED (installs only with ALLOW_UNSIGNED_UPDATES=true)');
}

const out = path.join(root, 'updates', `shopigo-update-${version}.tar.gz`);
await tar.c({ gzip: true, file: out, cwd: staging, portable: true }, entries);
fs.rmSync(staging, { recursive: true, force: true });
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
const baseUrl = process.env.SHOPIGO_UPDATE_BASE_URL ?? 'https://updates.example.com/shopigo';
fs.writeFileSync(path.join(root, 'updates', 'latest.json'), JSON.stringify({ latest: { version, releaseDate: manifest.releaseDate, minVersion: manifest.minVersion, changelog: manifest.changelog, url: `${baseUrl}/shopigo-update-${version}.tar.gz`, sha256 } }, null, 2));
console.log(`Built ${path.relative(root, out)} (${(fs.statSync(out).size / 1024 / 1024).toFixed(1)} MB, ${Object.keys(files).length} files)\nsha256 ${sha256}`);
