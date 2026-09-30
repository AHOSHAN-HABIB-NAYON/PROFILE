'use strict';
const db = require('./db');
const cache = require('./cache');

const DEFAULTS = {
  site_name: 'চাকরি সার্কুলার',
  app_name: 'চাকরি সার্কুলার',
  tagline: 'সবার আগে সঠিক তথ্য',
  site_domain: 'cakricircular.com',
  hero_title: 'সবার আগে\nসঠিক তথ্য\nচাকরি সার্কুলার',
  hero_subtitle: 'সরকারি-বেসরকারি চাকরি, ভর্তি, রেজাল্ট, নোটিশ ও স্কলারশিপ',
  logo: '',
  hero_image: '',
  favicon: '',
  theme_color: '#15803d',
  footer_about: 'চাকরি সার্কুলার বাংলাদেশের একটি বিশ্বস্ত চাকরি ও নিয়োগ তথ্যভিত্তিক প্ল্যাটফর্ম। সরকারি-বেসরকারি চাকরি, ভর্তি, রেজাল্ট, নোটিশ ও স্কলারশিপের সর্বশেষ তথ্য সবার আগে সহজে পৌঁছে দিতে কাজ করছি।',
  footer_slogan: 'সঠিক তথ্য, সফল ক্যারিয়ার',
  copyright: '© {year} চাকরি সার্কুলার। সর্বস্বত্ব সংরক্ষিত।',
  contact_email: 'info@cakricircular.com',
  social_facebook: '', social_youtube: '', social_x: '', social_telegram: '', social_whatsapp: '', social_linkedin: '',
  per_page: '20',
  notice_limit: '50',
  promo_gap: '5',
  related_count: '6',
  maintenance: '0',
  maintenance_title: 'রক্ষণাবেক্ষণ চলছে',
  maintenance_text: 'আমাদের সাইটে কিছু সময়ের জন্য আপডেটের কাজ চলছে। অল্প কিছু সময়ের মধ্যেই আবার ফিরে আসব।',
  admin_path: 'v2admin',
  smtp_host: '', smtp_port: '465', smtp_secure: '1', smtp_user: '', smtp_pass: '', mail_from: '', mail_from_name: 'চাকরি সার্কুলার',
  geo_lookup: '1',
  analytics_enabled: '1',
  meta_title: 'চাকরি সার্কুলার — সরকারি ও বেসরকারি চাকরির খবর',
  meta_desc: 'সরকারি-বেসরকারি চাকরির সার্কুলার, ভর্তি, রেজাল্ট, নোটিশ ও স্কলারশিপের সর্বশেষ আপডেট সবার আগে সঠিক তথ্যসহ।',
  meta_keywords: 'চাকরির খবর, সরকারি চাকরি, বেসরকারি চাকরি, নিয়োগ বিজ্ঞপ্তি, ভর্তি, রেজাল্ট',
  og_image: '',
  google_verification: '', bing_verification: '',
  head_code: '',
  vapid_public: '', vapid_private: '',
  cron_key: '',
  push_enabled: '1',
  push_prompt_delay: '8',
  digest_enabled: '1', digest_hour: '20',
  reminder_enabled: '1',
  trash_days: '30',
  report_limit_per_hour: '5',
  auto_enabled: '0',
  openai_key: '', openai_model: 'gpt-4o-mini', openai_base: 'https://api.openai.com/v1',
  auto_sources: '',
  auto_start_date: '',
  auto_batch: '6',
  auto_daily_limit: '40',
  auto_parallel: '2',
  auto_interval_min: '60',
  auto_price_in: '0.15', auto_price_out: '0.60',
  auto_notify_email: '',
  auto_default_category: '',
  auto_prompt_extra: '',
  install_screenshots: '1',
};

let store = { ...DEFAULTS };
let loaded = false;

async function load() {
  const rows = await db.query('SELECT k, v FROM settings');
  store = { ...DEFAULTS };
  for (const r of rows) store[r.k] = r.v === null ? '' : r.v;
  loaded = true;
  return store;
}

function get(k) { return store[k] !== undefined ? store[k] : DEFAULTS[k]; }
function int(k, fallback = 0) { const n = parseInt(get(k), 10); return Number.isFinite(n) ? n : fallback; }
function bool(k) { const v = get(k); return v === '1' || v === 'true' || v === 'on'; }
function all() { return { ...store }; }

async function set(values) {
  for (const [k, v] of Object.entries(values)) {
    const val = v === null || v === undefined ? '' : String(v);
    await db.query('INSERT INTO settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, val]);
    store[k] = val;
  }
  cache.clear();
}

function adminPath() {
  const p = String(get('admin_path') || 'v2admin').replace(/[^a-zA-Z0-9_-]/g, '');
  return '/' + (p || 'v2admin');
}

module.exports = { load, get, int, bool, all, set, adminPath, DEFAULTS, isLoaded: () => loaded };
