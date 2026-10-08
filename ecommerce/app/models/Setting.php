<?php
/**
 * Key/value settings: code defaults (app/config/defaults.php) merged with DB
 * overrides. Loaded once per request from a file cache.
 */
final class Setting
{
    private static ?array $values = null;

    public static function all(): array
    {
        if (self::$values === null) {
            $defaults = require APP_PATH . '/config/defaults.php';
            try {
                $overrides = Cache::remember('settings:all', 3600, static function () {
                    $rows = DB::all('SELECT `key`, `value` FROM settings');
                    return array_column($rows, 'value', 'key');
                });
            } catch (Throwable $e) {
                Logger::error('Settings unavailable: ' . $e->getMessage());
                $overrides = [];
            }
            self::$values = array_merge($defaults, $overrides);
        }
        return self::$values;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $all = self::all();
        return array_key_exists($key, $all) && $all[$key] !== null ? $all[$key] : $default;
    }

    public static function set(string $key, ?string $value): void
    {
        self::setMany([$key => $value]);
    }

    public static function setMany(array $values): void
    {
        foreach ($values as $key => $value) {
            DB::exec(
                'INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
                [$key, $value === null ? null : (string)$value]
            );
        }
        Cache::forget('settings:all');
        self::$values = null;
    }

    public static function json(string $key): array
    {
        return json_list(self::get($key, '[]'));
    }
}
