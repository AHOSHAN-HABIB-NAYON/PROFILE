<?php
final class Recaptcha
{
    public static function enabled(): bool
    {
        return setting('recaptcha_enabled') === '1' && setting('recaptcha_site_key') !== '' && setting('recaptcha_secret') !== '';
    }

    public static function widget(): string
    {
        if (!self::enabled()) return '';
        return '<div class="recaptcha" data-component="recaptcha" data-sitekey="' . e(setting('recaptcha_site_key')) . '"></div>';
    }

    public static function verify(): void
    {
        if (!self::enabled()) return;
        $token = (string)input('g-recaptcha-response');
        if ($token === '') fail(t('auth.captcha'));
        $r = Http::request('POST', 'https://www.google.com/recaptcha/api/siteverify', [],
            ['secret' => setting('recaptcha_secret'), 'response' => $token, 'remoteip' => client_ip()], 8);
        $j = json_decode($r['body'], true);
        if (empty($j['success'])) fail(t('auth.captcha'));
    }
}
