// Phase 5: per-user notification preferences and the daily family summary hour.
// notify_prefs: { push: { family, account, marketing }, email: { <type>: bool } } (safety push is always on).
export async function up(knex) {
  await knex.schema.alterTable('users', (t) => {
    t.json('notify_prefs').nullable();
    t.tinyint('daily_summary_hour').unsigned().nullable(); // local hour in the user's zone; null = off
    t.date('daily_summary_sent_on').nullable();
  });
  await knex.schema.alterTable('notifications', (t) => {
    t.index(['user_id', 'category', 'created_at']);
  });
}

export async function down(knex) {
  await knex.schema.alterTable('notifications', (t) => t.dropIndex(['user_id', 'category', 'created_at']));
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('notify_prefs');
    t.dropColumn('daily_summary_hour');
    t.dropColumn('daily_summary_sent_on');
  });
}
