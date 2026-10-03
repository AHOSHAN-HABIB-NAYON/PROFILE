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
        // A request that raced a login (e.g. a background prefetch sent with the old cookie) follows the
        // old session to its replacement instead of creating an empty one and logging the user out.
        if (!empty($_SESSION['_destroyed'])) {
            $next = $_SESSION['_new_id'] ?? '';
            if ($_SESSION['_destroyed'] < time() - 120 || !preg_match('/^[a-zA-Z0-9,-]{22,256}$/', $next)) {
                $_SESSION = [];
                session_regenerate_id(true);
            } else {
                session_write_close();
                ini_set('session.use_strict_mode', '0');
                session_id($next);
                session_start();
            }
        }
        // Idle timeout for non-remembered sessions (30 days for remembered).
        $now = time();
        $limit = !empty($_SESSION['remember']) ? 2592000 : 86400;
        if (!empty($_SESSION['_last']) && $now - $_SESSION['_last'] > $limit) {
            $_SESSION = [];
            session_regenerate_id(true);
        }
        $_SESSION['_last'] = $now;
    }

    /**
     * Race-safe session ID rotation (PHP manual pattern): the old session stays readable for a short time and
     * points to the new one, so parallel in-flight requests never wipe a fresh login.
     */
    public static function rotate(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) return;
        $data = $_SESSION;
        $newId = session_create_id();
        $_SESSION = ['_destroyed' => time(), '_new_id' => $newId];
        session_write_close();
        ini_set('session.use_strict_mode', '0');
        session_id($newId);
        session_start();
        $_SESSION = $data;
        unset($_SESSION['_destroyed'], $_SESSION['_new_id']);
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
