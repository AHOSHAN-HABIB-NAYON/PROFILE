import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  /** Public origin of the API, e.g. https://api.quizwar.app */
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),
  /** Public origin of the web app, used for links in emails, QR deep links, OG tags. */
  PUBLIC_WEB_URL: z.string().url().default('http://localhost:5173'),
  /** Comma separated list of allowed CORS origins (web, admin, Capacitor). */
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174,https://localhost,capacitor://localhost'),
  TRUST_PROXY: bool,

  DATABASE_URL: z.string().default('mysql://quizwar:devpass@localhost:3306/quizwar'),
  DATABASE_POOL_SIZE: z.coerce.number().int().default(10),
  REDIS_URL: z.string().optional(),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().default(12),

  GOOGLE_CLIENT_ID: z.string().optional(),
  /** Extra accepted audiences (e.g. Android OAuth client ids), comma separated. */
  GOOGLE_EXTRA_AUDIENCES: z.string().optional(),

  WEBAUTHN_RP_ID: z.string().default('localhost'),
  WEBAUTHN_RP_NAME: z.string().default('QUIZ WAR: Bangladesh'),
  /** Comma separated list of accepted origins, include android:apk-key-hash:... for the app. */
  WEBAUTHN_ORIGIN: z.string().default('http://localhost:5173'),

  ANDROID_PACKAGE_NAME: z.string().default('app.quizwar.bd'),
  /** SHA-256 fingerprints of the Play App Signing + upload certificates (for assetlinks.json). */
  ANDROID_SHA256_CERT_FINGERPRINTS: z.string().optional(),

  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('QUIZ WAR <no-reply@quizwar.app>'),

  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:support@quizwar.app'),
  /** Firebase service-account JSON (stringified) for FCM HTTP v1. */
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),

  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  /** Public base URL that serves uploaded files (CDN in production). */
  STORAGE_PUBLIC_URL: z.string().default('http://localhost:4000/media'),
  UPLOAD_MAX_BYTES: z.coerce.number().int().default(5 * 1024 * 1024),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  const merged = { ...process.env, ...overrides };
  if (merged.NODE_ENV !== 'production' && merged.NODE_ENV !== 'staging') {
    // Development conveniences only — production must provide real secrets.
    merged.JWT_SECRET ??= 'dev-only-jwt-secret-change-me-0123456789abcdef';
    merged.ADMIN_JWT_SECRET ??= 'dev-only-admin-secret-change-me-0123456789abcdef';
  }
  const parsed = envSchema.safeParse(merged);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${msg}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (!env.PUBLIC_API_URL.startsWith('https://')) throw new Error('PUBLIC_API_URL must be https in production');
    if (env.JWT_SECRET === env.ADMIN_JWT_SECRET) throw new Error('JWT_SECRET and ADMIN_JWT_SECRET must differ');
  }
  cached = env;
  return env;
}

export function env(): Env {
  if (!cached) return loadEnv();
  return cached;
}

export const isProd = () => env().NODE_ENV === 'production' || env().NODE_ENV === 'staging';
