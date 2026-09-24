'use strict';
const db = require('../config/database');
const logger = require('../utils/logger');

/** Write an audit entry. Never throws — auditing must not break the request. */
async function log(req, action, { category = 'admin', targetType = null, targetId = null, details = null, userId } = {}) {
  try {
    const actor = userId !== undefined ? userId : req?.user?.id ?? null;
    // Strip anything that looks like a secret before persisting.
    const clean = details ? JSON.parse(JSON.stringify(details, (k, v) => (/pass|secret|token|key|credential/i.test(k) ? '[redacted]' : v))) : null;
    await db.run(
      'INSERT INTO admin_logs (admin_id, category, action, target_type, target_id, details, ip, user_agent) VALUES (?,?,?,?,?,?,?,?)',
      [actor, category, action, targetType, targetId === null ? null : String(targetId), clean ? JSON.stringify(clean) : null,
        req?.ip || null, (req?.get?.('user-agent') || '').slice(0, 255) || null],
    );
  } catch (err) {
    logger.error('audit log failed', { err: err.message, action });
  }
}

module.exports = { log };
