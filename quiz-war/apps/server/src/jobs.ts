import type { AppContext } from './context';
import { exec, query } from './db/pool';
import { addDays, bdDateKey } from './lib/time';

/**
 * Background jobs. Each job is idempotent so running several server instances is safe
 * (worst case a job runs twice). For large deployments move these to a single worker.
 */
export function startJobs(ctx: AppContext) {
  const timers: ReturnType<typeof setInterval>[] = [];
  const every = (ms: number, name: string, fn: () => Promise<unknown>) => {
    const run = () => fn().catch((err) => ctx.log.error({ err, job: name }, 'job failed'));
    const t = setInterval(run, ms);
    t.unref();
    timers.push(t);
    return run;
  };

  every(15_000, 'battle-request-sweep', () => ctx.battles.sweep());
  every(30_000, 'settings-refresh', () => ctx.settings.load(true));
  every(10 * 60_000, 'season-tick', () => ctx.seasons.tick((m) => ctx.log.info(m)));
  every(6 * 60 * 60_000, 'verified-auto', () => ctx.verified.autoGrant());
  every(60 * 60_000, 'cleanup', async () => {
    await exec('DELETE FROM webauthn_challenges WHERE expires_at < UTC_TIMESTAMP()');
    await exec('DELETE FROM email_tokens WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)');
    await exec('DELETE FROM user_sessions WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)');
    await exec(`UPDATE matches SET status = 'aborted', end_reason = 'stale' WHERE status IN ('lobby','active') AND created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR)`);
    await exec(`DELETE FROM leaderboards WHERE board LIKE 'daily:%' AND board < CONCAT('daily:', DATE_SUB(UTC_DATE(), INTERVAL 60 DAY))`);
  });

  // Evening (BD) reminders: streak about to expire / daily challenge ready.
  let lastReminderDay = '';
  every(5 * 60_000, 'streak-reminder', async () => {
    const now = new Date();
    const bdHour = (now.getUTCHours() + 6) % 24;
    const today = bdDateKey(now);
    if (bdHour < 19 || lastReminderDay === today) return;
    lastReminderDay = today;
    const rows = await query<{ user_id: number; streak_days: number }>(
      `SELECT p.user_id, p.streak_days FROM user_profiles p JOIN users u ON u.id = p.user_id
       WHERE u.status = 'active' AND p.streak_days >= 2 AND p.last_active_date = ? LIMIT 20000`,
      [addDays(today, -1)],
    );
    for (const r of rows) {
      await ctx.notifications.notify(
        r.user_id,
        {
          type: 'streak',
          title: { en: `Your ${r.streak_days}-day streak is about to expire!`, bn: `আপনার টানা ${r.streak_days} দিনের স্ট্রিক শেষ হতে চলেছে!` },
          body: { en: 'Play one quick battle today to keep it alive.', bn: 'স্ট্রিক ধরে রাখতে আজ একটা ছোট ব্যাটল খেলে নিন।' },
          url: '/',
        },
        { forcePush: true },
      );
    }
  });

  return () => timers.forEach(clearInterval);
}
