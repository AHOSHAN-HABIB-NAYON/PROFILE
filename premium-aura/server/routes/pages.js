'use strict';
/**
 * HTML entry points. The authenticated app is a single shell (public/index.html)
 * whose content is swapped via Fetch + History API; these routes simply make
 * deep links / refreshes work and gate by auth / role.
 */
const express = require('express');
const path = require('path');
const paths = require('../config/paths');
const { ah } = require('../utils/errors');
const auth = require('../controllers/authController');
const pub = require('../controllers/publicController');

const router = express.Router();
const SHELL = path.join(paths.PUBLIC_DIR, 'index.html');
const AUTH = path.join(paths.PUBLIC_DIR, 'auth.html');

const APP_ROUTES = ['/dashboard', '/access', '/otp', '/premium', '/news', '/wallet', '/withdraw', '/profile', '/security', '/settings', '/notifications'];

const noStore = (res) => res.set('Cache-Control', 'no-store');

router.get('/', (req, res) => res.redirect(req.user ? '/dashboard' : '/login'));

for (const p of ['/login', '/register', '/forgot-password', '/reset-password', '/two-factor']) {
  router.get(p, (req, res) => {
    if (req.user && p !== '/reset-password') return res.redirect('/dashboard');
    noStore(res);
    res.sendFile(AUTH);
  });
}
router.get('/verify-email', ah(auth.verifyEmail));
router.get('/logout', (req, res) => {
  req.session?.destroy(() => {});
  res.clearCookie('aura.sid');
  res.redirect('/login');
});

router.get('/news/:slug', ah(pub.newsPage));

router.get(APP_ROUTES, (req, res) => {
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  noStore(res);
  res.sendFile(SHELL);
});

router.get(['/admin', '/admin/*splat'], (req, res) => {
  if (!req.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  if (req.user.role !== 'admin') return res.redirect('/dashboard');
  noStore(res);
  res.sendFile(SHELL);
});

module.exports = router;
