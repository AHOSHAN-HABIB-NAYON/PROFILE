/**
 * Entry point for hosts that start `node server.js` from the project root (e.g. Hostinger's
 * Express preset). Starts the bundled application; builds it first if the host did not run
 * `npm run build` and no prebuilt output is present.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = __dirname;
const apiEntry = path.join(root, 'apps/api/dist/server.js');
const webBuild = path.join(root, 'apps/web/.next/BUILD_ID');

if (!fs.existsSync(apiEntry) || !fs.existsSync(webBuild)) {
  console.warn('[tradeteam] build output missing — running `npm run build` (first start only)…');
  execSync('npm run build', { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } });
}
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

import(require('node:url').pathToFileURL(apiEntry).href).catch((e) => {
  console.error('[tradeteam] failed to start', e);
  process.exit(1);
});
