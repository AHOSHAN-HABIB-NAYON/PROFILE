const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { loadUser } = require('./lib/auth');
const { HttpError } = require('./lib/util');
const { ROOT: UPLOADS } = require('./lib/uploads');

const fs = require('fs');

// The web app sits next to src/ in the upload zip, or one level up in the repository.
const WEB = [path.join(__dirname, '..', 'web'), path.join(__dirname, '..', '..', 'web')]
  .find((p) => fs.existsSync(path.join(p, 'index.html')));

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Nginx / Hostinger proxy
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.googleusercontent.com'],
        connectSrc: ["'self'", 'https://api.binance.com', 'https://data-api.binance.vision',
          'wss://stream.binance.com:9443', 'wss://data-stream.binance.vision', 'https://accounts.google.com/gsi/'],
        frameSrc: ['https://accounts.google.com/gsi/'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    // Google sign-in popup needs this relaxed opener policy.
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    hsts: config.isProd,
  }));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  // CSRF defence: state-changing API calls must be JSON (browsers cannot send cross-site JSON
  // without a CORS preflight, which this server never allows), on top of SameSite=Lax cookies.
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!req.is('application/json')) return next(new HttpError(415, 'Requests must be JSON'));
    next();
  });

  app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));
  app.use('/api', loadUser);
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./routes/auth').router);
  app.use('/api/me', require('./routes/me').router);
  app.use('/api/admin', require('./routes/admin').router);
  app.use('/api', require('./routes/data'));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  // Uploaded images are only ever shown with <img>; this CSP stops an uploaded SVG from running anything.
  app.use('/uploads', (_req, res, next) => {
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:");
    next();
  }, express.static(UPLOADS, { maxAge: '30d', immutable: true, fallthrough: false }));

  app.use(express.static(WEB, {
    setHeaders(res, file) {
      // index.html and the service worker must always be fresh; versioned assets can be cached.
      if (/index\.html$|sw\.js$|manifest\.webmanifest$/.test(file)) res.set('Cache-Control', 'no-cache');
      else res.set('Cache-Control', 'public, max-age=604800');
    },
  }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Please try again.' : err.message });
  });

  return app;
}

module.exports = createApp;
