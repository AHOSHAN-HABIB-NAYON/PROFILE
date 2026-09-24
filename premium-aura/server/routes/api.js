'use strict';
const express = require('express');
const { ah } = require('../utils/errors');
const { requireAuth } = require('../middleware/auth');
const { loginLimiter, authLimiter, sensitiveLimiter } = require('../middleware/rateLimiters');
const fileStorage = require('../services/fileStorage');
const settings = require('../models/settings');
const auth = require('../controllers/authController');
const user = require('../controllers/userController');
const access = require('../controllers/accessController');
const eventsCtl = require('../controllers/eventController');
const finance = require('../controllers/financeController');
const news = require('../controllers/newsController');
const notif = require('../controllers/notificationController');
const profile = require('../controllers/profileController');
const pub = require('../controllers/publicController');

const router = express.Router();

// Upload size is admin-configurable, so build the multer instance per request.
const screenshotUpload = ah(async (req, res, next) => {
  const mb = Math.min(20, Math.max(1, await settings.getInt('upload_max_mb', 5)));
  fileStorage.memoryUpload(mb * 1024 * 1024).single('screenshot')(req, res, next);
});

// ---- public
router.get('/public/site', ah(pub.site));
router.get('/me', ah(user.me));

// ---- auth
router.get('/auth/csrf', auth.csrf);
router.post('/auth/register', authLimiter, ah(auth.register));
router.post('/auth/login', loginLimiter, ah(auth.login));
router.post('/auth/2fa', loginLimiter, ah(auth.twofa));
router.post('/auth/logout', ah(auth.logout));
router.post('/auth/resend-verification', authLimiter, ah(auth.resendVerification));
router.post('/auth/forgot', authLimiter, ah(auth.forgot));
router.post('/auth/reset', authLimiter, ah(auth.reset));

// ---- everything below requires a signed-in user
router.use(requireAuth);

router.get('/dashboard', ah(user.dashboard));
router.get('/wallet', ah(user.wallet));

router.get('/services', ah(access.list));
router.post('/resource/assign', ah(access.assign));
router.post('/resource/claim', ah(access.claim));
router.get('/resource/search', ah(access.search));
router.get('/resources/mine', ah(access.mine));
router.post('/resources/:id/release', ah(access.release));

router.get('/events', ah(eventsCtl.feed));

router.get('/premium', ah(finance.overview));
router.post('/premium/wallet', sensitiveLimiter, ah(finance.buyWithWallet));
router.post('/payment', sensitiveLimiter, screenshotUpload, ah(finance.submitPayment));
router.get('/payments', ah(finance.myPayments));
router.get('/withdrawals', ah(finance.withdrawals));
router.post('/withdraw', sensitiveLimiter, ah(finance.requestWithdrawal));

router.get('/news', ah(news.list));
router.get('/news/:id', ah(news.show));
router.post('/news/like', ah(news.like));
router.post('/news/share', ah(news.share));
router.post('/news/view', ah(news.view));

router.get('/notifications', ah(notif.list));
router.post('/notifications/read-all', ah(notif.readAll));
router.post('/notifications/:id/read', ah(notif.read));

router.get('/profile', ah(profile.get));
router.put('/profile', ah(profile.update));
router.put('/profile/theme', ah(profile.theme));
router.post('/profile/password', sensitiveLimiter, ah(profile.changePassword));
router.get('/security', ah(profile.security));
router.post('/security/2fa/setup', sensitiveLimiter, ah(profile.twofaSetup));
router.post('/security/2fa/confirm', sensitiveLimiter, ah(profile.twofaConfirm));
router.post('/security/2fa/disable', sensitiveLimiter, ah(profile.twofaDisable));
router.post('/security/2fa/recovery', sensitiveLimiter, ah(profile.twofaRecovery));
router.post('/security/sessions/revoke', sensitiveLimiter, ah(profile.revokeSessions));

router.get('/files/:id', ah(profile.file));

module.exports = router;
