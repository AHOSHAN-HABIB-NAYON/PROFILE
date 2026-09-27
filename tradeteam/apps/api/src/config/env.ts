import fs from 'node:fs';
import { z } from 'zod';
import dotenv from 'dotenv';
import { RUNTIME_ENV_FILE, INSTALL_LOCK_FILE } from './paths';

/**
 * Configuration precedence: real environment variables > storage/runtime.env (written once by the
 * installer with 0600 permissions). Secrets never reach the frontend bundle: the web app only
 * receives values explicitly exposed through /api/config/public.
 */
const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  TRUST_PROXY: z.string().default('loopback'),
  SERVE_WEB: bool.default(true),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DB_HOST: z.string().optional(),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_NAME: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASSWORD: z.string().optional(),
  DB_POOL_SIZE: z.coerce.number().int().min(1).max(200).default(20),
  DB_SSL: bool.default(false),

  REDIS_URL: z.string().optional(),

  SESSION_SECRET: z.string().min(32).optional(),
  ENCRYPTION_KEY: z.string().optional(), // base64, 32 bytes
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  WEBHOOK_SECRET: z.string().optional(),

  /** Process roles — allow splitting into several processes/instances. */
  RUN_MARKET_DATA: bool.default(true),
  RUN_ENGINE: bool.default(true),
  RUN_WORKERS: bool.default(true),
  AUTO_MIGRATE: bool.default(true),
  INSTANCE_ID: z.string().default(() => `${process.pid}`),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function loadEnv(force = false): Env {
  if (cached && !force) return cached;
  let fileVars: Record<string, string> = {};
  if (fs.existsSync(RUNTIME_ENV_FILE)) {
    fileVars = dotenv.parse(fs.readFileSync(RUNTIME_ENV_FILE));
  }
  const merged = { ...fileVars, ...process.env };
  const parsed = schema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(
      'Invalid environment configuration: ' + JSON.stringify(parsed.error.flatten().fieldErrors),
    );
  }
  cached = parsed.data;
  return cached;
}

export function isInstalled(): boolean {
  return fs.existsSync(INSTALL_LOCK_FILE);
}

/** Validates that everything needed to run an installed application is present. */
export function requireRuntimeEnv(env: Env) {
  const missing = (
    ['DB_HOST', 'DB_NAME', 'DB_USER', 'REDIS_URL', 'SESSION_SECRET', 'ENCRYPTION_KEY'] as const
  ).filter((k) => !env[k]);
  if (missing.length) throw new Error(`Installed, but missing configuration: ${missing.join(', ')}`);
  const key = Buffer.from(env.ENCRYPTION_KEY!, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes (base64 encoded)');
  return env as Env & {
    DB_HOST: string;
    DB_NAME: string;
    DB_USER: string;
    REDIS_URL: string;
    SESSION_SECRET: string;
    ENCRYPTION_KEY: string;
  };
}
