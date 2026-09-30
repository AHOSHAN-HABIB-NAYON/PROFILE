/* ─────────────────────────────────────────────
   কনফিগারেশন — সব মান .env থেকে আসে
   ───────────────────────────────────────────── */
import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));

export const config = {
  root,
  isProd: env.NODE_ENV === 'production',
  port: Number(env.PORT) || 3000,
  baseUrl: (env.BASE_URL || '').replace(/\/+$/, ''),
  trustProxy: bool(env.TRUST_PROXY, true),
  scheduler: bool(env.SCHEDULER, true),
  /* টেস্ট সাবডোমেইনে গুগল যেন ইনডেক্স না করে */
  noindex: bool(env.NOINDEX, false),
  uploadDir: path.resolve(root, env.UPLOAD_DIR || 'uploads'),
  publicDir: path.join(root, 'public'),
  /* সেশন কী না দিলে প্রতিবার চালুতে নতুন তৈরি হয় — তখন এডমিন লগইন রিস্টার্টে মুছে যায়। তাই .env-এ দিন। */
  sessionSecret: env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  sessionSecretFromEnv: Boolean(env.SESSION_SECRET),
  db: {
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT) || 3306,
    database: env.DB_NAME || '',
    user: env.DB_USER || '',
    password: env.DB_PASS || '',
    pool: Math.max(2, Math.min(10, Number(env.DB_POOL) || 4)),
  },
  tz: 'Asia/Dhaka',
  defaultAdminSlug: 'v2admin',
  appVersion: '3.0.0',
};

export const PERPAGE_DEFAULT = 20;
