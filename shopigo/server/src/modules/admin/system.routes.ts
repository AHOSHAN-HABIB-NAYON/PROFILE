import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { sql } from 'kysely';
import { z } from 'zod';
import { getRedis } from '../../core/cache.js';
import { randomToken } from '../../core/crypto.js';
import { badRequest, conflict, forbidden, notFound } from '../../core/errors.js';
import { UPDATE_STAGING_DIR } from '../../core/paths.js';
import { maintenance, setMaintenance } from '../../core/state.js';
import { pageParams, parse, zText } from '../../core/validate.js';
import { CODE_VERSION } from '../../core/version.js';
import { db, json, pendingMigrations, ping } from '../../db/index.js';
import { invalidateSessionCache, requirePermission, requireSuperAdmin } from '../../middleware/auth.js';
import { audit } from '../../services/audit.js';
import { backupPath, createBackup, restoreBackup, type BackupType } from '../../services/backup.js';
import { notificationBus } from '../../services/notifications.js';
import { hashPassword, passwordProblems, verifyPassword } from '../../services/password.js';
import { systemState } from '../../services/settings.js';
import { purgeFromTrash, restoreFromTrash } from '../../services/trash.js';
import { applyUpdate, checkFeed, downloadFromFeed, rollback, stagePackage, stagedUpdates, updateJob } from '../../services/updater.js';

export const systemRouter = Router();

// ------------------------------------------------------------ notifications (+ live stream)
systemRouter.get('/notifications', async (req, res) => {
  const { limit, offset } = pageParams(req.query as Record<string, unknown>, 30, 100);
  const [items, unread] = await Promise.all([
    db().selectFrom('notifications').selectAll().orderBy('id', 'desc').limit(limit).offset(offset).execute(),
    db().selectFrom('notifications').select(sql<number>`COUNT(*)`.as('n')).where('is_read', '=', 0).executeTakeFirst(),
  ]);
  res.json({ items: items.map((i) => ({ ...i, data: json.parse(i.data, null) })), unread: Number(unread?.n ?? 0) });
});

systemRouter.post('/notifications/read', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int().positive()).max(500).optional() }), req.body);
  let q = db().updateTable('notifications').set({ is_read: 1 });
  if (ids?.length) q = q.where('id', 'in', ids);
  await q.execute();
  res.json({ ok: true });
});

/** Server-Sent Events: real-time new order / fraud / stock alerts in the admin. */
systemRouter.get('/notifications/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  const send = (n: unknown) => res.write(`event: notification\ndata: ${JSON.stringify(n)}\n\n`);
  notificationBus.on('notification', send);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => { clearInterval(ping); notificationBus.off('notification', send); });
});

// ------------------------------------------------------------ audit log
systemRouter.get('/audit', requirePermission('audit.view'), async (req, res) => {
  const q = req.query as Record<string, string>;
  const { page, limit, offset } = pageParams(q, 40, 200);
  let base = db().selectFrom('audit_logs');
  if (q.action) base = base.where('action', 'like', `${q.action.replace(/[%_\\]/g, '')}%`);
  if (q.admin) base = base.where('admin_id', '=', Number(q.admin));
  if (q.target) base = base.where('target_type', '=', q.target);
  const rows = await base.selectAll().orderBy('id', 'desc').limit(limit).offset(offset).execute();
  res.json({ items: rows.map((r) => ({ ...r, old_value: json.parse(r.old_value, null), new_value: json.parse(r.new_value, null) })), page });
});

// ------------------------------------------------------------ trash
systemRouter.get('/trash', requirePermission('trash.manage'), async (_req, res) => {
  const rows = await db().selectFrom('trash as t').leftJoin('admins as a', 'a.id', 't.deleted_by').select(['t.id', 't.entity_type', 't.entity_id', 't.title', 't.deleted_at', 'a.name as deleted_by_name']).orderBy('t.id', 'desc').limit(500).execute();
  res.json(rows);
});
systemRouter.post('/trash/:id/restore', requirePermission('trash.manage'), async (req, res) => {
  await restoreFromTrash(req, Number(req.params.id));
  res.json({ ok: true });
});
systemRouter.delete('/trash/:id', requirePermission('trash.manage'), async (req, res) => {
  await purgeFromTrash(req, Number(req.params.id));
  res.json({ ok: true });
});

// ------------------------------------------------------------ administrators & roles
const adminsPerm = requirePermission('admins.manage');

systemRouter.get('/admins', adminsPerm, async (_req, res) => {
  const rows = await db().selectFrom('admins as a').innerJoin('roles as r', 'r.id', 'a.role_id')
    .select(['a.id', 'a.name', 'a.email', 'a.phone', 'a.status', 'a.totp_enabled', 'a.last_login_at', 'a.last_login_ip', 'a.created_at', 'r.name as role_name', 'r.slug as role_slug', 'a.role_id'])
    .select((eb) => eb.selectFrom('admin_passkeys as p').select(sql<number>`COUNT(*)`.as('n')).whereRef('p.admin_id', '=', 'a.id').as('passkeys'))
    .orderBy('a.id').execute();
  res.json(rows);
});

const adminSchema = z.object({ name: zText(120).pipe(z.string().min(2)), email: z.string().trim().toLowerCase().email().max(190), phone: z.string().trim().max(30).nullable().optional(), role_id: z.coerce.number().int().positive(), status: z.enum(['active', 'disabled']).default('active'), password: z.string().max(200).optional() });

async function guardSuperAdminRole(req: import('express').Request, roleId: number) {
  const role = await db().selectFrom('roles').select('slug').where('id', '=', roleId).executeTakeFirst();
  if (!role) throw badRequest('Role not found');
  if (role.slug === 'super_admin' && req.admin!.roleSlug !== 'super_admin') throw forbidden('Only a Super Admin can grant Super Admin');
}

systemRouter.post('/admins', adminsPerm, async (req, res) => {
  const v = parse(adminSchema, req.body);
  if (!v.password) throw badRequest('Password is required');
  const problem = passwordProblems(v.password);
  if (problem) throw badRequest(problem);
  await guardSuperAdminRole(req, v.role_id);
  const r = await db().insertInto('admins').values({ name: v.name, email: v.email, phone: v.phone || null, role_id: v.role_id, status: v.status, password_hash: await hashPassword(v.password), totp_enabled: 0 })
    .executeTakeFirstOrThrow().catch((err) => { if ((err as { code?: string }).code === 'ER_DUP_ENTRY') throw conflict('Email already in use'); throw err; });
  await audit(req, { action: 'admin.created', targetType: 'admin', targetId: Number(r.insertId), newValue: { name: v.name, email: v.email, role_id: v.role_id } });
  res.status(201).json({ id: Number(r.insertId) });
});

systemRouter.put('/admins/:id', adminsPerm, async (req, res) => {
  const id = Number(req.params.id);
  const v = parse(adminSchema, req.body);
  const before = await db().selectFrom('admins as a').innerJoin('roles as r', 'r.id', 'a.role_id').select(['a.id', 'a.role_id', 'a.status', 'r.slug']).where('a.id', '=', id).executeTakeFirst();
  if (!before) throw notFound();
  await guardSuperAdminRole(req, v.role_id);
  if (before.slug === 'super_admin' && req.admin!.roleSlug !== 'super_admin') throw forbidden('Only a Super Admin can edit a Super Admin');
  if (before.slug === 'super_admin' && (v.status !== 'active' || v.role_id !== before.role_id)) {
    const others = await db().selectFrom('admins').innerJoin('roles', 'roles.id', 'admins.role_id').select(sql<number>`COUNT(*)`.as('n')).where('roles.slug', '=', 'super_admin').where('admins.status', '=', 'active').where('admins.id', '!=', id).executeTakeFirst();
    if (!Number(others?.n)) throw badRequest('At least one active Super Admin is required');
  }
  const set: Record<string, unknown> = { name: v.name, email: v.email, phone: v.phone || null, role_id: v.role_id, status: v.status };
  if (v.password) {
    const problem = passwordProblems(v.password);
    if (problem) throw badRequest(problem);
    set.password_hash = await hashPassword(v.password);
  }
  await db().updateTable('admins').set(set).where('id', '=', id).execute();
  if (v.status !== 'active' || v.password) await db().updateTable('admin_sessions').set({ revoked_at: new Date() }).where('admin_id', '=', id).where('revoked_at', 'is', null).execute();
  await invalidateSessionCache();
  await audit(req, { action: 'admin.updated', targetType: 'admin', targetId: id, oldValue: { role_id: before.role_id, status: before.status }, newValue: { ...set, password_hash: v.password ? 'changed' : undefined } });
  res.json({ ok: true });
});

systemRouter.post('/admins/:id/reset-2fa', requireSuperAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db().updateTable('admins').set({ totp_enabled: 0, totp_secret: null }).where('id', '=', id).execute();
  await db().deleteFrom('admin_passkeys').where('admin_id', '=', id).execute();
  await invalidateSessionCache();
  await audit(req, { action: 'admin.2fa_reset', targetType: 'admin', targetId: id });
  res.json({ ok: true });
});

systemRouter.get('/roles', adminsPerm, async (_req, res) => {
  const [roles, perms, links] = await Promise.all([
    db().selectFrom('roles').selectAll().orderBy('id').execute(),
    db().selectFrom('permissions').selectAll().orderBy('group').orderBy('id').execute(),
    db().selectFrom('role_permissions').selectAll().execute(),
  ]);
  res.json({ roles: roles.map((r) => ({ ...r, permissions: links.filter((l) => l.role_id === r.id).map((l) => perms.find((p) => p.id === l.permission_id)?.slug).filter(Boolean) })), permissions: perms });
});

systemRouter.post('/roles', adminsPerm, async (req, res) => {
  const v = parse(z.object({ name: zText(80).pipe(z.string().min(2)), permissions: z.array(z.string().max(80)).max(100) }), req.body);
  const slug = v.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || `role_${Date.now()}`;
  const r = await db().insertInto('roles').values({ name: v.name, slug, is_system: 0 }).executeTakeFirstOrThrow().catch(() => { throw conflict('A role with this name exists'); });
  await setRolePermissions(Number(r.insertId), v.permissions);
  await audit(req, { action: 'role.created', targetType: 'role', targetId: Number(r.insertId), newValue: v });
  res.status(201).json({ id: Number(r.insertId) });
});

async function setRolePermissions(roleId: number, slugs: string[]) {
  const perms = slugs.length ? await db().selectFrom('permissions').select('id').where('slug', 'in', slugs).execute() : [];
  await db().transaction().execute(async (trx) => {
    await trx.deleteFrom('role_permissions').where('role_id', '=', roleId).execute();
    for (const p of perms) await trx.insertInto('role_permissions').values({ role_id: roleId, permission_id: p.id }).execute();
  });
  await invalidateSessionCache();
}

systemRouter.put('/roles/:id', adminsPerm, async (req, res) => {
  const id = Number(req.params.id);
  const v = parse(z.object({ name: zText(80).pipe(z.string().min(2)), permissions: z.array(z.string().max(80)).max(100) }), req.body);
  const role = await db().selectFrom('roles').selectAll().where('id', '=', id).executeTakeFirst();
  if (!role) throw notFound();
  if (role.slug === 'super_admin') throw badRequest('The Super Admin role always has every permission');
  await db().updateTable('roles').set({ name: v.name }).where('id', '=', id).execute();
  await setRolePermissions(id, v.permissions);
  await audit(req, { action: 'role.updated', targetType: 'role', targetId: id, newValue: v });
  res.json({ ok: true });
});

// ------------------------------------------------------------ health & maintenance
systemRouter.get('/health', requirePermission('system.manage', 'settings.manage'), async (_req, res) => {
  const checks: Record<string, unknown> = {};
  const t = Date.now();
  try { await ping(); checks.database = { ok: true, ms: Date.now() - t }; } catch (err) { checks.database = { ok: false, error: (err as Error).message }; }
  const r = getRedis();
  checks.redis = r ? { ok: r.status === 'ready', status: r.status } : { ok: true, status: 'not configured (memory cache)' };
  const mv = await db().selectFrom('installation').select(['version', 'installed_at']).where('id', '=', 1).executeTakeFirst();
  checks.version = { code: CODE_VERSION, database: mv?.version, installedAt: mv?.installed_at, pendingMigrations: await pendingMigrations() };
  checks.runtime = { node: process.version, platform: `${os.platform()} ${os.arch()}`, uptime: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024), freeMemMb: Math.round(os.freemem() / 1024 / 1024), load: os.loadavg().map((l) => l.toFixed(2)) };
  checks.maintenance = maintenance();
  res.json(checks);
});

systemRouter.post('/maintenance', requirePermission('system.manage'), async (req, res) => {
  const { enabled } = parse(z.object({ enabled: z.boolean() }), req.body);
  setMaintenance(enabled ? { enabled: true, reason: 'Manual', bypassToken: randomToken(16) } : { enabled: false });
  await audit(req, { action: enabled ? 'system.maintenance_on' : 'system.maintenance_off', targetType: 'system' });
  res.json(maintenance());
});

// ------------------------------------------------------------ backups
const systemPerm = requirePermission('system.manage');

systemRouter.get('/backups', systemPerm, async (_req, res) => {
  res.json(await db().selectFrom('backups as b').leftJoin('admins as a', 'a.id', 'b.created_by').select(['b.id', 'b.type', 'b.file', 'b.size', 'b.status', 'b.note', 'b.created_at', 'a.name as created_by_name']).orderBy('b.id', 'desc').limit(200).execute());
});

systemRouter.post('/backups', systemPerm, async (req, res) => {
  const { type } = parse(z.object({ type: z.enum(['database', 'full', 'config']) }), req.body);
  const b = await createBackup(type as BackupType, req.admin!.id, 'Manual backup');
  await audit(req, { action: 'system.backup_created', targetType: 'backup', targetId: b.id, newValue: b });
  res.status(201).json(b);
});

systemRouter.get('/backups/:id/download', requireSuperAdmin, async (req, res) => {
  const b = await db().selectFrom('backups').selectAll().where('id', '=', Number(req.params.id)).executeTakeFirst();
  if (!b) throw notFound();
  await audit(req, { action: 'system.backup_downloaded', targetType: 'backup', targetId: b.id });
  res.download(backupPath(b.file), b.file);
});

systemRouter.post('/backups/:id/restore', requireSuperAdmin, async (req, res) => {
  const { confirm, password } = parse(z.object({ confirm: z.literal('RESTORE'), password: z.string().min(1) }), req.body);
  void confirm;
  const admin = await db().selectFrom('admins').select('password_hash').where('id', '=', req.admin!.id).executeTakeFirstOrThrow();
  if (!(await verifyPassword(admin.password_hash, password))) throw forbidden('Password confirmation failed');
  const b = await db().selectFrom('backups').selectAll().where('id', '=', Number(req.params.id)).executeTakeFirst();
  if (!b || b.type === 'config') throw badRequest('Choose a database or full backup');
  setMaintenance({ enabled: true, reason: 'Restoring backup' });
  try {
    const safety = await createBackup('database', req.admin!.id, `pre-restore safety copy (before restoring ${b.file})`);
    await restoreBackup(b.file);
    await audit(req, { action: 'system.backup_restored', targetType: 'backup', targetId: b.id, newValue: { file: b.file, safetyBackup: safety.file } });
    res.json({ ok: true, safetyBackup: safety.file });
  } finally {
    setMaintenance({ enabled: false });
  }
});

systemRouter.delete('/backups/:id', requireSuperAdmin, async (req, res) => {
  const b = await db().selectFrom('backups').selectAll().where('id', '=', Number(req.params.id)).executeTakeFirst();
  if (!b) throw notFound();
  try { fs.rmSync(backupPath(b.file), { force: true }); } catch { /* file already gone */ }
  await db().deleteFrom('backups').where('id', '=', b.id).execute();
  await audit(req, { action: 'system.backup_deleted', targetType: 'backup', targetId: b.id, oldValue: b });
  res.json({ ok: true });
});

// ------------------------------------------------------------ updates (Super Admin only)
const packageUpload = multer({
  storage: multer.diskStorage({ destination: (_req, _file, cb) => { fs.mkdirSync(UPDATE_STAGING_DIR, { recursive: true }); cb(null, UPDATE_STAGING_DIR); }, filename: (_req, _file, cb) => cb(null, `upload-${Date.now()}.tar.gz`) }),
  limits: { fileSize: 400 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => (/\.(tar\.gz|tgz)$/i.test(file.originalname) ? cb(null, true) : cb(badRequest('Update packages must be .tar.gz files'))),
});

systemRouter.get('/updates', requireSuperAdmin, async (_req, res) => {
  const [history, installation, lastCheck] = await Promise.all([
    db().selectFrom('update_history').selectAll().orderBy('id', 'desc').limit(30).execute(),
    db().selectFrom('installation').selectAll().where('id', '=', 1).executeTakeFirst(),
    systemState.get('last_update_check', null),
  ]);
  res.json({ currentVersion: CODE_VERSION, databaseVersion: installation?.version, installedAt: installation?.installed_at, staged: await stagedUpdates(), job: updateJob(), history, lastCheck, pendingMigrations: await pendingMigrations() });
});

systemRouter.post('/updates/check', requireSuperAdmin, async (_req, res) => {
  res.json(await checkFeed());
});

systemRouter.post('/updates/download', requireSuperAdmin, async (req, res) => {
  const staged = await downloadFromFeed();
  await audit(req, { action: 'system.update_downloaded', targetType: 'system', targetId: staged.version, newValue: { signed: staged.signed } });
  res.json({ version: staged.version, manifest: staged.manifest, signed: staged.signed });
});

systemRouter.post('/updates/upload', requireSuperAdmin, packageUpload.single('package'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('Choose an update package');
  try {
    const staged = await stagePackage(file.path);
    await audit(req, { action: 'system.update_uploaded', targetType: 'system', targetId: staged.version, newValue: { signed: staged.signed, changelog: staged.manifest.changelog } });
    res.json({ version: staged.version, manifest: staged.manifest, signed: staged.signed });
  } finally {
    fs.rmSync(path.resolve(file.path), { force: true });
  }
});

systemRouter.post('/updates/apply', requireSuperAdmin, async (req, res) => {
  const { version, confirm } = parse(z.object({ version: z.string().max(40), confirm: z.literal(true) }), req.body);
  void confirm;
  await applyUpdate(version, req.admin!.id);
  await audit(req, { action: 'system.update_started', targetType: 'system', targetId: version });
  res.status(202).json({ ok: true, job: updateJob() });
});

systemRouter.get('/updates/job', requireSuperAdmin, (_req, res) => {
  res.json(updateJob());
});

systemRouter.post('/updates/rollback/:id', requireSuperAdmin, async (req, res) => {
  const { password, restoreDatabase } = parse(z.object({ password: z.string().min(1), restoreDatabase: z.boolean().default(false) }), req.body);
  const admin = await db().selectFrom('admins').select('password_hash').where('id', '=', req.admin!.id).executeTakeFirstOrThrow();
  if (!(await verifyPassword(admin.password_hash, password))) throw forbidden('Password confirmation failed');
  const target = await rollback(Number(req.params.id), req.admin!.id, restoreDatabase);
  await audit(req, { action: 'system.update_rolled_back', targetType: 'system', targetId: target, newValue: { restoreDatabase } });
  res.json({ ok: true, version: target });
});
