<?php
/**
 * Settings store (key/value in the `settings` table) + the schema that
 * drives the Admin "Master Control Center". Every key used anywhere in
 * the app has a default here, so a fresh install works out of the box.
 */
defined('APP') || exit;

/** Keys stored encrypted at rest. */
const SECRET_SETTINGS = ['smtp.password', 'google.client_secret', 'ai.api_key', 'security.recaptcha_secret', 'pwa.vapid_private'];

function setting(string $key, mixed $default = null): mixed
{
    $all = settings_all();
    if (array_key_exists($key, $all)) return $all[$key];
    // schema default first (so admin-editable texts work before ever being saved)
    return settings_defaults()[$key] ?? $default;
}

function setting_bool(string $key): bool
{
    return (string)setting($key) === '1';
}

/** Language-aware setting: setting_l('home.hero_title') → *_bn or *_en. */
function setting_l(string $base): string
{
    $v = (string)setting($base . '_' . lang(), '');
    return $v !== '' ? $v : (string)setting($base . '_en', '');
}

function settings_all(bool $refresh = false): array
{
    static $cache = null;
    if ($cache !== null && !$refresh) return $cache;
    $cache = [];
    if (!INSTALLED) return $cache;
    // Raw values (secrets still encrypted) are cached in a PHP file so a
    // normal page view needs no settings query at all.
    $file = ROOT . '/storage/cache/settings.php';
    $raw = (!$refresh && is_file($file)) ? @include $file : null;
    if (!is_array($raw)) {
        try {
            $raw = [];
            foreach (rows('SELECT k, v FROM settings') as $r) $raw[$r['k']] = $r['v'];
            @file_put_contents($file, '<?php defined(\'APP\') || exit; return ' . var_export($raw, true) . ';', LOCK_EX);
        } catch (Throwable $e) {
            log_error($e);
            $raw = [];
        }
    }
    foreach ($raw as $k => $v) {
        $cache[$k] = in_array($k, SECRET_SETTINGS, true) ? decrypt_value((string)$v) : $v;
    }
    return $cache;
}

function settings_save(array $values): void
{
    $groups = [];
    foreach (settings_schema() as $tab => $def) foreach ($def['fields'] as $k => $f) $groups[$k] = $tab;
    $st = db()->prepare('INSERT INTO settings (k, v, grp) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v), grp = VALUES(grp)');
    foreach ($values as $k => $v) {
        $v = $v === null ? null : (string)$v;
        if (in_array($k, SECRET_SETTINGS, true) && $v !== null && $v !== '') $v = encrypt_value($v);
        $st->execute([$k, $v, $groups[$k] ?? 'system']);
    }
    @unlink(ROOT . '/storage/cache/settings.php');
    settings_all(true);
}

/** Bump on every admin content change so clients drop their page cache. */
function bump_content_version(): void
{
    settings_save(['content_version' => (string)time()]);
}

function settings_defaults(): array
{
    static $d = null;
    if ($d !== null) return $d;
    $d = ['content_version' => '1'];
    foreach (settings_schema() as $tab) foreach ($tab['fields'] as $k => $f) $d[$k] = $f['default'] ?? '';
    return $d;
}

/**
 * Admin settings schema. Field types:
 * text, textarea, number, bool, select, color, image, secret, email, url,
 * lines, datetime, sections, info
 */
function settings_schema(): array
{
    static $s = null;
    if ($s !== null) return $s;
    $bi = function (string $key, string $label, string $type = 'text', string $en = '', string $bn = '', array $extra = []): array {
        return [
            $key . '_en' => ['type' => $type, 'label' => $label . ' (English)', 'default' => $en] + $extra,
            $key . '_bn' => ['type' => $type, 'label' => $label . ' (বাংলা)', 'default' => $bn] + $extra,
        ];
    };
    $s = [
        'general' => ['title' => 'General', 'icon' => 'fa-sliders', 'fields' => [
            'site_name' => ['type' => 'text', 'label' => 'Site name', 'default' => 'DevCraft Studio', 'required' => true],
            ...$bi('site_tagline', 'Tagline', 'text', 'Websites & digital products', 'ওয়েবসাইট ও ডিজিটাল প্রোডাক্ট'),
            ...$bi('site_description', 'Short description', 'textarea',
                'We design and build fast, secure and scalable websites, web apps and digital products.',
                'আমরা দ্রুত, নিরাপদ ও স্কেলেবল ওয়েবসাইট, ওয়েব অ্যাপ এবং ডিজিটাল প্রোডাক্ট তৈরি করি।'),
            'logo' => ['type' => 'image', 'label' => 'Logo', 'default' => ''],
            'favicon' => ['type' => 'image', 'label' => 'Favicon', 'default' => ''],
            'app_icon' => ['type' => 'image', 'label' => 'App icon (512×512)', 'default' => ''],
            'email_logo' => ['type' => 'image', 'label' => 'Email logo', 'default' => ''],
            'og_image' => ['type' => 'image', 'label' => 'Default OG / share image', 'default' => ''],
            'banner' => ['type' => 'image', 'label' => 'Banner image', 'default' => ''],
            'default_language' => ['type' => 'select', 'label' => 'Default language', 'options' => ['bn' => 'বাংলা', 'en' => 'English'], 'default' => 'bn'],
            'default_currency' => ['type' => 'select', 'label' => 'Default display currency', 'options' => ['USD' => 'USD ($)', 'BDT' => 'BDT (৳)'], 'default' => 'USD'],
            'usd_bdt_rate' => ['type' => 'number', 'label' => 'USD → BDT rate (used when a product has no BDT price)', 'default' => '122', 'step' => '0.01'],
            ...$bi('footer_text', 'Footer text', 'textarea',
                'Professional web development and digital solutions — built for speed, security and growth.',
                'পেশাদার ওয়েব ডেভেলপমেন্ট ও ডিজিটাল সলিউশন — গতি, নিরাপত্তা ও প্রবৃদ্ধির জন্য তৈরি।'),
            ...$bi('copyright', 'Copyright line', 'text', 'All rights reserved.', 'সর্বস্বত্ব সংরক্ষিত।'),
            ...$bi('disclaimer', 'Risk / disclaimer text', 'textarea', '', ''),
        ]],
        'theme' => ['title' => 'Theme', 'icon' => 'fa-palette', 'fields' => [
            'theme.primary' => ['type' => 'color', 'label' => 'Primary color', 'default' => '#2b44d8'],
            'theme.primary_dark' => ['type' => 'color', 'label' => 'Primary (pressed)', 'default' => '#1f33b5'],
            'theme.secondary' => ['type' => 'color', 'label' => 'Secondary color', 'default' => '#5b6cff'],
            'theme.accent' => ['type' => 'color', 'label' => 'Accent color', 'default' => '#f59e0b'],
            'theme.bg' => ['type' => 'color', 'label' => 'Background (light)', 'default' => '#f3f5fb'],
            'theme.card' => ['type' => 'color', 'label' => 'Card (light)', 'default' => '#ffffff'],
            'theme.text' => ['type' => 'color', 'label' => 'Text (light)', 'default' => '#0f172a'],
            'theme.radius' => ['type' => 'number', 'label' => 'Card radius (px)', 'default' => '22', 'min' => 0, 'max' => 32],
            'theme.dark_enabled' => ['type' => 'bool', 'label' => 'Allow dark mode', 'default' => '1'],
            'theme.default_mode' => ['type' => 'select', 'label' => 'Default mode', 'options' => ['light' => 'Light', 'dark' => 'Dark', 'system' => 'Follow device'], 'default' => 'light'],
            'theme.animations' => ['type' => 'bool', 'label' => 'Enable animations', 'default' => '1'],
        ]],
        'home' => ['title' => 'Home page', 'icon' => 'fa-house', 'fields' => [
            'home.sections' => ['type' => 'sections', 'label' => 'Sections (visibility & order)', 'options' => [
                'hero' => 'Hero', 'stats' => 'Statistics', 'categories' => 'Service categories', 'featured' => 'Featured services',
                'slider' => 'Platform slider', 'news' => 'Latest posts', 'why' => 'Why choose us', 'about' => 'About', 'cta' => 'Call to action', 'contact' => 'Contact strip'],
                'default' => 'hero,stats,categories,featured,news,slider,why,about,cta,contact'],
            ...$bi('home.hero_badge', 'Hero badge', 'text', 'Web development & digital solutions', 'ওয়েব ডেভেলপমেন্ট ও ডিজিটাল সলিউশন'),
            ...$bi('home.hero_title', 'Hero title', 'text', 'Build Your Website. Build Your Digital Future.', 'আপনার ওয়েবসাইট তৈরি করুন। গড়ে তুলুন ডিজিটাল ভবিষ্যৎ।'),
            ...$bi('home.hero_subtitle', 'Hero subtitle', 'textarea',
                'We build modern, fast, responsive and scalable websites and web applications — from landing pages to full SaaS platforms.',
                'আমরা আধুনিক, দ্রুত, রেসপন্সিভ ও স্কেলেবল ওয়েবসাইট এবং ওয়েব অ্যাপ্লিকেশন তৈরি করি — ল্যান্ডিং পেজ থেকে পূর্ণাঙ্গ SaaS প্ল্যাটফর্ম পর্যন্ত।'),
            ...$bi('home.btn1', 'Primary button text', 'text', 'Explore Services', 'সার্ভিস দেখুন'),
            'home.btn1_link' => ['type' => 'text', 'label' => 'Primary button link', 'default' => '/services'],
            ...$bi('home.btn2', 'Secondary button text', 'text', 'Contact Us', 'যোগাযোগ করুন'),
            'home.btn2_link' => ['type' => 'text', 'label' => 'Secondary button link', 'default' => '/contact'],
            'home.stats' => ['type' => 'lines', 'label' => 'Statistics — one per line: value | English label | Bangla label | icon', 'default' =>
                "150+ | Projects delivered | প্রজেক্ট সম্পন্ন | fa-rocket\n98% | Client satisfaction | ক্লায়েন্ট সন্তুষ্টি | fa-face-smile\n35+ | Services | সার্ভিস | fa-layer-group\n24/7 | Support | সাপোর্ট | fa-headset"],
            'home.slider_items' => ['type' => 'lines', 'label' => 'Platform slider — one per line: icon | label | link', 'default' =>
                "fa-brands fa-node-js | Node.js | /services/nodejs-development\nfa-brands fa-react | React | /services/react-development\nfa-brands fa-php | PHP | /services/php-development\nfa-solid fa-database | MySQL | /services/database-system\nfa-solid fa-plug | REST API | /services/rest-api\nfa-solid fa-mobile-screen | PWA | /services/pwa\nfa-solid fa-cart-shopping | E-commerce | /services/ecommerce-website\nfa-solid fa-robot | AI Chatbot | /services/ai-chatbot\nfa-solid fa-shield-halved | Security | /services/security-setup\nfa-solid fa-magnifying-glass-chart | SEO | /services/seo"],
            ...$bi('home.why_title', '"Why choose us" title', 'text', 'Why choose us', 'কেন আমাদের বেছে নেবেন'),
            'home.why_items' => ['type' => 'lines', 'label' => 'Why items — icon | English title | Bangla title | English text | Bangla text', 'default' =>
                "fa-bolt | Blazing fast | অসাধারণ দ্রুত | Optimised code, caching and lazy loading. | অপ্টিমাইজড কোড, ক্যাশিং ও লেজি লোডিং।\nfa-shield-halved | Secure by default | ডিফল্টভাবে নিরাপদ | CSRF, XSS & SQL-injection protection built in. | CSRF, XSS ও SQL ইনজেকশন সুরক্ষা অন্তর্ভুক্ত।\nfa-mobile-screen | Mobile first | মোবাইল ফার্স্ট | App-like experience on every device. | প্রতিটি ডিভাইসে অ্যাপের মতো অভিজ্ঞতা।\nfa-headset | Real support | সত্যিকারের সাপোর্ট | Installation help, docs and maintenance. | ইনস্টলেশন সহায়তা, ডকুমেন্টেশন ও মেইনটেন্যান্স।"],
            ...$bi('home.about_title', 'About title', 'text', 'Who we are', 'আমরা কারা'),
            ...$bi('home.about_text', 'About text', 'textarea',
                'We are a professional web development and digital solutions team. We plan, design, build, secure and maintain websites and web applications for startups, businesses and creators.',
                'আমরা একটি পেশাদার ওয়েব ডেভেলপমেন্ট ও ডিজিটাল সলিউশন টিম। স্টার্টআপ, ব্যবসা ও ক্রিয়েটরদের জন্য আমরা ওয়েবসাইট ও ওয়েব অ্যাপ্লিকেশন পরিকল্পনা, ডিজাইন, তৈরি, সুরক্ষা ও রক্ষণাবেক্ষণ করি।'),
            'home.about_image' => ['type' => 'image', 'label' => 'About image', 'default' => ''],
            ...$bi('home.cta_title', 'CTA title', 'text', 'Ready to start your project?', 'আপনার প্রজেক্ট শুরু করতে প্রস্তুত?'),
            ...$bi('home.cta_text', 'CTA text', 'textarea', 'Tell us what you need — we reply within a few hours.', 'আপনার প্রয়োজন জানান — আমরা কয়েক ঘণ্টার মধ্যেই উত্তর দিই।'),
            ...$bi('home.cta_btn', 'CTA button', 'text', 'Start a project', 'প্রজেক্ট শুরু করুন'),
            'home.cta_link' => ['type' => 'text', 'label' => 'CTA link', 'default' => '/contact'],
            'home.latest_count' => ['type' => 'number', 'label' => 'Latest posts on home', 'default' => '5', 'min' => 1, 'max' => 12],
        ]],
        'seo' => ['title' => 'SEO', 'icon' => 'fa-magnifying-glass-chart', 'fields' => [
            ...$bi('seo.meta_title', 'Home meta title', 'text', '', ''),
            ...$bi('seo.meta_description', 'Default meta description', 'textarea', '', ''),
            'seo.keywords' => ['type' => 'text', 'label' => 'Keywords', 'default' => 'web development, website, nodejs, php, react, api, bangladesh'],
            'seo.og_title' => ['type' => 'text', 'label' => 'OG title (blank = meta title)', 'default' => ''],
            'seo.og_description' => ['type' => 'textarea', 'label' => 'OG description', 'default' => ''],
            'seo.twitter_card' => ['type' => 'select', 'label' => 'X/Twitter card', 'options' => ['summary_large_image' => 'Large image', 'summary' => 'Summary'], 'default' => 'summary_large_image'],
            'seo.twitter_handle' => ['type' => 'text', 'label' => 'X/Twitter @handle', 'default' => ''],
            'seo.robots_index' => ['type' => 'bool', 'label' => 'Allow search engines to index the site', 'default' => '1'],
            'seo.robots_extra' => ['type' => 'textarea', 'label' => 'Extra robots.txt rules', 'default' => ''],
            'seo.org_schema' => ['type' => 'bool', 'label' => 'Output Organization structured data', 'default' => '1'],
            'seo.google_verification' => ['type' => 'text', 'label' => 'Google site verification code', 'default' => ''],
            'seo.bing_verification' => ['type' => 'text', 'label' => 'Bing site verification code', 'default' => ''],
            'seo.sitemap_info' => ['type' => 'info', 'label' => 'Sitemap', 'default' => '', 'html' => 'Auto-generated at <code>/sitemap.xml</code>; robots.txt at <code>/robots.txt</code>.'],
        ]],
        'payment' => ['title' => 'Payments', 'icon' => 'fa-wallet', 'fields' => [
            ...$bi('payment.instructions', 'General payment instructions', 'textarea',
                'Send the exact amount, then submit the transaction ID (TXID) and a screenshot. Orders are verified manually, usually within a few hours.',
                'সঠিক পরিমাণ পাঠান, তারপর ট্রানজ্যাকশন আইডি (TXID) ও স্ক্রিনশট জমা দিন। অর্ডার সাধারণত কয়েক ঘণ্টার মধ্যে যাচাই করা হয়।'),
            'payment.allow_balance' => ['type' => 'bool', 'label' => 'Allow paying with account balance', 'default' => '1'],
            'payment.order_expiry_hours' => ['type' => 'number', 'label' => 'Reuse an unpaid order for the same product within (hours)', 'default' => '24'],
        ]],
        'smtp' => ['title' => 'SMTP / Email', 'icon' => 'fa-envelope', 'fields' => [
            'smtp.host' => ['type' => 'text', 'label' => 'Host', 'default' => 'smtp.hostinger.com'],
            'smtp.port' => ['type' => 'number', 'label' => 'Port', 'default' => '465'],
            'smtp.encryption' => ['type' => 'select', 'label' => 'Encryption', 'options' => ['ssl' => 'SSL', 'tls' => 'TLS (STARTTLS)', 'none' => 'None'], 'default' => 'ssl'],
            'smtp.username' => ['type' => 'text', 'label' => 'Username', 'default' => ''],
            'smtp.password' => ['type' => 'secret', 'label' => 'Password', 'default' => ''],
            'smtp.from_email' => ['type' => 'email', 'label' => 'From email', 'default' => ''],
            'smtp.from_name' => ['type' => 'text', 'label' => 'From name', 'default' => ''],
            'smtp.admin_email' => ['type' => 'email', 'label' => 'Admin alert email (new payments, contact messages)', 'default' => ''],
        ]],
        'google' => ['title' => 'Google Login', 'icon' => 'fa-brands fa-google', 'fields' => [
            'google.enabled' => ['type' => 'bool', 'label' => 'Enable Google login', 'default' => '0'],
            'google.client_id' => ['type' => 'text', 'label' => 'Client ID', 'default' => ''],
            'google.client_secret' => ['type' => 'secret', 'label' => 'Client secret', 'default' => ''],
            'google.redirect_info' => ['type' => 'info', 'label' => 'Authorized redirect URI', 'default' => '', 'html' => '<code>' . e(abs_url('/auth/google/callback')) . '</code>'],
        ]],
        'ai' => ['title' => 'AI Assistant', 'icon' => 'fa-robot', 'fields' => [
            'ai.enabled' => ['type' => 'bool', 'label' => 'Enable AI chatbot', 'default' => '1'],
            'ai.provider' => ['type' => 'select', 'label' => 'Provider', 'options' => ['local' => 'Built-in assistant (no API key, answers from your site data)', 'openai' => 'OpenAI', 'compatible' => 'OpenAI-compatible API'], 'default' => 'local'],
            'ai.base_url' => ['type' => 'url', 'label' => 'API base URL', 'default' => 'https://api.openai.com/v1'],
            'ai.model' => ['type' => 'text', 'label' => 'Model', 'default' => 'gpt-4o-mini'],
            'ai.api_key' => ['type' => 'secret', 'label' => 'API key (only for OpenAI / compatible)', 'default' => ''],
            'ai.temperature' => ['type' => 'text', 'label' => 'Temperature (blank = model default; some models ignore it)', 'default' => '0.6'],
            'ai.max_tokens' => ['type' => 'number', 'label' => 'Max tokens per reply', 'default' => '600'],
            'ai.system_prompt' => ['type' => 'textarea', 'label' => 'Extra system prompt', 'default' => 'You are the friendly assistant of this web development company. Answer briefly and helpfully. Reply in the same language the visitor uses (Bangla or English). Only use the provided site information for prices and payment details; if unsure, suggest contacting support.'],
            'ai.rate_limit' => ['type' => 'number', 'label' => 'Max AI replies per visitor', 'default' => '30'],
            'ai.rate_window' => ['type' => 'number', 'label' => '…per this many minutes', 'default' => '10'],
            ...$bi('ai.greeting', 'Greeting', 'text', 'Need help? Ask our AI assistant.', 'সাহায্য দরকার? আমাদের AI অ্যাসিস্ট্যান্টকে জিজ্ঞাসা করুন।'),
            'ai.hint_enabled' => ['type' => 'bool', 'label' => 'Show greeting hint bubble', 'default' => '1'],
            'live_chat.enabled' => ['type' => 'bool', 'label' => 'Enable live customer chat', 'default' => '1'],
        ]],
        'security' => ['title' => 'Security', 'icon' => 'fa-shield-halved', 'fields' => [
            'security.allow_registration' => ['type' => 'bool', 'label' => 'Allow new registrations', 'default' => '1'],
            'security.require_email_verification' => ['type' => 'bool', 'label' => 'Require email verification before login', 'default' => '1'],
            'security.max_attempts' => ['type' => 'number', 'label' => 'Max failed login attempts', 'default' => '5'],
            'security.lock_minutes' => ['type' => 'number', 'label' => 'Lock duration (minutes)', 'default' => '15'],
            'security.password_min' => ['type' => 'number', 'label' => 'Minimum password length', 'default' => '8', 'min' => 6],
            'security.password_mixed' => ['type' => 'bool', 'label' => 'Password must contain letters and numbers', 'default' => '1'],
            'security.session_days' => ['type' => 'number', 'label' => 'Session duration (days)', 'default' => '30'],
            'security.passkeys_enabled' => ['type' => 'bool', 'label' => 'Enable passkeys (WebAuthn)', 'default' => '1'],
            'security.require_2fa_admin' => ['type' => 'bool', 'label' => 'Require 2FA for staff accounts', 'default' => '0'],
            'security.new_device_verify' => ['type' => 'bool', 'label' => 'Email code when logging in from a new device', 'default' => '0'],
            'security.login_notify' => ['type' => 'bool', 'label' => 'Send login alert emails', 'default' => '1'],
            'security.recaptcha_enabled' => ['type' => 'bool', 'label' => 'Enable reCAPTCHA v3 (login, register, contact)', 'default' => '0'],
            'security.recaptcha_site_key' => ['type' => 'text', 'label' => 'reCAPTCHA site key', 'default' => ''],
            'security.recaptcha_secret' => ['type' => 'secret', 'label' => 'reCAPTCHA secret key', 'default' => ''],
            'security.recaptcha_min_score' => ['type' => 'text', 'label' => 'Minimum score (0.0 – 1.0)', 'default' => '0.5'],
            'security.csrf_info' => ['type' => 'info', 'label' => 'CSRF', 'default' => '', 'html' => 'CSRF protection is always on for every form and API call.'],
        ]],
        'notifications' => ['title' => 'Notifications', 'icon' => 'fa-bell', 'fields' => [
            'notify.push_enabled' => ['type' => 'bool', 'label' => 'Web push notifications', 'default' => '1'],
            'notify.email_enabled' => ['type' => 'bool', 'label' => 'Email notifications', 'default' => '1'],
            'notify.sound_enabled' => ['type' => 'bool', 'label' => 'Notification sound (default for users)', 'default' => '1'],
            'notify.promotions_enabled' => ['type' => 'bool', 'label' => 'Allow promotion notifications', 'default' => '1'],
            'notify.poll_seconds' => ['type' => 'number', 'label' => 'Polling interval (seconds, while page is visible)', 'default' => '30', 'min' => 10],
            'notify.welcome_enabled' => ['type' => 'bool', 'label' => 'Welcome notification on registration', 'default' => '1'],
            ...$bi('notify.welcome_title', 'Welcome title', 'text', 'Welcome aboard! 🎉', 'স্বাগতম! 🎉'),
            ...$bi('notify.welcome_body', 'Welcome message', 'textarea', 'Your account is ready. Explore our services and start your first project.', 'আপনার অ্যাকাউন্ট প্রস্তুত। আমাদের সার্ভিসগুলো দেখুন এবং প্রথম প্রজেক্ট শুরু করুন।'),
        ]],
        'pwa' => ['title' => 'PWA', 'icon' => 'fa-mobile-screen', 'fields' => [
            'pwa.enabled' => ['type' => 'bool', 'label' => 'Enable PWA (installable app + offline)', 'default' => '1'],
            'pwa.name' => ['type' => 'text', 'label' => 'App name (blank = site name)', 'default' => ''],
            'pwa.short_name' => ['type' => 'text', 'label' => 'Short name', 'default' => ''],
            'pwa.theme_color' => ['type' => 'color', 'label' => 'Theme color', 'default' => '#2b44d8'],
            'pwa.background_color' => ['type' => 'color', 'label' => 'Splash background', 'default' => '#f3f5fb'],
            'pwa.install_prompt' => ['type' => 'bool', 'label' => 'Show install popup', 'default' => '1'],
            'pwa.install_delay' => ['type' => 'number', 'label' => 'Install popup delay (seconds)', 'default' => '5'],
            'pwa.vapid_subject' => ['type' => 'text', 'label' => 'Push contact (mailto: or https URL)', 'default' => ''],
            'pwa.vapid_public' => ['type' => 'text', 'label' => 'VAPID public key', 'default' => '', 'readonly' => true],
            'pwa.vapid_private' => ['type' => 'secret', 'label' => 'VAPID private key', 'default' => '', 'readonly' => true],
        ]],
        'maintenance' => ['title' => 'Maintenance', 'icon' => 'fa-screwdriver-wrench', 'fields' => [
            'maintenance.enabled' => ['type' => 'bool', 'label' => 'Maintenance mode (admins can still browse)', 'default' => '0'],
            'maintenance.duration' => ['type' => 'number', 'label' => 'Estimated duration (minutes)', 'default' => '60'],
            'maintenance.ends_at' => ['type' => 'datetime', 'label' => 'Countdown ends at', 'default' => ''],
            ...$bi('maintenance.message', 'Message', 'textarea', 'We are upgrading our platform to serve you better. Please check back soon.', 'আরও ভালো সেবা দিতে আমরা প্ল্যাটফর্ম আপগ্রেড করছি। অনুগ্রহ করে কিছুক্ষণ পরে আবার আসুন।'),
            'maintenance.show_contact' => ['type' => 'bool', 'label' => 'Show contact buttons', 'default' => '1'],
        ]],
        'analytics' => ['title' => 'Analytics', 'icon' => 'fa-chart-line', 'fields' => [
            'analytics.enabled' => ['type' => 'bool', 'label' => 'Enable visitor analytics', 'default' => '1'],
            'analytics.geo_lookup' => ['type' => 'bool', 'label' => 'Look up visitor location via ipapi.co when Cloudflare geo headers are absent (sends IP to a third party)', 'default' => '0'],
            'analytics.online_minutes' => ['type' => 'number', 'label' => '"Online" window (minutes)', 'default' => '5'],
            'analytics.retention_days' => ['type' => 'number', 'label' => 'Keep page views for (days)', 'default' => '365'],
        ]],
        'media' => ['title' => 'Media', 'icon' => 'fa-images', 'fields' => [
            'media.compress_enabled' => ['type' => 'bool', 'label' => 'Compress images automatically on upload', 'default' => '1'],
            'media.target_percent' => ['type' => 'number', 'label' => 'Target size (% of original, e.g. 10 → 5 MB ≈ 500 KB)', 'default' => '10', 'min' => 1, 'max' => 100],
            'media.min_quality' => ['type' => 'number', 'label' => 'Never go below quality', 'default' => '45', 'min' => 10, 'max' => 95],
            'media.max_dimension' => ['type' => 'number', 'label' => 'Max image width/height (px)', 'default' => '1920'],
            'media.convert_webp' => ['type' => 'bool', 'label' => 'Convert uploads to WebP', 'default' => '1'],
            'media.thumb_width' => ['type' => 'number', 'label' => 'Thumbnail width (px)', 'default' => '480'],
            'media.max_upload_mb' => ['type' => 'number', 'label' => 'Maximum upload size (MB)', 'default' => '10'],
            'media.allowed_types' => ['type' => 'text', 'label' => 'Allowed image types', 'default' => 'jpg,jpeg,png,webp'],
        ]],
        'contact' => ['title' => 'Contact & Footer', 'icon' => 'fa-address-book', 'fields' => [
            'contact.email' => ['type' => 'email', 'label' => 'Contact email', 'default' => ''],
            'contact.support_email' => ['type' => 'email', 'label' => 'Support email', 'default' => ''],
            'contact.whatsapp' => ['type' => 'text', 'label' => 'WhatsApp number (international, e.g. 8801XXXXXXXXX)', 'default' => ''],
            'contact.phone' => ['type' => 'text', 'label' => 'Phone', 'default' => ''],
            ...$bi('contact.address', 'Business address', 'text', 'Dhaka, Bangladesh', 'ঢাকা, বাংলাদেশ'),
            ...$bi('contact.hours', 'Business hours', 'text', 'Sat – Thu, 10:00 AM – 8:00 PM', 'শনি – বৃহস্পতি, সকাল ১০টা – রাত ৮টা'),
            'contact.form_enabled' => ['type' => 'bool', 'label' => 'Enable contact form', 'default' => '1'],
            'contact.faq_en' => ['type' => 'lines', 'label' => 'FAQ (English) — Question | Answer', 'default' =>
                "How long does a website take? | Most websites are delivered in 3–14 days depending on scope.\nDo you provide source code? | Yes. Full projects include complete source code and documentation.\nWhich payment methods do you accept? | bKash, USDT (TRC20/BEP20) and Binance Pay.\nDo you offer support after delivery? | Yes — every product includes a support period, and we also offer maintenance plans."],
            'contact.faq_bn' => ['type' => 'lines', 'label' => 'FAQ (বাংলা) — প্রশ্ন | উত্তর', 'default' =>
                "একটি ওয়েবসাইট তৈরি হতে কত সময় লাগে? | কাজের পরিধি অনুযায়ী সাধারণত ৩–১৪ দিনের মধ্যে ডেলিভারি দেওয়া হয়।\nআপনারা কি সোর্স কোড দেন? | হ্যাঁ। ফুল প্রজেক্টে সম্পূর্ণ সোর্স কোড ও ডকুমেন্টেশন থাকে।\nকোন কোন পেমেন্ট মেথড গ্রহণ করেন? | বিকাশ, USDT (TRC20/BEP20) এবং Binance Pay।\nডেলিভারির পর সাপোর্ট দেন? | হ্যাঁ — প্রতিটি প্রোডাক্টে সাপোর্ট পিরিয়ড থাকে, পাশাপাশি মেইনটেন্যান্স প্ল্যানও আছে।"],
        ]],
    ];
    return $s;
}
