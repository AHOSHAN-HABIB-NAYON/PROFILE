/**
 * ShopiGo launcher — the startup file for cPanel "Setup Node.js App",
 * Plesk, Passenger, PM2, systemd or `npm start`.
 *
 * It loads the release named in storage/current-release (written atomically
 * by the updater) and falls back to the code in this directory. Shared data
 * (.env, storage/, uploads/) always lives next to this file, so updates never
 * touch it.
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = __dirname;
process.env.SHOPIGO_SHARED = process.env.SHOPIGO_SHARED || root;

function entry() {
  try {
    const version = fs.readFileSync(path.join(root, 'storage', 'current-release'), 'utf8').trim();
    if (/^\d+\.\d+\.\d+([-.\w]*)$/.test(version)) {
      const candidate = path.join(root, 'releases', version, 'server', 'dist', 'index.js');
      if (fs.existsSync(candidate)) return candidate;
      console.error(`[shopigo] release ${version} not found, falling back to bundled code`);
    }
  } catch {
    /* no release pointer yet — first installation */
  }
  return path.join(root, 'server', 'dist', 'index.js');
}

const file = entry();
if (!fs.existsSync(file)) {
  console.error('[shopigo] server/dist is missing. Run `npm install && npm run build` first.');
  process.exit(1);
}
import(pathToFileURL(file).href).catch((err) => {
  console.error('[shopigo] failed to start', err);
  process.exit(1);
});
