<?php
/** Key/value settings with code defaults, a file cache and encrypted secrets. */
final class Settings
{
    private static ?array $cache = null;
    public const SECRETS = ['smtp_pass', 'google_client_secret', 'ai_api_key', 'recaptcha_secret', 'vapid_private'];

    public static function defaults(): array
    {
        return [
            // general
            'site_name' => 'Oryzenx', 'site_tagline' => 'Your Digital Partner', 'site_tagline_bn' => 'আপনার ডিজিটাল পার্টনার',
            'site_description' => 'Oryzenx builds fast, secure and modern websites, web apps and APIs.',
            'site_description_bn' => 'Oryzenx আধুনিক, দ্রুত ও নিরাপদ ওয়েবসাইট, ওয়েব অ্যাপ এবং API তৈরি করে।',
            'default_lang' => 'bn', 'logo' => '', 'favicon' => '', 'app_icon' => '', 'email_logo' => '', 'og_image' => '', 'default_banner' => '',
            'show_site_name' => '1', 'footer_en' => 'Building modern web experiences for growing businesses.',
            'footer_bn' => 'ক্রমবর্ধমান ব্যবসার জন্য আধুনিক ওয়েব অভিজ্ঞতা তৈরি করি।',
            'legal_notice' => 'Prices are starting prices. Final quotes depend on scope. Crypto payments are irreversible; verify addresses before sending.',
            'legal_notice_bn' => 'মূল্যগুলো শুরুর মূল্য। চূড়ান্ত মূল্য কাজের পরিধির উপর নির্ভর করে। ক্রিপ্টো পেমেন্ট ফেরতযোগ্য নয়; পাঠানোর আগে ঠিকানা যাচাই করুন।',
            'bengali_digits' => '1', 'usd_to_bdt' => '122',
            // homepage
            'hero_title' => 'We build the website of your dreams', 'hero_title_bn' => 'আপনার স্বপ্নের ওয়েবসাইট আমরা তৈরি করি',
            'hero_subtitle' => 'Modern, fast, secure and complete web solutions for your business.',
            'hero_subtitle_bn' => 'আধুনিক, দ্রুত, নিরাপদ এবং সম্পূর্ণ ওয়েব সমাধান আপনার ব্যবসার জন্য।',
            'stat_projects' => '150+', 'stat_satisfaction' => '98%', 'stat_support' => '24/7',
            // theme
            'color_primary' => '#2563eb', 'color_secondary' => '#0ea5e9', 'color_accent' => '#7c3aed',
            'card_radius' => '14', 'default_theme' => 'light', 'allow_dark' => '1',
            // contact
            'contact_email' => 'support@oryzenx.com', 'contact_whatsapp' => '+8801700000000', 'contact_telegram' => 'oryzenx',
            'contact_facebook' => 'https://facebook.com/oryzenx', 'contact_address' => 'Dhaka, Bangladesh', 'contact_address_bn' => 'ঢাকা, বাংলাদেশ',
            'contact_hours' => 'Every day, 9am – 11pm (GMT+6)', 'contact_hours_bn' => 'প্রতিদিন, সকাল ৯টা – রাত ১১টা',
            'social_x' => '', 'social_linkedin' => '', 'social_github' => '', 'social_youtube' => '',
            // payment
            'require_verified_for_payment' => '0', 'max_screenshot_mb' => '5',
            // security
            'security_max_attempts' => '5', 'security_lock_minutes' => '15', 'recaptcha_enabled' => '0',
            'recaptcha_site_key' => '', 'recaptcha_secret' => '', 'registration_enabled' => '1', 'require_email_verification' => '0',
            // smtp
            'smtp_host' => '', 'smtp_port' => '465', 'smtp_user' => '', 'smtp_pass' => '', 'smtp_encryption' => 'ssl',
            'smtp_from_email' => '', 'smtp_from_name' => 'Oryzenx',
            // google
            'google_enabled' => '0', 'google_client_id' => '', 'google_client_secret' => '',
            // ai
            'ai_enabled' => '1', 'ai_provider' => 'openai', 'ai_base_url' => 'https://api.openai.com/v1', 'ai_model' => 'gpt-4o-mini',
            'ai_api_key' => '', 'ai_rate_limit' => '10', 'ai_greeting' => '1', 'ai_sound' => '1',
            'ai_system_prompt' => "You are Oryzenx Assistant, a friendly and concise support agent for Oryzenx, a web development company. Answer only using the company information provided. Reply in the user's language (Bengali or English). Keep answers short. If unsure, suggest contacting support.",
            // pwa
            'pwa_enabled' => '1', 'pwa_name' => 'Oryzenx', 'pwa_short_name' => 'Oryzenx', 'pwa_theme_color' => '#2563eb',
            'pwa_background_color' => '#f5f7fb', 'pwa_install_prompt' => '1', 'pwa_version' => '1',
            // seo
            'seo_title' => 'Oryzenx — Web Development, Apps & APIs', 'seo_description' => 'Professional Node.js, React, PHP, API and e-commerce development by Oryzenx.',
            'seo_keywords' => 'web development, Node.js, React, PHP, API, ecommerce, Bangladesh', 'og_title' => '', 'og_description' => '',
            'twitter_card' => 'summary_large_image', 'twitter_site' => '', 'canonical_base' => '',
            // maintenance
            'maintenance_enabled' => '0', 'maintenance_minutes' => '30', 'maintenance_until' => '',
            'maintenance_message' => 'We are upgrading Oryzenx to serve you better. Please check back soon.',
            'maintenance_message_bn' => 'আরও ভালো সেবা দিতে আমরা Oryzenx আপডেট করছি। কিছুক্ষণ পর আবার আসুন।',
            'maintenance_contact' => '1',
            // notifications / push
            'notify_sound' => '1', 'push_enabled' => '1', 'vapid_public' => '', 'vapid_private' => '', 'vapid_subject' => '',
            // images
            'img_quality' => '75', 'img_max_upload_mb' => '8', 'img_max_width' => '1600', 'img_format' => 'webp',
            'img_auto_webp' => '1', 'img_thumbnail' => '1', 'img_thumb_width' => '400',
            // analytics
            'analytics_enabled' => '1', 'analytics_geo_lookup' => '0',
        ];
    }

    public static function groups(): array
    {
        return [
            'general' => ['site_name', 'site_tagline', 'site_tagline_bn', 'site_description', 'site_description_bn', 'default_lang', 'logo', 'favicon', 'app_icon', 'email_logo', 'og_image', 'default_banner', 'show_site_name', 'footer_en', 'footer_bn', 'legal_notice', 'legal_notice_bn', 'bengali_digits', 'usd_to_bdt'],
            'homepage' => ['hero_title', 'hero_title_bn', 'hero_subtitle', 'hero_subtitle_bn', 'stat_projects', 'stat_satisfaction', 'stat_support'],
            'theme' => ['color_primary', 'color_secondary', 'color_accent', 'card_radius', 'default_theme', 'allow_dark'],
            'contact' => ['contact_email', 'contact_whatsapp', 'contact_telegram', 'contact_facebook', 'contact_address', 'contact_address_bn', 'contact_hours', 'contact_hours_bn', 'social_x', 'social_linkedin', 'social_github', 'social_youtube'],
            'payment' => ['require_verified_for_payment', 'max_screenshot_mb'],
            'security' => ['security_max_attempts', 'security_lock_minutes', 'recaptcha_enabled', 'recaptcha_site_key', 'recaptcha_secret', 'registration_enabled', 'require_email_verification'],
            'smtp' => ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_encryption', 'smtp_from_email', 'smtp_from_name'],
            'google' => ['google_enabled', 'google_client_id', 'google_client_secret'],
            'ai' => ['ai_enabled', 'ai_provider', 'ai_base_url', 'ai_model', 'ai_api_key', 'ai_rate_limit', 'ai_greeting', 'ai_sound', 'ai_system_prompt'],
            'pwa' => ['pwa_enabled', 'pwa_name', 'pwa_short_name', 'pwa_theme_color', 'pwa_background_color', 'pwa_install_prompt', 'pwa_version'],
            'seo' => ['seo_title', 'seo_description', 'seo_keywords', 'og_title', 'og_description', 'twitter_card', 'twitter_site', 'canonical_base'],
            'maintenance' => ['maintenance_enabled', 'maintenance_minutes', 'maintenance_until', 'maintenance_message', 'maintenance_message_bn', 'maintenance_contact'],
            'notifications' => ['notify_sound', 'push_enabled', 'vapid_public', 'vapid_private', 'vapid_subject'],
            'images' => ['img_quality', 'img_max_upload_mb', 'img_max_width', 'img_format', 'img_auto_webp', 'img_thumbnail', 'img_thumb_width'],
            'analytics' => ['analytics_enabled', 'analytics_geo_lookup'],
        ];
    }

    public static function all(): array
    {
        if (self::$cache !== null) return self::$cache;
        $defaults = self::defaults();
        if (!INSTALLED) return self::$cache = $defaults;
        $file = STORAGE . '/cache/settings.php';
        if (is_file($file)) {
            $stored = include $file;
        } else {
            $stored = [];
            foreach (DB::all('SELECT setting_key, setting_value FROM settings') as $r) $stored[$r['setting_key']] = $r['setting_value'];
            @file_put_contents($file, '<?php return ' . var_export($stored, true) . ';', LOCK_EX);
        }
        return self::$cache = array_merge($defaults, is_array($stored) ? $stored : []);
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $v = self::all()[$key] ?? $default;
        if (in_array($key, self::SECRETS, true) && $v) return Crypto::decrypt((string)$v) ?? '';
        return $v;
    }

    public static function set(array $values): void
    {
        $groupOf = [];
        foreach (self::groups() as $g => $keys) foreach ($keys as $k) $groupOf[$k] = $g;
        foreach ($values as $k => $v) {
            if (in_array($k, self::SECRETS, true) && $v !== '') $v = Crypto::encrypt((string)$v);
            DB::q('INSERT INTO settings (setting_key, setting_value, group_name) VALUES (?,?,?)
                   ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), group_name = VALUES(group_name)',
                [$k, (string)$v, $groupOf[$k] ?? 'general']);
        }
        self::flush();
    }

    public static function flush(): void
    {
        @unlink(STORAGE . '/cache/settings.php');
        if (function_exists('opcache_invalidate')) @opcache_invalidate(STORAGE . '/cache/settings.php', true);
        self::$cache = null;
    }
}
