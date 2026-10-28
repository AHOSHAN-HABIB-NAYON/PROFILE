import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshDb } from './helpers.js';
import { seed } from '../src/db/seed.js';
import { LOCATION_TABLES } from '../migrations/20261028_0001_initial_schema.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const REQUIRED = `users, families, family_members, consents, child_devices, join_codes, invites, locations, places,
sos_events, sos_deliveries, trips, plans, plan_prices, subscriptions, redeem_codes, redemptions, grants,
support_tickets, chat_conversations, chat_messages, chat_attachments, agents, kb_articles, ai_settings, ai_usage,
emergency_numbers, app_settings, changelog, audit_logs, notifications, email_logs, nearby_cache, abuse_reports,
data_requests`.split(/[\s,]+/).filter(Boolean);

let db;
before(async () => { db = await freshDb(); });
after(async () => db.destroy());

async function tables() {
  const [rows] = await db.raw('SHOW TABLES');
  return rows.map((r) => Object.values(r)[0]);
}

test('every table required by the spec exists', async () => {
  const t = await tables();
  for (const name of REQUIRED) assert.ok(t.includes(name), `missing table ${name}`);
});

test('users table has the required profile fields', async () => {
  const cols = Object.keys(await db('users').columnInfo());
  for (const c of ['auth_provider', 'google_sub', 'name', 'avatar_url', 'avatar_thumb_url', 'country_iso2',
    'timezone', 'tz_auto', 'detected_source', 'language', 'email_verified_at']) {
    assert.ok(cols.includes(c), `users.${c}`);
  }
  assert.ok(!cols.includes('phone'), 'no phone number is collected');
});

test('migrations roll back and re-apply cleanly', async () => {
  await db.migrate.rollback(undefined, true);
  assert.deepEqual((await tables()).filter((t) => !t.startsWith('knex_')), []);
  await db.migrate.latest();
  assert.ok((await tables()).includes('users'));
});

test('seed is idempotent and loads plans with spec limits', async () => {
  await seed(db);
  await seed(db);
  const plans = await db('plans').orderBy('sort_order');
  assert.deepEqual(plans.map((p) => p.code), ['free', 'premium', 'family_plus']);
  const free = plans[0];
  assert.equal(free.max_children, 1); assert.equal(free.max_members, 2);
  assert.equal(free.max_places, 2); assert.equal(free.history_days, 3);
  assert.equal(plans[1].history_days, 30); assert.equal(plans[1].trial_days, 7);
  assert.equal(plans[2].history_days, 90); assert.equal(plans[2].max_places, null);
  for (const p of plans) {
    const f = typeof p.features === 'string' ? JSON.parse(p.features) : p.features;
    assert.ok(f.includes('live_map') && f.includes('sos'), `${p.code}: live map and SOS are never paywalled`);
  }
  const bd = await db('emergency_numbers').where({ country_iso2: 'BD' }).first();
  assert.equal(bd.number, '999');
});

test('place radius is limited to 100-300 m by the database', async () => {
  const [u] = await db('users').insert({ uuid: crypto.randomUUID(), auth_provider: 'email', email: 'a@example.com' });
  const [f] = await db('families').insert({ uuid: crypto.randomUUID(), owner_user_id: u });
  const base = { family_id: f, name: 'School', lat: 23.8, lng: 90.4 };
  await db('places').insert({ ...base, uuid: crypto.randomUUID(), radius_m: 150 });
  await assert.rejects(db('places').insert({ ...base, uuid: crypto.randomUUID(), radius_m: 50 }));
  await assert.rejects(db('places').insert({ ...base, uuid: crypto.randomUUID(), radius_m: 400 }));
});

test('admin DB grants never include location tables and cover every other table', async () => {
  const sql = fs.readFileSync(path.resolve(here, '../../tools/sql/admin-grants.sql'), 'utf8');
  const granted = new Set([...sql.matchAll(/^GRANT [^;]* ON nirapod\.(\w+) TO/gm)].map((m) => m[1]));
  for (const t of LOCATION_TABLES) assert.ok(!granted.has(t), `admin must not be granted ${t}`);
  const all = (await tables()).filter((t) => !t.startsWith('knex_'));
  for (const t of all) {
    if (!LOCATION_TABLES.includes(t)) assert.ok(granted.has(t), `admin-grants.sql has no decision for ${t}`);
  }
});

test('admin code never references location tables', () => {
  const dirs = [path.resolve(here, '../src/admin'), path.resolve(here, '../../admin')];
  const files = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && e.name !== 'node_modules') walk(p);
      else if (/\.(js|mjs|html|ts)$/.test(e.name)) files.push(p);
    }
  };
  dirs.forEach(walk);
  const pattern = new RegExp(`['"\`](${LOCATION_TABLES.join('|')})['"\`]`);
  for (const f of files) assert.ok(!pattern.test(fs.readFileSync(f, 'utf8')), `${f} references a location table`);
});
