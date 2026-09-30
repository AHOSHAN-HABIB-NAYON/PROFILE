/* ─────────────────────────────────────────────
   অ্যাপের ভেতরের শিডিউলার — একটাই প্রসেসে সব কাজ (আলাদা cron প্রসেস লাগে না)
   প্রতি মিনিটে: নোটিফিকেশন ব্যাচ → মেইল কিউ → সারসংক্ষেপ/রিমাইন্ডার (সময় হলে) → অটোমেশন (সময় হলে)
   DB-লিজ দিয়ে একই সময়ে দুইবার চলা ঠেকানো হয় (hPanel cron + অ্যাপের ভেতর দুটোই থাকলেও সমস্যা নেই)।
   ───────────────────────────────────────────── */
import crypto from 'node:crypto';
import { run, one } from '../../db.js';
import { setting, setSetting, settingInt } from '../../core/settings.js';
import { processNotifyJobs, sendDailyDigest, sendReminders } from '../notify/jobs.js';
import { drainQueue } from '../notify/mailer.js';
import { runAuto, isRunning } from '../automation/engine.js';
import { nowStr } from '../../core/bn.js';

const holder = `${process.pid}-${crypto.randomBytes(3).toString('hex')}`;
let busy = false; let timer; let lastTick = 0;

async function lease() {
  await run(`INSERT INTO job_locks (name, holder, until_at) VALUES ('tick', ?, DATE_ADD(NOW(), INTERVAL 55 SECOND))
    ON DUPLICATE KEY UPDATE holder = IF(until_at < NOW(), VALUES(holder), holder), until_at = IF(holder = VALUES(holder), VALUES(until_at), until_at)`, [holder]);
  const r = await one("SELECT holder FROM job_locks WHERE name = 'tick'");
  return r?.holder === holder;
}

export async function tick() {
  if (busy) return { busy: true };
  busy = true; lastTick = Date.now();
  try {
    if (!(await lease())) return { busy: true };
    const out = {};
    for (let i = 0; i < 3; i++) { const r = await processNotifyJobs(); if (r.idle) break; out.notify = r; }
    out.mail = await drainQueue(15);
    out.digest = await sendDailyDigest(false); out.remind = await sendReminders(false);
    /* অটোমেশন */
    if (setting('auto_enabled', '0') === '1' && !(await isRunning())) {
      const mins = Math.max(5, settingInt('auto_interval', 30));
      const last = setting('auto_last_run', '');
      const lastMs = last ? Date.parse(last.replace(' ', 'T') + '+06:00') : 0;
      if (!lastMs || Date.now() - lastMs >= mins * 60_000) { runAuto({ manual: false }).catch((e) => console.error('[auto]', e.message)); out.auto = 'started'; }
    }
    return out;
  } catch (e) { console.error('[scheduler]', e.message); return { error: e.message }; }
  finally { busy = false; }
}

export function startScheduler() {
  if (timer) return;
  timer = setInterval(tick, 60_000); timer.unref?.();
  setTimeout(tick, 15_000).unref?.();
  console.log('✔ শিডিউলার চালু (প্রতি মিনিটে)');
}
export const lastTickAt = () => lastTick;
