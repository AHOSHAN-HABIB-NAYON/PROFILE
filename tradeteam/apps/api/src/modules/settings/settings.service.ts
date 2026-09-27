import { z } from 'zod';
import { exec, query } from '../../infrastructure/db';
import { decrypt, encrypt } from '../../infrastructure/crypto';
import { redisPub, hasRedis } from '../../infrastructure/redis';
import { logger } from '../../infrastructure/logger';

/**
 * Typed system settings stored in `system_settings`. Secret values are AES-GCM encrypted and are
 * never returned by any API (admin UI only sees whether they are set).
 */
const bool = z.boolean();
export const SETTINGS = {
  'site.name': { schema: z.string().min(1).max(60), default: 'TradeTeam', public: true },
  'site.tagline': { schema: z.string().max(120), default: 'Trade Together • Grow Together', public: true },
  'site.logo_url': { schema: z.string().max(500), default: '', public: true },
  'site.favicon_url': { schema: z.string().max(500), default: '', public: true },
  'site.currency': { schema: z.string().min(2).max(10), default: 'USDT', public: true },
  'site.timezone': { schema: z.string().max(64), default: 'UTC', public: true },
  'site.default_theme': { schema: z.enum(['light', 'dark']), default: 'light', public: true },
  'auth.registration_enabled': { schema: bool, default: true, public: true },
  'auth.google_enabled': { schema: bool, default: false, public: true },
  'auth.passkey_enabled': { schema: bool, default: true, public: true },
  'auth.twofa_enabled': { schema: bool, default: true, public: true },
  'auth.email_verification_required': { schema: bool, default: true, public: true },
  'auth.max_login_attempts': { schema: z.number().int().min(3).max(50), default: 5, public: false },
  'auth.lockout_minutes': { schema: z.number().int().min(1).max(1440), default: 15, public: false },
  'auth.session_days': { schema: z.number().int().min(1).max(90), default: 14, public: false },
  'auth.session_idle_hours': { schema: z.number().int().min(1).max(720), default: 72, public: false },
  'google.client_id': { schema: z.string().max(200), default: '', public: true },
  'google.client_secret': { schema: z.string().max(200), default: '', secret: true },
  'smtp.host': { schema: z.string().max(200), default: '' },
  'smtp.port': { schema: z.number().int().min(1).max(65535), default: 587 },
  'smtp.secure': { schema: bool, default: false },
  'smtp.user': { schema: z.string().max(200), default: '' },
  'smtp.password': { schema: z.string().max(500), default: '', secret: true },
  'smtp.from': { schema: z.string().max(200), default: '' },
  'market.provider': { schema: z.enum(['binance', 'internal']), default: 'binance', public: true },
  'market.binance_rest_url': { schema: z.string().url(), default: 'https://api.binance.com' },
  'market.binance_ws_url': { schema: z.string().url(), default: 'wss://stream.binance.com:9443' },
  'market.sync_minutes': { schema: z.number().int().min(1).max(1440), default: 15 },
  'market.enrichment_enabled': { schema: bool, default: true },
  'market.default_engine': { schema: z.enum(['internal', 'external']), default: 'external' },
  'market.futures_enabled': { schema: bool, default: false, public: true },
  'exchange.api_key': { schema: z.string().max(200), default: '', secret: true },
  'exchange.api_secret': { schema: z.string().max(200), default: '', secret: true },
  'ws.max_channels_per_socket': { schema: z.number().int().min(10).max(1000), default: 200 },
  'ws.compression_threshold': { schema: z.number().int().min(0).max(1_000_000), default: 1024 },
  'withdrawal.require_verification': { schema: bool, default: true, public: true },
  'withdrawal.manual_review_all': { schema: bool, default: true },
  'withdrawal.daily_limit_usd': { schema: z.string().regex(/^\d+(\.\d+)?$/), default: '50000' },
  'maintenance.enabled': { schema: bool, default: false, public: true },
  'maintenance.message': {
    schema: z.string().max(500),
    default: 'We are performing scheduled maintenance.',
    public: true,
  },
  'admin.ip_allowlist': { schema: z.array(z.string().max(64)).max(200), default: [] as string[] },
  'storage.driver': { schema: z.enum(['local']), default: 'local' },
  'push.enabled': { schema: bool, default: true, public: true },
  'system.installed_version': { schema: z.string(), default: '' },
} as const;

type Defs = typeof SETTINGS;
export type SettingKey = keyof Defs;
export type SettingValue<K extends SettingKey> = z.infer<Defs[K]['schema']>;

const cache = new Map<string, unknown>();
let loaded = false;

function isSecret(k: SettingKey) {
  return (SETTINGS[k] as { secret?: boolean }).secret === true;
}

export async function loadSettings() {
  const rows = await query<{ key: string; value: string; is_secret: number }>(
    'SELECT `key`, value, is_secret FROM system_settings',
  );
  cache.clear();
  for (const r of rows) {
    try {
      const raw = r.is_secret ? decrypt(r.value, `setting:${r.key}`) : r.value;
      cache.set(r.key, JSON.parse(raw));
    } catch (e) {
      logger.error({ key: r.key, err: (e as Error).message }, 'failed to read setting');
    }
  }
  loaded = true;
}

export function getSetting<K extends SettingKey>(k: K): SettingValue<K> {
  if (!loaded) return SETTINGS[k].default as SettingValue<K>;
  return (cache.has(k) ? cache.get(k) : SETTINGS[k].default) as SettingValue<K>;
}

export async function setSettings(values: Partial<Record<SettingKey, unknown>>, adminId?: number | null) {
  const validated: [SettingKey, unknown][] = [];
  for (const [k, v] of Object.entries(values)) {
    const def = SETTINGS[k as SettingKey];
    if (!def) throw new Error(`Unknown setting ${k}`);
    // Secret fields submitted empty mean "keep existing".
    if (isSecret(k as SettingKey) && (v === '' || v === undefined || v === null)) continue;
    const parsed = def.schema.safeParse(v);
    if (!parsed.success) throw Object.assign(new Error(`Invalid value for ${k}`), { setting: k });
    validated.push([k as SettingKey, parsed.data]);
  }
  for (const [k, v] of validated) {
    const json = JSON.stringify(v);
    const secret = isSecret(k);
    const stored = secret ? encrypt(json, `setting:${k}`) : json;
    await exec(
      'INSERT INTO system_settings (`key`, value, is_secret, updated_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE value = VALUES(value), is_secret = VALUES(is_secret), updated_by = VALUES(updated_by)',
      [k, stored, secret ? 1 : 0, adminId ?? null],
    );
    cache.set(k, v);
  }
  if (hasRedis()) await redisPub().publish('settings:changed', JSON.stringify(validated.map(([k]) => k)));
  return validated.map(([k]) => k);
}

export function publicSettings() {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(SETTINGS) as SettingKey[]) {
    if ((SETTINGS[k] as { public?: boolean }).public) out[k] = getSetting(k);
  }
  return out;
}

/** For the admin UI: every setting, with secrets masked to a boolean "is set". */
export function adminSettingsView() {
  const out: Record<string, { value: unknown; secret: boolean; isSet?: boolean }> = {};
  for (const k of Object.keys(SETTINGS) as SettingKey[]) {
    if (isSecret(k)) out[k] = { value: '', secret: true, isSet: Boolean(getSetting(k)) };
    else out[k] = { value: getSetting(k), secret: false };
  }
  return out;
}
