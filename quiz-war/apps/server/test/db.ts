import { loadEnv } from '../src/config/env';
import { createContext } from '../src/context';
import { closePool, createPool, db } from '../src/db/pool';
import { migrate } from '../src/db/migrate';
import { buildApp } from '../src/app';
import { LogMailer } from '../src/modules/auth/mailer';
import { unauthorized } from '../src/lib/errors';
import { seedDevQuestions } from '../src/scripts/seed-dev';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'mysql://quizwar:devpass@localhost:3306/quizwar_test';

export async function dbAvailable() {
  try {
    const pool = createPool(TEST_DB_URL, 4);
    await pool.query('SELECT 1');
    return true;
  } catch {
    await closePool().catch(() => undefined);
    return false;
  }
}

export async function resetDb() {
  const pool = db();
  await pool.query('SET FOREIGN_KEY_CHECKS = 0');
  const [rows] = await pool.query(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()`);
  for (const r of rows as { t: string }[]) await pool.query(`DROP TABLE IF EXISTS \`${r.t}\``);
  await pool.query('SET FOREIGN_KEY_CHECKS = 1');
  await migrate(pool, undefined, () => undefined);
  await seedDevQuestions();
}

export async function makeTestApp() {
  const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DB_URL, STORAGE_LOCAL_DIR: '/tmp/qw-test-uploads', CORS_ORIGINS: 'http://localhost:5173' } as any);
  const log = { info: () => undefined, warn: () => undefined, error: (o: any, m?: string) => console.error(m, o?.err ?? o) };
  const mailer = new LogMailer(() => undefined);
  const google = {
    verify: async (token: string) => {
      if (!token.startsWith('valid-google-')) throw unauthorized('Google sign-in could not be verified');
      const sub = token.slice('valid-google-'.length);
      return { sub, email: `${sub}@gmail.com`, emailVerified: true, name: sub, picture: null };
    },
  };
  const ctx = createContext(env, log as any, { mailer, google: google as any });
  await ctx.settings.load(true);
  await ctx.seasons.tick();
  const app = await buildApp(ctx, { logger: false });
  await app.ready();
  return { app, ctx, mailer };
}

export function client(app: Awaited<ReturnType<typeof makeTestApp>>['app']) {
  return async (method: string, url: string, body?: unknown, token?: string, headers: Record<string, string> = {}) => {
    const res = await app.inject({
      method: method as any,
      url: `/api/v1${url}`,
      payload: body as any,
      headers: { 'x-client-platform': 'android', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    });
    let json: any = null;
    try {
      json = res.json();
    } catch {
      json = res.body;
    }
    return { status: res.statusCode, body: json, headers: res.headers };
  };
}
