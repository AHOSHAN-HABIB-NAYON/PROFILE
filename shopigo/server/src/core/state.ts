import fs from 'node:fs';
import { sql } from 'kysely';
import { config } from './env.js';
import { hmac } from './crypto.js';
import { logger } from './logger.js';
import { INSTALL_LOCK, MAINTENANCE_FILE } from './paths.js';

/**
 * Installation state.
 *
 * The app is "installed" when storage/install.lock exists and its signature
 * matches APP_SECRET. As a second line of defence the database is also
 * checked: if the lock was lost (e.g. storage wiped) but the configured DB
 * contains an installed ShopiGo, the lock is re-created instead of showing
 * the installer — an installed store can never fall back into setup.
 */
export interface InstallLock { installation_id: string; version: string; installed_at: string; signature: string }

let installed: boolean | null = null;

function lockSignature(id: string, at: string) {
  return hmac(`shopigo-install:${id}:${at}`);
}

export function readLock(): InstallLock | null {
  try {
    return JSON.parse(fs.readFileSync(INSTALL_LOCK, 'utf8')) as InstallLock;
  } catch {
    return null;
  }
}

export function writeLock(installationId: string, version: string): void {
  const at = new Date().toISOString();
  const lock: InstallLock = { installation_id: installationId, version, installed_at: at, signature: lockSignature(installationId, at) };
  const tmp = INSTALL_LOCK + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(lock, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, INSTALL_LOCK);
  installed = true;
}

export function isInstalledSync(): boolean {
  if (installed !== null) return installed;
  const lock = readLock();
  if (lock) {
    // A lock file always blocks the installer, even if the signature does not
    // verify (e.g. APP_SECRET rotated). The mismatch is only logged.
    if (config.appSecret && lock.signature !== lockSignature(lock.installation_id, lock.installed_at)) {
      logger.warn('install.lock signature mismatch — installer stays disabled');
    }
    installed = true;
    return true;
  }
  return false;
}

/** Async boot check that can recover a lost lock from the database. */
export async function detectInstallation(getDb: () => import('kysely').Kysely<any>): Promise<boolean> {
  if (isInstalledSync()) return true;
  if (!config.dbConfigured) { installed = false; return false; }
  try {
    const db = getDb();
    const rows = await sql<{ installation_id: string; version: string; status: string }>`SELECT installation_id, version, status FROM installation WHERE id = 1`.execute(db);
    const row = rows.rows[0];
    if (row && row.status === 'installed') {
      logger.warn('install.lock missing but database is installed — recreating lock');
      writeLock(row.installation_id, row.version);
      return true;
    }
  } catch {
    // table does not exist → not installed
  }
  installed = false;
  return false;
}

export function markInstalled() { installed = true; }

export interface MaintenanceState { enabled: boolean; reason?: string; since?: string; bypassToken?: string }

export function maintenance(): MaintenanceState {
  try {
    return JSON.parse(fs.readFileSync(MAINTENANCE_FILE, 'utf8')) as MaintenanceState;
  } catch {
    return { enabled: false };
  }
}

export function setMaintenance(state: MaintenanceState): void {
  if (!state.enabled) {
    fs.rmSync(MAINTENANCE_FILE, { force: true });
    return;
  }
  fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify({ ...state, since: state.since ?? new Date().toISOString() }), { mode: 0o600 });
}
