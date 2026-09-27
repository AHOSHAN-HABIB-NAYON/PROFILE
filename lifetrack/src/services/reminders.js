'use strict';
const db = require('../db');
const { localToUtc } = require('../lib/time');

/** Build reminder rows for a due date respecting the user's schedule (days before + hour, in their timezone). */
async function scheduleForDue(t, userId, { type, title, body, amount, dueDate, refType, refId }) {
  const p = await t.one('SELECT timezone, reminder_days_before, reminder_hour FROM user_profiles WHERE user_id=?', [userId]);
  const tz = p?.timezone || 'Asia/Dhaka';
  const hour = p?.reminder_hour ?? 9;
  const dueAt = localToUtc(dueDate, hour, tz);
  const times = [dueAt];
  const days = Number(p?.reminder_days_before ?? 1);
  if (days > 0) times.unshift(new Date(dueAt.getTime() - days * 864e5));
  const now = Date.now();
  let created = 0;
  for (const at of times) {
    const remindAt = at.getTime() < now ? new Date(now + 60e3) : at;
    if (at.getTime() < now && created > 0) continue;
    await t.q('INSERT INTO reminders (user_id, type, title, body, amount, due_at, remind_at, ref_type, ref_id) VALUES (?,?,?,?,?,?,?,?,?)',
      [userId, type, title.slice(0, 160), body ? body.slice(0, 500) : null, amount || null, dueAt, remindAt, refType || null, refId || null]);
    created++;
  }
  return created;
}

async function cancelForRef(t, userId, refType, refId) {
  await t.q('UPDATE reminders SET done_at=NOW() WHERE user_id=? AND ref_type=? AND ref_id=? AND done_at IS NULL', [userId, refType, refId]);
}

module.exports = { scheduleForDue, cancelForRef };
