<?php
/** Key/value settings with defaults and a file cache (invalidated on save). */
final class Settings
{
    private static ?array $cache = null;

    public const DEFAULTS = [
        // Branding
        'site_name' => 'শপ', 'site_tagline' => 'বিশ্বস্ত অনলাইন শপিং', 'logo' => '', 'favicon' => '',
        'primary_color' => '#16a34a',
        'theme_default' => 'light', 'theme_toggle' => '1',
        // Contact
        'contact_phone' => '', 'contact_email' => '', 'contact_address' => '', 'facebook_url' => '',
        'business_hours' => 'সকাল ১০টা - রাত ১০টা', 'business_info' => '',
        'whatsapp_enabled' => '1', 'whatsapp_number' => '+8801757827996',
        'whatsapp_message' => "আসসালামু আলাইকুম,\nআমি আমার অর্ডার সম্পর্কে জানতে চাই।\nঅর্ডার আইডি: {order_id}\nঅর্ডারটি সম্পর্কে আমাকে তথ্য দেওয়ার জন্য অনুরোধ করছি।\nধন্যবাদ।",
        'whatsapp_general_message' => 'আসসালামু আলাইকুম, আমি একটি পণ্য সম্পর্কে জানতে চাই।',
        // Delivery
        'delivery_enabled' => '1', 'delivery_inside_dhaka' => '70', 'delivery_outside_dhaka' => '130',
        'dhaka_keywords' => 'ঢাকা,dhaka',
        'delivery_info' => 'ঢাকার ভিতরে ১-২ দিন, ঢাকার বাইরে ২-৪ দিনের মধ্যে ডেলিভারি।',
        'cod_info' => 'পণ্য হাতে পেয়ে মূল্য পরিশোধ করুন (ক্যাশ অন ডেলিভারি)।',
        // Homepage sections
        'home_banner' => '1', 'home_categories' => '1', 'home_flash' => '1', 'home_featured' => '1',
        'home_combo' => '1', 'home_free_delivery' => '1', 'home_coupon' => '1', 'home_products' => '1',
        'home_recommended' => '1', 'home_info' => '1',
        'home_featured_limit' => '8', 'home_products_limit' => '12', 'home_flash_limit' => '8',
        'home_free_limit' => '8', 'home_recommended_limit' => '8',
        'grid_mobile' => '2', 'grid_tablet' => '3', 'grid_desktop' => '5',
        'products_per_page' => '12',
        // Features
        'coupon_enabled' => '1', 'flash_enabled' => '1', 'combo_enabled' => '1', 'free_delivery_enabled' => '1',
        'low_stock_threshold' => '10',
        // Double-order protection
        'order_limit_enabled' => '1', 'order_limit_hours' => '24', 'order_limit_count' => '1',
        'order_attempt_limit' => '3', 'order_block_type' => 'temporary', 'order_block_hours' => '72',
        // Fraud
        'fraud_enabled' => '1', 'fraud_auto_check' => '1', 'bdcourier_api_key' => '',
        'bdcourier_endpoint' => 'https://api.bdcourier.com/courier-check',
        'fraud_review_below' => '70', 'fraud_high_below' => '40', 'fraud_min_orders' => '3',
        // Tracking
        'meta_enabled' => '0', 'meta_pixel_id' => '', 'meta_access_token' => '', 'meta_test_code' => '',
        'meta_capi_enabled' => '0', 'meta_status' => 'not_configured', 'meta_status_message' => '',
        'gtag_enabled' => '0', 'gtag_id' => '', 'gads_conversion_id' => '', 'gads_conversion_label' => '',
        'analytics_enabled' => '1',
        // SEO
        'meta_title' => '', 'meta_description' => '', 'meta_keywords' => '', 'og_image' => '',
        'robots' => 'index,follow', 'canonical_base' => '',
        // PWA
        'pwa_enabled' => '1', 'pwa_short_name' => 'শপ', 'pwa_theme_color' => '#16a34a', 'pwa_bg_color' => '#ffffff',
        // System
        'maintenance' => '0', 'maintenance_message' => 'আমরা সাইটটি আরও উন্নত করছি। কিছুক্ষণ পর আবার আসুন।',
        'notify_email' => '',
    ];

    /** Keys that must never be sent to the browser. */
    public const SECRET = ['meta_access_token', 'bdcourier_api_key'];

    private static function cacheFile(): string
    {
        return BASE_PATH . '/storage/cache/settings.php';
    }

    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $file = self::cacheFile();
        if (is_file($file)) {
            $data = include $file;
            if (is_array($data)) {
                return self::$cache = $data + self::DEFAULTS;
            }
        }
        $rows = [];
        try {
            foreach (DB::all('SELECT `key`, `value` FROM settings') as $r) {
                $rows[$r['key']] = $r['value'];
            }
        } catch (Throwable $e) {
            Logger::error('Settings load failed: ' . $e->getMessage());
        }
        @file_put_contents($file, '<?php return ' . var_export($rows, true) . ';', LOCK_EX);
        return self::$cache = $rows + self::DEFAULTS;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $all = self::all();
        return $all[$key] ?? $default ?? (self::DEFAULTS[$key] ?? null);
    }

    public static function on(string $key): bool
    {
        return (string) self::get($key, '0') === '1';
    }

    public static function setMany(array $values): void
    {
        $st = DB::pdo()->prepare('INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)');
        foreach ($values as $k => $v) {
            $st->execute([$k, is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE) : (string) $v]);
        }
        self::flush();
    }

    public static function flush(): void
    {
        self::$cache = null;
        @unlink(self::cacheFile());
        if (function_exists('opcache_invalidate')) {
            @opcache_invalidate(self::cacheFile(), true);
        }
    }
}
