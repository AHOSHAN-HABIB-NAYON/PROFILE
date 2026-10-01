<?php
/**
 * CAPTCHA: built-in arithmetic challenge (no third party) or
 * Cloudflare Turnstile / Google reCAPTCHA v2, selectable in Admin.
 */
declare(strict_types=1);

final class Captcha
{
    public static function enabledFor(string $context): bool
    {
        return setting('captcha_provider', 'none') !== 'none' && setting_on('captcha_on_' . $context);
    }

    public static function provider(): string
    {
        $p = (string) setting('captcha_provider', 'builtin');
        if (in_array($p, ['turnstile', 'recaptcha'], true) && (setting('captcha_site_key') === '' || setting('captcha_secret') === '')) {
            return 'builtin';
        }
        return $p;
    }

    /** HTML for the widget (rendered inside forms). */
    public static function widget(string $context): string
    {
        if (!self::enabledFor($context)) {
            return '';
        }
        $provider = self::provider();
        if ($provider === 'turnstile') {
            return '<div class="captcha" data-captcha="turnstile" data-sitekey="' . e(setting('captcha_site_key')) . '"></div>';
        }
        if ($provider === 'recaptcha') {
            return '<div class="captcha" data-captcha="recaptcha" data-sitekey="' . e(setting('captcha_site_key')) . '"></div>';
        }
        $a = random_int(2, 12);
        $b = random_int(1, 9);
        $_SESSION['captcha_' . $context] = $a + $b;
        return '<div class="field captcha-builtin"><label>নিরাপত্তা যাচাই: ' . bn_digits((string) $a) . ' + ' . bn_digits((string) $b) . ' = ?</label>'
            . '<input class="input" name="captcha_answer" inputmode="numeric" autocomplete="off" required placeholder="উত্তর লিখুন"></div>';
    }

    public static function verify(string $context): bool
    {
        if (!self::enabledFor($context)) {
            return true;
        }
        $provider = self::provider();
        if ($provider === 'builtin') {
            $expected = $_SESSION['captcha_' . $context] ?? null;
            unset($_SESSION['captcha_' . $context]);
            $answer = bn_to_en_digits((string) input('captcha_answer', ''));
            return $expected !== null && is_numeric($answer) && (int) $answer === (int) $expected;
        }
        $token = (string) input($provider === 'turnstile' ? 'cf-turnstile-response' : 'g-recaptcha-response', '');
        if ($token === '') {
            return false;
        }
        $endpoint = $provider === 'turnstile'
            ? 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
            : 'https://www.google.com/recaptcha/api/siteverify';
        $res = Http::post($endpoint, ['secret' => setting('captcha_secret'), 'response' => $token, 'remoteip' => client_ip()], [], false);
        return !empty($res['json']['success']);
    }
}
