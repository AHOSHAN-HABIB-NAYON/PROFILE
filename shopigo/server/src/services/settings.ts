import { cache } from '../core/cache.js';
import { decrypt, encrypt } from '../core/crypto.js';
import { db, json } from '../db/index.js';

/**
 * Settings registry. Everything the admin can configure lives here with a
 * default, a group (for the settings UI), and flags:
 *   public  → safe to send to the storefront
 *   secret  → encrypted at rest, never returned to any client (write-only)
 */
export type SettingType = 'string' | 'text' | 'number' | 'boolean' | 'json' | 'image' | 'color' | 'select';
export interface SettingDef {
  key: string;
  group: string;
  type: SettingType;
  label: string;
  default: unknown;
  public?: boolean;
  secret?: boolean;
  options?: string[];
  help?: string;
}

const d = (group: string, key: string, type: SettingType, label: string, def: unknown, extra: Partial<SettingDef> = {}): SettingDef => ({ key, group, type, label, default: def, ...extra });

export const SETTINGS: SettingDef[] = [
  // General
  d('general', 'site_name', 'string', 'Website name', 'ShopiGo', { public: true }),
  d('general', 'site_tagline', 'string', 'Tagline', 'Better Products · Better Life', { public: true }),
  d('general', 'site_url', 'string', 'Website URL', '', { public: true }),
  d('general', 'currency', 'string', 'Currency', 'BDT', { public: true }),
  d('general', 'currency_symbol', 'string', 'Currency symbol', '৳', { public: true }),
  d('general', 'timezone', 'string', 'Timezone', 'Asia/Dhaka', { public: true }),
  d('general', 'order_prefix', 'string', 'Order ID prefix', 'SG'),
  d('general', 'language', 'select', 'Storefront language', 'en', { public: true, options: ['en', 'bn'] }),
  // Branding
  d('branding', 'logo', 'image', 'Logo', '', { public: true }),
  d('branding', 'favicon', 'image', 'Favicon', '', { public: true }),
  d('branding', 'app_icon', 'image', 'App icon (512×512)', '', { public: true }),
  d('branding', 'og_image', 'image', 'Default social share image', '', { public: true }),
  d('branding', 'primary_color', 'color', 'Accent colour', '#F26B3A', { public: true }),
  // Contact
  d('contact', 'contact_phone', 'string', 'Phone', '', { public: true }),
  d('contact', 'contact_email', 'string', 'Email', '', { public: true }),
  d('contact', 'contact_address', 'text', 'Address', '', { public: true }),
  d('contact', 'facebook_url', 'string', 'Facebook page URL', '', { public: true }),
  d('contact', 'instagram_url', 'string', 'Instagram URL', '', { public: true }),
  d('contact', 'youtube_url', 'string', 'YouTube URL', '', { public: true }),
  d('contact', 'map_embed_url', 'string', 'Google Maps embed URL', '', { public: true, help: 'Paste the https://www.google.com/maps/embed?... link' }),
  d('contact', 'business_hours', 'string', 'Business hours', 'সকাল ১০টা – রাত ১০টা', { public: true }),
  // SEO
  d('seo', 'meta_title', 'string', 'Default meta title', 'ShopiGo — Online Shopping in Bangladesh', { public: true }),
  d('seo', 'meta_description', 'text', 'Default meta description', 'Order online with Cash on Delivery all over Bangladesh.', { public: true }),
  d('seo', 'meta_keywords', 'string', 'Default keywords', 'online shopping bangladesh, cash on delivery', { public: true }),
  d('seo', 'robots_extra', 'text', 'Extra robots.txt rules', ''),
  // Delivery
  d('delivery', 'delivery_inside_dhaka', 'number', 'Delivery charge — inside Dhaka (৳)', 70, { public: true }),
  d('delivery', 'delivery_outside_dhaka', 'number', 'Delivery charge — outside Dhaka (৳)', 130, { public: true }),
  d('delivery', 'dhaka_districts', 'json', 'Districts charged as "inside Dhaka"', ['Dhaka'], { public: true }),
  d('delivery', 'free_delivery_min_order', 'number', 'Free delivery on orders over (৳, 0 = off)', 0, { public: true }),
  d('delivery', 'delivery_time_inside', 'string', 'Delivery time inside Dhaka', '১–২ দিন', { public: true }),
  d('delivery', 'delivery_time_outside', 'string', 'Delivery time outside Dhaka', '২–৫ দিন', { public: true }),
  // COD
  d('cod', 'cod_enabled', 'boolean', 'Cash on Delivery enabled', true, { public: true }),
  d('cod', 'cod_note', 'string', 'COD note at checkout', 'পণ্য হাতে পেয়ে মূল্য পরিশোধ করুন', { public: true }),
  d('cod', 'max_order_quantity', 'number', 'Max quantity per line item', 10, { public: true }),
  // Commerce toggles
  d('coupons', 'coupons_enabled', 'boolean', 'Coupon system enabled', true, { public: true }),
  d('flash_sale', 'flash_sale_enabled', 'boolean', 'Flash sale enabled', true, { public: true }),
  d('combo', 'combo_enabled', 'boolean', 'Combo offers enabled', true, { public: true }),
  // Products
  d('products', 'products_per_page', 'number', 'Products per page', 20, { public: true }),
  d('products', 'show_stock', 'boolean', 'Show stock on product page', true, { public: true }),
  d('products', 'low_stock_default', 'number', 'Default low stock threshold', 10),
  d('products', 'reviews_enabled', 'boolean', 'Product reviews enabled', true, { public: true }),
  d('products', 'reviews_auto_approve', 'boolean', 'Auto-approve reviews', false),
  d('products', 'image_quality', 'number', 'Image compression quality (40–95)', 78),
  // Courier
  d('courier', 'courier_auto_send', 'boolean', 'Send to default courier automatically when an order is confirmed', false),
  d('courier', 'courier_delivery_type', 'select', 'Default delivery type', 'home', { options: ['home', 'point'] }),
  d('courier', 'courier_note_template', 'string', 'Courier note', 'Handle with care. Call before delivery.'),
  d('courier', 'bdcourier_check_enabled', 'boolean', 'Check customer courier history (BD Courier) on new orders', false),
  // Fraud
  d('fraud', 'fraud_enabled', 'boolean', 'Fraud protection enabled', true),
  d('fraud', 'fraud_ip_limit', 'number', 'Max orders per IP', 1),
  d('fraud', 'fraud_ip_window_hours', 'number', 'IP limit window (hours)', 24),
  d('fraud', 'fraud_phone_limit', 'number', 'Max orders per phone', 3),
  d('fraud', 'fraud_phone_window_hours', 'number', 'Phone limit window (hours)', 24),
  d('fraud', 'fraud_device_limit', 'number', 'Max orders per device', 2),
  d('fraud', 'fraud_attempts_before_block', 'number', 'Rejected attempts before temporary block', 3),
  d('fraud', 'fraud_temp_block_hours', 'number', 'Temporary block duration (hours)', 24),
  d('fraud', 'fraud_lifetime_after_blocks', 'number', 'Temporary blocks before lifetime block (0 = never)', 3),
  d('fraud', 'fraud_max_quantity', 'number', 'Suspicious total quantity', 10),
  d('fraud', 'fraud_medium_threshold', 'number', 'MEDIUM risk score threshold', 30),
  d('fraud', 'fraud_high_threshold', 'number', 'HIGH risk score threshold', 60),
  d('fraud', 'fraud_reject_high', 'boolean', 'Reject HIGH risk orders automatically', false),
  d('fraud', 'ip_geolocation_enabled', 'boolean', 'Look up approximate IP location', true),
  // Security
  d('security', 'admin_2fa_required', 'boolean', 'Require 2FA (TOTP or passkey) for all admins', false),
  d('security', 'passkeys_enabled', 'boolean', 'Allow passkey sign-in', true),
  d('security', 'session_hours', 'number', 'Admin session lifetime (hours)', 12),
  d('security', 'login_max_attempts', 'number', 'Failed logins before lock', 5),
  d('security', 'login_lock_minutes', 'number', 'Lock duration (minutes)', 15),
  // Meta
  d('meta', 'meta_pixel_id', 'string', 'Meta Pixel ID', '', { public: true }),
  d('meta', 'meta_access_token', 'string', 'Conversions API access token', '', { secret: true }),
  d('meta', 'meta_test_event_code', 'string', 'Test event code', ''),
  // Google
  d('google', 'ga4_measurement_id', 'string', 'GA4 Measurement ID', '', { public: true }),
  d('google', 'ga4_api_secret', 'string', 'GA4 Measurement Protocol API secret', '', { secret: true }),
  d('google', 'google_tag_id', 'string', 'Google Tag ID', '', { public: true }),
  d('google', 'google_ads_conversion_id', 'string', 'Google Ads Conversion ID', '', { public: true }),
  d('google', 'google_ads_conversion_label', 'string', 'Google Ads Conversion Label', '', { public: true }),
  // WhatsApp
  d('whatsapp', 'whatsapp_enabled', 'boolean', 'Floating WhatsApp button', true, { public: true }),
  d('whatsapp', 'whatsapp_number', 'string', 'WhatsApp number (with country code)', '', { public: true, help: 'e.g. 8801XXXXXXXXX' }),
  d('whatsapp', 'whatsapp_greeting', 'string', 'Button greeting', 'কোনো প্রশ্ন? আমাদের মেসেজ করুন', { public: true }),
  d('whatsapp', 'whatsapp_default_message', 'text', 'Default support message', 'আসসালামু আলাইকুম।\nআমি একটি পণ্য সম্পর্কে জানতে চাই।', { public: true }),
  d('whatsapp', 'whatsapp_order_message', 'text', 'Order support message ({order_id} is replaced)', 'আসসালামু আলাইকুম।\nআমি আমার অর্ডার সম্পর্কে জানতে চাই।\nOrder ID: {order_id}\nআমি এই অর্ডার সম্পর্কে জানতে চাই।\nধন্যবাদ।', { public: true }),
  // PWA
  d('pwa', 'pwa_enabled', 'boolean', 'Progressive Web App enabled', true, { public: true }),
  d('pwa', 'pwa_short_name', 'string', 'App short name', 'ShopiGo', { public: true }),
  d('pwa', 'pwa_theme_color', 'color', 'Theme colour', '#F26B3A', { public: true }),
  d('pwa', 'pwa_background_color', 'color', 'Splash background', '#FBF5EF', { public: true }),
  d('pwa', 'android_package', 'string', 'Android package name (TWA)', ''),
  d('pwa', 'android_sha256_fingerprint', 'string', 'Android signing SHA-256 fingerprint (TWA)', ''),
  // Notifications
  d('notifications', 'notify_new_order', 'boolean', 'New order', true),
  d('notifications', 'notify_low_stock', 'boolean', 'Low stock', true),
  d('notifications', 'notify_fraud', 'boolean', 'Fraud alert', true),
  d('notifications', 'notify_courier_failure', 'boolean', 'Courier failure', true),
  d('notifications', 'notify_system', 'boolean', 'System / update / backup', true),
  // Performance
  d('performance', 'cache_ttl_seconds', 'number', 'Storefront API cache (seconds)', 60),
  d('performance', 'analytics_retention_days', 'number', 'Keep raw analytics events (days)', 365),
  // Backup
  d('backup', 'backup_auto_enabled', 'boolean', 'Automatic backups', false),
  d('backup', 'backup_frequency', 'select', 'Frequency', 'daily', { options: ['daily', 'weekly'] }),
  d('backup', 'backup_hour', 'number', 'Hour of day (Asia/Dhaka, 0–23)', 3),
  d('backup', 'backup_type', 'select', 'Automatic backup type', 'database', { options: ['database', 'full'] }),
  d('backup', 'backup_retention', 'number', 'Backups to keep', 7),
  // Updates
  d('updates', 'update_feed_url', 'string', 'Update feed URL', '', { help: 'HTTPS URL of the release feed (latest.json)' }),
  d('updates', 'update_public_key', 'text', 'Update signing public key (PEM)', ''),
  // Maintenance
  d('maintenance', 'maintenance_title', 'string', 'Maintenance title', "We're upgrading ShopiGo.", { public: true }),
  d('maintenance', 'maintenance_message', 'string', 'Maintenance message', 'Please wait a moment.', { public: true }),
];

const byKey = new Map(SETTINGS.map((s) => [s.key, s]));
export const SETTING_GROUPS = [...new Set(SETTINGS.map((s) => s.group))];

const CACHE_KEY = 'settings:all';

function coerce(def: SettingDef, value: unknown): unknown {
  switch (def.type) {
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n : def.default;
    }
    case 'boolean':
      return value === true || value === 'true' || value === 1 || value === '1';
    case 'json':
      return value;
    default:
      return value === null || value === undefined ? '' : String(value);
  }
}

async function loadAll(): Promise<Record<string, unknown>> {
  return cache.remember(CACHE_KEY, 300, async () => {
    const rows = await db().selectFrom('site_settings').select(['key', 'value', 'is_secret']).execute();
    const out: Record<string, unknown> = {};
    for (const def of SETTINGS) out[def.key] = def.default;
    for (const row of rows) {
      const def = byKey.get(row.key);
      if (!def) continue;
      try {
        const raw = row.is_secret && row.value ? decrypt(row.value) : row.value;
        out[row.key] = coerce(def, json.parse(raw, def.default));
      } catch {
        out[row.key] = def.default;
      }
    }
    return out;
  });
}

export const settings = {
  async all(): Promise<Record<string, unknown>> {
    return loadAll();
  },
  async get<T = unknown>(key: string): Promise<T> {
    const all = await loadAll();
    return (key in all ? all[key] : byKey.get(key)?.default) as T;
  },
  async num(key: string): Promise<number> { return Number(await this.get(key)) || 0; },
  async bool(key: string): Promise<boolean> { return Boolean(await this.get(key)); },
  async str(key: string): Promise<string> { return String((await this.get(key)) ?? ''); },

  async public(): Promise<Record<string, unknown>> {
    const all = await loadAll();
    const out: Record<string, unknown> = {};
    for (const def of SETTINGS) if (def.public) out[def.key] = all[def.key];
    return out;
  },

  /** Admin view: secrets are masked (only whether they are set). */
  async adminView(): Promise<Record<string, unknown>> {
    const all = await loadAll();
    const out: Record<string, unknown> = {};
    for (const def of SETTINGS) out[def.key] = def.secret ? (all[def.key] ? '__SET__' : '') : all[def.key];
    return out;
  },

  /** Returns {key: [old, new]} for audit logging. Unknown keys are rejected. */
  async update(values: Record<string, unknown>): Promise<Record<string, [unknown, unknown]>> {
    const current = await loadAll();
    const changes: Record<string, [unknown, unknown]> = {};
    for (const [key, raw] of Object.entries(values)) {
      const def = byKey.get(key);
      if (!def) throw new Error(`Unknown setting: ${key}`);
      if (def.secret && (raw === '__SET__' || raw === undefined)) continue; // unchanged secret
      const value = coerce(def, raw);
      if (def.type === 'json' && typeof value !== 'object') throw new Error(`Setting ${key} must be JSON`);
      const serialised = JSON.stringify(value);
      const stored = def.secret && value ? encrypt(serialised) : serialised;
      await db()
        .insertInto('site_settings')
        .values({ key, group: def.group, value: stored, is_secret: def.secret ? 1 : 0 })
        .onDuplicateKeyUpdate({ value: stored, group: def.group, is_secret: def.secret ? 1 : 0 })
        .execute();
      changes[key] = def.secret ? ['***', '***'] : [current[key], value];
    }
    await cache.del(CACHE_KEY);
    await cache.del('public:');
    return changes;
  },

  definitions(): SettingDef[] { return SETTINGS; },
  async invalidate() { await cache.del(CACHE_KEY); },
};

/** System (non-admin-editable) key/value state such as the installed version. */
export const systemState = {
  async get<T>(key: string, fallback: T): Promise<T> {
    const row = await db().selectFrom('system_settings').select('value').where('key', '=', key).executeTakeFirst();
    return json.parse(row?.value, fallback);
  },
  async set(key: string, value: unknown): Promise<void> {
    const v = JSON.stringify(value);
    await db().insertInto('system_settings').values({ key, value: v }).onDuplicateKeyUpdate({ value: v }).execute();
  },
};
