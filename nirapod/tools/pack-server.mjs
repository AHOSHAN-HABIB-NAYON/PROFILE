// Builds dist/nirapod-server.zip for Hostinger "Node.js app" hosting (no VPS needed).
// Layout inside the zip keeps the repo structure the server expects:
//   package.json (root: dependencies + start)   server/   admin/public/   landing/public/   shared/{tz,web}/
// In hPanel: Application root = the unzipped folder, Startup file = server/src/index.js, then "NPM install".
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT } from './lib.mjs';

const OUT = path.join(ROOT, 'dist', 'nirapod-server');
fs.rmSync(path.join(ROOT, 'dist'), { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const skip = new Set(['node_modules', 'test', 'uploads', '.env', '.env.test']);
function copy(rel) {
  const src = path.join(ROOT, rel);
  const dst = path.join(OUT, rel);
  fs.cpSync(src, dst, { recursive: true, filter: (p) => !skip.has(path.basename(p)) });
}
for (const rel of ['server', 'admin/public', 'landing/public', 'shared/tz', 'shared/web']) copy(rel);

const serverPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/package.json'), 'utf8'));
fs.writeFileSync(path.join(OUT, 'package.json'), JSON.stringify({
  name: 'nirapod-server-bundle',
  private: true,
  type: 'module',
  main: 'server/src/index.js',
  engines: serverPkg.engines,
  scripts: {
    start: 'node server/src/index.js',
    migrate: 'node server/scripts/migrate.js latest',
    seed: 'node server/scripts/seed.js',
    jobs: 'node server/scripts/run-jobs.js',
  },
  dependencies: serverPkg.dependencies,
}, null, 2) + '\n');
fs.copyFileSync(path.join(ROOT, 'docs/deploy/hostinger-nodejs.md'), path.join(OUT, 'DEPLOY.md'));

execFileSync('zip', ['-qr', '../nirapod-server.zip', '.'], { cwd: OUT });
console.log(`dist/nirapod-server.zip (${(fs.statSync(path.join(ROOT, 'dist/nirapod-server.zip')).size / 1024).toFixed(0)} KB)`);
