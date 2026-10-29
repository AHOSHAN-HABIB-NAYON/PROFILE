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

/** Normalises camelCase / kebab-case / spaced keys to snake_case before matching (refreshToken -> refresh_token). */
export function normalizeKey(k) {
  return String(k)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s.]+/g, '_')
    .toLowerCase();
}

// Extra names that only appear after normalisation (e.g. idToken -> id_token, joinCode -> join_code).
const SENSITIVE_PART = /(^|_)(lat|lng|lon|latitude|longitude|coords?|location|email|password|passwd|token|code|otp|secret|phone|ip|picture|avatar|photo|name|address|place|route)(_|$)/;

export function isSensitiveKey(k) {
  if (SENSITIVE_KEY.test(k)) return true;
  const n = normalizeKey(k);
  // keep obviously safe technical fields readable
  if (['err_code', 'status_code', 'errno', 'sql_state', 'type', 'msg', 'level', 'time', 'req_id', 'request_id'].includes(n)) return false;
  return SENSITIVE_KEY.test(n) || SENSITIVE_PART.test(n);
}

/** Database errors carry the full SQL with values: log only the codes. */
export function serializeError(err) {
  if (!err) return err;
  if (err.sqlMessage || err.sql || err.sqlState || typeof err.errno === 'number') {
    return { type: err.name, errCode: err.code, errno: err.errno, sqlState: err.sqlState };
  }
  return { type: err.name, errCode: err.code, detail: scrubString(String(err.message || '')) };
}

export function sanitize(value, depth = 0) {
  if (depth > 6) return '[depth]';
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === 'object' && !(value instanceof Error)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = isSensitiveKey(k) ? REDACTED : sanitize(v, depth + 1);
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
    .replace(/\b(lat|lng|lon|latitude|longitude)\b\s*[=:]\s*-?\d{1,3}(\.\d+)?/gi, '$1=[coord]')
    .replace(/-?\d{1,3}\.\d{2,}\s*,\s*-?\d{1,3}\.\d{2,}/g, '[coords]')
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
      err: serializeError,
    },
    hooks: {
      // scrub the message string too
      logMethod(args, method) {
        method.apply(this, args.map((a) => (typeof a === 'string' ? scrubString(a) : a)));
      },
    },
  }, destination);
}
