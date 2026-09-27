'use strict';
/**
 * Background jobs (single process or multiple — reminders are claimed atomically).
 * - delivers due reminders through in-app / email / push
 * - housekeeping of expired tokens and challenges
 */
const db = require('../db');
const { notify } = require('./notify');
const settings = require('./settings');

const fmtMoney = (amount, cur) => {
  const c = settings.currencies().find((x) => x.code === cur);
  return `${c ? c.symbol : cur + ' '}${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};

async function processReminders() {
  const due = await db.q(`SELECT r.*, COALESCE(l.currency, b.currency, pr.currency, 'BDT') AS currency,
      COALESCE(l.person_name, b.person_name) AS person
    FROM reminders r
    LEFT JOIN loans_lent l ON r.ref_type='lent' AND l.id=r.ref_id
    LEFT JOIN loans_borrowed b ON r.ref_type='borrowed' AND b.id=r.ref_id
    LEFT JOIN user_profiles pr ON pr.user_id=r.user_id
    WHERE r.sent_at IS NULL AND r.done_at IS NULL AND r.remind_at <= NOW()
    ORDER BY r.remind_at LIMIT 100`);
  for (const r of due) {
    const claim = await db.q('UPDATE reminders SET sent_at=NOW() WHERE id=? AND sent_at IS NULL', [r.id]);
    if (!claim.affectedRows) continue; // another worker took it
    try {
      const pr = await db.one('SELECT timezone, language FROM user_profiles WHERE user_id=?', [r.user_id]);
      const due = new Intl.DateTimeFormat(pr?.language === 'bn' ? 'bn-BD' : pr?.language === 'hi' ? 'hi-IN' : 'en-GB', { day: 'numeric', month: 'long', timeZone: pr?.timezone || 'Asia/Dhaka' }).format(r.due_at);
      const amount = r.amount ? fmtMoney(r.amount, r.currency) : '';
      const vars = { person: r.person || '', amount, due, title: r.title };
      const map = {
        lend: { type: 'lend_reminder', titleKey: 'notif.lend.title', bodyKey: 'notif.lend.body', template: 'lend_reminder', link: '/app/loans' },
        borrow: { type: 'borrow_reminder', titleKey: 'notif.borrow.title', bodyKey: 'notif.borrow.body', template: 'borrow_reminder', link: '/app/loans' },
      };
      const m = map[r.type] || { type: `${r.type}_reminder`, titleKey: 'notif.reminder.title', bodyKey: null, template: 'due_reminder', link: '/app/reminders' };
      await notify(r.user_id, {
        type: m.type, titleKey: m.titleKey, bodyKey: m.bodyKey, body: m.bodyKey ? null : (r.body || r.title), vars, link: m.link,
        email: { template: m.template, vars, cta: { link: settings.siteUrl() + m.link } },
      });
      if (r.repeat_rule !== 'none') {
        const unit = { daily: 'DAY', weekly: 'WEEK', monthly: 'MONTH', yearly: 'YEAR' }[r.repeat_rule];
        await db.q(`UPDATE reminders SET remind_at=DATE_ADD(remind_at, INTERVAL 1 ${unit}), due_at=DATE_ADD(due_at, INTERVAL 1 ${unit}), sent_at=NULL WHERE id=?`, [r.id]);
      }
    } catch (e) { console.error('[scheduler] reminder', r.id, e.message); }
  }
}

async function housekeeping() {
  await db.q('DELETE FROM auth_challenges WHERE expires_at < NOW()');
  await db.q('DELETE FROM login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)');
  await db.q('DELETE FROM sessions WHERE (expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY)) OR (revoked_at IS NOT NULL AND revoked_at < DATE_SUB(NOW(), INTERVAL 30 DAY))');
  await db.q('DELETE FROM otp_codes WHERE expires_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
}

let timers = [];
function start() {
  stop();
  const safe = (fn) => () => fn().catch((e) => console.error('[scheduler]', e.message));
  timers.push(setInterval(safe(processReminders), 60e3));
  timers.push(setInterval(safe(housekeeping), 6 * 3600e3));
  setTimeout(safe(processReminders), 5e3);
  setTimeout(safe(housekeeping), 15e3);
}
function stop() { timers.forEach(clearInterval); timers = []; }

module.exports = { start, stop, processReminders, fmtMoney };
