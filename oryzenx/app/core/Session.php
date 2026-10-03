<?php
final class Session
{
    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) return;
        $dir = STORAGE . '/sessions';
        if (is_dir($dir) && is_writable($dir)) session_save_path($dir);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        ini_set('session.gc_maxlifetime', '2592000');
        session_name('ozx_sid');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => base_path() ?: '/',
            'secure' => is_https(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
        // Idle timeout for non-remembered sessions (30 days for remembered).
        $now = time();
        $limit = !empty($_SESSION['remember']) ? 2592000 : 86400;
        if (!empty($_SESSION['_last']) && $now - $_SESSION['_last'] > $limit) {
            $_SESSION = [];
            session_regenerate_id(true);
        }
        $_SESSION['_last'] = $now;
    }

    public static function flash(string $key, ?string $value = null): ?string
    {
        if ($value !== null) { $_SESSION['_flash'][$key] = $value; return null; }
        $v = $_SESSION['_flash'][$key] ?? null;
        unset($_SESSION['_flash'][$key]);
        return $v;
    }

    /** Re-issues the cookie with a long lifetime when "remember me" is chosen. */
    public static function remember(bool $on): void
    {
        $_SESSION['remember'] = $on;
        if ($on) {
            setcookie(session_name(), session_id(), [
                'expires' => time() + 2592000, 'path' => base_path() ?: '/',
                'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax',
            ]);
        }
    }
}
