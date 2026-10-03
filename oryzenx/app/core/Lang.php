<?php
final class Lang
{
    private static ?string $current = null;
    private static array $strings = [];
    public const AVAILABLE = ['bn' => 'বাংলা', 'en' => 'English'];

    public static function current(): string
    {
        if (self::$current) return self::$current;
        $c = $_COOKIE['ozx_lang'] ?? '';
        if (!isset(self::AVAILABLE[$c])) $c = (string)Settings::get('default_lang', 'bn');
        return self::$current = isset(self::AVAILABLE[$c]) ? $c : 'en';
    }

    public static function set(string $code): void
    {
        if (!isset(self::AVAILABLE[$code])) return;
        setcookie('ozx_lang', $code, ['expires' => time() + 31536000, 'path' => base_path() ?: '/', 'secure' => is_https(), 'httponly' => false, 'samesite' => 'Lax']);
        self::$current = $code;
    }

    private static function load(string $code): array
    {
        return self::$strings[$code] ??= (is_file(APP . "/lang/$code.php") ? require APP . "/lang/$code.php" : []);
    }

    public static function get(string $key, array $repl = []): string
    {
        $s = self::load(self::current())[$key] ?? self::load('en')[$key] ?? ucfirst(str_replace('_', ' ', substr(strrchr('.' . $key, '.'), 1)));
        foreach ($repl as $k => $v) $s = str_replace('{' . $k . '}', (string)$v, $s);
        return $s;
    }

    /** Strings exposed to JavaScript. */
    public static function js(): array
    {
        $keys = ['js.copied', 'js.offline', 'js.error', 'js.loading', 'js.update_ready', 'js.reload', 'js.confirm', 'js.no_results',
            'js.share_copy', 'js.install_title', 'js.install_text', 'js.typing', 'js.ai_error', 'js.notif_enabled', 'js.notif_denied',
            'js.cancel', 'js.ok', 'js.searching', 'js.saved', 'js.chars', 'js.view_all', 'js.mark_read', 'js.no_notifications', 'js.days', 'js.hours', 'js.minutes', 'js.seconds', 'js.ai_cleared',
            'js.eg_install_title', 'js.eg_install_text', 'js.eg_ios_text', 'js.eg_ios1', 'js.eg_ios2', 'js.eg_install_btn', 'js.eg_ok', 'js.eg_if1', 'js.eg_if2', 'js.eg_if3',
            'js.eg_push_title', 'js.eg_push_text', 'js.eg_allow', 'js.eg_pf1', 'js.eg_pf2', 'js.eg_pf3', 'js.eg_later', 'js.eg_denied_title', 'js.eg_denied_text',
            'js.eg_den1', 'js.eg_den2', 'js.eg_recheck', 'js.eg_still_blocked'];
        $out = [];
        foreach ($keys as $k) $out[substr($k, 3)] = self::get($k);
        return $out;
    }
}
