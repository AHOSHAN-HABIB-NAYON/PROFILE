<?php
/**
 * First-run installation wizard. Runs only while storage/installed.lock is absent, then locks itself.
 */
final class InstallController
{
    public static function requirements(): array
    {
        $writable = static fn (string $p) => is_writable(BASE_PATH . '/' . $p);
        return [
            ['PHP ৮.১ বা তার উপরে', version_compare(PHP_VERSION, '8.1.0', '>='), PHP_VERSION],
            ['PDO MySQL', extension_loaded('pdo_mysql'), ''],
            ['cURL (কুরিয়ার/Meta API)', extension_loaded('curl'), ''],
            ['GD + WebP (ইমেজ কমপ্রেশন)', extension_loaded('gd') && function_exists('imagewebp'), ''],
            ['mbstring (বাংলা টেক্সট)', extension_loaded('mbstring'), ''],
            ['fileinfo (আপলোড MIME যাচাই)', extension_loaded('fileinfo'), ''],
            ['JSON', function_exists('json_encode'), ''],
            ['রুট ফোল্ডার লেখার অনুমতি (.env)', is_writable(BASE_PATH), ''],
            ['storage/ লেখার অনুমতি', $writable('storage') && $writable('storage/cache') && $writable('storage/logs'), ''],
            ['uploads/ লেখার অনুমতি', $writable('uploads'), ''],
        ];
    }

    public function handle(): void
    {
        if (is_file(BASE_PATH . '/storage/installed.lock')) {
            http_response_code(403);
            exit('Installer is locked.');
        }
        if (Request::method() === 'POST') {
            $this->install();
            return;
        }
        header('Content-Type: text/html; charset=utf-8');
        header('Cache-Control: no-store');
        echo View::render('pages/install', ['reqs' => self::requirements(), 'csrf' => Csrf::token()]);
    }

    private function install(): void
    {
        $sent = (string) Request::input('_csrf', '');
        if (!hash_equals(Csrf::token(), $sent)) {
            Response::fail('সেশনের মেয়াদ শেষ। পাতাটি রিফ্রেশ করুন।', [], 419);
        }
        foreach (self::requirements() as [$label, $ok]) {
            if (!$ok) {
                Response::fail('সার্ভার রিকোয়ারমেন্ট পূরণ হয়নি: ' . $label);
            }
        }
        $in = [
            'db_host' => Request::str('db_host', 'localhost'), 'db_port' => Request::int('db_port', 3306),
            'db_name' => Request::str('db_name'), 'db_user' => Request::str('db_user'), 'db_pass' => (string) Request::input('db_pass', ''),
            'admin_user' => Request::str('admin_user'), 'admin_pass' => (string) Request::input('admin_pass', ''),
            'site_name' => Request::str('site_name'), 'whatsapp' => Request::str('whatsapp', '+8801757827996'),
            'inside' => Request::str('delivery_inside', '70'), 'outside' => Request::str('delivery_outside', '130'),
            'app_url' => rtrim(Request::str('app_url'), '/'),
        ];
        $errors = [];
        if ($in['db_name'] === '' || !preg_match('/^[A-Za-z0-9_\-$]+$/', $in['db_name'])) $errors['db_name'] = 'সঠিক ডাটাবেস নাম দিন।';
        if ($in['db_user'] === '') $errors['db_user'] = 'ডাটাবেস ইউজার দিন।';
        if (!preg_match('/^[A-Za-z0-9_.\-]{3,40}$/', $in['admin_user'])) $errors['admin_user'] = 'ইউজারনেম ৩-৪০ অক্ষরের (ইংরেজি অক্ষর/সংখ্যা) হতে হবে।';
        if (strlen($in['admin_pass']) < 8 || !preg_match('/[A-Za-z]/', $in['admin_pass']) || !preg_match('/\d/', $in['admin_pass'])) $errors['admin_pass'] = 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষর, অক্ষর ও সংখ্যা মিলিয়ে হতে হবে।';
        if (mb_strlen($in['site_name']) < 2) $errors['site_name'] = 'সাইটের নাম দিন।';
        if (!is_numeric($in['inside']) || !is_numeric($in['outside'])) $errors['delivery_inside'] = 'ডেলিভারি চার্জ সংখ্যায় দিন।';
        if ($in['app_url'] !== '' && !filter_var($in['app_url'], FILTER_VALIDATE_URL)) $errors['app_url'] = 'সঠিক URL দিন।';
        if ($errors) {
            Response::fail(reset($errors), $errors);
        }
        try {
            $pdo = DB::connect($in['db_host'], $in['db_port'], $in['db_name'], $in['db_user'], $in['db_pass']);
        } catch (PDOException $e) {
            Logger::error('Installer DB connect failed: ' . $e->getMessage());
            Response::fail('ডাটাবেসে সংযোগ করা যায়নি। হোস্ট, নাম, ইউজার ও পাসওয়ার্ড যাচাই করুন।', ['db_host' => 'সংযোগ ব্যর্থ']);
        }
        try {
            $pdo->exec('ALTER DATABASE `' . $in['db_name'] . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        } catch (PDOException) {
            // Shared hosts may not allow ALTER DATABASE; tables declare utf8mb4 explicitly anyway.
        }
        try {
            self::runSchema($pdo);
            $st = $pdo->prepare('INSERT INTO admins (username, name, password_hash) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)');
            $st->execute([$in['admin_user'], 'অ্যাডমিন', password_hash($in['admin_pass'], PASSWORD_DEFAULT)]);
            $settings = [
                'site_name' => $in['site_name'], 'pwa_short_name' => mb_substr($in['site_name'], 0, 12),
                'whatsapp_number' => $in['whatsapp'], 'delivery_inside_dhaka' => (string) (float) $in['inside'],
                'delivery_outside_dhaka' => (string) (float) $in['outside'], 'meta_title' => $in['site_name'],
            ];
            $st = $pdo->prepare('INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)');
            foreach ($settings as $k => $v) {
                $st->execute([$k, $v]);
            }
            $pdo->exec("INSERT IGNORE INTO seo_settings (page_key) VALUES ('home'), ('products'), ('categories'), ('contact')");
        } catch (PDOException $e) {
            Logger::error('Installer schema failed: ' . $e->getMessage());
            Response::fail('ডাটাবেস টেবিল তৈরি করা যায়নি। ইউজারের CREATE অনুমতি আছে কিনা দেখুন।');
        }
        $env = [
            'APP_URL' => $in['app_url'] ?: Request::origin(), 'APP_DEBUG' => 'false', 'APP_KEY' => bin2hex(random_bytes(32)),
            'TRUST_PROXY' => 'false', 'DB_HOST' => $in['db_host'], 'DB_PORT' => $in['db_port'], 'DB_NAME' => $in['db_name'],
            'DB_USER' => $in['db_user'], 'DB_PASS' => $in['db_pass'], 'BDCOURIER_API_KEY' => '',
        ];
        if (!Env::write(BASE_PATH . '/.env', $env)) {
            Response::fail('.env ফাইল লেখা যায়নি। ফোল্ডারের অনুমতি যাচাই করুন।');
        }
        @unlink(BASE_PATH . '/storage/cache/settings.php');
        file_put_contents(BASE_PATH . '/storage/installed.lock', 'Installed ' . date('c') . "\n", LOCK_EX);
        Logger::security('Installation completed', ['ip' => Request::ip()]);
        Response::json(true, 'ইনস্টলেশন সফল হয়েছে! অ্যাডমিন প্যানেলে লগইন করুন।', null, [], '/admin/login');
    }

    public static function runSchema(PDO $pdo): void
    {
        $sql = (string) file_get_contents(BASE_PATH . '/database/schema.sql');
        $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? '';
        foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
            $pdo->exec($stmt);
        }
    }
}
