'use strict';
const express = require('express');
const path = require('path');
const { ah } = require('../utils/errors');
const paths = require('../config/paths');
const fileStorage = require('../services/fileStorage');
const install = require('../controllers/installController');

module.exports = function installRouter(onInstalled) {
  const router = express.Router();
  router.use('/assets', express.static(path.join(paths.INSTALL_DIR, 'assets'), { index: false }));
  router.get('/', install.page);
  router.use('/api', install.guard);
  router.get('/api/requirements', ah(install.requirements));
  router.post('/api/database', ah(install.database));
  router.post('/api/tables', ah(install.tables));
  router.post('/api/admin', ah(install.admin));
  router.post('/api/site', ah(install.site));
  router.post('/api/logo', fileStorage.memoryUpload(5 * 1024 * 1024).single('logo'), ah(install.logo));
  router.post('/api/smtp', ah(install.smtp));
  router.post('/api/pwa', ah(install.pwa));
  router.post('/api/finish', ah(install.finish(onInstalled)));
  return router;
};
