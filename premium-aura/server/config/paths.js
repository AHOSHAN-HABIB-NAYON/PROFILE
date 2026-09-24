'use strict';
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');

module.exports = {
  ROOT,
  ENV_FILE: path.join(ROOT, '.env'),
  INSTALL_DIR: path.join(ROOT, 'install'),
  INSTALL_LOCK: path.join(ROOT, 'install', 'installed.lock'),
  PUBLIC_DIR: path.join(ROOT, 'public'),
  ADMIN_DIR: path.join(ROOT, 'admin'),
  UPLOADS_DIR: path.join(ROOT, 'uploads'),
  PUBLIC_UPLOADS: path.join(ROOT, 'uploads', 'public'),
  PRIVATE_UPLOADS: path.join(ROOT, 'uploads', 'private'),
  TMP_UPLOADS: path.join(ROOT, 'uploads', 'tmp'),
  LOGS_DIR: path.join(ROOT, 'logs'),
  DATABASE_DIR: path.join(ROOT, 'database'),
  NODE_MODULES: path.join(ROOT, 'node_modules'),
};
