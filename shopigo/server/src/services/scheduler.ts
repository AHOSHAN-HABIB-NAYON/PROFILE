import { sql } from 'kysely';
import { logger } from '../core/logger.js';
import { isInstalledSync, maintenance } from '../core/state.js';
import { syncShipmentStatus } from '../couriers/index.js';
import { db } from '../db/index.js';
import { autoBackupTick } from './backup.js';
import { changeStatus } from './orders.js';
import { settings, systemState } from './settings.js';
import { checkFeed } from './updater.js';

/**
 * Lightweight in-process scheduler (no cron needed on shared hosting).
 * Each job is guarded so slow runs never overlap.
 */
const running = new Set<string>();

function every(name: string, ms: number, fn: () => Promise<void>, initialDelay = 30_000) {
  const run = async () => {
    if (running.has(name) || !isInstalledSync() || maintenance().enabled) return;
    running.add(name);
    try { await fn(); } catch (err) { logger.error({ err, job: name }, 'scheduled job failed'); } finally { running.delete(name); }
  };
  setTimeout(() => { void run(); setInterval(run, ms).unref(); }, initialDelay).unref();
}

export function startScheduler(): void {
  if (process.env.SHOPIGO_DISABLE_SCHEDULER === 'true') return;

  every('backup', 5 * 60_000, autoBackupTick);

  every('courier-sync', 30 * 60_000, async () => {
    const rows = await db().selectFrom('orders').select(['id', 'status']).where('status', 'in', ['courier_sent', 'in_transit']).where('consignment_id', 'is not', null).where('deleted_at', 'is', null)
      .where('updated_at', '<', new Date(Date.now() - 25 * 60_000)).orderBy('updated_at').limit(40).execute();
    for (const o of rows) {
      try {
        const r = await syncShipmentStatus(o.id);
        if (r.mapped && r.mapped !== o.status) await changeStatus(o.id, r.mapped, null, `Courier status: ${r.status}`);
        else await db().updateTable('orders').set({ updated_at: new Date() }).where('id', '=', o.id).execute();
      } catch (err) {
        logger.warn({ order: o.id, err: (err as Error).message }, 'courier sync failed');
        await db().updateTable('orders').set({ updated_at: new Date() }).where('id', '=', o.id).execute();
      }
    }
  }, 90_000);

  every('housekeeping', 6 * 3600_000, async () => {
    const now = new Date();
    await db().deleteFrom('admin_sessions').where((eb) => eb.or([eb('expires_at', '<', now), eb('revoked_at', '<', new Date(Date.now() - 30 * 86400_000))])).execute();
    for (const t of ['blocked_ips', 'blocked_devices', 'blocked_phones'] as const) {
      await db().deleteFrom(t).where('expires_at', 'is not', null).where('expires_at', '<', new Date(Date.now() - 30 * 86400_000)).execute();
    }
    const days = Math.max(30, await settings.num('analytics_retention_days'));
    await db().deleteFrom('analytics_events').where('created_at', '<', new Date(Date.now() - days * 86400_000)).limit(50000).execute();
    await db().deleteFrom('notifications').where('is_read', '=', 1).where('created_at', '<', new Date(Date.now() - 90 * 86400_000)).execute();
    await db().deleteFrom('fraud_events').where('created_at', '<', sql<Date>`NOW() - INTERVAL 365 DAY`).execute();
  }, 120_000);

  every('update-check', 24 * 3600_000, async () => {
    if (!(await settings.str('update_feed_url'))) return;
    const last = await systemState.get<{ at: string } | null>('last_update_check', null);
    if (last && Date.now() - new Date(last.at).getTime() < 20 * 3600_000) return;
    await checkFeed();
  }, 5 * 60_000);
}
