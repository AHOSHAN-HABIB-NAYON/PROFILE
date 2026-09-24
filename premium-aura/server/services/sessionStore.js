'use strict';
/**
 * express-session store backed by the `user_sessions` MySQL table so sessions
 * survive restarts and admins can see/terminate active sessions.
 */
const session = require('express-session');
const db = require('../config/database');
const logger = require('../utils/logger');

class MySQLSessionStore extends session.Store {
  constructor({ ttlSeconds = 86400 } = {}) {
    super();
    this.ttl = ttlSeconds;
    this.pruneTimer = setInterval(() => this.prune(), 15 * 60 * 1000);
    this.pruneTimer.unref();
  }

  expiry(sess) {
    const ms = sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.ttl * 1000;
    return new Date(ms);
  }

  get(sid, cb) {
    db.one('SELECT data FROM user_sessions WHERE session_id = ? AND expires_at > UTC_TIMESTAMP()', [sid])
      .then((row) => cb(null, row ? JSON.parse(row.data) : null))
      .catch((err) => cb(err));
  }

  set(sid, sess, cb) {
    const data = JSON.stringify(sess);
    db.run(
      `INSERT INTO user_sessions (session_id, user_id, data, ip, user_agent, expires_at) VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), data = VALUES(data), expires_at = VALUES(expires_at),
         ip = COALESCE(VALUES(ip), ip), user_agent = COALESCE(VALUES(user_agent), user_agent)`,
      [sid, sess.userId || null, data, sess.meta?.ip || null, sess.meta?.ua || null, this.expiry(sess)],
    ).then(() => cb && cb(null)).catch((err) => cb && cb(err));
  }

  touch(sid, sess, cb) {
    db.run('UPDATE user_sessions SET expires_at = ? WHERE session_id = ?', [this.expiry(sess), sid])
      .then(() => cb && cb(null)).catch((err) => cb && cb(err));
  }

  destroy(sid, cb) {
    db.run('DELETE FROM user_sessions WHERE session_id = ?', [sid])
      .then(() => cb && cb(null)).catch((err) => cb && cb(err));
  }

  async destroyForUser(userId, exceptSid = null) {
    await db.run('DELETE FROM user_sessions WHERE user_id = ? AND session_id <> ?', [userId, exceptSid || '']);
  }

  prune() {
    if (!db.isReady()) return;
    db.run('DELETE FROM user_sessions WHERE expires_at <= UTC_TIMESTAMP()').catch((err) => logger.warn(`session prune: ${err.message}`));
  }
}

module.exports = MySQLSessionStore;
