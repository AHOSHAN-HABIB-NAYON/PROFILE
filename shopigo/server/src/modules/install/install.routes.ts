import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { sql } from 'kysely';
import { z } from 'zod';
import { getRedis } from '../../core/cache.js';
import { generateSecrets, safeEqual } from '../../core/crypto.js';
import { config, writeEnvFile } from '../../core/env.js';
import { HttpError, badRequest } from '../../core/errors.js';
import { logger } from '../../core/logger.js';
import { CLIENT_DIST, ENV_FILE, SHARED_ROOT, STORAGE_DIR, UPLOADS_DIR, ensureDirs } from '../../core/paths.js';
import { isInstalledSync, markInstalled, writeLock } from '../../core/state.js';
import { parse, zPhone } from '../../core/validate.js';
import { CODE_VERSION } from '../../core/version.js';
import { closeDb, createDb, initDb, runMigrations, type DbCredentials } from '../../db/index.js';
import { seedDefaults } from '../../db/defaults.js';
import { imageUpload } from '../../middleware/upload.js';
import { processIcon, processLogo } from '../../services/images.js';
import { hashPassword, passwordProblems } from '../../services/password.js';
import { settings, systemState } from '../../services/settings.js';

export const installRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
installRouter.use(limiter);

/** Every installer endpoint (except status) is dead once installed. */
function onlyWhenNotInstalled(req: Request, res: Response, next: NextFunction) {
  if (isInstalledSync()) {
    res.status(410).json({ installed: true, message: 'ShopiGo is already installed.' });
    return;
  }
  // Optional hardening for public servers: require the INSTALL_TOKEN set in the hosting panel.
  if (config.installToken) {
    const token = String(req.get('x-install-token') ?? '');
    if (!token || !safeEqual(token, config.installToken)) {
      res.status(403).json({ code: 'INSTALL_TOKEN', message: 'A valid installation token is required.' });
      return;
    }
  }
  next();
}

installRouter.get('/status', (_req, res) => {
  res.json({ installed: isInstalledSync(), version: CODE_VERSION, tokenRequired: !isInstalledSync() && Boolean(config.installToken) });
});

interface Check { key: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string }

function writable(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.probe-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

async function moduleLoads(name: string): Promise<boolean> {
  try { await import(name); return true; } catch { return false; }
}

installRouter.get('/requirements', onlyWhenNotInstalled, async (_req, res) => {
  const checks: Check[] = [];
  const major = Number(process.versions.node.split('.')[0]);
  checks.push({ key: 'node', label: 'Node.js version', status: major >= 20 ? 'pass' : 'fail', detail: `v${process.versions.node} (20+ required)` });
  let npmVersion = '';
  try { npmVersion = execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['-v'], { timeout: 8000 }).toString().trim(); } catch { /* optional */ }
  checks.push({ key: 'npm', label: 'npm', status: npmVersion ? 'pass' : 'warn', detail: npmVersion ? `v${npmVersion}` : 'Not found on PATH (only needed for updates that change dependencies)' });
  checks.push({ key: 'php', label: 'PHP', status: 'pass', detail: 'Not required — ShopiGo runs entirely on Node.js' });
  for (const mod of ['mysql2', 'sharp', '@node-rs/argon2', 'kysely', '@simplewebauthn/server']) {
    const ok = await moduleLoads(mod);
    checks.push({ key: `mod:${mod}`, label: `Module ${mod}`, status: ok ? 'pass' : 'fail', detail: ok ? 'Loaded' : 'Missing — run npm install' });
  }
  checks.push({ key: 'client', label: 'Storefront build', status: fs.existsSync(path.join(CLIENT_DIST, 'index.html')) ? 'pass' : 'fail', detail: fs.existsSync(path.join(CLIENT_DIST, 'index.html')) ? 'client/dist found' : 'Run npm run build' });
  checks.push({ key: 'storage', label: 'Storage directory writable', status: writable(STORAGE_DIR) ? 'pass' : 'fail', detail: 'storage/' });
  checks.push({ key: 'uploads', label: 'Uploads directory writable', status: writable(UPLOADS_DIR) ? 'pass' : 'fail', detail: 'uploads/' });
  checks.push({ key: 'env', label: 'Configuration file writable', status: writable(SHARED_ROOT) ? 'pass' : 'fail', detail: '.env will be created with private (0600) permissions' });
  checks.push({ key: 'env_existing', label: 'Environment configuration', status: 'pass', detail: fs.existsSync(ENV_FILE) ? '.env exists — values will be merged' : 'Will be generated' });
  if (config.redisUrl) {
    let ok = false;
    try { const r = getRedis(); ok = (await r?.ping()) === 'PONG'; } catch { ok = false; }
    checks.push({ key: 'redis', label: 'Redis', status: ok ? 'pass' : 'warn', detail: ok ? 'Connected' : 'REDIS_URL set but not reachable — in-memory cache will be used' });
  } else {
    checks.push({ key: 'redis', label: 'Redis (optional)', status: 'pass', detail: 'Not configured — in-memory cache & rate limiting' });
  }
  const freeMem = Math.round(os.freemem() / 1024 / 1024);
  checks.push({ key: 'memory', label: 'Free memory', status: freeMem > 256 ? 'pass' : 'warn', detail: `${freeMem} MB` });
  res.json({ checks, ok: checks.every((c) => c.status !== 'fail') });
});

const dbSchema = z.object({
  host: z.string().trim().min(1).max(255).regex(/^[a-zA-Z0-9._:-]+$/, 'Invalid host'),
  port: z.coerce.number().int().min(1).max(65535).default(3306),
  user: z.string().trim().min(1).max(120),
  password: z.string().max(255).default(''),
  database: z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9_$-]+$/, 'Database name may only contain letters, numbers, _ $ -'),
});

async function testConnection(c: DbCredentials): Promise<{ version: string; existing: boolean; tables: number }> {
  const { db } = createDb(c);
  try {
    const v = await sql<{ v: string }>`SELECT VERSION() AS v`.execute(db);
    const t = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ${c.database}`.execute(db);
    let existing = false;
    try {
      const r = await sql<{ status: string }>`SELECT status FROM installation WHERE id = 1`.execute(db);
      existing = r.rows[0]?.status === 'installed';
    } catch { /* no table */ }
    // Privilege probe: can we create/drop a scratch table?
    await sql.raw('CREATE TABLE IF NOT EXISTS `_shopigo_probe` (id INT) ENGINE=InnoDB').execute(db);
    await sql.raw('DROP TABLE IF EXISTS `_shopigo_probe`').execute(db);
    return { version: v.rows[0]?.v ?? 'unknown', existing, tables: Number(t.rows[0]?.n ?? 0) };
  } finally {
    await db.destroy();
  }
}

function dbErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string };
  switch (e.code) {
    case 'ER_ACCESS_DENIED_ERROR': return 'Access denied — check the database username and password.';
    case 'ER_BAD_DB_ERROR': return 'The database does not exist. Create it in your hosting panel first.';
    case 'ECONNREFUSED': return 'Connection refused — check the host and port.';
    case 'ENOTFOUND': return 'Database host not found.';
    case 'ETIMEDOUT': return 'Connection timed out.';
    case 'ER_TABLEACCESS_DENIED_ERROR':
    case 'ER_DBACCESS_DENIED_ERROR': return 'The user needs CREATE, ALTER, INDEX, INSERT, UPDATE, DELETE, SELECT and REFERENCES privileges.';
    default: return 'Could not connect to the database. Please verify the details.';
  }
}

installRouter.post('/test-db', onlyWhenNotInstalled, async (req, res) => {
  const c = parse(dbSchema, req.body);
  try {
    const info = await testConnection(c);
    if (info.existing) {
      res.status(409).json({ ok: false, message: 'This database already contains an installed ShopiGo store. It will not be overwritten. Use an empty database, or restore the original storage/install.lock.' });
      return;
    }
    res.json({ ok: true, message: `Connected to MySQL ${info.version}`, tables: info.tables });
  } catch (err) {
    logger.warn({ code: (err as { code?: string }).code }, 'installer db test failed');
    res.status(400).json({ ok: false, message: dbErrorMessage(err) });
  }
});

const installSchema = z
  .object({
    db: dbSchema,
    site: z.object({
      name: z.string().trim().min(2).max(80),
      url: z.string().trim().url().max(255),
      currency: z.string().trim().min(3).max(3).default('BDT'),
      timezone: z.string().trim().min(3).max(64).default('Asia/Dhaka'),
      whatsapp: z.string().trim().max(20).regex(/^\+?\d{8,15}$/, 'WhatsApp number must contain digits only (with country code)').or(z.literal('')).default(''),
      phone: z.string().trim().max(20).default(''),
      email: z.string().trim().email().or(z.literal('')).default(''),
      createCategories: z.boolean().default(true),
    }),
    admin: z.object({
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().toLowerCase().email().max(190),
      phone: zPhone.or(z.literal('')).default(''),
      password: z.string().min(10).max(200),
      confirmPassword: z.string(),
    }),
  })
  .refine((v) => v.admin.password === v.admin.confirmPassword, { message: 'Passwords do not match', path: ['admin', 'confirmPassword'] });

let installing = false;

installRouter.post(
  '/run',
  onlyWhenNotInstalled,
  imageUpload.fields([{ name: 'logo', maxCount: 1 }, { name: 'favicon', maxCount: 1 }]),
  async (req, res) => {
    if (installing) throw new HttpError(409, 'Installation already in progress', 'BUSY');
    let payload: unknown;
    try { payload = JSON.parse(String(req.body.payload ?? '{}')); } catch { throw badRequest('Invalid installer payload'); }
    const input = parse(installSchema, payload);
    const pwProblem = passwordProblems(input.admin.password);
    if (pwProblem) throw badRequest(pwProblem);
    try { Intl.DateTimeFormat('en', { timeZone: input.site.timezone }); } catch { throw badRequest('Unknown timezone'); }

    installing = true;
    const steps: string[] = [];
    try {
      // 1. Database must be reachable and must NOT already hold a store.
      const info = await testConnection(input.db).catch((err) => { throw badRequest(dbErrorMessage(err)); });
      if (info.existing) throw new HttpError(409, 'This database already contains an installed ShopiGo store. Refusing to overwrite it.', 'ALREADY_INSTALLED');
      steps.push('Database connection verified');

      // 2. Directories
      ensureDirs();
      steps.push('Storage directories created');

      // 3. Secrets + config (.env outside the release directory, 0600)
      const secrets = config.appSecret && config.encryptionKey
        ? { APP_SECRET: config.appSecret, ENCRYPTION_KEY: config.encryptionKey, INSTALLATION_ID: process.env.INSTALLATION_ID || generateSecrets().INSTALLATION_ID }
        : generateSecrets();
      writeEnvFile({
        NODE_ENV: 'production',
        DB_HOST: input.db.host,
        DB_PORT: String(input.db.port),
        DB_USER: input.db.user,
        DB_PASSWORD: input.db.password,
        DB_NAME: input.db.database,
        APP_SECRET: secrets.APP_SECRET,
        ENCRYPTION_KEY: secrets.ENCRYPTION_KEY,
        INSTALLATION_ID: secrets.INSTALLATION_ID,
      });
      steps.push('Secure application secrets & encryption key generated');

      // 4. Schema
      await closeDb();
      const db = initDb();
      const applied = await runMigrations(db);
      steps.push(`Database migrated (${applied.length} migration${applied.length === 1 ? '' : 's'})`);

      // 5. Defaults
      await seedDefaults(db, {
        categories: input.site.createCategories,
        overrides: {
          site_name: input.site.name,
          site_url: input.site.url.replace(/\/+$/, ''),
          currency: input.site.currency.toUpperCase(),
          currency_symbol: input.site.currency.toUpperCase() === 'BDT' ? '৳' : input.site.currency.toUpperCase(),
          timezone: input.site.timezone,
          whatsapp_number: input.site.whatsapp.replace(/^\+/, ''),
          contact_phone: input.site.phone,
          contact_email: input.site.email || input.admin.email,
          pwa_short_name: input.site.name.slice(0, 12),
          meta_title: `${input.site.name} — Online Shopping in Bangladesh`,
        },
      });
      steps.push('Default roles, permissions, order statuses, delivery, security settings & pages created');

      // 6. Branding uploads
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const logo = files?.logo?.[0];
      const favicon = files?.favicon?.[0];
      const brand: Record<string, unknown> = {};
      if (logo) brand.logo = (await processLogo(logo.buffer)).path;
      if (favicon) {
        const icon = await processIcon(favicon.buffer);
        brand.favicon = icon.path;
        brand.app_icon = icon.path;
      }
      if (Object.keys(brand).length) {
        await settings.update(brand);
        steps.push('Logo & favicon optimised');
      }

      // 7. Super admin
      const role = await db.selectFrom('roles').select('id').where('slug', '=', 'super_admin').executeTakeFirstOrThrow();
      const passwordHash = await hashPassword(input.admin.password);
      await db
        .insertInto('admins')
        .values({ role_id: role.id, name: input.admin.name, email: input.admin.email, phone: input.admin.phone || null, password_hash: passwordHash, totp_enabled: 0, status: 'active' })
        .onDuplicateKeyUpdate({ role_id: role.id, name: input.admin.name, password_hash: passwordHash, status: 'active' })
        .execute();
      steps.push('Super administrator created');

      // 8. Installation record + lock
      const now = new Date();
      await db
        .insertInto('installation')
        .values({ id: 1, installation_id: secrets.INSTALLATION_ID, status: 'installed', version: CODE_VERSION, site_url: input.site.url, installed_at: now })
        .onDuplicateKeyUpdate({ status: 'installed', version: CODE_VERSION })
        .execute();
      await systemState.set('installed_version', CODE_VERSION);
      await systemState.set('installed_at', now.toISOString());
      writeLock(secrets.INSTALLATION_ID, CODE_VERSION);
      markInstalled();
      steps.push('Installation locked');

      await db.insertInto('audit_logs').values({ action: 'system.installed', admin_name: input.admin.name, new_value: JSON.stringify({ version: CODE_VERSION }), ip: req.ip ?? null }).execute();
      logger.info({ version: CODE_VERSION }, 'ShopiGo installed');
      res.json({ ok: true, steps, siteUrl: input.site.url, adminUrl: '/admin' });
    } finally {
      installing = false;
    }
  },
);
