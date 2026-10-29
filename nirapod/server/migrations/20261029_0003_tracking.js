// Phase 3: background tracking support.
// - child_devices.upload_key_hash: a device-scoped key that only allows POST /locations (the native background
//   service uses it, so it never touches the user's rotating refresh token).
// - alert bookkeeping so each battery/offline/location-off alert is sent once per crossing.
export async function up(knex) {
  await knex.schema.alterTable('child_devices', (t) => {
    t.string('upload_key_hash', 64).nullable().unique();
    t.datetime('upload_key_created_at', { precision: 3 }).nullable();
    t.tinyint('battery_alert_level').unsigned().nullable(); // null | 20 | 5
    t.datetime('offline_alerted_at', { precision: 3 }).nullable();
  });
  await knex.schema.alterTable('locations', (t) => {
    t.index(['recorded_at']); // retention purge
  });
}

export async function down(knex) {
  await knex.schema.alterTable('locations', (t) => t.dropIndex(['recorded_at']));
  await knex.schema.alterTable('child_devices', (t) => {
    t.dropUnique(['upload_key_hash']);
    t.dropColumn('upload_key_hash');
    t.dropColumn('upload_key_created_at');
    t.dropColumn('battery_alert_level');
    t.dropColumn('offline_alerted_at');
  });
}
