'use strict';
const db = require('../db');
const { clientIp, ua } = require('../lib/http');

async function security(req, userId, event, meta = null, severity = 'info') {
  try {
    await db.q('INSERT INTO security_logs (user_id, event, severity, ip, user_agent, meta) VALUES (?,?,?,?,?,?)',
      [userId || null, event, severity, req ? clientIp(req) : null, req ? ua(req) : null, meta ? JSON.stringify(meta) : null]);
  } catch (e) { console.error('[security-log]', e.message); }
}

async function audit(req, action, targetType = null, targetId = null, meta = null) {
  try {
    await db.q('INSERT INTO audit_logs (actor_id, actor_role, action, target_type, target_id, meta, ip) VALUES (?,?,?,?,?,?,?)',
      [req?.user?.id || null, req?.user?.role || null, action, targetType, targetId === null ? null : String(targetId), meta ? JSON.stringify(meta) : null, req ? clientIp(req) : null]);
  } catch (e) { console.error('[audit-log]', e.message); }
}

module.exports = { security, audit };
