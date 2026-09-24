'use strict';
/** Minimal file + console logger (no external deps, shared-hosting friendly). */
const fs = require('fs');
const path = require('path');
const paths = require('../config/paths');

fs.mkdirSync(paths.LOGS_DIR, { recursive: true });

function write(file, level, msg, meta) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(meta ? { meta } : {}) });
  fs.appendFile(path.join(paths.LOGS_DIR, file), line + '\n', () => {});
}

const logger = {
  info(msg, meta) { console.log(`[info] ${msg}`); write('app.log', 'info', msg, meta); },
  warn(msg, meta) { console.warn(`[warn] ${msg}`); write('app.log', 'warn', msg, meta); },
  error(msg, meta) {
    console.error(`[error] ${msg}`, meta?.stack || '');
    write('error.log', 'error', msg, meta);
  },
  mail(entry) { write('mail.log', 'info', 'mail', entry); },
};

module.exports = logger;
