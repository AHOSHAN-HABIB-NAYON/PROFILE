'use strict';
/** Maintenance mode: everyone except admins gets 503; /admin & auth stay reachable. */
const db = require('../config/database');
const errorPage = require('../utils/errorPage');
const esc = require('../utils/escape');

let cached = null;
let cachedAt = 0;

async function current() {
  if (cached && Date.now() - cachedAt < 5000) return cached;
  cached = await db.one('SELECT is_active, title, message, contact, estimated_end FROM maintenance WHERE id = 1');
  cachedAt = Date.now();
  return cached;
}
function invalidate() { cached = null; }

const ALWAYS_ALLOWED = [
  /^\/admin(\/|$)/, /^\/api\/admin\//, /^\/api\/auth\//, /^\/api\/me$/, /^\/api\/public\//, /^\/login/, /^\/logout/,
  /^\/assets\//, /^\/vendor\//, /^\/uploads\/public\//, /^\/manifest\.json$/, /^\/service-worker\.js$/, /^\/brand\.css$/,
  /^\/admin-assets\//, /^\/socket\.io\//, /^\/favicon/, /^\/robots\.txt$/,
];

async function maintenanceGate(req, res, next) {
  try {
    if (!db.isReady()) return next();
    const m = await current();
    if (!m?.is_active) return next();
    if (req.user?.role === 'admin') return next();
    if (ALWAYS_ALLOWED.some((re) => re.test(req.path))) return next();
    const payload = {
      title: m.title, message: m.message, contact: m.contact,
      estimated_end: m.estimated_end ? new Date(m.estimated_end).toISOString() : null,
    };
    res.set('Retry-After', '300');
    if (req.path.startsWith('/api/')) {
      return res.status(503).json({ ok: false, error: m.message || 'Maintenance in progress', maintenance: payload });
    }
    const extra = [m.contact ? `Contact: ${esc(m.contact)}` : '', payload.estimated_end ? `Estimated back: ${esc(payload.estimated_end.replace('T', ' ').slice(0, 16))} UTC` : '']
      .filter(Boolean).join('<br>');
    return res.status(503).type('html').send(errorPage.render(503, { title: m.title, message: m.message, extra }));
  } catch (err) { next(err); }
}

module.exports = { maintenanceGate, current, invalidate };
