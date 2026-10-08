<?php
/**
 * Integration plugins (tracking, fraud check, WhatsApp). Each plugin declares a
 * field schema rendered by Admin → Plugins. Secret fields are stored encrypted
 * and are never sent to the browser (the admin form shows "saved" placeholders).
 * Courier plugins are managed by CourierManager but appear in the same UI.
 */
final class PluginManager
{
    public const DEFINITIONS = [
        'meta_pixel' => [
            'name' => 'Meta Pixel', 'icon' => 'fa-brands fa-meta', 'category' => 'tracking',
            'description' => 'Browser-side Facebook/Instagram ads tracking.',
            'features' => ['PageView', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase', 'AJAX route PageView'],
            'fields' => [
                'pixel_id' => ['label' => 'Pixel ID', 'secret' => false, 'placeholder' => '123456789012345', 'fallback' => 'META_PIXEL_ID'],
            ],
        ],
        'meta_capi' => [
            'name' => 'Meta Conversions API', 'icon' => 'fa-solid fa-server', 'category' => 'tracking',
            'description' => 'Server-side events with event_id deduplication. Uses the Pixel ID from Meta Pixel.',
            'features' => ['Server events', 'event_id dedup', 'SHA-256 hashed user data', 'Test event code'],
            'fields' => [
                'access_token' => ['label' => 'Access Token', 'secret' => true, 'placeholder' => 'EAAG…', 'fallback' => 'META_ACCESS_TOKEN'],
                'test_event_code' => ['label' => 'Test Event Code', 'secret' => false, 'placeholder' => 'TEST12345', 'fallback' => 'META_TEST_CODE'],
            ],
        ],
        'google_tag' => [
            'name' => 'Google Tag Manager', 'icon' => 'fa-brands fa-google', 'category' => 'tracking',
            'description' => 'Loads GTM only when an ID is configured. Pushes ecommerce events to dataLayer.',
            'features' => ['page_view on AJAX navigation', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'],
            'fields' => [
                'gtm_id' => ['label' => 'GTM Container ID', 'secret' => false, 'placeholder' => 'GTM-XXXXXXX', 'fallback' => 'GOOGLE_TAG_ID'],
            ],
        ],
        'google_ads' => [
            'name' => 'Google Ads Conversion', 'icon' => 'fa-solid fa-rectangle-ad', 'category' => 'tracking',
            'description' => 'Fires a purchase conversion with value and order ID (transaction_id).',
            'features' => ['Purchase conversion', 'Order value', 'Transaction ID dedup'],
            'fields' => [
                'conversion_id' => ['label' => 'Conversion ID', 'secret' => false, 'placeholder' => 'AW-XXXXXXXXX', 'fallback' => 'GOOGLE_CONVERSION_ID'],
                'conversion_label' => ['label' => 'Conversion Label', 'secret' => false, 'placeholder' => 'AbCdEfGhIjk', 'fallback' => 'GOOGLE_CONVERSION_LABEL'],
            ],
        ],
        'fraud_check' => [
            'name' => 'Fraud Check', 'icon' => 'fa-solid fa-user-shield', 'category' => 'security',
            'description' => 'Shows customer courier history (via BD Courier) and internal order history on order pages.',
            'features' => ['Internal order history', 'Courier success ratio', 'Auto-check on order view'],
            'fields' => [
                'auto_check' => ['label' => 'Auto-check when opening an order (uses API quota)', 'type' => 'toggle', 'secret' => false],
            ],
        ],
        'whatsapp' => [
            'name' => 'WhatsApp', 'icon' => 'fa-brands fa-whatsapp', 'category' => 'support',
            'description' => 'Floating chat button and order support messages. Configure under Settings → WhatsApp.',
            'features' => ['Floating button', 'Order support message', 'Product enquiry message'],
            'fields' => [],
            'settings_link' => '/admin/settings?tab=whatsapp',
        ],
    ];

    private static array $rows = [];

    public static function row(string $slug): array
    {
        if (!isset(self::$rows[$slug])) {
            $row = null;
            try {
                $row = DB::one('SELECT slug, is_enabled, config FROM plugins WHERE slug = ?', [$slug]);
            } catch (Throwable $e) {
                Logger::error('Plugin load failed: ' . $e->getMessage());
            }
            self::$rows[$slug] = $row ?: ['slug' => $slug, 'is_enabled' => 0, 'config' => null];
        }
        return self::$rows[$slug];
    }

    public static function enabled(string $slug): bool
    {
        if ($slug === 'whatsapp') {
            return setting('whatsapp_enabled') === '1';
        }
        return (int)self::row($slug)['is_enabled'] === 1;
    }

    /** Decrypted config merged with config.php fallbacks. Server-side only. */
    public static function config(string $slug): array
    {
        $def = self::DEFINITIONS[$slug] ?? ['fields' => []];
        $stored = Crypto::decryptArray(self::row($slug)['config']);
        $out = [];
        foreach ($def['fields'] as $key => $field) {
            $value = $stored[$key] ?? '';
            if ($value === '' && !empty($field['fallback']) && defined($field['fallback'])) {
                $value = (string)constant($field['fallback']);
            }
            $out[$key] = $value;
        }
        return $out;
    }

    public static function save(string $slug, bool $enabled, array $input): void
    {
        $def = self::DEFINITIONS[$slug] ?? throw new HttpException(404);
        $current = Crypto::decryptArray(self::row($slug)['config']);
        foreach ($def['fields'] as $key => $field) {
            if (!array_key_exists($key, $input)) {
                continue;
            }
            $value = trim(clean_text((string)$input[$key]));
            // Blank secret field = keep the stored value (secrets are never echoed back).
            if (!empty($field['secret']) && $value === '') {
                continue;
            }
            $current[$key] = mb_substr($value, 0, 1000);
        }
        DB::exec(
            'INSERT INTO plugins (slug, name, category, is_enabled, config) VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), config = VALUES(config)',
            [$slug, $def['name'], $def['category'], $enabled ? 1 : 0, Crypto::encryptArray($current)]
        );
        unset(self::$rows[$slug]);
        Cache::forget('settings:tracking');
        Audit::log('plugin.update', 'plugin', null, null, ['slug' => $slug, 'enabled' => $enabled]);
    }

    /** Admin form values: secrets replaced by a "saved" flag. */
    public static function formValues(string $slug): array
    {
        $def = self::DEFINITIONS[$slug];
        $stored = Crypto::decryptArray(self::row($slug)['config']);
        $values = [];
        foreach ($def['fields'] as $key => $field) {
            $values[$key] = !empty($field['secret']) ? '' : ($stored[$key] ?? '');
            $values[$key . '__saved'] = !empty($field['secret']) && !empty($stored[$key]);
        }
        return $values;
    }
}
