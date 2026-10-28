// Logger that never writes PII or coordinates.
// Two layers: pino redaction for known paths, plus a deep sanitizer that drops any
// field whose name looks sensitive, wherever it appears.
import pino from 'pino';

export const SENSITIVE_KEY = new RegExp(
  [
    'lat', 'lng', 'lon', 'latitude', 'longitude', 'coords?', 'coordinates', 'location', 'accuracy', 'altitude',
    'heading', 'route', 'place', 'address',
    'email', 'name', 'phone', 'password', 'pass', 'otp', 'code', 'token', 'secret', 'authorization', 'cookie',
    'api_?key', 'apikey', 'ip', 'avatar', 'photo', 'google_sub', 'sub', 'message', 'body',
  ]
    .map((k) => `^${k}$`)
    .join('|') +
    '|_(lat|lng|email|name|token|code|password|ip)$|^(email|token|password|refresh|access)_',
  'i',
);

const REDACTED = '[redacted]';

export function sanitize(value, depth = 0) {
  if (depth > 6) return '[depth]';
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === 'object' && !(value instanceof Error)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return scrubString(value);
  return value;
}

// Removes things that look like emails, coordinate pairs or bearer tokens from free text.
export function scrubString(s) {
  return s
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, '[coords]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [token]')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[jwt]');
}

export function createLogger(level = 'info', destination = undefined) {
  return pino({
    level,
    base: undefined,
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]', 'req.remoteAddress', 'req.remotePort'],
      censor: REDACTED,
    },
    formatters: {
      log: (obj) => sanitize(obj),
    },
    serializers: {
      // Only method, path (no query string) and status; never bodies, IPs or query params.
      req: (req) => ({ method: req.method, path: (req.url || '').split('?')[0] }),
      res: (res) => ({ statusCode: res.statusCode }),
      err: (err) => ({ type: err.name, errCode: err.code, detail: scrubString(String(err.message || '')) }),
    },
    hooks: {
      // scrub the message string too
      logMethod(args, method) {
        method.apply(this, args.map((a) => (typeof a === 'string' ? scrubString(a) : a)));
      },
    },
  }, destination);
}
