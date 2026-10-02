'use strict';
/**
 * Admin-originated messages over several channels: in-app (header bell),
 * email and browser push. Recipients: everyone, or a list of users by email.
 * Each user's own preferences (notify_email / notify_push) are respected.
 */
const db = require('../config/database');
const config = require('../config/env');
const notifications = require('../models/notification');
const mailer = require('./mailer');
const push = require('./push');
const logger = require('../utils/logger');
const v = require('../utils/validate');
const { E } = require('../utils/errors');

/** Parse "a@x.com, b@y.com" into user ids (throws if any email is unknown). */
async function resolveEmails(raw) {
  const emails = [...new Set(String(raw || '').split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))].slice(0, 500);
  if (!emails.length) throw E.badRequest('Enter at least one user email');
  emails.forEach((e) => v.email(e));
  const rows = await db.query("SELECT id, email FROM users WHERE email IN (?) AND status = 'active'", [emails]);
  const found = new Set(rows.map((r) => r.email.toLowerCase()));
  const missing = emails.filter((e) => !found.has(e));
  if (missing.length) throw E.badRequest(`User not found: ${missing.slice(0, 3).join(', ')}`);
  return rows.map((r) => r.id);
}

function emailInBackground(users, { title, body, link }) {
  const url = link ? `${config.appUrl || ''}${link}` : config.appUrl || '';
  (async () => {
    for (const u of users) {
      // Sequential on purpose: SMTP hosts throttle bursts.
      await mailer.send({ to: u.email, subject: title, title, text: body || title, cta: url ? { url, label: 'Open Premium Aura' } : undefined }).catch(() => {});
    }
  })().catch((err) => logger.warn(`email broadcast: ${err.message}`));
}

/**
 * @param {{ to: 'all'|'users', userIds?: number[], type?: string, title: string, body?: string, link?: string,
 *           channels: { inapp?: boolean, email?: boolean, push?: boolean } }} msg
 */
async function deliver({ to, userIds = [], type = 'system', title, body = null, link = null, channels }) {
  const out = { inapp: 0, email: 0, push: 0 };
  const all = to === 'all';
  if (!all && !userIds.length) return out;
  if (channels.inapp) {
    if (all) out.inapp = await notifications.broadcast({ type, title, body, link });
    else { for (const id of userIds) await notifications.notify(id, { type, title, body, link, push: false }); out.inapp = userIds.length; }
  }
  if (channels.email) {
    const users = await db.query(
      `SELECT email FROM users WHERE status = 'active' AND notify_email = 1 ${all ? '' : 'AND id IN (?)'}`, all ? [] : [userIds],
    );
    out.email = users.length;
    emailInBackground(users, { title, body, link });
  }
  if (channels.push) {
    // count subscribed devices now, send in the background
    const [{ n }] = await db.query(
      `SELECT COUNT(DISTINCT s.user_id) AS n FROM push_subscriptions s JOIN users u ON u.id = s.user_id
       WHERE u.status = 'active' AND u.notify_push = 1 ${all ? '' : 'AND u.id IN (?)'}`, all ? [] : [userIds],
    );
    out.push = Number(n);
    const msg = { title, body: body || '', link: link || '/' };
    (all ? push.sendToAll(msg) : push.sendToUsers(userIds, msg)).catch(() => {});
  }
  return out;
}

/** Read the shared "notify" form fields (to, emails, title, body, channels). */
async function fromRequest(b, defaults = {}) {
  const to = v.oneOf(b.notify_to || b.to, ['all', 'users'], { def: 'all' });
  const userIds = to === 'users' ? await resolveEmails(b.notify_users || b.user_email) : [];
  const channels = {
    inapp: b.ch_inapp === undefined ? true : v.bool(b.ch_inapp),
    email: v.bool(b.ch_email),
    push: b.ch_push === undefined ? true : v.bool(b.ch_push),
  };
  if (!channels.inapp && !channels.email && !channels.push) throw E.badRequest('Choose at least one channel');
  const title = v.str(b.notify_title ?? b.title ?? defaults.title, { name: 'Title', required: true, max: 160 });
  const body = v.str(b.notify_body ?? b.body ?? defaults.body, { name: 'Message', max: 500 }) || null;
  return { to, userIds, title, body, channels };
}

const summary = (o) => [o.inapp && `${o.inapp} in-app`, o.email && `${o.email} email`, o.push && `${o.push} push`].filter(Boolean).join(' · ') || 'nobody';

module.exports = { deliver, fromRequest, resolveEmails, summary };
