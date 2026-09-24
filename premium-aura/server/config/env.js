'use strict';
/**
 * Environment configuration. Values come from .env (written by the installer
 * or by hand) and can be re-read at runtime after the installer finishes.
 */
const fs = require('fs');
const dotenv = require('dotenv');
const paths = require('./paths');

const config = {};

function bool(v, def = false) {
  if (v === undefined || v === '') return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

// Keys that came from .env (not the real environment) may be refreshed on reload.
const fileKeys = new Set();

function load() {
  if (fs.existsSync(paths.ENV_FILE)) {
    const parsed = dotenv.parse(fs.readFileSync(paths.ENV_FILE));
    // Real environment variables win over the file (12-factor).
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined || fileKeys.has(k)) {
        process.env[k] = v;
        fileKeys.add(k);
      }
    }
  }
  const e = process.env;
  Object.assign(config, {
    nodeEnv: e.NODE_ENV || 'production',
    isProd: (e.NODE_ENV || 'production') === 'production',
    port: parseInt(e.PORT || '3000', 10),
    host: e.HOST || '0.0.0.0',
    appUrl: (e.APP_URL || '').replace(/\/+$/, ''),
    trustProxy: e.TRUST_PROXY || 'loopback',
    corsOrigins: (e.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    installToken: e.INSTALL_TOKEN || '',
    db: {
      host: e.DB_HOST || '127.0.0.1',
      port: parseInt(e.DB_PORT || '3306', 10),
      database: e.DB_NAME || '',
      user: e.DB_USER || '',
      password: e.DB_PASSWORD || '',
      connectionLimit: parseInt(e.DB_POOL_SIZE || '10', 10),
    },
    sessionSecret: e.SESSION_SECRET || '',
    encryptionKey: e.ENCRYPTION_KEY || e.SESSION_SECRET || '',
    secureCookies: bool(e.SECURE_COOKIES, (e.APP_URL || '').startsWith('https://')),
    smtp: {
      host: e.SMTP_HOST || '',
      port: parseInt(e.SMTP_PORT || '587', 10),
      user: e.SMTP_USER || '',
      password: e.SMTP_PASSWORD || '',
      secure: bool(e.SMTP_SECURE, false),
      fromName: e.SMTP_FROM_NAME || '',
      fromEmail: e.SMTP_FROM_EMAIL || '',
    },
    payments: {
      binanceUid: e.BINANCE_PAY_UID || '',
      trc20Address: e.TRC20_ADDRESS || '',
    },
    workers: {
      disable: bool(e.DISABLE_WORKERS, false),
    },
  });
  return config;
}

load();

module.exports = config;
module.exports.reload = load;
module.exports.bool = bool;
