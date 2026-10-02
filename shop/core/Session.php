<?php
final class Session
{
    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $ini = static function (string $k, string $v): void {
            if (function_exists('ini_set')) {
                @ini_set($k, $v);
            }
        };
        $ini('session.use_strict_mode', '1');
        $ini('session.use_only_cookies', '1');
        $ini('session.cookie_httponly', '1');
        $ini('session.gc_maxlifetime', '7200');
        if (PHP_VERSION_ID < 80400) {
            // Deprecated since PHP 8.4 (where 32 chars / 4 bits is the safe default).
            $ini('session.sid_length', '48');
            $ini('session.sid_bits_per_character', '6');
        }
        // Shared hosts sometimes have an unwritable default session path → use our own private folder.
        $path = (string) session_save_path();
        $dir = $path !== '' ? (str_contains($path, ';') ? substr($path, strrpos($path, ';') + 1) : $path) : sys_get_temp_dir();
        if (!@is_writable($dir)) {
            $own = BASE_PATH . '/storage/sessions';
            if (!is_dir($own)) {
                @mkdir($own, 0700, true);
            }
            if (is_writable($own)) {
                session_save_path($own);
            }
        }
        session_name(Config::get('session.name', 'shop_sid'));
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => Request::isHttps(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
        if (!isset($_SESSION['_created'])) {
            $_SESSION['_created'] = time();
        } elseif (time() - $_SESSION['_created'] > 1800) {
            session_regenerate_id(true);
            $_SESSION['_created'] = time();
        }
    }

    public static function get(string $k, mixed $d = null): mixed { return $_SESSION[$k] ?? $d; }
    public static function set(string $k, mixed $v): void         { $_SESSION[$k] = $v; }
    public static function forget(string $k): void                { unset($_SESSION[$k]); }

    public static function flash(string $k, mixed $v = null): mixed
    {
        if ($v !== null) {
            $_SESSION['_flash'][$k] = $v;
            return null;
        }
        $val = $_SESSION['_flash'][$k] ?? null;
        unset($_SESSION['_flash'][$k]);
        return $val;
    }

    public static function regenerate(): void
    {
        session_regenerate_id(true);
        $_SESSION['_created'] = time();
    }

    public static function destroy(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', ['expires' => time() - 42000, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Lax']);
        }
        session_destroy();
    }
}
