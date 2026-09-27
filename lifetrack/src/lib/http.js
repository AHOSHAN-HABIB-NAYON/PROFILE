'use strict';
class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status; this.code = code; this.extra = extra;
  }
}
const err = (status, code, message, extra) => new HttpError(status, code, message, extra);
/** Wrap async route handlers so rejections reach the error middleware */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ok = (res, data = {}, status = 200) => res.status(status).json({ ok: true, data });
const clientIp = (req) => (req.ip || '').replace(/^::ffff:/, '').slice(0, 64);
const ua = (req) => String(req.get('user-agent') || '').slice(0, 500);
module.exports = { HttpError, err, ah, ok, clientIp, ua };
