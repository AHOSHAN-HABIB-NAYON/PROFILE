<?php
/**
 * Admin-controlled configuration. Values live in three tables:
 *   site_settings (key/value), support_settings (row 1) and smtp_settings (row 1).
 * Keys prefixed with "support." / "smtp." map to those tables' columns.
 * Secret keys are stored encrypted and transparently decrypted.
 */
declare(strict_types=1);

final class Settings
{
    public const SECRET_KEYS = [
        'google_client_secret', 'captcha_secret', 'ai_api_key', 'push_vapid_private',
        'binance_api_secret', 'smtp.password',
    ];

    private static ?array $cache = null;

    private static function load(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $data = [];
        try {
            foreach (db()->all('SELECT k, v FROM site_settings') as $row) {
                $data[$row['k']] = $row['v'];
            }
            foreach (['support' => 'support_settings', 'smtp' => 'smtp_settings'] as $prefix => $table) {
                $row = db()->row('SELECT * FROM ' . $table . ' WHERE id = 1') ?? [];
                foreach ($row as $k => $v) {
                    $data[$prefix . '.' . $k] = $v;
                }
            }
        } catch (Throwable $e) {
            Logger::error($e);
        }
        return self::$cache = $data;
    }

    public static function get(string $key, $default = '')
    {
        $all = self::load();
        if (!array_key_exists($key, $all) || $all[$key] === null) {
            return $default;
        }
        return in_array($key, self::SECRET_KEYS, true) ? Crypto::decrypt((string) $all[$key]) : $all[$key];
    }

    public static function has(string $key): bool
    {
        return array_key_exists($key, self::load());
    }

    public static function set(string $key, $value): void
    {
        $value = is_bool($value) ? ($value ? '1' : '0') : (string) $value;
        $stored = in_array($key, self::SECRET_KEYS, true) ? Crypto::encrypt($value) : $value;
        if (preg_match('/^(support|smtp)\.([a-z_]+)$/', $key, $m)) {
            $table = $m[1] === 'support' ? 'support_settings' : 'smtp_settings';
            db()->q('UPDATE ' . $table . ' SET `' . $m[2] . '` = ? WHERE id = 1', [$stored]);
        } else {
            db()->q('INSERT INTO site_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [$key, $stored]);
        }
        self::$cache = null;
    }

    /** Lines of a multi-line setting as an array. */
    public static function lines(string $key): array
    {
        return array_values(array_filter(array_map('trim', explode("\n", (string) self::get($key, '')))));
    }
}
