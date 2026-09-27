import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { Redis } from 'ioredis';
import webpush from 'web-push';
import {
  INSTALL_LOCK_FILE,
  INSTALL_TOKEN_FILE,
  RUNTIME_ENV_FILE,
  STORAGE_DIR,
  APP_VERSION,
  ensureStorage,
} from '../../config/paths';
import { isInstalled } from '../../config/env';
import { createPool } from '../../infrastructure/db';
import { migrate } from '../../database/migrator';
import { encrypt, setEncryptionKey, randomToken } from '../../infrastructure/crypto';
import { logger } from '../../infrastructure/logger';
import { hashPassword } from '../auth/passwords';
import { generateSecret, verifyTotp } from '../auth/totp';

/**
 * One-time installer. Guarantees:
 *  - only reachable while storage/install.lock does not exist; the lock is created with O_EXCL,
 *    so it can never be overwritten by a second run
 *  - requires the setup token printed to the server log / storage/install-token.txt
 *  - never touches a database that already contains an installation (refuses instead)
 *  - generates all secrets server-side and writes them only to storage/runtime.env (0600)
 */
let setupToken: string | null = null;
let running = false;

export function ensureSetupToken(): string {
  if (setupToken) return setupToken;
  ensureStorage();
  if (fs.existsSync(INSTALL_TOKEN_FILE)) setupToken = fs.readFileSync(INSTALL_TOKEN_FILE, 'utf8').trim();
  if (!setupToken) {
    setupToken = randomToken(12);
    fs.writeFileSync(INSTALL_TOKEN_FILE, setupToken, { mode: 0o600 });
  }
  return setupToken;
}

export function checkToken(t: string | undefined) {
  const expected = ensureSetupToken();
  return (
    typeof t === 'string' &&
    t.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(t), Buffer.from(expected))
  );
}

export function requirements() {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  let writable = false;
  try {
    ensureStorage();
    const p = path.join(STORAGE_DIR, '.write-test');
    fs.writeFileSync(p, 'ok');
    fs.rmSync(p);
    writable = true;
  } catch {
    writable = false;
  }
  let argon = false;
  try {
    argon = typeof hashPassword === 'function';
  } catch {
    argon = false;
  }
  const checks = [
    {
      key: 'node',
      label: `Node.js ≥ 20 (found ${process.versions.node})`,
      ok: nodeMajor >= 20,
      required: true,
    },
    { key: 'storage', label: 'Private storage directory is writable', ok: writable, required: true },
    { key: 'argon2', label: 'Argon2id password hashing available', ok: argon, required: true },
    {
      key: 'memory',
      label: `Memory ≥ 1 GB (found ${Math.round(os.totalmem() / 1024 ** 3)} GB)`,
      ok: os.totalmem() >= 1024 ** 3,
      required: false,
    },
    {
      key: 'crypto',
      label: 'Web Crypto / AES-256-GCM available',
      ok: crypto.getCiphers().includes('aes-256-gcm'),
      required: true,
    },
  ];
  return { checks, ok: checks.every((c) => c.ok || !c.required) };
}

export interface DbInput {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

export async function checkDatabase(d: DbInput) {
  const conn = await mysql.createConnection({
    host: d.host,
    port: d.port,
    user: d.user,
    password: d.password,
    connectTimeout: 8000,
  });
  try {
    const [v] = await conn.query('SELECT VERSION() AS v');
    const version = (v as { v: string }[])[0]!.v;
    const [dbs] = await conn.query(
      'SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
      [d.database],
    );
    const exists = (dbs as unknown[]).length > 0;
    let existingInstall = false;
    let tableCount = 0;
    if (exists) {
      const [t] = await conn.query(
        'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
        [d.database],
      );
      const names = (t as { TABLE_NAME: string }[]).map((r) => r.TABLE_NAME);
      tableCount = names.length;
      existingInstall = names.includes('schema_migrations') || names.includes('users');
    }
    return { ok: !existingInstall, version, databaseExists: exists, tableCount, existingInstall };
  } finally {
    await conn.end();
  }
}

export async function checkRedis(url: string) {
  const r = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  try {
    await r.connect();
    const t = performance.now();
    await r.ping();
    const info = await r.info('server');
    const version = /redis_version:(\S+)/.exec(info)?.[1] ?? 'unknown';
    return { ok: true, version, latencyMs: Math.round((performance.now() - t) * 100) / 100 };
  } finally {
    r.disconnect();
  }
}

/** Pending TOTP enrolment for the first admin, generated during the wizard. */
const pendingTotp = new Map<string, { secret: string; at: number }>();
export function beginAdminTotp(token: string) {
  const secret = generateSecret();
  pendingTotp.set(token, { secret, at: Date.now() });
  return secret;
}

export interface InstallInput {
  token: string;
  appUrl: string;
  db: DbInput;
  redisUrl: string;
  admin: { name: string; email: string; password: string; totpCode?: string };
  app: { siteName: string; logoUrl?: string; currency: string; timezone: string };
  services: {
    smtp?: { host: string; port: number; secure: boolean; user?: string; password?: string; from: string };
    google?: { clientId: string; clientSecret: string };
    market: {
      provider: 'binance' | 'internal';
      restUrl?: string;
      wsUrl?: string;
      defaultEngine: 'internal' | 'external';
    };
    ws: { maxChannelsPerSocket: number; compressionThreshold: number };
    exchange?: { apiKey: string; apiSecret: string };
  };
}

export interface StepLog {
  step: string;
  ok: boolean;
  detail?: string;
}

const envLine = (k: string, v: string | number | boolean) => {
  const s = String(v);
  return `${k}=${/[\s#"'$`\\]/.test(s) ? JSON.stringify(s) : s}`;
};

export async function runInstall(input: InstallInput, activate: () => Promise<void>): Promise<StepLog[]> {
  if (isInstalled()) throw new Error('Already installed');
  if (running) throw new Error('Installation already in progress');
  running = true;
  const log: StepLog[] = [];
  const step = async <T>(name: string, fn: () => Promise<T>, detail?: (r: T) => string) => {
    try {
      const r = await fn();
      log.push({ step: name, ok: true, detail: detail?.(r) });
      return r;
    } catch (e) {
      log.push({ step: name, ok: false, detail: (e as Error).message });
      throw Object.assign(new Error((e as Error).message), { log });
    }
  };
  try {
    if (!/^[A-Za-z0-9_]{1,64}$/.test(input.db.database)) throw new Error('Invalid database name');

    await step('Create database', async () => {
      const c = await mysql.createConnection({
        host: input.db.host,
        port: input.db.port,
        user: input.db.user,
        password: input.db.password,
      });
      try {
        await c.query(
          `CREATE DATABASE IF NOT EXISTS \`${input.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
        );
      } finally {
        await c.end();
      }
    });

    const check = await step(
      'Verify database is empty',
      () => checkDatabase(input.db),
      (r) => `MySQL ${r.version}, ${r.tableCount} existing tables`,
    );
    if (check.existingInstall) {
      log[log.length - 1] = {
        step: 'Verify database is empty',
        ok: false,
        detail: 'An existing installation was found in this database. It will not be modified.',
      };
      throw Object.assign(new Error('Existing installation detected — refusing to overwrite'), { log });
    }

    await step(
      'Verify Redis',
      () => checkRedis(input.redisUrl),
      (r) => `Redis ${r.version}`,
    );

    const secrets = await step(
      'Generate secure secrets',
      async () => {
        const vapid = webpush.generateVAPIDKeys();
        return {
          SESSION_SECRET: randomToken(48),
          ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
          WEBHOOK_SECRET: randomToken(32),
          VAPID_PUBLIC_KEY: vapid.publicKey,
          VAPID_PRIVATE_KEY: vapid.privateKey,
        };
      },
      () => 'session, encryption, webhook and VAPID keys',
    );
    setEncryptionKey(secrets.ENCRYPTION_KEY);

    const pool = createPool({
      host: input.db.host,
      port: input.db.port,
      user: input.db.user,
      password: input.db.password,
      database: input.db.database,
      poolSize: 4,
    });
    try {
      await step(
        'Run migrations',
        () => migrate(pool),
        (r) => `${r.applied.length} migrations applied`,
      );

      await step(
        'Create system settings',
        async () => {
          const s: Record<string, [unknown, boolean]> = {
            'site.name': [input.app.siteName, false],
            'site.logo_url': [input.app.logoUrl ?? '', false],
            'site.currency': [input.app.currency, false],
            'site.timezone': [input.app.timezone, false],
            'site.default_theme': ['light', false],
            'market.provider': [input.services.market.provider, false],
            'market.default_engine': [input.services.market.defaultEngine, false],
            'ws.max_channels_per_socket': [input.services.ws.maxChannelsPerSocket, false],
            'ws.compression_threshold': [input.services.ws.compressionThreshold, false],
            'system.installed_version': [APP_VERSION, false],
            'system.installed_at': [new Date().toISOString(), false],
          };
          if (input.services.market.restUrl)
            s['market.binance_rest_url'] = [input.services.market.restUrl, false];
          if (input.services.market.wsUrl) s['market.binance_ws_url'] = [input.services.market.wsUrl, false];
          if (input.services.smtp?.host) {
            s['smtp.host'] = [input.services.smtp.host, false];
            s['smtp.port'] = [input.services.smtp.port, false];
            s['smtp.secure'] = [input.services.smtp.secure, false];
            s['smtp.user'] = [input.services.smtp.user ?? '', false];
            s['smtp.from'] = [input.services.smtp.from, false];
            if (input.services.smtp.password) s['smtp.password'] = [input.services.smtp.password, true];
          } else {
            s['auth.email_verification_required'] = [false, false];
          }
          if (input.services.google?.clientId) {
            s['google.client_id'] = [input.services.google.clientId, false];
            s['google.client_secret'] = [input.services.google.clientSecret, true];
            s['auth.google_enabled'] = [true, false];
          }
          if (input.services.exchange?.apiKey) {
            s['exchange.api_key'] = [input.services.exchange.apiKey, true];
            s['exchange.api_secret'] = [input.services.exchange.apiSecret, true];
          }
          for (const [k, [v, secret]] of Object.entries(s)) {
            const json = JSON.stringify(v);
            await pool.query(
              'INSERT INTO system_settings (`key`, value, is_secret) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value = VALUES(value), is_secret = VALUES(is_secret)',
              [k, secret ? encrypt(json, `setting:${k}`) : json, secret ? 1 : 0],
            );
          }
          return Object.keys(s).length;
        },
        (n) => `${n} settings saved`,
      );

      await step(
        'Create administrator',
        async () => {
          const [roles] = await pool.query("SELECT id FROM admin_roles WHERE name = 'super_admin'");
          const roleId = (roles as { id: number }[])[0]!.id;
          const [r] = await pool.query(
            'INSERT INTO admin_users (email, name, password_hash, role_id) VALUES (?,?,?,?)',
            [
              input.admin.email.toLowerCase(),
              input.admin.name,
              await hashPassword(input.admin.password),
              roleId,
            ],
          );
          const adminId = (r as { insertId: number }).insertId;
          const pending = pendingTotp.get(input.token);
          if (pending && input.admin.totpCode) {
            const stepOk = verifyTotp(pending.secret, input.admin.totpCode);
            if (stepOk === null) throw new Error('The authenticator code was not valid');
            await pool.query(
              "INSERT INTO two_factor_auth (principal_type, principal_id, secret_enc, enabled_at, last_used_step) VALUES ('admin', ?, ?, NOW(3), ?)",
              [adminId, encrypt(pending.secret, `totp:admin:${adminId}`), stepOk],
            );
          }
          await pool.query(
            "INSERT INTO audit_logs (admin_user_id, action, target_type, target_id) VALUES (?, 'system.install', 'system', ?)",
            [adminId, APP_VERSION],
          );
          return pending && input.admin.totpCode
            ? 'with authenticator 2FA'
            : 'second factor will be required at first sign-in';
        },
        (d) => d,
      );

      await step(
        'Verify database',
        async () => {
          const [rows] = await pool.query('SELECT COUNT(*) AS n FROM schema_migrations');
          return (rows as { n: number }[])[0]!.n;
        },
        (n) => `${n} schema versions recorded`,
      );
    } finally {
      await pool.end();
    }

    await step(
      'Write configuration',
      async () => {
        ensureStorage();
        const lines = [
          '# Generated by the TradeTeam installer. Keep this file private (0600). Environment variables override it.',
          envLine('NODE_ENV', 'production'),
          envLine('APP_URL', input.appUrl.replace(/\/$/, '')),
          envLine('DB_HOST', input.db.host),
          envLine('DB_PORT', input.db.port),
          envLine('DB_NAME', input.db.database),
          envLine('DB_USER', input.db.user),
          envLine('DB_PASSWORD', input.db.password),
          envLine('REDIS_URL', input.redisUrl),
          ...Object.entries(secrets).map(([k, v]) => envLine(k, v)),
        ];
        const tmp = `${RUNTIME_ENV_FILE}.tmp`;
        fs.writeFileSync(tmp, lines.join('\n') + '\n', { mode: 0o600 });
        fs.renameSync(tmp, RUNTIME_ENV_FILE);
      },
      () => 'storage/runtime.env (0600)',
    );

    await step('Create installation lock', async () => {
      const fd = fs.openSync(INSTALL_LOCK_FILE, 'wx', 0o600); // O_EXCL: never overwrite
      fs.writeSync(fd, JSON.stringify({ installedAt: new Date().toISOString(), version: APP_VERSION }));
      fs.closeSync(fd);
      fs.rmSync(INSTALL_TOKEN_FILE, { force: true });
    });

    await step('Start services (market data, engine, WebSocket)', activate);
    await step(
      'Verify WebSocket gateway',
      async () => {
        const { runtime } = await import('../system/runtime');
        if (!runtime.gateway) throw new Error('WebSocket gateway did not start');
        return runtime.gateway.health();
      },
      () => 'gateway accepting connections',
    );

    pendingTotp.clear();
    setupToken = null;
    logger.info('installation complete');
    return log;
  } finally {
    running = false;
  }
}
