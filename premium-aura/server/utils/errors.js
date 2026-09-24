'use strict';

class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.expose = true;
    this.extra = extra;
  }
}

const E = {
  badRequest: (m = 'Bad request', x) => new AppError(400, m, x),
  unauthorized: (m = 'Please sign in to continue', x) => new AppError(401, m, x),
  forbidden: (m = 'You do not have permission to do that', x) => new AppError(403, m, x),
  notFound: (m = 'Not found', x) => new AppError(404, m, x),
  conflict: (m = 'Conflict', x) => new AppError(409, m, x),
  tooMany: (m = 'Too many requests — please slow down', x) => new AppError(429, m, x),
  unavailable: (m = 'Service temporarily unavailable', x) => new AppError(503, m, x),
};

/** Wrap an async route handler so rejections reach the error middleware. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, E, ah };
