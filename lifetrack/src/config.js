'use strict';
/**
 * Runtime configuration.
 * Written by the web installer to config/config.json. Environment variables
 * (see .env.example) override file values, which makes container deploys easy.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = process.env.LT_CONFIG || path.join(ROOT, 'config', 'config.json');

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

function load() {
  let file = null;
  if (fs.existsSync(CONFIG_PATH)) {
    try { file = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { console.error('[config] invalid config.json', e.message); }
  }
  const cfg = fromEnv(file);
  cfg.installed = Boolean(file && file.installed) || process.env.LT_INSTALLED === 'true';
  if (cfg.installed && (!cfg.appKey || !cfg.db.host)) {
    console.error('[config] installed flag set but appKey/db missing');
    cfg.installed = false;
  }
  current = cfg;
  return cfg;
}

function save(cfg) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  return load();
}

module.exports = {
  ROOT,
  CONFIG_PATH,
  load,
  save,
  get: () => current || load(),
  get isProd() { return process.env.NODE_ENV === 'production'; },
};
