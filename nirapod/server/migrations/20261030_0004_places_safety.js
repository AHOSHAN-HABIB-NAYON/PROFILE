// Phase 4: places and safety.
// - place_presence: debounced inside/outside state per (place, child) for arrival/departure alerts.
// - trips: alert bookkeeping for safe walk (overdue / stopped too long, each once).
// - timeline_events.type: safe walk stopped / cancelled.
const TYPES = ['arrival', 'departure', 'sos', 'battery_low', 'battery_critical', 'offline', 'location_off',
  'permission_removed', 'safe_arrival', 'safe_walk_started', 'safe_walk_arrived', 'safe_walk_overdue',
  'update_requested'];
const enumSql = (list) => list.map((x) => `'${x}'`).join(',');

export async function up(knex) {
  await knex.schema.createTable('place_presence', (t) => {
    t.bigIncrements('id').primary();
    t.bigInteger('place_id').unsigned().notNullable().references('id').inTable('places').onDelete('CASCADE');
    t.bigInteger('user_id').unsigned().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.enu('state', ['inside', 'outside']).nullable();
    t.enu('pending_state', ['inside', 'outside']).nullable();
    t.tinyint('pending_count').unsigned().notNullable().defaultTo(0);
    t.datetime('changed_at', { precision: 3 }).nullable();
    t.unique(['place_id', 'user_id']);
  });
  await knex.schema.alterTable('trips', (t) => {
    t.datetime('overdue_alerted_at', { precision: 3 }).nullable();
    t.datetime('stopped_alerted_at', { precision: 3 }).nullable();
    t.index(['status', 'expected_arrival_at']);
  });
  await knex.raw(`ALTER TABLE timeline_events MODIFY type ENUM(${enumSql([...TYPES, 'safe_walk_stopped', 'safe_walk_cancelled', 'sos_resolved'])}) NOT NULL`);
}

export async function down(knex) {
  await knex('timeline_events').whereIn('type', ['safe_walk_stopped', 'safe_walk_cancelled', 'sos_resolved']).del();
  await knex.raw(`ALTER TABLE timeline_events MODIFY type ENUM(${enumSql(TYPES)}) NOT NULL`);
  await knex.schema.alterTable('trips', (t) => {
    t.dropIndex(['status', 'expected_arrival_at']);
    t.dropColumn('overdue_alerted_at');
    t.dropColumn('stopped_alerted_at');
  });
  await knex.schema.dropTable('place_presence');
}
