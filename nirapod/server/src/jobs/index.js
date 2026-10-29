// Scheduled jobs (Phase 3): stale-device detection and location-history retention.
// Each run is recorded in job_runs (shown in admin system health). Run in-process (node-cron style intervals in
// index.js) or from system/hPanel cron via scripts/run-jobs.js.
import { raiseAlert } from '../tracking/alerts.js';
import { familyPlan } from '../users/presenter.js';

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

export const JOBS = {
  stale_devices: { everyMs: 60_000, run: detectStaleDevices },
  location_retention: { everyMs: 6 * 3600_000, run: purgeLocationHistory },
};

/** Starts in-process intervals (VPS). Returns a stop() function. */
export function startScheduler(ctx) {
  const timers = Object.entries(JOBS).map(([name, j]) => setInterval(() => {
    runJob(ctx.db, ctx.clock, name, () => j.run(ctx)).catch((e) => ctx.logger.warn({ err: e, job: name }, 'job failed'));
  }, j.everyMs));
  return () => timers.forEach(clearInterval);
}
