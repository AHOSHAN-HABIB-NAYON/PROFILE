// Expiry reminder bookkeeping: one reminder per subscription, 3 days before it ends (trial or non-renewing).
export async function up(knex) {
  await knex.schema.alterTable('subscriptions', (t) => {
    t.datetime('reminder_sent_at', { precision: 3 }).nullable();
  });
}
export async function down(knex) {
  await knex.schema.alterTable('subscriptions', (t) => t.dropColumn('reminder_sent_at'));
}
