// Phase 8: admin panel sessions, canned chat replies and push/email campaigns.
export async function up(knex) {
  await knex.schema.createTable('admin_sessions', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('admin_user_id').unsigned().notNullable().references('id').inTable('admin_users').onDelete('CASCADE');
    t.string('token_hash', 64).notNullable().unique();
    t.datetime('expires_at', { precision: 3 }).notNullable();
    t.datetime('last_used_at', { precision: 3 }).nullable();
    t.datetime('revoked_at', { precision: 3 }).nullable();
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
  });
  await knex.schema.alterTable('admin_users', (t) => {
    t.string('name', 80).nullable();
    t.integer('failed_login_count').notNullable().defaultTo(0);
    t.datetime('locked_until', { precision: 3 }).nullable();
  });
  await knex.schema.createTable('canned_replies', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.string('language', 8).notNullable().defaultTo('en');
    t.string('title', 120).notNullable();
    t.text('body').notNullable();
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
  });
  await knex.schema.createTable('campaigns', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.enu('channel', ['push', 'email', 'both']).notNullable();
    t.string('audience', 40).notNullable(); // all | free | premium | country:BD
    t.string('title', 160).notNullable();
    t.text('body').notNullable();
    t.integer('sent_count').notNullable().defaultTo(0);
    t.bigInteger('created_by_admin_id').unsigned().nullable().references('id').inTable('admin_users').onDelete('SET NULL');
    t.datetime('sent_at', { precision: 3 }).nullable();
    t.datetime('created_at', { precision: 3 }).notNullable().defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
  });
}

export async function down(knex) {
  await knex.schema.dropTable('campaigns');
  await knex.schema.dropTable('canned_replies');
  await knex.schema.alterTable('admin_users', (t) => {
    t.dropColumn('name');
    t.dropColumn('failed_login_count');
    t.dropColumn('locked_until');
  });
  await knex.schema.dropTable('admin_sessions');
}
