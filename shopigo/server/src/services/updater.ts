import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import { badRequest, conflict } from '../core/errors.js';
import { logger } from '../core/logger.js';
import { APP_ROOT, CURRENT_RELEASE_FILE, RELEASES_DIR, SHARED_ROOT, UPDATE_STAGING_DIR, safeJoin } from '../core/paths.js';
import { maintenance, setMaintenance } from '../core/state.js';
import { CODE_VERSION, compareVersions } from '../core/version.js';
import { db } from '../db/index.js';
import { createBackup, restoreBackup } from './backup.js';
import { notify } from './notifications.js';
import { settings, systemState } from './settings.js';

/**
 * Safe, versioned updates.
 *
 * Package (.tar.gz):
 *   manifest.json   { name, version, releaseDate, minVersion, changelog[], migrations[], files{path: sha256} }
 *   manifest.sig    base64 Ed25519 signature of manifest.json (vendor private key)
 *   release/…       complete application code (never contains .env, storage/ or uploads/)
 *
 * Apply: verify → backup DB + config → maintenance → unpack into releases/<v>
 * → install deps if lockfile changed → migrate (forward-only) → health check
 * → atomically switch storage/current-release → restart. Any failure after
 * migrations restores the pre-update database backup; the previous release
 * is never touched, so the store keeps running on the old version.
 */

export interface Manifest {
  name: string;
  version: string;
  releaseDate: string;
  minVersion?: string;
  changelog: string[];
  migrations?: string[];
  files: Record<string, string>;
}

export interface StagedUpdate { version: string; dir: string; manifest: Manifest; signed: boolean }

const PROTECTED = [/^release\/\.env$/, /^release\/\.env\.(?!example$)/, /^release\/storage(\/|$)/, /^release\/uploads(\/|$)/, /^release\/releases(\/|$)/];

let job: { running: boolean; version: string | null; log: string[]; status: 'idle' | 'running' | 'success' | 'failed'; startedAt: string | null } = { running: false, version: null, log: [], status: 'idle', startedAt: null };

export function updateJob() {
  return { ...job, log: [...job.log] };
}

function log(line: string) {
  const entry = `[${new Date().toISOString()}] ${line}`;
  job.log.push(entry);
  logger.info({ update: job.version }, line);
}

export function runningVersion(): string {
  return CODE_VERSION;
}

async function publicKey(): Promise<string | null> {
  const fromSettings = (await settings.str('update_public_key')).trim();
  if (fromSettings) return fromSettings;
  const bundled = path.join(APP_ROOT, 'server', 'update-public-key.pem');
  return fs.existsSync(bundled) ? fs.readFileSync(bundled, 'utf8') : null;
}

async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw badRequest(`Update packages may not contain symlinks (${entry.name})`);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

/** Extracts and fully verifies a package into storage/updates/<version>. */
export async function stagePackage(archive: string): Promise<StagedUpdate> {
  const tmp = path.join(UPDATE_STAGING_DIR, `extract-${Date.now()}`);
  await fsp.mkdir(tmp, { recursive: true });
  try {
    await tar.x({
      file: archive,
      cwd: tmp,
      strict: true,
      preservePaths: false,
      filter: (p, entry) => {
        const name = p.replace(/^\.\//, '');
        const type = (entry as { type?: string }).type;
        if (type === 'SymbolicLink' || type === 'Link') return false;
        if (name.split('/').includes('..') || path.isAbsolute(name)) return false;
        return name === 'manifest.json' || name === 'manifest.sig' || name.startsWith('release/');
      },
    });
    const manifestRaw = await fsp.readFile(path.join(tmp, 'manifest.json')).catch(() => { throw badRequest('manifest.json missing from package'); });
    const manifest = JSON.parse(manifestRaw.toString('utf8')) as Manifest;
    if (manifest.name !== 'shopigo' || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(manifest.version) || typeof manifest.files !== 'object') throw badRequest('Invalid update manifest');

    // Signature
    let signed = false;
    const key = await publicKey();
    const sigPath = path.join(tmp, 'manifest.sig');
    if (key && fs.existsSync(sigPath)) {
      const sig = Buffer.from((await fsp.readFile(sigPath, 'utf8')).trim(), 'base64');
      signed = crypto.verify(null, manifestRaw, crypto.createPublicKey(key), sig);
      if (!signed) throw badRequest('Update signature is invalid — package rejected');
    } else if (key) {
      throw badRequest('Update package is not signed');
    } else if (process.env.ALLOW_UNSIGNED_UPDATES !== 'true') {
      throw badRequest('No update signing key is configured (Settings → Updates). Unsigned packages are rejected unless ALLOW_UNSIGNED_UPDATES=true.');
    }

    // Checksums: every file listed must match, and nothing unlisted may exist.
    const files = await listFiles(path.join(tmp, 'release'));
    const listed = new Set(Object.keys(manifest.files));
    for (const f of files) {
      const rel = `release/${f}`;
      if (PROTECTED.some((re) => re.test(rel))) throw badRequest(`Package tries to overwrite protected data: ${rel}`);
      if (!listed.has(rel)) throw badRequest(`Unlisted file in package: ${rel}`);
      const actual = await sha256File(path.join(tmp, rel));
      if (actual !== manifest.files[rel]) throw badRequest(`Checksum mismatch: ${rel}`);
      listed.delete(rel);
    }
    if (listed.size) throw badRequest(`Package is incomplete (${[...listed][0]} missing)`);
    for (const required of ['release/app.js', 'release/package.json', 'release/server/dist/index.js', 'release/server/dist/cli.js', 'release/client/dist/index.html']) {
      if (!fs.existsSync(path.join(tmp, required))) throw badRequest(`Package is missing ${required}`);
    }

    const dir = path.join(UPDATE_STAGING_DIR, manifest.version);
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.rename(tmp, dir);
    return { version: manifest.version, dir, manifest, signed };
  } catch (err) {
    await fsp.rm(tmp, { recursive: true, force: true });
    if (err instanceof SyntaxError) throw badRequest('manifest.json is not valid JSON');
    throw err;
  }
}

export async function stagedUpdates(): Promise<Array<{ version: string; manifest: Manifest }>> {
  if (!fs.existsSync(UPDATE_STAGING_DIR)) return [];
  const out = [];
  for (const d of await fsp.readdir(UPDATE_STAGING_DIR)) {
    const mf = path.join(UPDATE_STAGING_DIR, d, 'manifest.json');
    if (/^\d+\.\d+\.\d+/.test(d) && fs.existsSync(mf)) out.push({ version: d, manifest: JSON.parse(await fsp.readFile(mf, 'utf8')) as Manifest });
  }
  return out.sort((a, b) => compareVersions(b.version, a.version));
}

export interface FeedEntry { version: string; releaseDate?: string; changelog?: string[]; url: string; sha256: string; minVersion?: string }

export async function checkFeed(): Promise<{ current: string; latest: FeedEntry | null; available: boolean }> {
  const url = await settings.str('update_feed_url');
  if (!url) throw badRequest('Update feed URL is not configured (Settings → Updates). You can also upload a package manually.');
  if (!/^https:\/\//.test(url)) throw badRequest('Update feed must use HTTPS');
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
  if (!res.ok) throw badRequest(`Update server responded with HTTP ${res.status}`);
  const body = (await res.json()) as { latest?: FeedEntry };
  const latest = body.latest ?? null;
  const available = Boolean(latest && compareVersions(latest.version, CODE_VERSION) > 0);
  await systemState.set('last_update_check', { at: new Date().toISOString(), latest: latest?.version ?? null });
  if (available && latest) {
    const notified = await systemState.get<string | null>('update_notified', null);
    if (notified !== latest.version) {
      await notify('update', `Update available: ${latest.version}`, (latest.changelog ?? []).slice(0, 3).join(' · '), '/admin/system/updates');
      await systemState.set('update_notified', latest.version);
    }
  }
  return { current: CODE_VERSION, latest, available };
}

export async function downloadFromFeed(): Promise<StagedUpdate> {
  const { latest, available } = await checkFeed();
  if (!latest || !available) throw badRequest('No newer version is available');
  if (!/^https:\/\//.test(latest.url)) throw badRequest('Package URL must use HTTPS');
  await fsp.mkdir(UPDATE_STAGING_DIR, { recursive: true });
  const file = path.join(UPDATE_STAGING_DIR, `download-${latest.version}.tar.gz`);
  const res = await fetch(latest.url, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok || !res.body) throw badRequest(`Download failed (HTTP ${res.status})`);
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(file));
  try {
    if ((await sha256File(file)) !== latest.sha256) throw badRequest('Downloaded package checksum does not match the feed');
    return await stagePackage(file);
  } finally {
    await fsp.rm(file, { force: true });
  }
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, SHOPIGO_SHARED: SHARED_ROOT, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${cmd} ${args.join(' ')} timed out`)); }, timeoutMs);
    child.stdout.on('data', (d) => { output += d; });
    child.stderr.on('data', (d) => { output += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim());
      else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}: ${output.trim().slice(-2000)}`));
    });
  });
}

async function copyDir(src: string, dest: string) {
  await fsp.cp(src, dest, { recursive: true, force: true, errorOnExist: false, verbatimSymlinks: true });
}

async function lockHash(dir: string): Promise<string | null> {
  const f = path.join(dir, 'package-lock.json');
  return fs.existsSync(f) ? sha256File(f) : null;
}

export async function applyUpdate(version: string, adminId: number | null): Promise<void> {
  if (job.running) throw conflict('An update is already running');
  const staged = (await stagedUpdates()).find((s) => s.version === version);
  if (!staged) throw badRequest('That version is not staged. Upload or download it first.');
  if (compareVersions(version, CODE_VERSION) <= 0) throw badRequest(`Version ${version} is not newer than the running version ${CODE_VERSION}`);
  if (staged.manifest.minVersion && compareVersions(CODE_VERSION, staged.manifest.minVersion) < 0) throw badRequest(`Version ${version} requires at least ${staged.manifest.minVersion}. Install intermediate updates first.`);

  job = { running: true, version, log: [], status: 'running', startedAt: new Date().toISOString() };
  const history = await db().insertInto('update_history').values({ from_version: CODE_VERSION, to_version: version, status: 'running', admin_id: adminId }).executeTakeFirst();
  const historyId = Number(history.insertId);
  // Run in background; the admin UI polls the job status.
  void (async () => {
    let backupFile: string | null = null;
    let migrated = false;
    const releaseDir = safeJoin(RELEASES_DIR, version);
    const wasInMaintenance = maintenance().enabled;
    try {
      log(`Updating ShopiGo ${CODE_VERSION} → ${version}`);
      log('Creating database backup…');
      const dbBackup = await createBackup('database', adminId, `pre-update ${CODE_VERSION}→${version}`);
      backupFile = dbBackup.file;
      log(`Database backup: ${dbBackup.file}`);
      const cfg = await createBackup('config', adminId, `pre-update config ${CODE_VERSION}→${version}`);
      log(`Configuration backup: ${cfg.file}`);
      await db().updateTable('update_history').set({ backup_file: backupFile }).where('id', '=', historyId).execute();

      setMaintenance({ enabled: true, reason: `Updating to ${version}` });
      log('Maintenance mode enabled (admins can still sign in)');

      log(`Installing release files into releases/${version}`);
      await fsp.rm(releaseDir, { recursive: true, force: true });
      await fsp.mkdir(RELEASES_DIR, { recursive: true });
      await copyDir(path.join(UPDATE_STAGING_DIR, version, 'release'), releaseDir);

      const [oldLock, newLock] = await Promise.all([lockHash(APP_ROOT), lockHash(releaseDir)]);
      const currentModules = path.join(APP_ROOT, 'node_modules');
      if (oldLock && oldLock === newLock && fs.existsSync(currentModules)) {
        log('Dependencies unchanged — linking existing node_modules');
        try { await fsp.symlink(currentModules, path.join(releaseDir, 'node_modules'), 'junction'); } catch {
          log('Symlinks not supported — copying node_modules (this can take a minute)');
          await copyDir(currentModules, path.join(releaseDir, 'node_modules'));
        }
      } else {
        log('Dependencies changed — running npm ci --omit=dev');
        const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        log(await run(npm, ['ci', '--omit=dev', '--no-audit', '--no-fund'], releaseDir, 15 * 60_000));
      }

      log('Running database migrations (forward-only, non-destructive)…');
      log(await run(process.execPath, [path.join(releaseDir, 'server', 'dist', 'cli.js'), 'migrate'], releaseDir, 10 * 60_000) || 'Migrations complete');
      migrated = true;

      log('Running health checks on the new release…');
      log(await run(process.execPath, [path.join(releaseDir, 'server', 'dist', 'cli.js'), 'health'], releaseDir, 2 * 60_000));

      log('Switching current release…');
      const tmp = CURRENT_RELEASE_FILE + '.tmp';
      await fsp.writeFile(tmp, version);
      await fsp.rename(tmp, CURRENT_RELEASE_FILE);
      try {
        const link = path.join(SHARED_ROOT, 'current');
        await fsp.rm(link, { force: true });
        await fsp.symlink(releaseDir, link, 'junction');
      } catch { /* pointer file is authoritative */ }

      await db().updateTable('installation').set({ version }).where('id', '=', 1).execute();
      await systemState.set('installed_version', version);
      await db().updateTable('update_history').set({ status: 'success', finished_at: new Date(), log: job.log.join('\n') }).where('id', '=', historyId).execute();
      await db().insertInto('audit_logs').values({ admin_id: adminId, action: 'system.update_installed', target_type: 'system', target_id: version, old_value: JSON.stringify({ version: CODE_VERSION }), new_value: JSON.stringify({ version }) }).execute();
      await fsp.rm(path.join(UPDATE_STAGING_DIR, version), { recursive: true, force: true });
      if (!wasInMaintenance) setMaintenance({ enabled: false });
      log(`Update to ${version} installed successfully. Restarting…`);
      job.status = 'success';
      await notify('update', `Updated to ${version}`, 'ShopiGo was updated successfully.', '/admin/system/updates');
      scheduleRestart();
    } catch (err) {
      const message = (err as Error).message;
      log(`ERROR: ${message}`);
      if (migrated && backupFile) {
        log('Restoring pre-update database backup…');
        try { await restoreBackup(backupFile); log('Database restored'); } catch (e) { log(`Database restore failed: ${(e as Error).message} — restore ${backupFile} manually from System → Backups`); }
      }
      await fsp.rm(releaseDir, { recursive: true, force: true }).catch(() => {});
      if (!wasInMaintenance) setMaintenance({ enabled: false });
      log(`Update failed. ShopiGo is still running version ${CODE_VERSION}.`);
      job.status = 'failed';
      await db().updateTable('update_history').set({ status: 'failed', finished_at: new Date(), log: job.log.join('\n') }).where('id', '=', historyId).execute().catch(() => {});
      await notify('update', `Update to ${version} failed`, message.slice(0, 300), '/admin/system/updates');
    } finally {
      job.running = false;
    }
  })();
}

/** Restart strategy — the launcher (app.js) loads the release named in storage/current-release. */
export function scheduleRestart(): void {
  const mode = process.env.SHOPIGO_RESTART_MODE ?? 'exit';
  setTimeout(() => {
    if (mode === 'none') return;
    if (mode === 'passenger') {
      const tmpDir = path.join(SHARED_ROOT, 'tmp');
      fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'restart.txt'), String(Date.now()));
      return;
    }
    logger.info('exiting so the process manager restarts ShopiGo on the new release');
    process.exit(0);
  }, 1500);
}

/**
 * Roll back to the previous code release. Migrations are additive, so the
 * older code keeps working on the newer schema and NO data is touched by
 * default. Restoring the pre-update database is a separate, explicit opt-in
 * because it discards everything written since the update.
 */
export async function rollback(historyId: number, adminId: number | null, restoreDb = false): Promise<string> {
  const h = await db().selectFrom('update_history').selectAll().where('id', '=', historyId).executeTakeFirst();
  if (!h || h.status !== 'success') throw badRequest('Only successful updates can be rolled back');
  if (h.to_version !== CODE_VERSION) throw badRequest(`The running version is ${CODE_VERSION}; only the latest update can be rolled back`);
  const target = h.from_version;
  const targetDir = path.join(RELEASES_DIR, target);
  const launcherRoot = process.env.SHOPIGO_LAUNCHER_ROOT || SHARED_ROOT;
  const rootVersion = JSON.parse(await fsp.readFile(path.join(launcherRoot, 'package.json'), 'utf8').catch(() => '{}')).version;
  if (!fs.existsSync(targetDir) && rootVersion !== target) throw badRequest(`Release ${target} is no longer available on disk`);
  if (restoreDb && !h.backup_file) throw badRequest('No pre-update backup is recorded for this update');
  setMaintenance({ enabled: true, reason: `Rolling back to ${target}` });
  try {
    if (restoreDb) {
      await createBackup('database', adminId, `pre-rollback ${CODE_VERSION}→${target}`);
      await restoreBackup(h.backup_file!);
    }
    if (fs.existsSync(targetDir)) await fsp.writeFile(CURRENT_RELEASE_FILE, target);
    else await fsp.rm(CURRENT_RELEASE_FILE, { force: true });
    await db().updateTable('update_history').set({ status: 'rolled_back' }).where('id', '=', historyId).execute();
    await db().insertInto('update_history').values({ from_version: CODE_VERSION, to_version: target, status: 'rollback', admin_id: adminId, finished_at: new Date(), log: restoreDb ? `Code rolled back and database restored from ${h.backup_file}` : 'Code rolled back; database kept as-is' }).execute();
  } finally {
    setMaintenance({ enabled: false });
  }
  scheduleRestart();
  return target;
}
