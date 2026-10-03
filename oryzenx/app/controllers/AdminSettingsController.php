<?php
final class AdminSettingsController
{
    public static function sections(): array
    {
        $yes = ['type' => 'checkbox'];
        return [
            'general' => ['icon' => 'fa-solid fa-sliders', 'fields' => [
                'site_name' => ['type' => 'text', 'max' => 80], 'site_tagline' => ['type' => 'text'], 'site_tagline_bn' => ['type' => 'text'],
                'site_description' => ['type' => 'textarea'], 'site_description_bn' => ['type' => 'textarea'],
                'default_lang' => ['type' => 'select', 'options' => Lang::AVAILABLE],
                'logo' => ['type' => 'image', 'opts' => ['max_width' => 256, 'format' => 'png']], 'show_site_name' => $yes,
                'favicon' => ['type' => 'image', 'opts' => ['square' => 64, 'format' => 'png']],
                'app_icon' => ['type' => 'image', 'opts' => ['square' => 512, 'format' => 'png'], 'hint' => 'set.app_icon_hint'],
                'email_logo' => ['type' => 'image', 'opts' => ['max_width' => 320, 'format' => 'png']],
                'og_image' => ['type' => 'image', 'opts' => ['max_width' => 1200, 'format' => 'jpg']],
                'default_banner' => ['type' => 'image', 'opts' => ['max_width' => 1600]],
                'footer_en' => ['type' => 'textarea'], 'footer_bn' => ['type' => 'textarea'],
                'legal_notice' => ['type' => 'textarea'], 'legal_notice_bn' => ['type' => 'textarea'],
                'bengali_digits' => $yes, 'usd_to_bdt' => ['type' => 'number', 'hint' => 'set.usd_to_bdt_hint'],
            ]],
            'homepage' => ['icon' => 'fa-solid fa-house', 'fields' => [
                'hero_title' => ['type' => 'text'], 'hero_title_bn' => ['type' => 'text'], 'hero_subtitle' => ['type' => 'textarea'], 'hero_subtitle_bn' => ['type' => 'textarea'],
                'stat_projects' => ['type' => 'text', 'max' => 20], 'stat_satisfaction' => ['type' => 'text', 'max' => 20], 'stat_support' => ['type' => 'text', 'max' => 20],
            ], 'links' => [['/admin/slides', 'admin.slider', 'fa-solid fa-images'], ['/admin/faqs', 'admin.faqs', 'fa-solid fa-circle-question']]],
            'theme' => ['icon' => 'fa-solid fa-palette', 'fields' => [
                'color_primary' => ['type' => 'color'], 'color_secondary' => ['type' => 'color'], 'color_accent' => ['type' => 'color'],
                'card_radius' => ['type' => 'number', 'min' => 0, 'max' => 28],
                'default_theme' => ['type' => 'select', 'options' => ['light' => 'Light', 'dark' => 'Dark', 'auto' => 'Auto (system)']], 'allow_dark' => $yes,
            ]],
            'contact' => ['icon' => 'fa-solid fa-address-book', 'fields' => [
                'contact_email' => ['type' => 'email'], 'contact_whatsapp' => ['type' => 'text'], 'contact_telegram' => ['type' => 'text'], 'contact_facebook' => ['type' => 'url'],
                'contact_address' => ['type' => 'text'], 'contact_address_bn' => ['type' => 'text'], 'contact_hours' => ['type' => 'text'], 'contact_hours_bn' => ['type' => 'text'],
                'social_x' => ['type' => 'url'], 'social_linkedin' => ['type' => 'url'], 'social_github' => ['type' => 'url'], 'social_youtube' => ['type' => 'url'],
            ]],
            'payment' => ['icon' => 'fa-solid fa-wallet', 'fields' => [
                'require_verified_for_payment' => $yes, 'max_screenshot_mb' => ['type' => 'number', 'min' => 1, 'max' => 20], 'wallet_min_withdraw' => ['type' => 'number', 'min' => 1, 'max' => 10000],
            ], 'links' => [['/admin/payment-methods', 'admin.payment_methods', 'fa-solid fa-building-columns'], ['/admin/wallet', 'wallet.admin_title', 'fa-solid fa-wallet']], 'methods' => true],
            'security' => ['icon' => 'fa-solid fa-shield-halved', 'fields' => [
                'security_max_attempts' => ['type' => 'number', 'min' => 3, 'max' => 50], 'security_lock_minutes' => ['type' => 'number', 'min' => 1, 'max' => 1440],
                'registration_enabled' => $yes, 'require_email_verification' => $yes,
                'recaptcha_enabled' => $yes, 'recaptcha_site_key' => ['type' => 'text'], 'recaptcha_secret' => ['type' => 'secret'],
            ], 'info' => 'set.security_info'],
            'smtp' => ['icon' => 'fa-solid fa-envelope', 'fields' => [
                'smtp_host' => ['type' => 'text', 'placeholder' => 'smtp.hostinger.com'], 'smtp_port' => ['type' => 'number', 'placeholder' => '465'],
                'smtp_encryption' => ['type' => 'select', 'options' => ['ssl' => 'SSL', 'tls' => 'TLS (STARTTLS)', 'none' => 'None']],
                'smtp_user' => ['type' => 'text'], 'smtp_pass' => ['type' => 'secret'], 'smtp_from_email' => ['type' => 'email'], 'smtp_from_name' => ['type' => 'text'],
            ], 'test' => 'smtp'],
            'google' => ['icon' => 'fa-brands fa-google', 'fields' => [
                'google_enabled' => $yes, 'google_client_id' => ['type' => 'text'], 'google_client_secret' => ['type' => 'secret'],
            ], 'google' => true],
            'ai' => ['icon' => 'fa-solid fa-robot', 'fields' => [
                'ai_enabled' => $yes, 'ai_provider' => ['type' => 'select', 'options' => ['openai' => 'OpenAI', 'compatible' => 'OpenAI-compatible API']],
                'ai_base_url' => ['type' => 'url', 'hint' => 'set.ai_base_hint'], 'ai_model' => ['type' => 'text', 'placeholder' => 'gpt-4o-mini'],
                'ai_api_key' => ['type' => 'secret', 'hint' => 'set.ai_key_hint'], 'ai_rate_limit' => ['type' => 'number', 'min' => 1, 'max' => 200],
                'ai_greeting' => $yes, 'ai_sound' => $yes, 'ai_system_prompt' => ['type' => 'textarea', 'rows' => 6],
            ], 'test' => 'ai', 'links' => [['/admin/ai-logs', 'admin.ai_logs', 'fa-solid fa-comments']]],
            'pwa' => ['icon' => 'fa-solid fa-mobile-screen-button', 'fields' => [
                'pwa_enabled' => $yes, 'pwa_name' => ['type' => 'text'], 'pwa_short_name' => ['type' => 'text', 'max' => 24],
                'pwa_theme_color' => ['type' => 'color'], 'pwa_background_color' => ['type' => 'color'], 'pwa_install_prompt' => $yes,
                'pwa_version' => ['type' => 'number', 'hint' => 'set.pwa_version_hint'],
            ], 'info' => 'set.pwa_info'],
            'seo' => ['icon' => 'fa-solid fa-magnifying-glass-chart', 'fields' => [
                'seo_title' => ['type' => 'text'], 'seo_description' => ['type' => 'textarea'], 'seo_keywords' => ['type' => 'text'],
                'og_title' => ['type' => 'text'], 'og_description' => ['type' => 'textarea'],
                'twitter_card' => ['type' => 'select', 'options' => ['summary_large_image' => 'summary_large_image', 'summary' => 'summary']], 'twitter_site' => ['type' => 'text', 'placeholder' => '@oryzenx'],
                'canonical_base' => ['type' => 'url', 'hint' => 'set.canonical_hint'],
            ], 'seo' => true],
            'maintenance' => ['icon' => 'fa-solid fa-person-digging', 'fields' => [
                'maintenance_enabled' => $yes, 'maintenance_minutes' => ['type' => 'number', 'min' => 1, 'max' => 10080],
                'maintenance_message' => ['type' => 'textarea'], 'maintenance_message_bn' => ['type' => 'textarea'], 'maintenance_contact' => $yes,
            ], 'info' => 'set.maint_info'],
            'notifications' => ['icon' => 'fa-solid fa-bell', 'fields' => [
                'notify_sound' => $yes, 'push_enabled' => $yes, 'vapid_subject' => ['type' => 'text', 'placeholder' => 'mailto:you@example.com'],
            ], 'links' => [['/admin/notifications', 'admin.send_notification', 'fa-solid fa-paper-plane']]],
            'images' => ['icon' => 'fa-solid fa-image', 'fields' => [
                'img_quality' => ['type' => 'number', 'min' => 10, 'max' => 100], 'img_max_upload_mb' => ['type' => 'number', 'min' => 1, 'max' => 50],
                'img_max_width' => ['type' => 'number', 'min' => 0, 'max' => 8000], 'img_format' => ['type' => 'select', 'options' => ['webp' => 'WebP', 'jpg' => 'JPG', 'png' => 'PNG', 'keep' => 'Keep original']],
                'img_auto_webp' => $yes, 'img_thumbnail' => $yes, 'img_thumb_width' => ['type' => 'number', 'min' => 64, 'max' => 1200],
            ], 'links' => [['/admin/compressor', 'admin.compressor', 'fa-solid fa-compress']]],
            'analytics' => ['icon' => 'fa-solid fa-chart-line', 'fields' => ['analytics_enabled' => $yes, 'analytics_geo_lookup' => $yes], 'info' => 'set.analytics_info',
                'links' => [['/admin/analytics', 'admin.analytics', 'fa-solid fa-chart-pie']]],
        ];
    }

    public function index(): void
    {
        View::page('admin/settings', ['sections' => self::sections(), 'current' => null], ['layout' => 'admin', 'title' => t('admin.settings'), 'nav' => 'settings', 'cache' => false]);
    }

    private function sec(string $section): array
    {
        $s = self::sections()[$section] ?? null;
        if (!$s) throw new HttpException(t('error.404'), 404);
        return $s;
    }

    public function section(string $section): void
    {
        $s = $this->sec($section);
        $extra = [];
        if (!empty($s['methods'])) $extra['methods'] = DB::all('SELECT * FROM payment_methods ORDER BY sort_order, id');
        View::page('admin/settings', ['sections' => self::sections(), 'current' => $section, 's' => $s] + $extra,
            ['layout' => 'admin', 'title' => t('set.' . $section) . ' · ' . t('admin.settings'), 'nav' => 'settings', 'cache' => false]);
    }

    public function save(string $section): void
    {
        $s = $this->sec($section);
        $values = []; $errors = [];
        foreach ($s['fields'] as $key => $f) {
            $raw = $_POST[$key] ?? null;
            switch ($f['type']) {
                case 'checkbox': $values[$key] = $raw === '1' ? '1' : '0'; break;
                case 'secret': if (is_string($raw) && $raw !== '') $values[$key] = trim($raw); if (($_POST[$key . '_clear'] ?? '') === '1') $values[$key] = ''; break;
                case 'image':
                    if (($_POST[$key . '_remove'] ?? '') === '1') { Upload::delete(setting($key)); $values[$key] = ''; }
                    if (Upload::present($key)) {
                        try { $values[$key] = Upload::image($key, 'brand', $f['opts'] ?? []); Upload::delete(setting($key)); }
                        catch (UploadError $e) { $errors[$key] = $e->getMessage(); }
                    }
                    break;
                case 'color':
                    if (!preg_match('/^#[0-9a-f]{6}$/i', (string)$raw)) $errors[$key] = t('valid.color'); else $values[$key] = strtolower((string)$raw);
                    break;
                case 'number':
                    if (!is_numeric($raw)) { $errors[$key] = t('valid.numeric'); break; }
                    $n = $raw + 0;
                    if ((isset($f['min']) && $n < $f['min']) || (isset($f['max']) && $n > $f['max'])) { $errors[$key] = t('valid.range', ['min' => $f['min'] ?? '-', 'max' => $f['max'] ?? '-']); break; }
                    $values[$key] = (string)$n;
                    break;
                case 'select':
                    if (!array_key_exists((string)$raw, $f['options'])) $errors[$key] = t('valid.in'); else $values[$key] = (string)$raw;
                    break;
                default:
                    $v = trim((string)$raw);
                    if ($f['type'] === 'email' && $v !== '' && !filter_var($v, FILTER_VALIDATE_EMAIL)) $errors[$key] = t('valid.email');
                    if ($f['type'] === 'url' && $v !== '' && !preg_match('#^https?://#i', $v)) $errors[$key] = t('valid.url');
                    if (mb_strlen($v) > ($f['max'] ?? 5000)) $errors[$key] = t('valid.max', ['n' => $f['max'] ?? 5000]);
                    $values[$key] = $v;
            }
        }
        if ($errors) fail(t('valid.fix'), $errors);

        if ($section === 'maintenance') {
            $values['maintenance_until'] = $values['maintenance_enabled'] === '1'
                ? (setting('maintenance_enabled') === '1' && setting('maintenance_minutes') === $values['maintenance_minutes'] && setting('maintenance_until') ? setting('maintenance_until') : date('c', time() + (int)$values['maintenance_minutes'] * 60))
                : '';
        }
        Settings::set($values);
        if (isset($values['app_icon']) || isset($values['color_primary'])) SystemController::buildIcons();
        if ($section === 'notifications' && ($values['push_enabled'] ?? '') === '1') WebPush::ensureKeys();
        @array_map('unlink', glob(STORAGE . '/cache/ai-knowledge-*.txt') ?: []);
        Auth::activity('admin_settings_' . $section);
        respond(true, t('common.saved'), '/admin/settings/' . $section, ['reload' => in_array($section, ['general', 'theme'], true)]);
    }

    public function test(string $what): void
    {
        if ($what === 'smtp') {
            $to = input('to') ?: auth()['email'];
            if (!filter_var($to, FILTER_VALIDATE_EMAIL)) fail(t('valid.email'));
            $ok = Mailer::send($to, setting('site_name') . ' SMTP test', '<p>✅ SMTP is working. Sent at ' . e(date('Y-m-d H:i:s')) . '.</p>', $err);
            $ok ? respond(true, t('set.smtp_ok', ['to' => $to])) : fail(t('set.smtp_fail') . ' ' . $err);
        }
        if (setting('ai_api_key') === '') fail(t('set.ai_no_key'));
        try {
            $t0 = microtime(true);
            $reply = Assistant::callProvider([['role' => 'user', 'content' => (string)(input('prompt') ?: 'Say hello and list two of our services in one sentence.')]]);
            respond(true, t('set.ai_ok'), null, ['reply' => $reply, 'ms' => (int)((microtime(true) - $t0) * 1000)]);
        } catch (Throwable $e) {
            fail(t('set.ai_fail') . ' ' . mb_substr($e->getMessage(), 0, 300));
        }
    }
}
