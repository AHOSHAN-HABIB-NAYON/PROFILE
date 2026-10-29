// app_settings access. Public keys are served by /app-config; `secret.*` keys hold encrypted values that only
// the server reads (never sent to the app or shown unmasked in admin).
import { fromJson } from './db/json.js';
import { decryptSecret, encryptSecret } from './crypto/secrets.js';

export async function getSetting(db, key, fallback = null) {
  const row = await db('app_settings').where({ key }).first('value');
  const v = row ? fromJson(row.value) : undefined;
  return v === undefined || v === null ? fallback : v;
}

export async function setSetting(db, key, value, adminId = null) {
  await db('app_settings').insert({ key, value: JSON.stringify(value), updated_by_admin_id: adminId })
    .onConflict('key').merge({ value: JSON.stringify(value), updated_by_admin_id: adminId });
}

export async function getSecret(db, cfg, key) {
  const v = await getSetting(db, `secret.${key}`);
  return typeof v === 'string' ? decryptSecret(cfg.MASTER_KEY || cfg.JWT_ACCESS_SECRET, v) : null;
}

export async function setSecret(db, cfg, key, plain, adminId = null) {
  if (plain == null || plain === '') {
    await db('app_settings').where({ key: `secret.${key}` }).del();
    return;
  }
  await setSetting(db, `secret.${key}`, encryptSecret(cfg.MASTER_KEY || cfg.JWT_ACCESS_SECRET, plain), adminId);
}
