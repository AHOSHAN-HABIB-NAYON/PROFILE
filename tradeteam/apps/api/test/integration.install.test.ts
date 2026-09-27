import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import mysql from 'mysql2/promise';
import request from 'supertest';
import http from 'node:http';
import { INSTALL_LOCK_FILE, RUNTIME_ENV_FILE } from '../src/config/paths';
import { isInstalled } from '../src/config/env';
import {
  runInstall,
  checkDatabase,
  ensureSetupToken,
  beginAdminTotp,
} from '../src/modules/install/install.service';
import { buildServer } from '../src/http/app';
import { hotp, currentStep } from '../src/modules/auth/totp';

const DB = {
  host: process.env.DB_HOST!,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: 'tradeteam_install_test',
};

async function dropDb() {
  const c = await mysql.createConnection({
    host: DB.host,
    port: DB.port,
    user: DB.user,
    password: DB.password,
  });
  await c.query(`DROP DATABASE IF EXISTS \`${DB.database}\``);
  await c.end();
}

afterAll(async () => {
  fs.rmSync(INSTALL_LOCK_FILE, { force: true });
  fs.rmSync(RUNTIME_ENV_FILE, { force: true });
  await dropDb();
});

describe('one-time installer', () => {
  it('serves the wizard before installation and redirects pages to /install', async () => {
    await dropDb();
    const { app } = buildServer({
      activate: async () => undefined,
      nextHandler: (_req, res) => res.send('web'),
    });
    const srv = http.createServer(app);
    expect((await request(srv).get('/api/install/status')).status).toBe(200);
    expect((await request(srv).get('/login')).headers.location).toBe('/install');
    expect((await request(srv).get('/api/markets')).status).toBe(503);
    const bad = await request(srv).post('/api/install/verify-token').send({ token: 'nope' });
    expect(bad.status).toBe(401);
    expect(
      (await request(srv).post('/api/install/verify-token').send({ token: ensureSetupToken() })).body.ok,
    ).toBe(true);
  });

  it('installs, locks, and can never run again', async () => {
    const token = ensureSetupToken();
    const secret = beginAdminTotp(token);
    let activated = false;
    const { runtime } = await import('../src/modules/system/runtime');
    const log = await runInstall(
      {
        token,
        appUrl: 'https://example.com',
        db: DB,
        redisUrl: process.env.REDIS_URL!,
        admin: {
          name: 'Owner',
          email: 'owner@example.com',
          password: 'OwnerPassw0rd!',
          totpCode: hotp(secret, currentStep()),
        },
        app: { siteName: 'TradeTeam', currency: 'USDT', timezone: 'UTC' },
        services: {
          market: { provider: 'binance', defaultEngine: 'external' },
          ws: { maxChannelsPerSocket: 200, compressionThreshold: 1024 },
        },
      },
      async () => {
        activated = true;
        runtime.gateway = { health: () => ({ connections: 0, channels: 0, messagesOut: 0 }) } as never;
      },
    );
    runtime.gateway = null;
    expect(log.every((s) => s.ok)).toBe(true);
    expect(activated).toBe(true);
    expect(isInstalled()).toBe(true);
    expect(fs.statSync(RUNTIME_ENV_FILE).mode & 0o777).toBe(0o600);
    const env = fs.readFileSync(RUNTIME_ENV_FILE, 'utf8');
    expect(env).toMatch(/ENCRYPTION_KEY=/);
    expect(env).toMatch(/APP_URL=https:\/\/example.com/);

    const c = await mysql.createConnection(DB);
    const [admins] = await c.query(
      "SELECT u.email, t.enabled_at FROM admin_users u LEFT JOIN two_factor_auth t ON t.principal_type = 'admin' AND t.principal_id = u.id",
    );
    expect((admins as { email: string; enabled_at: Date }[])[0]).toMatchObject({
      email: 'owner@example.com',
    });
    expect((admins as { enabled_at: Date }[])[0]!.enabled_at).not.toBeNull();
    const [secretRow] = await c.query(
      "SELECT value, is_secret FROM system_settings WHERE `key` = 'system.installed_version'",
    );
    expect((secretRow as unknown[]).length).toBe(1);
    await c.end();

    // Existing installation is detected and never overwritten.
    expect((await checkDatabase(DB)).existingInstall).toBe(true);
    await expect(runInstall({} as never, async () => undefined)).rejects.toThrow(/Already installed/);

    const { app } = buildServer({
      activate: async () => undefined,
      nextHandler: (_req, res) => res.send('web'),
    });
    const srv = http.createServer(app);
    expect((await request(srv).get('/api/install/status')).status).toBe(404);
    expect((await request(srv).get('/install')).headers.location).toBe('/login');
  });

  it('refuses to install over a database that already has data even without a lock file', async () => {
    fs.rmSync(INSTALL_LOCK_FILE, { force: true });
    const token = ensureSetupToken();
    await expect(
      runInstall(
        {
          token,
          appUrl: 'https://example.com',
          db: DB,
          redisUrl: process.env.REDIS_URL!,
          admin: { name: 'Mallory', email: 'm@example.com', password: 'MalloryPassw0rd!' },
          app: { siteName: 'X', currency: 'USDT', timezone: 'UTC' },
          services: {
            market: { provider: 'binance', defaultEngine: 'external' },
            ws: { maxChannelsPerSocket: 200, compressionThreshold: 1024 },
          },
        },
        async () => undefined,
      ),
    ).rejects.toThrow(/Existing installation/);
    const c = await mysql.createConnection(DB);
    const [admins] = await c.query('SELECT email FROM admin_users');
    expect((admins as unknown[]).length).toBe(1);
    await c.end();
  });
});
