import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import { createConnection, format, type RowDataPacket } from 'mysql2/promise';
import * as tar from 'tar';
import { config } from '../core/env.js';
import { badRequest, notFound } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { BACKUP_DIR, ENV_FILE, INSTALL_LOCK, SHARED_ROOT, STORAGE_DIR, UPLOADS_DIR, safeJoin } from '../core/paths.js';
import { CODE_VERSION } from '../core/version.js';
import { db } from '../db/index.js';
import { notify } from './notifications.js';
import { settings, systemState } from './settings.js';

export type BackupType = 'database' | 'full' | 'config';

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

async function connect() {
  const c = config.db;
  return createConnection({ host: c.host, port: c.port, user: c.user, password: c.password, database: c.database, timezone: 'Z', dateStrings: true, multipleStatements: false, charset: 'utf8mb4_unicode_ci' });
}

/**
 * Pure-JS logical dump (no mysqldump binary needed on shared hosting).
 * One statement per line so restore can stream it back safely.
 */
export async function dumpDatabase(outFile: string): Promise<number> {
  const conn = await connect();
  const gzip = zlib.createGzip({ level: 6 });
  const out = fs.createWriteStream(outFile, { mode: 0o600 });
  const done = pipeline(gzip, out);
  const write = (s: string) => new Promise<void>((resolve) => { if (!gzip.write(s)) gzip.once('drain', resolve); else resolve(); });
  let rowsTotal = 0;
  try {
    await conn.query("SET time_zone = '+00:00'");
    await write(`-- ShopiGo database backup\n-- version ${CODE_VERSION}\n-- created ${new Date().toISOString()}\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\nSET time_zone='+00:00';\n`);
    const [tables] = await conn.query<RowDataPacket[]>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE' ORDER BY table_name");
    for (const { t } of tables) {
      const table = String(t);
      const [[create]] = await conn.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${table.replace(/`/g, '')}\``);
      const ddl = String(create!['Create Table']).replace(/\r?\n/g, ' ');
      await write(`DROP TABLE IF EXISTS \`${table}\`;\n${ddl};\n`);
      const [cols] = await conn.query<RowDataPacket[]>(`SHOW COLUMNS FROM \`${table}\``);
      const names = cols.map((c) => `\`${c.Field}\``).join(',');
      let offset = 0;
      const batch = 500;
      for (;;) {
        const [rows] = await conn.query<RowDataPacket[]>(`SELECT * FROM \`${table}\` LIMIT ${batch} OFFSET ${offset}`);
        if (!rows.length) break;
        const values = rows.map((r) => format('(?)', [cols.map((c) => r[c.Field])])).join(',');
        await write(`INSERT INTO \`${table}\` (${names}) VALUES ${values.replace(/\r?\n/g, '\\n')};\n`);
        rowsTotal += rows.length;
        offset += rows.length;
        if (rows.length < batch) break;
      }
    }
    await write('SET FOREIGN_KEY_CHECKS=1;\n');
    gzip.end();
    await done;
  } catch (err) {
    gzip.destroy();
    await fsp.rm(outFile, { force: true });
    throw err;
  } finally {
    await conn.end();
  }
  return rowsTotal;
}

export async function restoreDatabase(sqlGzFile: string): Promise<void> {
  const conn = await connect();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    const rl = readline.createInterface({ input: fs.createReadStream(sqlGzFile).pipe(zlib.createGunzip()), crlfDelay: Infinity });
    for await (const line of rl) {
      const stmt = line.trim();
      if (!stmt || stmt.startsWith('--')) continue;
      await conn.query(stmt.endsWith(';') ? stmt.slice(0, -1) : stmt);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  } finally {
    await conn.end();
  }
}

async function record(type: BackupType, file: string, status: string, note: string | null, adminId: number | null) {
  const size = fs.existsSync(file) ? (await fsp.stat(file)).size : 0;
  const r = await db().insertInto('backups').values({ type, file: path.basename(file), size, status, note, created_by: adminId }).executeTakeFirst();
  return { id: Number(r.insertId), file: path.basename(file), size };
}

export async function createBackup(type: BackupType, adminId: number | null, note: string | null = null): Promise<{ id: number; file: string; size: number }> {
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
  const ts = stamp();
  const tmpDir = path.join(STORAGE_DIR, 'tmp', `backup-${ts}-${process.pid}`);
  try {
    if (type === 'database') {
      const file = path.join(BACKUP_DIR, `shopigo-db-${ts}.sql.gz`);
      await dumpDatabase(file);
      return await record(type, file, 'completed', note, adminId);
    }
    await fsp.mkdir(tmpDir, { recursive: true });
    const entries: string[] = [];
    if (fs.existsSync(ENV_FILE)) { await fsp.copyFile(ENV_FILE, path.join(tmpDir, 'env')); entries.push('env'); }
    if (fs.existsSync(INSTALL_LOCK)) { await fsp.copyFile(INSTALL_LOCK, path.join(tmpDir, 'install.lock')); entries.push('install.lock'); }
    const manifest = { type, version: CODE_VERSION, created_at: new Date().toISOString(), installation_id: process.env.INSTALLATION_ID ?? null };
    await fsp.writeFile(path.join(tmpDir, 'backup.json'), JSON.stringify(manifest, null, 2));
    entries.push('backup.json');
    const settingsRows = await db().selectFrom('site_settings').selectAll().execute();
    await fsp.writeFile(path.join(tmpDir, 'settings.json'), JSON.stringify(settingsRows, null, 2));
    entries.push('settings.json');
    if (type === 'full') {
      await dumpDatabase(path.join(tmpDir, 'database.sql.gz'));
      entries.push('database.sql.gz');
    }
    const file = path.join(BACKUP_DIR, `shopigo-${type}-${ts}.tar.gz`);
    await tar.c({ gzip: true, file, cwd: tmpDir, portable: true, mode: 0o600 } as tar.TarOptionsWithAliasesAsyncFile, entries);
    if (type === 'full' && fs.existsSync(UPLOADS_DIR)) {
      // Append uploads as a second archive to avoid copying them into tmp.
      const uploadsFile = path.join(BACKUP_DIR, `shopigo-${type}-${ts}-uploads.tar.gz`);
      await tar.c({ gzip: true, file: uploadsFile, cwd: SHARED_ROOT, portable: true } as tar.TarOptionsWithAliasesAsyncFile, ['uploads']);
      await record(type, uploadsFile, 'completed', 'Uploads archive for ' + path.basename(file), adminId);
    }
    return await record(type, file, 'completed', note, adminId);
  } catch (err) {
    logger.error({ err }, 'backup failed');
    await db().insertInto('backups').values({ type, file: `failed-${ts}`, size: 0, status: 'failed', note: (err as Error).message.slice(0, 500), created_by: adminId }).execute().catch(() => {});
    await notify('backup', 'Backup failed', (err as Error).message);
    throw err;
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
    await applyRetention().catch(() => {});
  }
}

export function backupPath(file: string): string {
  if (!/^shopigo-[a-z]+-[\w-]+\.(sql\.gz|tar\.gz)$/.test(file)) throw badRequest('Invalid backup file');
  const p = safeJoin(BACKUP_DIR, file);
  if (!fs.existsSync(p)) throw notFound('Backup file not found');
  return p;
}

/** Restores the database from a .sql.gz or a full/config .tar.gz backup. */
export async function restoreBackup(file: string): Promise<void> {
  const p = backupPath(file);
  if (p.endsWith('.sql.gz')) return restoreDatabase(p);
  const tmpDir = path.join(STORAGE_DIR, 'tmp', `restore-${Date.now()}`);
  await fsp.mkdir(tmpDir, { recursive: true });
  try {
    await tar.x({ file: p, cwd: tmpDir, strict: true, filter: (entry) => !entry.includes('..') && ['database.sql.gz', 'backup.json', 'settings.json', 'env', 'install.lock'].includes(entry.replace(/^\.\//, '')) });
    const dump = path.join(tmpDir, 'database.sql.gz');
    if (!fs.existsSync(dump)) throw badRequest('This backup does not contain a database dump (configuration backups are for manual recovery)');
    await restoreDatabase(dump);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function applyRetention(): Promise<void> {
  const keep = Math.max(1, await settings.num('backup_retention'));
  const rows = await db().selectFrom('backups').select(['id', 'file', 'note']).where('status', '=', 'completed').orderBy('id', 'desc').execute();
  // Backups taken right before an update are kept for rollback.
  const candidates = rows.filter((r) => !(r.note ?? '').startsWith('pre-update'));
  for (const r of candidates.slice(keep * 2)) {
    await fsp.rm(safeJoin(BACKUP_DIR, r.file), { force: true });
    await db().deleteFrom('backups').where('id', '=', r.id).execute();
  }
}

/** Called every few minutes by the scheduler. */
export async function autoBackupTick(): Promise<void> {
  if (!(await settings.bool('backup_auto_enabled'))) return;
  const tz = await settings.str('timezone');
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date()));
  if (hour !== (await settings.num('backup_hour'))) return;
  const last = await systemState.get<string | null>('last_auto_backup', null);
  const minGap = (await settings.str('backup_frequency')) === 'weekly' ? 6.5 * 86400_000 : 20 * 3600_000;
  if (last && Date.now() - new Date(last).getTime() < minGap) return;
  await systemState.set('last_auto_backup', new Date().toISOString());
  const type = (await settings.str('backup_type')) === 'full' ? 'full' : 'database';
  await createBackup(type, null, 'Automatic backup');
  logger.info({ type }, 'automatic backup completed');
}
