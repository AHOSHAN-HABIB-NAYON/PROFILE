'use strict';
/** Idempotent default data. Safe to run on every boot. */
const db = require('../config/database');
const settings = require('../models/settings');

const PLANS = [
  { name: '7 Days', description: 'Faster access for one week', duration_days: 7, price: '1.00', resource_limit: null, hourly: 100, daily: 500, sort_order: 1 },
  { name: '15 Days', description: 'Two weeks of faster speed', duration_days: 15, price: '3.00', resource_limit: null, hourly: 150, daily: 1000, sort_order: 2 },
  { name: '30 Days', description: 'Best value for regular members', duration_days: 30, price: '5.00', resource_limit: null, hourly: 200, daily: 1500, sort_order: 3, is_featured: 1 },
  { name: '1 Year', description: 'Top speed for a full year', duration_days: 365, price: '10.00', resource_limit: null, hourly: 500, daily: 5000, sort_order: 4 },
];

const SERVICES = [
  ['Pakistan', 'PK', 'pk', 'Telegram', 'TG', 'telegram', 1],
  ['Iraq', 'IQ', 'iq', 'WhatsApp', 'WS', 'whatsapp', 2],
  ['India', 'IN', 'in', 'Telegram', 'TG', 'telegram', 3],
  ['Bangladesh', 'BD', 'bd', 'Telegram', 'TG', 'telegram', 4],
];

const PROVIDERS = [
  {
    name: 'TelerouteX', provider_type: 'teleroutex', base_url: 'https://server.teleroutex.com',
    endpoint: '/api/message-data-record/viewstats', auth_type: 'query_token', auth_param_name: 'apiKey',
    credential_env: 'TELEROUTEX_API_KEY', query_json: { page: 1, pageSize: 50 }, records_path: 'data.docs',
  },
  {
    name: 'ThirdWave', provider_type: 'thirdwave', base_url: 'https://clients.thirdwave.im',
    endpoint: '/api/v1/traffic', auth_type: 'bearer', credential_env: 'THIRDWAVE_API_KEY',
    query_json: { page: 1, pageSize: 50 }, records_path: 'data',
  },
  {
    name: 'Lamix', provider_type: 'lamix', base_url: 'https://panel.lamix.org',
    endpoint: '/api/v1/messages', auth_type: 'query_token', auth_param_name: 'token', credential_env: 'LAMIX_API_TOKEN',
    query_json: { from: '{{window_start}}', to: '{{now}}', limit: 100 }, records_path: 'data',
  },
  {
    name: 'EnterpriseSMS', provider_type: 'enterprisesms', base_url: 'https://www.enterprisesms.site',
    endpoint: '/api/export', auth_type: 'query_token', auth_param_name: 'token', credential_env: 'ENTERPRISESMS_API_TOKEN',
    query_json: { otp_only: 'true' }, records_path: 'data',
  },
  {
    name: '2oo9 Cloud', provider_type: 'two009', base_url: 'https://api.2oo9.cloud/MXS47FLFX0U/tnevs/@public/api',
    endpoint: '/success-otp', auth_type: 'api_key', auth_param_name: 'mauthapi', credential_env: 'TWO009_API_KEY', records_path: 'data.otps',
  },
];

async function seed() {
  await settings.seedDefaults();

  await db.run(`INSERT IGNORE INTO rate_limits (scope, interval_seconds, hourly_limit, daily_limit) VALUES ('resource_assign', 1, 50, 200)`);
  await db.run(`INSERT IGNORE INTO maintenance (id, is_active, title, message) VALUES (1, 0, 'Scheduled maintenance', 'We are upgrading Premium Aura. Please check back shortly.')`);
  await db.run(`INSERT IGNORE INTO smtp_settings (id) VALUES (1)`);
  await db.run(
    `INSERT IGNORE INTO demo_event_settings (id, enabled, events_per_second, interval_ms, applications, countries, expiration_hours, starting_count)
     VALUES (1, 0, 2, 1000, ?, ?, 24, 0)`,
    [JSON.stringify(['TG', 'WS', 'FB', 'IG', 'TT', 'IMO', 'GG', 'MS']), JSON.stringify(['PK', 'IQ', 'IN', 'BD'])],
  );
  await db.run(`INSERT INTO event_sources (source_type, label) SELECT 'demo', 'Demo generator' FROM DUAL
                WHERE NOT EXISTS (SELECT 1 FROM event_sources WHERE source_type = 'demo')`);
  await db.run(`INSERT INTO event_sources (source_type, label) SELECT 'manual', 'Manual entry' FROM DUAL
                WHERE NOT EXISTS (SELECT 1 FROM event_sources WHERE source_type = 'manual')`);

  const [{ n: planCount }] = await db.query('SELECT COUNT(*) AS n FROM premium_plans');
  if (!planCount) {
    for (const p of PLANS) {
      await db.run(
        'INSERT INTO premium_plans (name, description, duration_days, price, resource_limit, hourly_limit, daily_limit, sort_order, is_featured) VALUES (?,?,?,?,?,?,?,?,?)',
        [p.name, p.description, p.duration_days, p.price, p.resource_limit, p.hourly, p.daily, p.sort_order, p.is_featured || 0],
      );
    }
  }

  const [{ n: svcCount }] = await db.query('SELECT COUNT(*) AS n FROM services');
  if (!svcCount) {
    for (const s of SERVICES) {
      await db.run(
        'INSERT INTO services (country_name, country_code, flag_code, app_name, app_code, app_icon, sort_order) VALUES (?,?,?,?,?,?,?)', s,
      );
    }
  }

  for (const p of PROVIDERS) {
    const res = await db.run(
      `INSERT IGNORE INTO api_providers (name, provider_type, base_url, endpoint, auth_type, auth_param_name, credential_env, query_json, records_path, polling_interval_sec, enabled)
       VALUES (?,?,?,?,?,?,?,?,?,5,0)`,
      [p.name, p.provider_type, p.base_url, p.endpoint, p.auth_type, p.auth_param_name || null, p.credential_env,
        p.query_json ? JSON.stringify(p.query_json) : null, p.records_path || null],
    );
    if (res.insertId) {
      await db.run(`INSERT IGNORE INTO event_sources (source_type, provider_id, label) VALUES ('provider', ?, ?)`, [res.insertId, p.name]);
    }
  }
}

module.exports = { seed };
