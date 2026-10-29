// Initial schema: every table named in the spec plus auth/session/job support tables.
// Conventions: BIGINT UNSIGNED ids, utf8mb4, DATETIME(3) in UTC, public uuids for anything the app sees.
// LOCATION-BEARING TABLES (never readable by the admin DB user): see LOCATION_TABLES below and
// tools/sql/admin-grants.sql.

export const LOCATION_TABLES = ['locations', 'places', 'trips', 'sos_events', 'timeline_events', 'nearby_cache', 'place_presence'];

let K; // knex instance, set in up()
const ts = (t) => {
  t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(K.raw('CURRENT_TIMESTAMP(3)'));
  t.datetime('updated_at', { precision: 3 })
    .notNullable()
    .defaultTo(K.raw('CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'));
};
const id = (t) => t.bigIncrements('id').unsigned().primary();
const fk = (t, col, table, { nullable = false, onDelete = 'CASCADE' } = {}) => {
  const c = t.bigInteger(col).unsigned();
  if (nullable) c.nullable();
  else c.notNullable();
  c.references('id').inTable(table).onDelete(onDelete);
  return c;
};
const dt = (t, name) => t.datetime(name, { precision: 3 }).nullable();

export async function up(knex) {
  K = knex;
  // ---------- identity ----------
  await knex.schema.createTable('users', (t) => {
    id(t);
    t.uuid('uuid').notNullable().unique();
    t.string('email', 254).nullable().unique();
    t.string('password_hash', 100).nullable();
    // 'device' = child account bound to one device (no email/password). See ASSUMPTIONS A-012.
    t.enu('auth_provider', ['email', 'google', 'device']).notNullable();
    t.string('google_sub', 64).nullable().unique();
    t.string('name', 191).nullable();
    t.string('avatar_url', 500).nullable();
    t.string('avatar_thumb_url', 500).nullable();
    t.specificType('country_iso2', 'CHAR(2)').nullable();
    t.string('timezone', 64).nullable(); // IANA
    t.boolean('tz_auto').notNullable().defaultTo(true);
    t.enu('detected_source', ['timezone', 'locale', 'ip', 'manual']).nullable();
    t.string('language', 8).notNullable().defaultTo('en');
    dt(t, 'email_verified_at');
    dt(t, 'adult_confirmed_at'); // "I am 18 or older"
    dt(t, 'terms_accepted_at');
    t.string('terms_version', 20).nullable();
    t.enu('status', ['active', 'suspended', 'deleted']).notNullable().defaultTo('active');
    t.integer('failed_login_count').notNullable().defaultTo(0);
    dt(t, 'locked_until');
    dt(t, 'last_login_at');
    ts(t);
    dt(t, 'deleted_at');
  });

  await knex.schema.createTable('sessions', (t) => {
    id(t);
    fk(t, 'user_id', 'users');
    t.uuid('uuid').notNullable().unique();
    t.string('refresh_token_hash', 64).notNullable().unique(); // sha256 hex of current refresh token
    t.uuid('rotation_family').notNullable().index(); // reuse of an old token revokes the whole family
    t.string('device_id', 64).nullable();
    t.string('device_model', 100).nullable();
    t.string('os_version', 40).nullable();
    t.string('app_version', 20).nullable();
    t.string('fcm_token', 255).nullable();
    t.boolean('is_child_device').notNullable().defaultTo(false);
    dt(t, 'last_used_at');
    t.datetime('expires_at', { precision: 3 }).notNullable();
    dt(t, 'revoked_at');
    t.string('revoked_reason', 40).nullable();
    ts(t);
    t.index(['user_id', 'revoked_at']);
  });

  await knex.schema.createTable('email_codes', (t) => {
    id(t);
    fk(t, 'user_id', 'users');
    t.enu('purpose', ['verify_email', 'reset_password', 'change_email']).notNullable();
    t.string('code_hash', 64).notNullable();
    t.integer('attempts').notNullable().defaultTo(0);
    t.datetime('expires_at', { precision: 3 }).notNullable();
    dt(t, 'consumed_at');
    dt(t, 'locked_until');
    ts(t);
    t.index(['user_id', 'purpose']);
  });

  await knex.schema.createTable('admin_users', (t) => {
    id(t);
    t.string('email', 254).notNullable().unique();
    t.string('password_hash', 100).notNullable();
    t.enu('role', ['super_admin', 'support', 'finance']).notNullable();
    t.string('totp_secret_enc', 255).nullable();
    dt(t, 'totp_enabled_at');
    t.boolean('is_active').notNullable().defaultTo(true);
    dt(t, 'last_login_at');
    ts(t);
  });

  // ---------- family ----------
  await knex.schema.createTable('families', (t) => {
    id(t);
    t.uuid('uuid').notNullable().unique();
    t.string('name', 120).nullable();
    fk(t, 'owner_user_id', 'users', { nullable: true, onDelete: 'SET NULL' });
    ts(t);
    dt(t, 'deleted_at');
  });

  await knex.schema.createTable('family_members', (t) => {
    id(t);
    fk(t, 'family_id', 'families');
    fk(t, 'user_id', 'users');
    t.enu('role', ['parent', 'guardian', 'child']).notNullable();
    t.string('relationship', 40).nullable();
    t.boolean('is_overseas').notNullable().defaultTo(false);
    // Adult consent rule: adults start 'pending' and are visible only after they accept. Children are 'active'
    // after the child consent screen. Adults can pause/stop at any time.
    t.enu('sharing_status', ['pending', 'active', 'paused', 'stopped']).notNullable().defaultTo('pending');
    dt(t, 'sharing_changed_at');
    t.boolean('daily_summary_enabled').notNullable().defaultTo(false);
    t.string('daily_summary_time', 5).nullable(); // HH:MM in the member's own zone
    t.datetime('joined_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    dt(t, 'left_at');
    ts(t);
    t.unique(['family_id', 'user_id']);
  });

  await knex.schema.createTable('consents', (t) => {
    id(t);
    fk(t, 'user_id', 'users');
    fk(t, 'family_id', 'families', { nullable: true });
    t.enu('type', [
      'age_18_terms_privacy', 'child_location_sharing', 'adult_location_sharing', 'background_location_disclosure',
      'ai_chat_notice', 'email_marketing',
    ]).notNullable();
    t.string('version', 20).notNullable();
    t.boolean('granted').notNullable();
    t.json('details').nullable(); // e.g. list of member uuids shown on the consent screen
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.index(['user_id', 'type']);
  });

  await knex.schema.createTable('child_devices', (t) => {
    id(t);
    fk(t, 'user_id', 'users');
    fk(t, 'family_id', 'families');
    fk(t, 'session_id', 'sessions', { nullable: true, onDelete: 'SET NULL' });
    t.string('device_id', 64).notNullable();
    t.string('device_model', 100).nullable();
    t.string('manufacturer', 60).nullable();
    t.string('os_version', 40).nullable();
    t.string('app_version', 20).nullable();
    t.tinyint('battery_pct').unsigned().nullable();
    t.enu('location_state', ['ok', 'location_off', 'permission_removed', 'battery_saver', 'unknown'])
      .notNullable().defaultTo('unknown');
    t.json('diagnostics').nullable(); // permission flags only, never coordinates
    dt(t, 'last_seen_at');
    t.datetime('bound_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    dt(t, 'revoked_at');
    ts(t);
    t.index(['family_id', 'revoked_at']);
  });

  await knex.schema.createTable('join_codes', (t) => {
    id(t);
    fk(t, 'family_id', 'families');
    fk(t, 'created_by_user_id', 'users');
    t.specificType('code', 'CHAR(6)').notNullable().unique();
    t.datetime('expires_at', { precision: 3 }).notNullable(); // 24h
    dt(t, 'used_at');
    fk(t, 'used_by_user_id', 'users', { nullable: true, onDelete: 'SET NULL' });
    dt(t, 'revoked_at');
    ts(t);
  });

  await knex.schema.createTable('invites', (t) => {
    id(t);
    fk(t, 'family_id', 'families');
    fk(t, 'invited_by_user_id', 'users');
    t.string('email', 254).nullable();
    t.specificType('code', 'CHAR(6)').notNullable().unique();
    t.enu('role', ['parent', 'guardian']).notNullable().defaultTo('guardian');
    t.boolean('is_overseas').notNullable().defaultTo(false);
    t.string('timezone', 64).nullable();
    t.datetime('expires_at', { precision: 3 }).notNullable();
    dt(t, 'accepted_at');
    fk(t, 'accepted_by_user_id', 'users', { nullable: true, onDelete: 'SET NULL' });
    dt(t, 'revoked_at');
    ts(t);
  });

  // ---------- location (admin DB user has NO access) ----------
  await knex.schema.createTable('locations', (t) => {
    id(t);
    fk(t, 'family_id', 'families');
    fk(t, 'user_id', 'users');
    t.datetime('recorded_at', { precision: 3 }).notNullable();
    t.datetime('received_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.decimal('lat', 9, 6).notNullable();
    t.decimal('lng', 9, 6).notNullable();
    t.float('accuracy_m').notNullable();
    t.float('speed_mps').nullable();
    t.float('heading_deg').nullable();
    t.tinyint('battery_pct').unsigned().nullable();
    t.boolean('is_moving').nullable();
    t.enu('source', ['gps', 'fused', 'network', 'manual_request', 'sos', 'trip']).notNullable().defaultTo('fused');
    t.bigInteger('trip_id').unsigned().nullable();
    t.index(['user_id', 'recorded_at']);
    t.index(['family_id', 'recorded_at']);
  });

  await knex.schema.createTable('places', (t) => {
    id(t);
    t.uuid('uuid').notNullable().unique();
    fk(t, 'family_id', 'families');
    t.string('name', 80).notNullable();
    t.enu('type', ['home', 'school', 'coaching', 'custom']).notNullable().defaultTo('custom');
    t.decimal('lat', 9, 6).notNullable();
    t.decimal('lng', 9, 6).notNullable();
    t.smallint('radius_m').unsigned().notNullable().defaultTo(150);
    t.json('applies_to_user_uuids').nullable(); // null = all children
    fk(t, 'created_by_user_id', 'users', { nullable: true, onDelete: 'SET NULL' });
    ts(t);
  });
  await knex.raw('ALTER TABLE places ADD CONSTRAINT chk_places_radius CHECK (radius_m BETWEEN 100 AND 300)');

  await knex.schema.createTable('trips', (t) => {
    id(t);
    t.uuid('uuid').notNullable().unique();
    fk(t, 'family_id', 'families');
    fk(t, 'user_id', 'users');
    t.enu('type', ['safe_walk']).notNullable().defaultTo('safe_walk');
    fk(t, 'destination_place_id', 'places', { nullable: true, onDelete: 'SET NULL' });
    t.datetime('expected_arrival_at', { precision: 3 }).notNullable();
    t.enu('status', ['active', 'arrived', 'overdue', 'stopped_too_long', 'cancelled']).notNullable().defaultTo('active');
    t.datetime('started_at', { precision: 3 }).notNullable();
    dt(t, 'ended_at');
    ts(t);
  });

  await knex.schema.createTable('timeline_events', (t) => {
    id(t);
    fk(t, 'family_id', 'families');
    fk(t, 'user_id', 'users');
    t.enu('type', ['arrival', 'departure', 'sos', 'battery_low', 'battery_critical', 'offline', 'location_off',
      'permission_removed', 'safe_arrival', 'safe_walk_started', 'safe_walk_arrived', 'safe_walk_overdue',
      'update_requested']).notNullable();
    fk(t, 'place_id', 'places', { nullable: true, onDelete: 'SET NULL' });
    t.json('data').nullable();
    t.datetime('occurred_at', { precision: 3 }).notNullable();
    t.index(['family_id', 'occurred_at']);
  });

  await knex.schema.createTable('nearby_cache', (t) => {
    id(t);
    t.string('grid_cell', 32).notNullable(); // coarse cell id, not linked to any user
    t.string('category', 32).notNullable();
    t.string('language', 8).notNullable().defaultTo('en');
    t.json('payload').notNullable();
    t.datetime('fetched_at', { precision: 3 }).notNullable();
    t.datetime('expires_at', { precision: 3 }).notNullable();
    t.unique(['grid_cell', 'category', 'language']);
  });

  // ---------- SOS ----------
  await knex.schema.createTable('sos_events', (t) => {
    id(t);
    t.uuid('uuid').notNullable().unique();
    fk(t, 'family_id', 'families');
    fk(t, 'user_id', 'users');
    t.enu('trigger', ['button', 'shake']).notNullable();
    t.enu('status', ['sending', 'active', 'resolved', 'cancelled']).notNullable().defaultTo('sending');
    t.decimal('lat', 9, 6).nullable();
    t.decimal('lng', 9, 6).nullable();
    t.float('accuracy_m').nullable();
    t.datetime('started_at', { precision: 3 }).notNullable();
    dt(t, 'resolved_at');
    fk(t, 'resolved_by_user_id', 'users', { nullable: true, onDelete: 'SET NULL' });
    ts(t);
  });

  await knex.schema.createTable('sos_deliveries', (t) => {
    id(t);
    fk(t, 'sos_event_id', 'sos_events');
    fk(t, 'recipient_user_id', 'users', { nullable: true, onDelete: 'SET NULL' });
    t.string('recipient_email', 254).nullable(); // emergency contacts (email only, no SMS)
    t.enu('channel', ['push', 'email', 'socket']).notNullable();
    t.enu('status', ['queued', 'sent', 'delivered', 'seen', 'responded', 'failed']).notNullable().defaultTo('queued');
    dt(t, 'sent_at');
    dt(t, 'delivered_at');
    dt(t, 'seen_at');
    dt(t, 'responded_at');
    t.string('error', 120).nullable();
    ts(t);
  });

  await knex.schema.createTable('emergency_contacts', (t) => {
    id(t);
    fk(t, 'family_id', 'families');
    t.string('name', 120).notNullable();
    t.string('email', 254).notNullable();
    t.string('relationship', 40).nullable();
    ts(t);
  });

  // ---------- plans & billing ----------
  await knex.schema.createTable('plans', (t) => {
    id(t);
    t.string('code', 32).notNullable().unique();
    t.string('name', 60).notNullable();
    t.json('name_i18n').nullable();
    t.integer('max_children').nullable(); // null = unlimited
    t.integer('max_members').nullable();
    t.integer('max_places').nullable();
    t.integer('history_days').notNullable();
    t.json('features').notNullable();
    t.boolean('priority_support').notNullable().defaultTo(false);
    t.boolean('email_reports').notNullable().defaultTo(false);
    t.boolean('is_popular').notNullable().defaultTo(false);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.boolean('is_free').notNullable().defaultTo(false);
    t.integer('trial_days').notNullable().defaultTo(0);
    t.integer('sort_order').notNullable().defaultTo(0);
    ts(t);
  });

  await knex.schema.createTable('plan_prices', (t) => {
    id(t);
    fk(t, 'plan_id', 'plans');
    t.enu('period', ['monthly', 'yearly', 'one_time', 'multi_year']).notNullable();
    t.integer('duration_months').notNullable();
    t.specificType('currency', 'CHAR(3)').notNullable();
    t.specificType('country_iso2', 'CHAR(2)').nullable(); // null = default for the currency
    t.integer('amount_minor').notNullable();
    t.string('play_product_id', 100).nullable();
    t.string('play_base_plan_id', 100).nullable();
    t.string('play_offer_id', 100).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    ts(t);
  });

  await knex.schema.createTable('subscriptions', (t) => {
    id(t);
    fk(t, 'family_id', 'families');
    fk(t, 'plan_id', 'plans', { onDelete: 'RESTRICT' });
    t.enu('source', ['play', 'redeem', 'grant', 'trial']).notNullable();
    t.enu('status', ['trial', 'active', 'grace', 'on_hold', 'paused', 'cancelled', 'expired', 'refunded', 'revoked'])
      .notNullable();
    t.datetime('starts_at', { precision: 3 }).notNullable();
    dt(t, 'expires_at');
    t.boolean('auto_renew').notNullable().defaultTo(false);
    t.string('play_purchase_token_hash', 64).nullable().unique();
    t.string('play_order_id', 64).nullable();
    t.string('play_product_id', 100).nullable();
    fk(t, 'purchased_by_user_id', 'users', { nullable: true, onDelete: 'SET NULL' });
    ts(t);
    t.index(['family_id', 'status']);
  });

  await knex.schema.createTable('redeem_codes', (t) => {
    id(t);
    t.string('code_hash', 64).notNullable().unique();
    t.string('code_enc', 255).notNullable(); // encrypted with MASTER_KEY so admins can export CSV
    t.string('code_last4', 4).notNullable();
    fk(t, 'plan_id', 'plans', { onDelete: 'RESTRICT' });
    t.integer('duration_days').notNullable();
    dt(t, 'expires_at');
    t.string('batch_name', 80).nullable();
    t.string('gift_from_name', 80).nullable();
    t.string('gift_message', 300).nullable();
    fk(t, 'created_by_admin_id', 'admin_users', { nullable: true, onDelete: 'SET NULL' });
    t.enu('status', ['active', 'redeemed', 'revoked', 'expired']).notNullable().defaultTo('active');
    ts(t);
    t.index('batch_name');
  });

  await knex.schema.createTable('redemptions', (t) => {
    id(t);
    fk(t, 'redeem_code_id', 'redeem_codes', { onDelete: 'RESTRICT' });
    fk(t, 'family_id', 'families');
    fk(t, 'user_id', 'users', { nullable: true, onDelete: 'SET NULL' });
    fk(t, 'subscription_id', 'subscriptions', { nullable: true, onDelete: 'SET NULL' });
    t.datetime('redeemed_at', { precision: 3 }).notNullable();
    t.unique(['redeem_code_id']); // single use
  });

  await knex.schema.createTable('grants', (t) => {
    id(t);
    fk(t, 'family_id', 'families');
    t.string('target_user_email', 254).notNullable();
    fk(t, 'plan_id', 'plans', { onDelete: 'RESTRICT' });
    t.integer('duration_days').notNullable();
    t.string('note', 300).nullable();
    t.string('payment_reference', 120).nullable().index();
    t.string('gift_from_name', 80).nullable();
    t.string('gift_message', 300).nullable();
    fk(t, 'granted_by_admin_id', 'admin_users', { nullable: true, onDelete: 'SET NULL' });
    fk(t, 'subscription_id', 'subscriptions', { nullable: true, onDelete: 'SET NULL' });
    dt(t, 'revoked_at');
    fk(t, 'revoked_by_admin_id', 'admin_users', { nullable: true, onDelete: 'SET NULL' });
    ts(t);
  });

  // ---------- support & chat ----------
  await knex.schema.createTable('support_tickets', (t) => {
    id(t);
    fk(t, 'user_id', 'users');
    fk(t, 'family_id', 'families', { nullable: true, onDelete: 'SET NULL' });
    t.string('subject', 160).notNullable();
    t.text('body').notNullable();
    t.boolean('is_premium').notNullable().defaultTo(false);
    t.enu('status', ['open', 'pending', 'resolved', 'closed']).notNullable().defaultTo('open');
    ts(t);
  });

  await knex.schema.createTable('agents', (t) => {
    id(t);
    fk(t, 'admin_user_id', 'admin_users');
    t.string('display_name', 60).notNullable();
    t.string('photo_url', 500).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    ts(t);
  });

  await knex.schema.createTable('chat_conversations', (t) => {
    id(t);
    t.uuid('uuid').notNullable().unique();
    fk(t, 'user_id', 'users');
    fk(t, 'family_id', 'families', { nullable: true, onDelete: 'SET NULL' });
    t.enu('status', ['ai', 'needs_human', 'human', 'closed']).notNullable().defaultTo('ai');
    t.boolean('is_urgent').notNullable().defaultTo(false);
    t.boolean('is_suspicious').notNullable().defaultTo(false);
    t.boolean('is_priority').notNullable().defaultTo(false);
    t.boolean('legal_hold').notNullable().defaultTo(false);
    fk(t, 'assigned_agent_id', 'agents', { nullable: true, onDelete: 'SET NULL' });
    t.string('language', 8).notNullable().defaultTo('en');
    t.tinyint('ai_unsure_count').unsigned().notNullable().defaultTo(0);
    dt(t, 'last_user_message_at');
    dt(t, 'last_message_at');
    dt(t, 'inactivity_warned_at');
    dt(t, 'closed_at');
    t.enu('closed_by', ['user', 'agent', 'ai', 'system']).nullable();
    t.enu('rating', ['up', 'down']).nullable();
    ts(t);
    t.index(['status', 'last_message_at']);
  });

  await knex.schema.createTable('chat_messages', (t) => {
    id(t);
    fk(t, 'conversation_id', 'chat_conversations');
    t.enu('sender_type', ['user', 'ai', 'agent', 'system']).notNullable();
    fk(t, 'agent_id', 'agents', { nullable: true, onDelete: 'SET NULL' });
    t.text('body').nullable();
    t.boolean('is_internal_note').notNullable().defaultTo(false);
    dt(t, 'delivered_at');
    dt(t, 'read_at');
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.index(['conversation_id', 'created_at']);
  });

  await knex.schema.createTable('chat_attachments', (t) => {
    id(t);
    fk(t, 'message_id', 'chat_messages');
    fk(t, 'conversation_id', 'chat_conversations');
    t.string('storage_key', 200).notNullable();
    t.string('thumb_key', 200).nullable();
    t.string('mime', 40).notNullable();
    t.integer('size_bytes').unsigned().notNullable();
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    dt(t, 'purged_at'); // set by the 7-day purge job
    t.index('created_at');
  });

  await knex.schema.createTable('kb_articles', (t) => {
    id(t);
    t.string('language', 8).notNullable();
    t.string('slug', 120).notNullable();
    t.string('title', 200).notNullable();
    t.text('body').notNullable();
    t.string('category', 60).nullable();
    t.boolean('is_published').notNullable().defaultTo(true);
    fk(t, 'updated_by_admin_id', 'admin_users', { nullable: true, onDelete: 'SET NULL' });
    ts(t);
    t.unique(['language', 'slug']);
  });

  await knex.schema.createTable('ai_settings', (t) => {
    id(t);
    t.string('provider', 40).notNullable().defaultTo('openai');
    t.text('api_key_enc').nullable();
    t.string('model', 100).nullable();
    t.decimal('temperature', 3, 2).notNullable().defaultTo(0.3);
    t.integer('max_tokens').notNullable().defaultTo(600);
    t.text('system_prompt').nullable();
    t.integer('daily_message_limit_per_user').notNullable().defaultTo(50);
    t.decimal('global_daily_cost_cap_usd', 10, 2).notNullable().defaultTo(5);
    t.boolean('enabled').notNullable().defaultTo(false);
    ts(t);
  });

  await knex.schema.createTable('ai_usage', (t) => {
    id(t);
    fk(t, 'conversation_id', 'chat_conversations', { nullable: true, onDelete: 'SET NULL' });
    fk(t, 'user_id', 'users', { nullable: true, onDelete: 'SET NULL' });
    t.date('usage_date').notNullable();
    t.string('model', 100).notNullable();
    t.integer('prompt_tokens').notNullable().defaultTo(0);
    t.integer('completion_tokens').notNullable().defaultTo(0);
    t.bigInteger('cost_usd_micros').notNullable().defaultTo(0);
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.index(['usage_date', 'user_id']);
  });

  // ---------- config & content ----------
  await knex.schema.createTable('emergency_numbers', (t) => {
    id(t);
    t.specificType('country_iso2', 'CHAR(2)').notNullable();
    t.enu('service', ['general', 'police', 'ambulance', 'fire']).notNullable();
    t.string('number', 20).notNullable();
    t.string('note', 160).nullable();
    dt(t, 'verified_at');
    ts(t);
    t.unique(['country_iso2', 'service']);
  });

  await knex.schema.createTable('app_settings', (t) => {
    t.string('key', 80).primary();
    t.json('value').notNullable();
    fk(t, 'updated_by_admin_id', 'admin_users', { nullable: true, onDelete: 'SET NULL' });
    t.datetime('updated_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'));
  });

  await knex.schema.createTable('changelog', (t) => {
    id(t);
    t.string('version', 20).notNullable();
    t.string('language', 8).notNullable().defaultTo('en');
    t.string('title', 160).notNullable();
    t.text('body').notNullable();
    t.boolean('is_published').notNullable().defaultTo(false);
    dt(t, 'published_at');
    ts(t);
  });

  await knex.schema.createTable('audit_logs', (t) => {
    id(t);
    t.enu('actor_type', ['admin', 'agent', 'user', 'system']).notNullable();
    t.bigInteger('actor_id').unsigned().nullable();
    t.string('actor_label', 80).nullable(); // agent name shown in audit view
    t.string('action', 80).notNullable();
    t.string('target_type', 40).nullable();
    t.string('target_id', 64).nullable();
    t.json('metadata').nullable(); // never PII beyond ids, never coordinates
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.index(['target_type', 'target_id']);
    t.index('created_at');
  });

  await knex.schema.createTable('notifications', (t) => {
    id(t);
    fk(t, 'user_id', 'users');
    fk(t, 'family_id', 'families', { nullable: true, onDelete: 'CASCADE' });
    t.enu('category', ['safety', 'family', 'account', 'marketing']).notNullable();
    t.string('type', 60).notNullable();
    t.string('title_key', 80).notNullable(); // i18n key, rendered in the user's language
    t.json('params').nullable();
    dt(t, 'read_at');
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.index(['user_id', 'read_at']);
  });

  await knex.schema.createTable('email_logs', (t) => {
    id(t);
    fk(t, 'user_id', 'users', { nullable: true, onDelete: 'SET NULL' });
    t.string('template', 60).notNullable();
    t.string('language', 8).notNullable();
    t.enu('status', ['queued', 'sent', 'failed', 'bounced']).notNullable().defaultTo('queued');
    t.string('provider_message_id', 200).nullable();
    t.string('error', 200).nullable();
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    t.index('created_at');
  });

  await knex.schema.createTable('abuse_reports', (t) => {
    id(t);
    fk(t, 'reporter_user_id', 'users');
    fk(t, 'family_id', 'families', { nullable: true, onDelete: 'SET NULL' });
    fk(t, 'reported_user_id', 'users', { nullable: true, onDelete: 'SET NULL' });
    t.enu('category', ['covert_tracking', 'harassment', 'unwanted_sharing', 'other']).notNullable();
    t.text('details').nullable();
    t.enu('status', ['open', 'investigating', 'resolved', 'dismissed']).notNullable().defaultTo('open');
    dt(t, 'resolved_at');
    ts(t);
  });

  await knex.schema.createTable('data_requests', (t) => {
    id(t);
    fk(t, 'user_id', 'users', { nullable: true, onDelete: 'SET NULL' });
    t.string('requester_email', 254).nullable(); // for web deletion requests
    t.enu('type', ['export', 'delete']).notNullable();
    t.enu('status', ['pending', 'processing', 'completed', 'rejected']).notNullable().defaultTo('pending');
    t.enu('source', ['app', 'web', 'support']).notNullable();
    t.string('export_file_key', 200).nullable();
    dt(t, 'export_expires_at');
    dt(t, 'completed_at');
    ts(t);
  });

  await knex.schema.createTable('job_runs', (t) => {
    id(t);
    t.string('job', 60).notNullable();
    t.enu('status', ['running', 'ok', 'failed']).notNullable();
    t.integer('affected').nullable();
    t.string('error', 200).nullable();
    t.datetime('started_at', { precision: 3 }).notNullable();
    dt(t, 'finished_at');
    t.index(['job', 'started_at']);
  });
}

export async function down(knex) {
  const order = [
    'job_runs', 'data_requests', 'abuse_reports', 'email_logs', 'notifications', 'audit_logs', 'changelog',
    'app_settings', 'emergency_numbers', 'ai_usage', 'ai_settings', 'kb_articles', 'chat_attachments',
    'chat_messages', 'chat_conversations', 'agents', 'support_tickets', 'grants', 'redemptions', 'redeem_codes',
    'subscriptions', 'plan_prices', 'plans', 'emergency_contacts', 'sos_deliveries', 'sos_events', 'nearby_cache',
    'timeline_events', 'trips', 'places', 'locations', 'invites', 'join_codes', 'child_devices', 'consents',
    'family_members', 'families', 'admin_users', 'email_codes', 'sessions', 'users',
  ];
  for (const t of order) await knex.schema.dropTableIfExists(t);
}
