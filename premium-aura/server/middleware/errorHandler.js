'use strict';
const config = require('../config/env');
const logger = require('../utils/logger');
const errorPage = require('../utils/errorPage');

function wantsJson(req) {
  return req.path.startsWith('/api/') || req.xhr || (req.get('accept') || '').includes('application/json');
}

function notFound(req, res) {
  if (wantsJson(req)) return res.status(404).json({ ok: false, error: 'Not found' });
  res.status(404).type('html').send(errorPage.render(404));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') status = 413;
  if (err.code === 'LIMIT_UNEXPECTED_FILE') status = 400;
  if (err.type === 'entity.parse.failed') status = 400;
  const expose = err.expose || status < 500;
  let message = expose ? err.message : 'An unexpected error occurred';
  if (status === 413) message = 'The uploaded file or request is too large';

  if (status >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${err.message}`, { stack: err.stack, user: req.user?.id });
  }

  if (res.headersSent) return;
  if (wantsJson(req)) {
    const body = { ok: false, error: message, ...(err.extra || {}) };
    if (!config.isProd && status >= 500) body.debug = err.message; // never stack traces, never in prod
    return res.status(status).json(body);
  }
  res.status(status).type('html').send(errorPage.render(status >= 400 && status < 600 ? status : 500, expose ? { message } : {}));
}

module.exports = { notFound, errorHandler, wantsJson };
