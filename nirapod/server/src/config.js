// Loads and validates environment configuration. Secrets live only in env.
import 'dotenv/config';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3000'),
  // Unset = false in dev/test, true in production (Hostinger/NGINX terminate HTTPS in front of Node).
  TRUST_PROXY: bool.optional(),
  // Comma-separated list of allowed browser origins (admin/landing are same-origin, so this is usually empty).
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  FORCE_HTTPS: bool.default(false),

  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_NAME: z.string().default('nirapod_dev'),
  DB_USER: z.string().default('nirapod'),
  DB_PASSWORD: z.string().default(''),
  // Separate MySQL user for the admin panel with NO grants on location tables (see tools/sql/admin-grants.sql).
  DB_ADMIN_USER: z.string().optional(),
  DB_ADMIN_PASSWORD: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().default(10),

  JWT_ACCESS_SECRET: z.string().min(32).optional(),
  JWT_ACCESS_TTL_S: z.coerce.number().int().default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().default(60),
  // 32-byte base64 key used to encrypt secrets at rest (e.g. the OpenAI key, redeem codes).
  MASTER_KEY: z.string().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().default(10),
  // /auth/refresh has its own, more generous per-IP limiter (apps refresh every 15 minutes per device).
  REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().default(30),
  // bcrypt work factor. 12 is required in production; tests may lower it for speed.
  BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  // Version string stored with the 18+/Terms/Privacy consent.
  TERMS_VERSION: z.string().min(1).max(20).default('2026-10'),
  // Profile photos (re-encoded, metadata-free) are written here and served read-only at /media/avatars/.
  // Photos and chat images. Must live OUTSIDE the app folder so a redeploy (new zip) never deletes them.
  UPLOAD_DIR: z.string().min(1).optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: bool.default(false),
  MAIL_FROM: z.string().optional(),

  FCM_SERVICE_ACCOUNT_JSON_PATH: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_IDS: z.string().optional(),
  GOOGLE_PLAY_PACKAGE_NAME: z.string().default('app.nirapod.family'),
  GEOIP_DB_PATH: z.string().optional(),
  // Server-side key for Places API (New) nearby search (restrict it to the server IP in Google Cloud).
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  // One-time key to create the first super admin at /admin (remove it after setup).
  ADMIN_SETUP_KEY: z.string().min(12).optional(),
});

export function loadConfig(env = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${issues}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === 'production') {
    const missing = ['JWT_ACCESS_SECRET', 'MASTER_KEY', 'DB_PASSWORD', 'DB_ADMIN_USER', 'DB_ADMIN_PASSWORD'].filter(
      (k) => !cfg[k],
    );
    if (missing.length) throw new Error(`Missing required production settings: ${missing.join(', ')}`);
    if (cfg.BCRYPT_COST < 12) throw new Error('BCRYPT_COST must be at least 12 in production');
    cfg.FORCE_HTTPS = true;
  }
  // Default upload folder: in production the home folder (~/nirapod-uploads), outside the deployed app, so new
  // deploys keep every profile photo, agent photo, banner logo and chat image. Locally ./uploads.
  if (!cfg.UPLOAD_DIR) {
    const home = env.HOME || os.homedir();
    cfg.UPLOAD_DIR = cfg.NODE_ENV === 'production' && home ? path.join(home, 'nirapod-uploads') : './uploads';
  }
  if (cfg.TRUST_PROXY === undefined) cfg.TRUST_PROXY = cfg.NODE_ENV === 'production';
  cfg.corsOrigins = cfg.CORS_ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  return Object.freeze(cfg);
}
