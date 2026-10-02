<?php
final class AdminSystemController extends AdminController
{
    private const NUMERIC = [
        'delivery_inside_dhaka', 'delivery_outside_dhaka', 'products_per_page', 'low_stock_threshold', 'order_limit_hours', 'order_limit_count',
        'order_attempt_limit', 'order_block_hours', 'fraud_review_below', 'fraud_high_below', 'fraud_min_orders', 'grid_mobile', 'grid_tablet',
        'grid_desktop', 'home_featured_limit', 'home_products_limit', 'home_flash_limit', 'home_free_limit', 'home_recommended_limit',
    ];
    private const URLS = ['facebook_url', 'canonical_base', 'bdcourier_endpoint'];
    private const COLORS = ['primary_color', 'pwa_theme_color', 'pwa_bg_color'];

    public function notificationCount(): void
    {
        $latest = DB::one('SELECT id, title, message, link FROM notifications WHERE is_read = 0 ORDER BY id DESC LIMIT 1');
        Response::ok(['count' => Notifier::unreadCount(), 'latest' => $latest]);
    }

    public function notifications(): void
    {
        $items = DB::all('SELECT * FROM notifications ORDER BY id DESC LIMIT 100');
        View::admin('notifications', ['items' => $items], 'নোটিফিকেশন', 'notifications');
    }

    public function markRead(): void
    {
        $id = Request::int('id');
        $id ? DB::run('UPDATE notifications SET is_read = 1 WHERE id = ?', [$id]) : DB::run('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
        DB::run('DELETE FROM notifications WHERE is_read = 1 AND created_at < (NOW() - INTERVAL 60 DAY)');
        Response::ok(['count' => Notifier::unreadCount()], 'পড়া হয়েছে হিসেবে চিহ্নিত।');
    }

    public function trash(): void
    {
        View::admin('trash', ['items' => DB::all('SELECT t.*, a.name admin_name FROM trash t LEFT JOIN admins a ON a.id = t.admin_id ORDER BY t.deleted_at DESC')], 'ট্র্যাশ', 'trash');
    }

    public function restore(string $id): void
    {
        TrashService::restore($this->id($id)) ? Response::ok(null, 'ফিরিয়ে আনা হয়েছে।') : Response::fail('ফিরিয়ে আনা যায়নি।');
    }

    public function purge(string $id): void
    {
        TrashService::purge($this->id($id)) ? Response::ok(null, 'স্থায়ীভাবে মুছে ফেলা হয়েছে।') : Response::fail('মুছে ফেলা যায়নি।');
    }

    public function settings(): void
    {
        $seo = array_column(DB::all('SELECT * FROM seo_settings'), null, 'page_key');
        View::admin('settings', ['s' => Settings::all(), 'seo' => $seo, 'admin' => DB::one('SELECT username, name FROM admins WHERE id = ?', [Auth::id()])], 'সেটিংস', 'settings');
    }

    public function saveSettings(): void
    {
        $in = Request::all();
        $out = [];
        foreach (Settings::DEFAULTS as $key => $default) {
            if (!array_key_exists($key, $in) || is_array($in[$key])) {
                continue;
            }
            $v = trim((string) $in[$key]);
            if (in_array($key, Settings::SECRET, true) && $v === '') {
                continue; // write-only secret left blank → keep existing
            }
            if (in_array($key, ['meta_status', 'meta_status_message'], true)) {
                continue;
            }
            if (in_array($key, self::NUMERIC, true)) {
                if (!is_numeric($v) || (float) $v < 0) {
                    Response::fail('"' . $key . '" এর মান সঠিক সংখ্যা হতে হবে।', [$key => 'সংখ্যা দিন']);
                }
                $v = (string) (str_contains($key, 'delivery') ? round((float) $v, 2) : (int) $v);
            }
            if (in_array($key, self::URLS, true) && $v !== '' && !filter_var($v, FILTER_VALIDATE_URL)) {
                Response::fail('সঠিক URL দিন।', [$key => 'অবৈধ URL']);
            }
            if (in_array($key, self::COLORS, true) && !preg_match('/^#[0-9a-f]{6}$/i', $v)) {
                continue;
            }
            if ($key === 'whatsapp_number' && $v !== '' && !preg_match('/^\+?\d{8,15}$/', preg_replace('/[\s\-]/', '', $v))) {
                Response::fail('সঠিক WhatsApp নম্বর দিন (যেমন +8801XXXXXXXXX)।', [$key => 'অবৈধ নম্বর']);
            }
            if ($key === 'meta_pixel_id' && $v !== '' && !preg_match('/^\d{5,20}$/', $v)) {
                Response::fail('Meta Pixel ID শুধুমাত্র সংখ্যা হবে।', [$key => 'অবৈধ']);
            }
            if ($key === 'gtag_id' && $v !== '' && !preg_match('/^(G|AW|GT|UA)-[A-Z0-9\-]+$/i', $v)) {
                Response::fail('সঠিক Google Tag ID দিন (যেমন G-XXXX)।', [$key => 'অবৈধ']);
            }
            if ($key === 'theme_default') {
                $v = $v === 'dark' ? 'dark' : 'light';
            }
            if ($key === 'order_block_type') {
                $v = $v === 'lifetime' ? 'lifetime' : 'temporary';
            }
            $out[$key] = mb_substr($v, 0, 2000);
        }
        foreach (['logo' => [400, 'webp'], 'favicon' => [128, 'png'], 'og_image' => [1200, 'jpg']] as $field => [$w, $fmt]) {
            if ($path = self::upload($field . '_file', 'branding', $w, $fmt)) {
                ImageProcessor::delete((string) setting($field));
                $out[$field] = $path;
            } elseif (Request::bool('remove_' . $field)) {
                ImageProcessor::delete((string) setting($field));
                $out[$field] = '';
            }
        }
        if ($icon = self::upload('pwa_icon_file', 'branding', 512, 'png')) {
            ImageProcessor::buildPwaIcons($icon);
            ImageProcessor::delete($icon);
        }
        if (isset($out['meta_pixel_id']) || isset($out['meta_access_token'])) {
            $out['meta_status'] = (($out['meta_pixel_id'] ?? setting('meta_pixel_id')) && ($out['meta_access_token'] ?? setting('meta_access_token'))) ? setting('meta_status') : 'not_configured';
        }
        Settings::setMany($out);
        Response::ok(null, 'সেটিংস সংরক্ষিত হয়েছে।');
    }

    public function saveSeo(): void
    {
        foreach (['home', 'products', 'categories', 'contact'] as $page) {
            $og = self::upload('seo_' . $page . '_og', 'branding', 1200, 'jpg');
            $data = [
                'title' => mb_substr(Request::str('seo_' . $page . '_title'), 0, 190) ?: null,
                'description' => mb_substr(Request::str('seo_' . $page . '_description'), 0, 400) ?: null,
                'keywords' => mb_substr(Request::str('seo_' . $page . '_keywords'), 0, 400) ?: null,
            ];
            if ($og) {
                $data['og_image'] = $og;
            }
            DB::run('INSERT IGNORE INTO seo_settings (page_key) VALUES (?)', [$page]);
            DB::update('seo_settings', $data, 'page_key = ?', [$page]);
        }
        Response::ok(null, 'SEO সংরক্ষিত হয়েছে।');
    }

    public function metaTest(): void
    {
        $r = MetaCapi::test();
        $r['ok'] ? Response::ok(null, $r['message']) : Response::fail($r['message']);
    }

    public function password(): void
    {
        $admin = DB::one('SELECT * FROM admins WHERE id = ?', [Auth::id()]);
        if (!password_verify((string) Request::input('current_password', ''), $admin['password_hash'])) {
            Response::fail('বর্তমান পাসওয়ার্ড সঠিক নয়।', ['current_password' => 'ভুল পাসওয়ার্ড']);
        }
        $new = (string) Request::input('new_password', '');
        if (strlen($new) < 8 || !preg_match('/[A-Za-z]/', $new) || !preg_match('/\d/', $new)) {
            Response::fail('নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষর, অক্ষর ও সংখ্যা মিলিয়ে হতে হবে।', ['new_password' => 'দুর্বল পাসওয়ার্ড']);
        }
        $name = Request::str('name');
        DB::update('admins', ['password_hash' => password_hash($new, PASSWORD_DEFAULT)] + ($name !== '' ? ['name' => mb_substr($name, 0, 120)] : []), 'id = ?', [$admin['id']]);
        Session::regenerate();
        Logger::security('Admin password changed', ['admin' => $admin['id'], 'ip' => Request::ip()]);
        Response::ok(null, 'পাসওয়ার্ড পরিবর্তন হয়েছে।');
    }

    public function clearCache(): void
    {
        Settings::flush();
        foreach (glob(BASE_PATH . '/storage/cache/*.php') ?: [] as $f) {
            @unlink($f);
        }
        Response::ok(null, 'ক্যাশ পরিষ্কার হয়েছে।');
    }
}
