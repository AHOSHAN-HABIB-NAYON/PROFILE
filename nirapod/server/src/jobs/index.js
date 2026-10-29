// Scheduled jobs (Phase 3): stale-device detection and location-history retention.
// Each run is recorded in job_runs (shown in admin system health). Run in-process (node-cron style intervals in
// index.js) or from system/hPanel cron via scripts/run-jobs.js.
import { raiseAlert } from '../tracking/alerts.js';
import { familyPlan } from '../users/presenter.js';
import { stayedWithin } from '../safety/geo.js';
import { partsIn as inZone, formatLocalTime } from '../tz/index.js';
import { visibleMembers } from '../family/visibility.js';
import { emailAllowed } from '../routes/notifications.js';
import { t } from '../push/strings.js';
import { expireSubscriptions } from '../routes/billing.js';
import { purgeExports } from '../routes/data-rights.js';

export const OFFLINE_AFTER_MS = 15 * 60_000;

export async function runJob(db, clock, name, fn) {
  const startedAt = clock.now();
  const [id] = await db('job_runs').insert({ job: name, status: 'running', started_at: startedAt });
  try {
    const affected = await fn();
    await db('job_runs').where({ id }).update({ status: 'ok', affected: affected ?? 0, finished_at: clock.now() });
    return affected;
  } catch (e) {
    await db('job_runs').where({ id }).update({ status: 'failed', error: String(e?.code || e?.name || 'error').slice(0, 200), finished_at: clock.now() });
    throw e;
  }
}

/** No update for 15 minutes -> "last seen X min ago, phone may be off or offline" (once until it reports again). */
export async function detectStaleDevices(ctx) {
  const { db, clock } = ctx;
  const now = clock.now();
  const cutoff = new Date(now.getTime() - OFFLINE_AFTER_MS);
  const rows = await db('child_devices as d')
    .join('family_members as m', function join() { this.on('m.user_id', 'd.user_id').andOn('m.family_id', 'd.family_id'); })
    .join('users as u', 'u.id', 'd.user_id')
    .whereNull('d.revoked_at').whereNull('m.left_at').where('u.status', 'active')
    .whereNotNull('d.last_seen_at').where('d.last_seen_at', '<', cutoff).whereNull('d.offline_alerted_at')
    .select('d.id as device_id', 'd.family_id', 'd.last_seen_at', 'd.location_state', 'u.id', 'u.uuid', 'u.name');
  for (const r of rows) {
    const minutes = Math.round((now - new Date(r.last_seen_at)) / 60_000);
    const reason = r.location_state && r.location_state !== 'ok' && r.location_state !== 'unknown' ? r.location_state : 'phone_off_or_offline';
    await raiseAlert(ctx, { familyId: r.family_id, subject: r, type: 'offline', data: { minutes, reason }, now });
    await db('child_devices').where({ id: r.device_id }).update({ offline_alerted_at: now });
  }
  return rows.length;
}

/** Deletes location history older than each family's plan allows (Free 3, Premium 30, Family Plus 90 days). */
export async function purgeLocationHistory(ctx) {
  const { db, clock } = ctx;
  const now = clock.now();
  let deleted = 0;
  const families = await db('families').select('id');
  for (const f of families) {
    const plan = await familyPlan(db, f.id, now);
    const days = plan?.history_days ?? 3;
    const before = new Date(now.getTime() - days * 24 * 3600_000);
    deleted += await db('locations').where({ family_id: f.id }).where('recorded_at', '<', before).del();
    deleted += await db('timeline_events').where({ family_id: f.id }).where('occurred_at', '<', before).del();
  }
  // Locations of families that no longer exist are removed by FK cascade; nothing else keeps coordinates.
  return deleted;
}

/** Safe walk not finished on time, or stopped in one spot too long, each alerted once per walk. */
export const STOPPED_AFTER_MS = 10 * 60_000;
export const STOPPED_RADIUS_M = 50;
export async function watchTrips(ctx) {
  const { db, clock, realtime } = ctx;
  const now = clock.now();
  const trips = await db('trips as t').join('users as u', 'u.id', 't.user_id')
    .where('t.status', 'active').select('t.*', 'u.uuid as user_uuid', 'u.name as user_name');
  let n = 0;
  for (const t of trips) {
    const subject = { id: t.user_id, uuid: t.user_uuid, name: t.user_name };
    const changed = {};
    if (!t.overdue_alerted_at && new Date(t.expected_arrival_at) <= now) {
      await raiseAlert(ctx, { familyId: t.family_id, subject, type: 'safe_walk_overdue', now, data: { expected_at: new Date(t.expected_arrival_at).toISOString() } });
      changed.overdue_alerted_at = now;
    }
    if (now - new Date(t.started_at) >= STOPPED_AFTER_MS) {
      const pts = await db('locations').where({ user_id: t.user_id }).where('recorded_at', '>=', new Date(now - STOPPED_AFTER_MS))
        .orderBy('recorded_at', 'asc').select('lat', 'lng', 'recorded_at');
      // Enough coverage of the window: the first point is near its start.
      const covered = pts.length >= 2 && new Date(pts[0].recorded_at) - (now - STOPPED_AFTER_MS) < 3 * 60_000;
      const still = covered && stayedWithin(pts, STOPPED_RADIUS_M);
      if (still && !t.stopped_alerted_at) {
        await raiseAlert(ctx, { familyId: t.family_id, subject, type: 'safe_walk_stopped', now, data: { minutes: STOPPED_AFTER_MS / 60_000 } });
        changed.stopped_alerted_at = now;
      } else if (!still && t.stopped_alerted_at && pts.length >= 2) {
        changed.stopped_alerted_at = null; // moving again: re-arm
      }
    }
    if (Object.keys(changed).length) {
      await db('trips').where({ id: t.id }).update(changed);
      n += 1;
      realtime?.emitToUsers([t.user_uuid], 'trip.updated', { id: t.uuid, status: 'active' }, now);
    }
  }
  return n;
}

/** Daily family summary email at each adult's chosen local hour (once per local day). */
export async function sendDailySummaries(ctx) {
  const { db, clock, mailer } = ctx;
  const now = clock.now();
  const users = await db('users as u').join('family_members as m', 'm.user_id', 'u.id')
    .whereNotNull('u.daily_summary_hour').whereNull('m.left_at').whereIn('m.role', ['parent', 'guardian']).where('u.status', 'active')
    .whereNotNull('u.email').select('u.id', 'u.email', 'u.language', 'u.timezone', 'u.daily_summary_hour', 'u.daily_summary_sent_on', 'm.family_id');
  let n = 0;
  for (const u of users) {
    const zone = u.timezone || 'UTC';
    const local = inZone(now, zone);
    const day = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
    const sent = u.daily_summary_sent_on ? new Date(u.daily_summary_sent_on).toISOString().slice(0, 10) : null;
    if (local.hour !== u.daily_summary_hour || sent === day) continue;
    if (!(await emailAllowed(db, u.id, 'daily_summary'))) continue;
    const members = (await visibleMembers(db, u.family_id, u.id)).filter((m) => m.user_id !== u.id);
    const since = new Date(now.getTime() - 24 * 3600_000);
    const lines = [];
    for (const m of members) {
      const last = await db('locations').where({ user_id: m.user_id }).where('recorded_at', '>=', since).orderBy('recorded_at', 'desc').first('recorded_at', 'battery_pct');
      lines.push(last
        ? t(u.language, 'email.summary_line', { name: m.name, time: formatLocalTime(new Date(last.recorded_at), zone, { language: 'en' }), battery: last.battery_pct ?? '—' })
        : t(u.language, 'email.summary_line_none', { name: m.name }));
    }
    const events = Number((await db('timeline_events').where({ family_id: u.family_id }).where('occurred_at', '>=', since).count({ n: '*' }).first()).n);
    lines.push(t(u.language, 'email.summary_events', { count: events }));
    await mailer.send('daily_summary', u, { date: day, lines });
    await db('users').where({ id: u.id }).update({ daily_summary_sent_on: day });
    n += 1;
  }
  return n;
}

export const JOBS = {
  subscriptions_expire: { everyMs: 10 * 60_000, run: expireSubscriptions },
  daily_summary: { everyMs: 10 * 60_000, run: sendDailySummaries },
  trips_watch: { everyMs: 60_000, run: watchTrips },
  stale_devices: { everyMs: 60_000, run: detectStaleDevices },
  location_retention: { everyMs: 6 * 3600_000, run: purgeLocationHistory },
  exports_purge: { everyMs: 6 * 3600_000, run: purgeExports },
};

/** Starts in-process intervals (VPS). Returns a stop() function. */
export function startScheduler(ctx) {
  const timers = Object.entries(JOBS).map(([name, j]) => setInterval(() => {
    runJob(ctx.db, ctx.clock, name, () => j.run(ctx)).catch((e) => ctx.logger.warn({ err: e, job: name }, 'job failed'));
  }, j.everyMs));
  return () => timers.forEach(clearInterval);
}
