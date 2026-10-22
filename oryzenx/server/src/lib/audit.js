const { query } = require('../db');

// Record an admin (or security-relevant) action. Never throws: logging must not break the request.
async function audit(req, action, entity = null, entityId = null, details = null) {
  try {
    await query(
      'INSERT INTO audit_log (actor_id, action, entity, entity_id, details, ip) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user?.id || null, action, entity, entityId == null ? null : String(entityId),
        details ? JSON.stringify(details) : null, req.ip],
    );
  } catch (err) {
    console.error('audit log failed', err.message);
  }
}

module.exports = audit;
