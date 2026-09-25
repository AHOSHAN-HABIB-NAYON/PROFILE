'use strict';
/**
 * Key/value system settings with in-memory cache and typed defaults.
 * Secrets (is_secret = 1) are never returned by `publicSettings()`.
 */
const db = require('../config/database');
const config = require('../config/env');

const DEFAULTS = {
  // Branding
  site_name: 'Premium Aura',
  site_subtitle: 'Vip Acess Only',
  logo_url: '',
  favicon_url: '',
  pwa_icon_url: '',
  login_background_url: '',
  primary_color: '#2563eb',
  accent_color: '#7c3aed',
  footer_text: 'Fast · Secure · Multiple API · Responsive · PWA Support · Dark & Light Mode',
  default_timezone: 'UTC',
  default_theme: 'light',
  // PWA
  pwa_name: 'Premium Aura',
  pwa_short_name: 'Aura',
  pwa_theme_color: '#2563eb',
  pwa_background_color: '#ffffff',
  // Accounts
  registration_enabled: '1',
  require_email_verification: '1',
  // Wallet
  event_reward: '0.0100',
  min_withdrawal: '50.00',
  currency_symbol: '$',
  // Access / quotas
  free_quota_daily: '10',
  // Minutes a number stays with a user without receiving an OTP before it returns to the pool
  assignment_timeout_minutes: '10',
  // Header notifications are removed automatically after this many hours
  notification_ttl_hours: '24',
  // Events
  event_expiration_hours: '24',
  feed_page_size: '30',
  api_polling_default: '5',
  // Payments (fallbacks come from .env)
  trc20_address: '',
  trc20_network_note: 'Send only USDT on the TRON (TRC20) network.',
  binance_uid: '',
  binance_name: '',
  binance_pay_link: '',
  binance_qr_url: '',
  upload_max_mb: '5',
  // News
  news_demo_engagement_enabled: '0',
};

const PUBLIC_KEYS = [
  'site_name', 'site_subtitle', 'logo_url', 'favicon_url', 'pwa_icon_url', 'login_background_url',
  'primary_color', 'accent_color', 'footer_text', 'default_timezone', 'default_theme',
  'pwa_name', 'pwa_short_name', 'pwa_theme_color', 'pwa_background_color',
  'registration_enabled', 'currency_symbol', 'min_withdrawal', 'event_reward', 'feed_page_size',
];

let cache = null;
let cacheAt = 0;
const TTL = 30_000;

async function loadAll(force = false) {
  if (!force && cache && Date.now() - cacheAt < TTL) return cache;
  const rows = await db.query('SELECT setting_key, setting_value FROM system_settings');
  const map = { ...DEFAULTS };
  for (const r of rows) map[r.setting_key] = r.setting_value ?? '';
  if (!map.trc20_address) map.trc20_address = config.payments.trc20Address;
  if (!map.binance_uid) map.binance_uid = config.payments.binanceUid;
  cache = map;
  cacheAt = Date.now();
  return map;
}

async function get(key) {
  const all = await loadAll();
  return all[key] ?? DEFAULTS[key] ?? '';
}

async function getInt(key, def = 0) {
  const v = parseInt(await get(key), 10);
  return Number.isFinite(v) ? v : def;
}

async function getBool(key) {
  return ['1', 'true', 'yes', 'on'].includes(String(await get(key)).toLowerCase());
}

async function set(values, conn = db) {
  const entries = Object.entries(values).filter(([k]) => k in DEFAULTS);
  for (const [k, v] of entries) {
    await conn.run(
      'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [k, v === null || v === undefined ? '' : String(v)],
    );
  }
  invalidate();
  return entries.length;
}

function invalidate() { cache = null; }

async function publicSettings() {
  const all = await loadAll();
  const out = {};
  for (const k of PUBLIC_KEYS) out[k] = all[k];
  return out;
}

async function seedDefaults(conn = db) {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    await conn.run('INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES (?, ?)', [k, v]);
  }
  invalidate();
}

module.exports = { DEFAULTS, PUBLIC_KEYS, loadAll, get, getInt, getBool, set, invalidate, publicSettings, seedDefaults };
