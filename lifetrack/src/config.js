'use strict';
/**
 * Runtime configuration.
 *
 * The installer writes config.json to a PERSISTENT data directory outside the app folder
 * (default ~/.lifetrack, override with LT_DATA_DIR), so re-deploying new app files never
 * loses the installation. Uploads and backups live there too.
 * Environment variables (see .env.example) override file values.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LEGACY_PATH = path.join(ROOT, 'config', 'config.json');

function pickDataDir() {
  const candidates = [process.env.LT_DATA_DIR, path.join(os.homedir() || '', '.lifetrack'), path.join(ROOT, 'data')].filter(Boolean);
  for (const dir of candidates) {
    try { fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); fs.accessSync(dir, fs.constants.W_OK); return dir; } catch { /* try next */ }
  }
  return path.join(ROOT, 'data');
}
const DATA_DIR = pickDataDir();
const CONFIG_PATH = process.env.LT_CONFIG || path.join(DATA_DIR, 'config.json');

let current = null;

function fromEnv(base) {
  const e = process.env;
  const cfg = base ? JSON.parse(JSON.stringify(base)) : { db: {} };
  cfg.db = cfg.db || {};
  if (e.DB_HOST) cfg.db.host = e.DB_HOST;
  if (e.DB_PORT) cfg.db.port = Number(e.DB_PORT);
  if (e.DB_USER) cfg.db.user = e.DB_USER;
  if (e.DB_PASSWORD !== undefined) cfg.db.password = e.DB_PASSWORD;
  if (e.DB_NAME) cfg.db.database = e.DB_NAME;
  if (e.APP_KEY) cfg.appKey = e.APP_KEY;
  if (e.APP_URL) cfg.appUrl = e.APP_URL;
  if (e.TRUST_PROXY) cfg.trustProxy = e.TRUST_PROXY;
  if (e.COOKIE_SECURE) cfg.cookieSecure = e.COOKIE_SECURE === 'true';
  return cfg;
}

function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function load() {
  // New persistent location first, then the old in-app location (migrated automatically)
  let file = fs.existsSync(CONFIG_PATH) ? readJson(CONFIG_PATH) : null;
  if (!file && fs.existsSync(LEGACY_PATH)) {
    file = readJson(LEGACY_PATH);
    if (file) { try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(file, null, 2), { mode: 0o600 }); } catch {} }
  }
  const cfg = fromEnv(file);
  cfg.installed = Boolean(file && file.installed) || process.env.LT_INSTALLED === 'true';
  if (cfg.installed && (!cfg.appKey || !cfg.db.host)) { console.error('[config] installed flag set but appKey/db missing'); cfg.installed = false; }
  current = cfg;
  return cfg;
}

function save(cfg) {
  const { installed, db, appKey, installedAt } = cfg;
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ installed, db, appKey, installedAt }, null, 2), { mode: 0o600 });
  return load();
}

/** DB says LifeTrack is installed → lock the installer and remember it on disk. */
function markInstalled() {
  if (!current) load();
  current.installed = true;
  try { save({ ...current, installed: true, installedAt: current.installedAt || new Date().toISOString() }); } catch (e) { console.warn('[config] could not persist config:', e.message); }
  current.installed = true;
}

module.exports = {
  ROOT, DATA_DIR, CONFIG_PATH,
  UPLOAD_DIR: path.join(DATA_DIR, 'uploads'),
  BACKUP_DIR: path.join(DATA_DIR, 'backups'),
  load, save, markInstalled,
  get: () => current || load(),
  get isProd() { return process.env.NODE_ENV === 'production'; },
};
