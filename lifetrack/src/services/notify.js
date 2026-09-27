'use strict';
/**
 * Central notification dispatcher: in-app row + Web/FCM push + email,
 * honouring each user's channel preferences. Security notices always go in-app.
 */
const db = require('../db');
const push = require('./push');
const mailer = require('./mailer');
const settings = require('./settings');
const i18n = require('./i18n');

async function userCtx(userId) {
  return db.one(`SELECT u.id, u.email, u.name, u.status, p.language, p.notify_inapp, p.notify_email, p.notify_push, p.notify_security
    FROM users u LEFT JOIN user_profiles p ON p.user_id=u.id WHERE u.id=? AND u.deleted_at IS NULL`, [userId]);
}

/**
 * notify(userId, { type, titleKey|title, bodyKey|body, vars, link, email: {template, vars, cta}, security, channels })
 */
async function notify(userId, opts) {
  const u = await userCtx(userId);
  if (!u) return null;
  const locale = u.language || 'en';
  const vars = { name: u.name, ...(opts.vars || {}) };
  const title = opts.title || i18n.t(locale, opts.titleKey, vars);
  const body = opts.body || (opts.bodyKey ? i18n.t(locale, opts.bodyKey, vars) : '');
  const want = opts.channels || ['inapp', 'push', 'email'];
  const used = [];

  let id = null;
  if (want.includes('inapp') && (u.notify_inapp || opts.security)) {
    const r = await db.q('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?,?,?,?,?)', [userId, opts.type, title.slice(0, 190), body.slice(0, 1000), opts.link || null]);
    id = r.insertId; used.push('inapp');
  }
  if (want.includes('push') && u.notify_push) {
    push.sendToUser(userId, { title, body, link: opts.link || '/app/notifications', tag: opts.type }).catch(() => {});
    used.push('push');
  }
  const emailOk = opts.security ? (u.notify_security && settings.bool('notify_security_email')) : u.notify_email;
  if (want.includes('email') && opts.email && emailOk) {
    mailer.send({ to: u.email, userId, template: opts.email.template, locale, vars: { ...vars, ...(opts.email.vars || {}) }, cta: opts.email.cta }).catch(() => {});
    used.push('email');
  }
  if (id) await db.q('UPDATE notifications SET channels=? WHERE id=?', [used.join(','), id]);
  return id;
}

module.exports = { notify, userCtx };
