import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import mysql from 'mysql2/promise';
import request from 'supertest';
import type { Request } from 'express';
import { loadEnv, requireRuntimeEnv } from '../src/config/env';
import { initDb, db, closeDb, exec, one } from '../src/infrastructure/db';
import { initRedis, redis, closeRedis } from '../src/infrastructure/redis';
import { closeQueues } from '../src/infrastructure/queue';
import { setEncryptionKey } from '../src/infrastructure/crypto';
import { migrate } from '../src/database/migrator';
import { loadSettings, setSettings } from '../src/modules/settings/settings.service';
import { loadFees } from '../src/modules/trading/fees';
import { loadAssets } from '../src/modules/wallets/assets-cache';
import { loadMarkets } from '../src/modules/markets/registry';
import { buildAppApi } from '../src/http/app';
import { errorHandler, notFound } from '../src/http/middleware/error';
import { MatchingEngine } from '../src/modules/trading/engine';
import { setLocalEngine } from '../src/modules/trading/engine-client';
import { hashPassword } from '../src/modules/auth/passwords';
import { createUser } from '../src/modules/users/users.repo';
import { runtime } from '../src/modules/system/runtime';

export interface Harness {
  app: express.Express;
  server: http.Server;
  engine: MatchingEngine;
  stop: () => Promise<void>;
}

export async function resetDatabase() {
  const env = requireRuntimeEnv(loadEnv(true));
  const c = await mysql.createConnection({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
  });
  await c.query(`DROP DATABASE IF EXISTS \`${env.DB_NAME}\``);
  await c.query(`CREATE DATABASE \`${env.DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await c.end();
}

export async function startHarness(): Promise<Harness> {
  await resetDatabase();
  const env = requireRuntimeEnv(loadEnv(true));
  setEncryptionKey(env.ENCRYPTION_KEY);
  initDb({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    poolSize: 10,
  });
  initRedis(env.REDIS_URL);
  await redis().flushdb();
  await migrate(db());
  await loadSettings();
  // SMTP "configured" so emails are queued; no mail worker runs in tests, so nothing is sent.
  await setSettings({
    'auth.email_verification_required': false,
    'market.provider': 'internal',
    'smtp.host': 'smtp.test.invalid',
    'smtp.from': 'test@example.com',
  });
  await loadFees();
  await seedInternalMarket();
  await loadAssets();
  await loadMarkets();
  const engine = new MatchingEngine();
  await engine.start();
  setLocalEngine(engine);
  runtime.engine = engine;

  const app = express();
  app.set('trust proxy', 'loopback');
  app.use(cookieParser());
  const api = express.Router();
  api.use(
    express.json({
      verify: (req, _res, buf) => ((req as Request & { rawBody?: string }).rawBody = buf.toString('utf8')),
    }),
  );
  api.use(buildAppApi());
  api.use(notFound);
  api.use(errorHandler);
  app.use('/api', api);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  return {
    app,
    server,
    engine,
    stop: async () => {
      await engine.stop();
      setLocalEngine(null);
      await new Promise((r) => server.close(() => r(null)));
      await closeQueues();
      await closeRedis();
      await closeDb();
    },
  };
}

export async function seedInternalMarket() {
  await exec(
    "INSERT INTO assets (symbol, name, `precision`, source) VALUES ('TST', 'Test Coin', 8, 'manual'), ('USDT', 'Tether', 8, 'manual')",
  );
  await exec(
    `INSERT INTO markets (symbol, base_asset_id, quote_asset_id, base, quote, engine, provider, provider_symbol, tick_size, step_size, price_precision, qty_precision, min_qty, min_notional)
     SELECT 'TSTUSDT', b.id, q.id, 'TST', 'USDT', 'internal', 'internal', 'TSTUSDT', 0.01, 0.0001, 2, 4, 0.0001, 1 FROM assets b, assets q WHERE b.symbol = 'TST' AND q.symbol = 'USDT'`,
  );
}

/** Creates a user, credits balances through the ledger, returns a logged-in agent. */
export async function userAgent(h: Harness, email: string, credits: Record<string, string> = {}) {
  const id = await createUser({
    email,
    name: email.split('@')[0]!,
    passwordHash: await hashPassword('Password123!'),
    emailVerified: true,
  });
  const { tx } = await import('../src/infrastructure/db');
  const { BalanceSession } = await import('../src/modules/wallets/ledger');
  await tx(async (c) => {
    const bs = new BalanceSession(c);
    for (const [sym, amt] of Object.entries(credits)) {
      const a = await one<{ id: number }>('SELECT id FROM assets WHERE symbol = ?', [sym], c);
      await bs.apply({
        userId: id,
        assetId: Number(a!.id),
        available: amt,
        locked: 0,
        type: 'adjustment',
        refType: 'test',
        refId: 'seed',
      });
    }
  });
  const agent = request.agent(h.server);
  const csrf = await csrfFor(agent);
  const r = await agent
    .post('/api/auth/login')
    .set('x-csrf-token', csrf)
    .send({ email, password: 'Password123!' });
  if (r.body.status !== 'ok') throw new Error(`login failed: ${JSON.stringify(r.body)}`);
  const token = await csrfFor(agent);
  return { id, agent, csrf: token };
}

export async function csrfFor(agent: ReturnType<typeof request.agent>) {
  const r = await agent.get('/api/auth/csrf');
  return r.body.csrfToken as string;
}

export async function balance(userId: number, symbol: string) {
  const r = await one<{ available: string; locked: string }>(
    'SELECT b.available, b.locked FROM balances b JOIN assets a ON a.id = b.asset_id WHERE b.user_id = ? AND a.symbol = ?',
    [userId, symbol],
  );
  return { available: r?.available ?? '0', locked: r?.locked ?? '0' };
}
