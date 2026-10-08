<?php
/**
 * Store settings organised in tabs. Each tab declares the keys it may write,
 * with a type used for validation/normalisation.
 */
final class AdminSettingsController extends AdminController
{
    public const TABS = [
        'general'  => ['label' => 'General', 'icon' => 'fa-solid fa-store', 'keys' => [
            'store_name' => 'text', 'store_tagline' => 'text', 'currency' => 'text', 'currency_symbol' => 'text', 'bengali_digits' => 'bool',
            'contact_phone' => 'text', 'contact_email' => 'email', 'contact_address' => 'text',
            'facebook_url' => 'url', 'messenger_url' => 'url', 'instagram_url' => 'url', 'youtube_url' => 'url', 'tiktok_url' => 'url',
        ]],
        'whatsapp' => ['label' => 'WhatsApp', 'icon' => 'fa-brands fa-whatsapp', 'keys' => [
            'whatsapp_enabled' => 'bool', 'whatsapp_number' => 'phone', 'whatsapp_position' => 'select:left,right',
            'whatsapp_greeting' => 'text', 'whatsapp_message' => 'textarea', 'text_whatsapp_order' => 'textarea',
        ]],
        'theme'    => ['label' => 'Theme', 'icon' => 'fa-solid fa-palette', 'keys' => [
            'primary_color' => 'color', 'primary_dark' => 'color', 'secondary_color' => 'color', 'accent_color' => 'color',
            'dark_mode_enabled' => 'bool', 'default_theme' => 'select:light,dark',
        ]],
        'home'     => ['label' => 'Home page', 'icon' => 'fa-solid fa-house', 'keys' => [
            'home_sections' => 'sections', 'hero_title' => 'text', 'hero_subtitle' => 'text', 'flash_sale_title' => 'text', 'flash_sale_ends_at' => 'datetime',
            'cta_title' => 'text', 'cta_text' => 'textarea', 'cta_button' => 'text', 'cta_link' => 'url',
            'announcement_enabled' => 'bool', 'announcement_text' => 'text', 'products_per_page' => 'select:12,24,36,48',
        ]],
        'orders'   => ['label' => 'Orders & stock', 'icon' => 'fa-solid fa-boxes-stacked', 'keys' => [
            'low_stock_threshold' => 'int', 'allow_backorder' => 'bool', 'coupon_enabled' => 'bool', 'geoip_enabled' => 'bool',
            'text_checkout_note' => 'text', 'text_order_success_title' => 'text', 'text_order_success_body' => 'text', 'text_order_success_call' => 'text',
        ]],
        'seo'      => ['label' => 'SEO', 'icon' => 'fa-solid fa-magnifying-glass-chart', 'keys' => [
            'seo_title' => 'text', 'seo_description' => 'textarea', 'seo_keywords' => 'text',
        ]],
        'pages'    => ['label' => 'Pages', 'icon' => 'fa-solid fa-file-lines', 'keys' => [
            'page_about' => 'html', 'page_privacy' => 'html', 'page_terms' => 'html', 'page_return' => 'html',
        ]],
        'pwa'      => ['label' => 'App (PWA)', 'icon' => 'fa-solid fa-mobile-screen-button', 'keys' => [
            'pwa_enabled' => 'bool', 'pwa_short_name' => 'text', 'pwa_theme_color' => 'color', 'pwa_bg_color' => 'color',
        ]],
        'system'   => ['label' => 'System', 'icon' => 'fa-solid fa-gear', 'keys' => [
            'maintenance_mode' => 'bool', 'maintenance_message' => 'text', 'google_client_id' => 'text',
        ]],
    ];

    private const UPLOADS = [
        'logo' => [600, null, false], 'favicon' => [64, 1.0, true], 'og_image' => [1200, 1.91, false], 'pwa_icon' => [512, 1.0, true],
    ];

    public function index(Request $r): Response
    {
        $tab = isset(self::TABS[(string)$r->get('tab')]) ? (string)$r->get('tab') : 'general';
        return $this->page('settings', ['tab' => $tab, 'tabs' => self::TABS, 's' => Setting::all()], [
            'title' => 'Settings', 'nav' => 'settings', 'page' => 'settings',
            'scripts' => $tab === 'pages' ? ['editor'] : [], 'styles' => $tab === 'pages' ? ['admin-editor'] : [],
        ]);
    }

    public function save(Request $r): Response
    {
        $tab = $r->str('tab', 20);
        $def = self::TABS[$tab] ?? null;
        if (!$def) {
            return $this->fail('Unknown settings tab.');
        }
        $values = [];
        foreach ($def['keys'] as $key => $type) {
            $raw = $r->input($key);
            $values[$key] = $this->normalize($key, $type, $raw, $r);
        }
        $old = array_intersect_key(Setting::all(), $values);
        Setting::setMany($values);
        [$o, $n] = Audit::diff($old, $values);
        Audit::log('settings.' . $tab, 'settings', null, $o ?: null, $n ?: null);
        Cache::catalogChanged();
        return $this->done('Settings saved.');
    }

    public function upload(Request $r, string $field): Response
    {
        if (!isset(self::UPLOADS[$field])) {
            return $this->fail('Unknown upload field.', 404);
        }
        $file = $r->file('file');
        if (!$file) {
            return $this->fail('Choose an image first.');
        }
        [$width, $ratio, $icons] = self::UPLOADS[$field];
        $old = (string)setting($field);
        if ($icons) {
            $paths = ImageService::storeIcons($file);
            $path = $field === 'favicon' ? $paths[32] : $paths[512];
        } else {
            $path = ImageService::storeSingle($file, 'site', $width, $ratio);
        }
        Setting::set($field, $path);
        if ($old && !$icons) {
            ImageService::deleteVariants($old, '', 'single');
        }
        Audit::log('settings.upload', 'settings', null, null, ['field' => $field]);
        Cache::catalogChanged();
        return $this->done(ucfirst(str_replace('_', ' ', $field)) . ' updated.');
    }

    public function clearCache(Request $r): Response
    {
        Cache::flushAll();
        Setting::set('cache_version', (string)((int)setting('cache_version', 1) + 1));
        Audit::log('cache.clear');
        return $this->done('All caches cleared.');
    }

    private function normalize(string $key, string $type, mixed $raw, Request $r): string
    {
        $str = is_scalar($raw) ? trim(clean_text((string)$raw)) : '';
        [$kind, $arg] = array_pad(explode(':', $type, 2), 2, '');
        return match ($kind) {
            'bool'     => in_array($raw, ['1', 'on', 1, true], true) ? '1' : '0',
            'int'      => (string)max(0, (int)en_digits($str)),
            'color'    => preg_match('/^#[0-9a-f]{6}$/i', $str) ? strtolower($str) : (string)setting($key),
            'email'    => $str === '' || filter_var($str, FILTER_VALIDATE_EMAIL) ? $str : throw new ValidationException([$key => 'Invalid email address.']),
            'url'      => $str === '' || preg_match('#^(https?://|/)#i', $str) ? $str : throw new ValidationException([$key => 'Links must start with https:// or /']),
            'phone'    => preg_match('/^\+?[0-9 ]{8,16}$/', en_digits($str)) ? en_digits($str) : throw new ValidationException([$key => 'Enter a valid phone number, e.g. +8801XXXXXXXXX']),
            'select'   => in_array($str, explode(',', $arg), true) ? $str : (string)setting($key),
            'datetime' => $str !== '' && strtotime($str) ? date('Y-m-d H:i:s', strtotime($str)) : '',
            'html'     => HtmlSanitizer::clean((string)$raw),
            'textarea' => mb_substr($str, 0, 2000),
            'sections' => $this->sections($r),
            default    => mb_substr($str, 0, 300),
        };
    }

    private function sections(Request $r): string
    {
        $keys = (array)$r->input('section_key', []);
        $allowed = ['hero', 'categories', 'flash', 'featured', 'coupon', 'combo', 'free_delivery', 'popular', 'latest', 'cta'];
        $out = [];
        foreach ($keys as $i => $key) {
            if (!in_array($key, $allowed, true) || isset($out[$key])) {
                continue;
            }
            $sort = (string)(((array)$r->input('section_sort', []))[$i] ?? 'manual');
            $out[$key] = [
                'key' => $key,
                'enabled' => isset(((array)$r->input('section_enabled', []))[$key]) ? 1 : 0,
                'limit' => max(1, min(48, (int)(((array)$r->input('section_limit', []))[$i] ?? 8))),
                'sort' => isset(Product::SORTS[$sort]) ? $sort : 'manual',
            ];
        }
        return json_encode(array_values($out), JSON_UNESCAPED_UNICODE);
    }
}
