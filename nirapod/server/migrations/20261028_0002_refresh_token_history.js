// Retired refresh-token hashes, for reuse detection (DECISIONS D-007).
// The session row keeps a stable uuid (shown in the sessions list, used as the JWT `sid`) and its CURRENT
// refresh-token hash. On every /auth/refresh the old hash moves here. Presenting a hash found here means a
// rotated token was replayed: the whole rotation_family is revoked.
// Not a location table. Admin user gets DELETE only (tools/sql/admin-grants.sql): it never needs to read hashes.

export async function up(knex) {
  await knex.schema.createTable('refresh_token_history', (t) => {
    t.bigIncrements('id').unsigned().primary();
    t.bigInteger('session_id').unsigned().notNullable().references('id').inTable('sessions').onDelete('CASCADE');
    t.string('token_hash', 64).notNullable().unique();
    t.datetime('retired_at', { precision: 3 }).notNullable();
    t.index(['session_id', 'retired_at']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('refresh_token_history');
}
