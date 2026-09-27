'use strict';
/**
 * Admin-configurable settings stored in the `settings` table.
 * Secrets are AES-GCM encrypted at rest and never returned to the browser.
 */
const db = require('../db');
const { encrypt, decrypt } = require('../lib/crypto');

const DEFAULTS = {
  // Branding — the site name is independent from the logo image.
  site_name: 'LifeTrack',
  site_tagline: 'Track Today • Build Tomorrow',
  site_url: '',
  logo_url: '',
  logo_show_name: '1',
  favicon_url: '',
  pwa_icon_url: '',
  og_image_url: '',
  theme_color: '#1E4FD8',
  background_color: '#F5F7FB',
  // SEO
  seo_title: 'LifeTrack — Personal Finance & Life Tracker',
  seo_description: 'Track income, expenses, accounts, bKash/Nagad/Rocket wallets, goals, lending, reports and mood in one fast, secure, installable app.',
  seo_keywords: 'finance tracker, expense tracker, budget, bKash, Nagad, Rocket, savings goals, lending tracker, PWA',
  // Landing
  landing_hero_title: 'Your life, your money, your goals — all in one place.',
  landing_hero_subtitle: 'LifeTrack helps you track spending, grow savings, remember who owes you and build better habits — beautifully, securely and offline-ready.',
  landing_cta: 'Get started free',
  landing_show_faq: '1',
  // Auth
  registration_enabled: '1',
  email_verification_required: '0',
  auth_google_enabled: '0',
  google_client_id: '',
  google_client_secret: '',
  auth_passkey_enabled: '1',
  auth_2fa_enabled: '1',
  session_days: '30',
  login_max_attempts: '5',
  login_lock_minutes: '15',
  // Mail
  mail_enabled: '0',
  smtp_host: '',
  smtp_port: '587',
  smtp_secure: '0',
  smtp_user: '',
  smtp_pass: '',
  mail_from_name: 'LifeTrack',
  mail_from_email: '',
  email_templates: '{}',
  // Push
  push_enabled: '1',
  vapid_public: '',
  vapid_private: '',
  vapid_subject: 'mailto:admin@example.com',
  firebase_enabled: '0',
  firebase_web_config: '',
  firebase_vapid_key: '',
  firebase_service_account: '',
  // Localisation
  default_language: 'en',
  languages_enabled: 'en,bn,hi',
  default_currency: 'BDT',
  default_timezone: 'Asia/Dhaka',
  currencies: JSON.stringify([
    { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', rate: 1 },
    { code: 'USD', symbol: '$', name: 'US Dollar', rate: 122 },
    { code: 'EUR', symbol: '€', name: 'Euro', rate: 132 },
    { code: 'INR', symbol: '₹', name: 'Indian Rupee', rate: 1.45 },
    { code: 'GBP', symbol: '£', name: 'British Pound', rate: 155 },
  ]),
  // Notifications
  notify_welcome: '1',
  notify_security_email: '1',
  // System
  maintenance_mode: '0',
  upload_max_mb: '5',
};

const SECRETS = new Set(['google_client_secret', 'smtp_pass', 'vapid_private', 'firebase_service_account']);

let cache = null;

async function loadAll() {
  const rows = await db.q('SELECT `key`, value, is_secret FROM settings');
  const map = { ...DEFAULTS };
  for (const r of rows) {
    if (r.is_secret) { try { map[r.key] = decrypt(r.value); } catch { map[r.key] = ''; } } else map[r.key] = r.value ?? '';
  }
  cache = map;
  return map;
}

function get(key) {
  if (!cache) return DEFAULTS[key] ?? '';
  return cache[key] ?? DEFAULTS[key] ?? '';
}
const bool = (key) => get(key) === '1' || get(key) === 'true';
const json = (key, fallback = null) => { try { const v = get(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };

async function set(key, value, userId = null) {
  const secret = SECRETS.has(key);
  const v = value === null || value === undefined ? '' : String(value);
  await db.q(
    'INSERT INTO settings (`key`, value, is_secret, updated_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value), is_secret=VALUES(is_secret), updated_by=VALUES(updated_by)',
    [key, secret ? encrypt(v) : v, secret ? 1 : 0, userId]
  );
  if (cache) cache[key] = v;
}

async function setMany(obj, userId) { for (const [k, v] of Object.entries(obj)) await set(k, v, userId); }

/** Admin view — secrets replaced with a boolean "configured" marker */
function adminView() {
  const out = {};
  for (const k of Object.keys({ ...DEFAULTS, ...(cache || {}) })) {
    out[k] = SECRETS.has(k) ? (get(k) ? '__set__' : '') : get(k);
  }
  return out;
}

function siteUrl(req) {
  const s = get('site_url');
  if (s) return s.replace(/\/+$/, '');
  if (req) return `${req.protocol}://${req.get('host')}`;
  return 'http://localhost:3000';
}

function currencies() { return json('currencies', JSON.parse(DEFAULTS.currencies)); }

module.exports = { DEFAULTS, SECRETS, loadAll, get, bool, json, set, setMany, adminView, siteUrl, currencies, isSecret: (k) => SECRETS.has(k) };
