<?php
final class Request
{
    private static ?array $json = null;

    public static function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public static function path(): string
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $path = '/' . trim(rawurldecode($path), '/');
        return $path;
    }

    public static function fullUrl(): string
    {
        return $_SERVER['REQUEST_URI'] ?? '/';
    }

    public static function origin(): string
    {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (Config::get('trust_proxy') && ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $host = preg_replace('/[^a-z0-9.\-:]/i', '', $_SERVER['HTTP_HOST'] ?? 'localhost');
        return ($https ? 'https' : 'http') . '://' . $host;
    }

    public static function isHttps(): bool
    {
        return str_starts_with(self::origin(), 'https');
    }

    /** SPA partial request (router.js sends X-SPA: 1). */
    public static function isSpa(): bool
    {
        return ($_SERVER['HTTP_X_SPA'] ?? '') === '1';
    }

    public static function wantsJson(): bool
    {
        return self::isSpa()
            || ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'fetch'
            || str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json')
            || str_starts_with(self::path(), '/api/')
            || str_starts_with(self::path(), '/admin/api/');
    }

    public static function input(string $key, mixed $default = null): mixed
    {
        $all = self::all();
        return $all[$key] ?? $default;
    }

    public static function str(string $key, string $default = ''): string
    {
        $v = self::input($key, $default);
        return is_scalar($v) ? trim((string) $v) : $default;
    }

    public static function int(string $key, int $default = 0): int
    {
        $v = self::input($key, $default);
        return is_numeric($v) ? (int) $v : $default;
    }

    public static function bool(string $key): bool
    {
        $v = self::input($key, false);
        return in_array($v, [true, 1, '1', 'on', 'true', 'yes'], true);
    }

    public static function all(): array
    {
        if (str_contains($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
            if (self::$json === null) {
                $raw = file_get_contents('php://input') ?: '';
                $decoded = json_decode($raw, true);
                self::$json = is_array($decoded) ? $decoded : [];
            }
            return self::$json + $_GET;
        }
        return $_POST + $_GET;
    }

    public static function query(string $key, string $default = ''): string
    {
        $v = $_GET[$key] ?? $default;
        return is_string($v) ? trim($v) : $default;
    }

    public static function ip(): string
    {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        if (Config::get('trust_proxy')) {
            $candidates = [
                $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null,
                isset($_SERVER['HTTP_X_FORWARDED_FOR']) ? trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]) : null,
                $_SERVER['HTTP_X_REAL_IP'] ?? null,
            ];
            foreach ($candidates as $c) {
                if ($c && filter_var($c, FILTER_VALIDATE_IP)) {
                    return $c;
                }
            }
        }
        return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
    }

    public static function userAgent(): string
    {
        return mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500);
    }

    public static function file(string $key): ?array
    {
        return isset($_FILES[$key]) && is_array($_FILES[$key]) ? $_FILES[$key] : null;
    }

    /** Normalises multi-file uploads into a list. */
    public static function files(string $key): array
    {
        $f = $_FILES[$key] ?? null;
        if (!$f) {
            return [];
        }
        if (!is_array($f['name'])) {
            return [$f];
        }
        $out = [];
        foreach ($f['name'] as $i => $name) {
            $out[] = ['name' => $name, 'type' => $f['type'][$i], 'tmp_name' => $f['tmp_name'][$i], 'error' => $f['error'][$i], 'size' => $f['size'][$i]];
        }
        return $out;
    }
}
