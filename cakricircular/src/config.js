'use strict';
/**
 * Persistent configuration.
 *
 * The installer writes config.json to a data directory that lives OUTSIDE the
 * deployed code (by default ~/.cakricircular). Redeploying / updating the app
 * files therefore never loses the database credentials, secrets or uploads,
 * and the site keeps running without asking for anything again.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const APP_DIR = path.resolve(__dirname, '..');

/**
 * One key per site, so two sites on the same hosting account (e.g. a test subdomain and the
 * main domain) never read each other's config. On Hostinger the app lives in
 * ~/domains/<domain>/…, which stays the same across redeploys.
 */
function siteKey() {
  const m = APP_DIR.replace(/\\/g, '/').match(/\/domains\/([^/]+)\//);
  if (m) return m[1].toLowerCase().replace(/[^a-z0-9.-]/g, '');
  return `app-${crypto.createHash('sha1').update(APP_DIR).digest('hex').slice(0, 10)}`;
}

function candidateDirs() {
  const dirs = [];
  if (process.env.CC_DATA_DIR) dirs.push(path.resolve(process.env.CC_DATA_DIR));
  dirs.push(path.join(os.homedir() || APP_DIR, '.cakricircular', siteKey()));
  dirs.push(path.join(APP_DIR, 'data'));
  return [...new Set(dirs)];
}

let current = null;
let dataDir = null;
let invalid = '';

function load() {
  invalid = '';
  for (const dir of candidateDirs()) {
    const file = path.join(dir, 'config.json');
    try {
      const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (cfg && cfg.db) {
        current = cfg;
        dataDir = dir;
        return cfg;
      }
    } catch (_) { /* try next */ }
  }
  current = null;
  dataDir = null;
  return null;
}

/** The saved database turned out to be unusable (e.g. the old PHP site's tables) → show the installer again. */
function markInvalid(reason) { invalid = String(reason || 'invalid'); }
function invalidReason() { return invalid; }

function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, '.probe');
    fs.writeFileSync(probe, '1');
    fs.unlinkSync(probe);
    return true;
  } catch (_) { return false; }
}

/** Save config to the first writable persistent location (home dir unless CC_DATA_DIR is set). */
function save(cfg) {
  const primary = candidateDirs().find(writable);
  if (!primary) throw new Error('কনফিগ ফাইল লেখার মতো কোনো ফোল্ডার পাওয়া যায়নি');
  fs.writeFileSync(path.join(primary, 'config.json'), JSON.stringify({ ...cfg, site: siteKey() }, null, 2), { mode: 0o600 });
  current = cfg;
  invalid = '';
  dataDir = cfg.dataDir && writable(cfg.dataDir) ? cfg.dataDir : primary;
  return primary;
}

function get() { return current; }
function isInstalled() { return !!(current && current.installed) && !invalid; }

/** Folder for uploaded files; kept with the config so deploys never wipe it. */
function uploadsDir() {
  const base = (current && current.uploadsDir) || path.join(dataDir || path.join(APP_DIR, 'data'), 'uploads');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function defaultDataDir() {
  for (const dir of candidateDirs()) if (writable(dir)) return dir;
  return path.join(APP_DIR, 'data');
}

function randomSecret(bytes = 32) { return crypto.randomBytes(bytes).toString('hex'); }

module.exports = { load, save, get, isInstalled, uploadsDir, defaultDataDir, randomSecret, markInvalid, invalidReason, siteKey, APP_DIR };
