<?php
declare(strict_types=1);

namespace OryzenX\Core;

/**
 * Static application configuration loaded from config/config.php (outside the
 * web root). Runtime settings editable by admins live in the app_settings table
 * and are handled by Services\SettingsService.
 */
final class Config
{
    private static array $data = [];
    private static bool $loaded = false;

    public static function load(string $file): void
    {
        self::$data = is_file($file) ? (require $file) : [];
        self::$loaded = is_file($file);
    }

    public static function set(array $data): void
    {
        self::$data = $data;
        self::$loaded = true;
    }

    public static function isInstalled(): bool
    {
        return self::$loaded && !empty(self::$data['installed']);
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $cur = self::$data;
        foreach (explode('.', $key) as $part) {
            if (!is_array($cur) || !array_key_exists($part, $cur)) {
                return $default;
            }
            $cur = $cur[$part];
        }
        return $cur;
    }

    public static function all(): array
    {
        return self::$data;
    }

    public static function basePath(string $path = ''): string
    {
        return dirname(__DIR__, 2) . ($path !== '' ? '/' . ltrim($path, '/') : '');
    }

    public static function storagePath(string $path = ''): string
    {
        $base = self::get('storage_path') ?: self::basePath('storage');
        return rtrim($base, '/') . ($path !== '' ? '/' . ltrim($path, '/') : '');
    }

    public static function appUrl(string $path = ''): string
    {
        $base = rtrim((string) self::get('app_url', ''), '/');
        return $base . '/' . ltrim($path, '/');
    }

    public static function isDebug(): bool
    {
        return (bool) self::get('debug', false);
    }

    public static function demoMode(): bool
    {
        return (bool) self::get('demo_mode', false);
    }
}
