'use strict';
/**
 * Premium Aura — application entrypoint.
 *
 * Boot sequence:
 *   not installed → only /install (wizard) + static assets are served
 *   installed     → connect MySQL, migrate + seed (idempotent), sessions,
 *                   Socket.IO, background workers (poller, demo, scheduler)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const { Server: SocketServer } = require('socket.io');

const config = require('./config/env');
const paths = require('./config/paths');
const db = require('./config/database');
const logger = require('./utils/logger');
const errorPage = require('./utils/errorPage');
const MySQLSessionStore = require('./services/sessionStore');
const realtime = require('./services/realtime');
const poller = require('./services/poller');
const demo = require('./services/demoGenerator');
const scheduler = require('./services/scheduler');
const { migrate } = require('./utils/migrate');
const { seed } = require('./utils/seed');
const { loadUser } = require('./middleware/auth');
const { csrfProtection } = require('./middleware/csrf');
const { maintenanceGate } = require('./middleware/maintenance');
const { apiLimiter } = require('./middleware/rateLimiters');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const installRouter = require('./routes/install');
const installController = require('./controllers/installController');

const state = {
  installed: installController.isInstalled(),
  ready: false,
  bootError: null,
  sessionMiddleware: null,
  store: null,
};

const app = express();
const server = http.createServer(app);
const io = new SocketServer(server, {
  serveClient: true,
  cors: config.corsOrigins.length ? { origin: config.corsOrigins, credentials: true } : undefined,
  pingInterval: 25_000,
  maxHttpBufferSize: 1e5,
});
realtime.attach(io);

app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

// ------------------------------------------------------------------ security headers
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      mediaSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: config.appUrl.startsWith('https://') ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: config.appUrl.startsWith('https://') ? { maxAge: 15552000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(compression());
if (config.corsOrigins.length) app.use('/api', cors({ origin: config.corsOrigins, credentials: true }));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

// ------------------------------------------------------------------ static assets
const staticOpts = { index: false, maxAge: config.isProd ? '7d' : 0, fallthrough: true };
app.use('/assets', express.static(path.join(paths.PUBLIC_DIR, 'assets'), staticOpts));
app.use('/vendor/fontawesome', express.static(path.join(paths.NODE_MODULES, '@fortawesome/fontawesome-free'), { ...staticOpts, maxAge: '30d' }));
app.use('/vendor/flag-icons', express.static(path.join(paths.NODE_MODULES, 'flag-icons'), { ...staticOpts, maxAge: '30d' }));
app.use('/vendor/chart.js', express.static(path.join(paths.NODE_MODULES, 'chart.js/dist'), { ...staticOpts, maxAge: '30d' }));
app.use('/uploads/public', express.static(paths.PUBLIC_UPLOADS, {
  ...staticOpts,
  maxAge: '30d',
  setHeaders(res) {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
  },
}));
app.get('/service-worker.js', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.set('Service-Worker-Allowed', '/');
  res.sendFile(path.join(paths.PUBLIC_DIR, 'service-worker.js'));
});
app.get('/offline.html', (req, res) => res.sendFile(path.join(paths.PUBLIC_DIR, 'offline.html')));

// ------------------------------------------------------------------ installer gate
async function onInstalled() {
  state.installed = true;
  await startApp();
}
app.use('/install', (req, res, next) => {
  if (state.installed) return res.redirect('/login');
  next();
}, installRouter(onInstalled));

app.use((req, res, next) => {
  if (!state.installed) {
    if (req.path.startsWith('/api/')) return res.status(503).json({ ok: false, error: 'Application is not installed yet', install: '/install' });
    return res.redirect('/install');
  }
  if (!state.ready) {
    res.set('Retry-After', '10');
    const msg = state.bootError ? 'The application could not connect to its database. Please check the configuration and logs.' : 'Starting up — please retry in a few seconds.';
    if (req.path.startsWith('/api/')) return res.status(503).json({ ok: false, error: msg });
    return res.status(503).type('html').send(errorPage.render(503, { message: msg }));
  }
  next();
});

// ------------------------------------------------------------------ sessions + auth
const lazySession = (req, res, next) => (state.sessionMiddleware ? state.sessionMiddleware(req, res, next) : next());
app.use(lazySession);
app.use(loadUser);
app.use(maintenanceGate);

// ------------------------------------------------------------------ routes
const publicController = require('./controllers/publicController');
const { ah } = require('./utils/errors');

app.get('/manifest.json', ah(publicController.manifest));
app.get('/brand.css', ah(publicController.brandCss));
app.get('/robots.txt', ah(publicController.robots));
app.get('/sitemap.xml', ah(publicController.sitemap));
app.get('/favicon.ico', (req, res) => res.redirect(301, '/assets/icons/favicon.svg'));

app.use('/api', apiLimiter, csrfProtection);
app.use('/api/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));

// Admin page modules are only served to administrators.
const { requireAdmin } = require('./middleware/auth');
app.use('/admin-assets', requireAdmin, express.static(paths.ADMIN_DIR, { index: false, maxAge: 0 }));

app.use(require('./routes/pages'));

app.use(notFound);
app.use(errorHandler);

// ------------------------------------------------------------------ socket.io
io.engine.use((req, res, next) => lazySession(req, res, next));
io.use(async (socket, next) => {
  try {
    const uid = socket.request.session?.userId;
    if (!state.ready || !uid) return next(new Error('unauthorized'));
    const user = await db.one("SELECT id, role, status FROM users WHERE id = ? AND status = 'active'", [uid]);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  } catch (err) { next(err); }
});
io.on('connection', (socket) => {
  const u = socket.data.user;
  socket.join(['feed', `user:${u.id}`]);
  if (u.role === 'admin') socket.join('admins');
});

// ------------------------------------------------------------------ startup
async function startApp() {
  try {
    if (!config.sessionSecret || config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be set (32+ chars)');
    await migrate(config.db);
    await db.init(config.db);
    await seed();
    state.store = new MySQLSessionStore({ ttlSeconds: 86400 });
    state.sessionMiddleware = session({
      name: 'aura.sid',
      secret: config.sessionSecret,
      store: state.store,
      resave: false,
      saveUninitialized: false,
      rolling: false,
      proxy: true,
      cookie: { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, maxAge: 24 * 3600 * 1000 },
    });
    state.ready = true;
    state.bootError = null;
    if (!config.workers.disable) {
      poller.start();
      scheduler.start();
      await demo.refresh();
    }
    logger.info('Premium Aura is ready');
  } catch (err) {
    state.ready = false;
    state.bootError = err;
    logger.error(`Startup failed: ${err.message}`, { stack: err.stack });
    setTimeout(startApp, 15_000).unref();
  }
}

function shutdown(signal) {
  logger.info(`${signal} received — shutting down`);
  poller.stop(); scheduler.stop(); demo.stop();
  io.close();
  server.close(() => db.close().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error(`Unhandled rejection: ${err?.message || err}`, { stack: err?.stack }));

// Always start: hosting launchers (Hostinger, Passenger, pm2) may load this file via require().
if (!global.__auraStarted) {
  global.__auraStarted = true;
  fs.mkdirSync(paths.LOGS_DIR, { recursive: true });
  server.listen(config.port, config.host, () => {
    logger.info(`HTTP listening on ${config.host}:${config.port} (${config.nodeEnv})`);
    if (state.installed) startApp();
    else logger.info('Not installed yet — open /install to run the setup wizard');
  });
}

module.exports = { app, server, io, state, startApp };
