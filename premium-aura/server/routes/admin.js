'use strict';
const express = require('express');
const { ah } = require('../utils/errors');
const { requireAdmin } = require('../middleware/auth');
const fileStorage = require('../services/fileStorage');
const dash = require('../controllers/admin/dashboardAdmin');
const users = require('../controllers/admin/usersAdmin');
const access = require('../controllers/admin/accessAdmin');
const events = require('../controllers/admin/eventsAdmin');
const api = require('../controllers/admin/apiAdmin');
const finance = require('../controllers/admin/financeAdmin');
const content = require('../controllers/admin/contentAdmin');
const system = require('../controllers/admin/systemAdmin');

const router = express.Router();
router.use(requireAdmin);

const imageUpload = fileStorage.memoryUpload(8 * 1024 * 1024).single('file');
const importUpload = fileStorage.memoryUpload(20 * 1024 * 1024).single('file');

router.get('/stats', ah(dash.stats));

router.get('/users', ah(users.list));
router.post('/users', ah(users.create));
router.post('/users/bulk', ah(users.bulk));
router.get('/users/:id', ah(users.show));
router.put('/users/:id', ah(users.update));
router.delete('/users/:id', ah(users.remove));
router.post('/users/:id/suspend', ah(users.suspend));
router.post('/users/:id/unsuspend', ah(users.unsuspend));
router.post('/users/:id/approve', ah(users.approve));
router.post('/users/:id/reset-2fa', ah(users.reset2fa));
router.post('/users/:id/reset-password', ah(users.resetPassword));
router.put('/users/:id/limits', ah(users.limits));
router.post('/users/:id/premium', ah(users.premium));
router.post('/users/:id/wallet', ah(users.adjustWallet));

router.get('/services', ah(access.services));
router.post('/services', ah(access.createService));
router.put('/services/:id', ah(access.updateService));
router.delete('/services/:id', ah(access.deleteService));
router.post('/services/:id/clear', ah(access.clearService));
router.get('/resources', ah(access.resources));
router.post('/resources', ah(access.addResources));
router.post('/resources/import', importUpload, ah(access.importResources));
router.post('/resources/bulk', ah(access.bulkResources));
router.get('/assignments', ah(access.assignments));
router.get('/rate-limits', ah(access.getRateLimits));
router.put('/rate-limits', ah(access.setRateLimits));

router.get('/events', ah(events.list));
router.post('/events/expire', ah(events.expire));
router.get('/events/config', ah(events.getConfig));
router.put('/events/config', ah(events.setConfig));
router.put('/demo', ah(events.setDemo));
router.post('/demo/toggle', ah(events.toggleDemo));
router.post('/demo/purge', ah(events.purgeDemo));

router.get('/providers', ah(api.list));
router.post('/providers', ah(api.create));
router.get('/providers/logs', ah(api.logs));
router.get('/providers/:id', ah(api.show));
router.put('/providers/:id', ah(api.update));
router.delete('/providers/:id', ah(api.remove));
router.post('/providers/:id/toggle', ah(api.toggle));
router.post('/providers/:id/test', ah(api.test));
router.post('/providers/:id/poll', ah(api.pollNow));
router.put('/providers/:id/mappings', ah(api.saveMappings));
router.post('/providers/:id/preview', ah(api.preview));
router.get('/providers/:id/sample', ah(api.sample));

router.get('/plans', ah(finance.plans));
router.post('/plans', ah(finance.createPlan));
router.put('/plans/:id', ah(finance.updatePlan));
router.delete('/plans/:id', ah(finance.deletePlan));
router.get('/payments', ah(finance.payments));
router.post('/payments/:id/review', ah(finance.reviewPayment));
router.get('/withdrawals', ah(finance.withdrawals));
router.post('/withdrawals/:id/review', ah(finance.reviewWithdrawal));

router.get('/news', ah(content.list));
router.post('/news', ah(content.create));
router.post('/news/image', imageUpload, ah(content.uploadImage));
router.get('/news/:id', ah(content.show));
router.put('/news/:id', ah(content.update));
router.delete('/news/:id', ah(content.remove));
router.get('/notifications', ah(content.notifications));
router.post('/notifications', ah(content.sendNotification));

router.get('/settings', ah(system.getSettings));
router.put('/settings', ah(system.saveSettings));
router.post('/settings/upload/:target', imageUpload, ah(system.uploadBrand));
router.get('/smtp', ah(system.getSmtp));
router.put('/smtp', ah(system.saveSmtp));
router.post('/smtp/test', ah(system.testSmtp));
router.get('/maintenance', ah(system.getMaintenance));
router.put('/maintenance', ah(system.saveMaintenance));
router.get('/logs', ah(system.logs));

module.exports = router;
