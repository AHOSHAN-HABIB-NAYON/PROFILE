// All 8 languages are now fully translated: switch them on, unless an admin already changed the setting
// (we only flip the original seed value where every extra language was still off).
const EXTRA = ['hi', 'ur', 'ar', 'es', 'id', 'ms'];
export async function up(knex) {
  const row = await knex('app_settings').where({ key: 'languages_enabled' }).first();
  if (!row) return;
  const v = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  if (!v || !EXTRA.every((k) => v[k] === false)) return;
  const next = { ...v, en: true, bn: true };
  for (const k of EXTRA) next[k] = true;
  await knex('app_settings').where({ key: 'languages_enabled' }).update({ value: JSON.stringify(next) });
}
export async function down() {}
