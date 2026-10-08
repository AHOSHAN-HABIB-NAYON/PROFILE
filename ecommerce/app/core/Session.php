<?php
/**
 * Hardened PHP session — used only for the admin area so storefront pages
 * stay session-less (better caching, no cookie for customers).
 */
final class Session
{
    private static bool $started = false;

    public static function cookieName(): string
    {
        return Request::current()->isSecure() ? '__Host-nsadmin' : 'nsadmin';
    }

    /** True when the browser already carries an admin session cookie. */
    public static function hasCookie(): bool
    {
        return self::$started || isset($_COOKIE[self::cookieName()]);
    }

    public static function start(): void
    {
        if (self::$started || session_status() === PHP_SESSION_ACTIVE) {
            self::$started = true;
            return;
        }
        $secure = Request::current()->isSecure();
        session_name(self::cookieName());
        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.gc_maxlifetime', '28800');
        session_cache_limiter('');
        session_start();
        self::$started = true;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        self::start();
        return $_SESSION[$key] ?? $default;
    }

    public static function set(string $key, mixed $value): void
    {
        self::start();
        $_SESSION[$key] = $value;
    }

    public static function forget(string $key): void
    {
        self::start();
        unset($_SESSION[$key]);
    }

    public static function regenerate(): void
    {
        self::start();
        session_regenerate_id(true);
    }

    public static function id(): string
    {
        self::start();
        return session_id();
    }

    public static function destroy(): void
    {
        self::start();
        $_SESSION = [];
        $p = session_get_cookie_params();
        setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => $p['samesite']]);
        session_destroy();
        self::$started = false;
    }
}
