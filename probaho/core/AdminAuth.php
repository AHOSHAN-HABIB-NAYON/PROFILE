<?php
/**
 * Separate authentication for the /v2admin panel.
 */
declare(strict_types=1);

final class AdminAuth
{
    private static ?array $admin = null;

    public static function user(): ?array
    {
        if (self::$admin !== null) {
            return self::$admin;
        }
        $id = (int) ($_SESSION['admin_id'] ?? 0);
        if (!$id) {
            return null;
        }
        $timeout = max(5, (int) setting('security_session_timeout', '120')) * 60;
        if (time() - (int) ($_SESSION['admin_last'] ?? 0) > $timeout) {
            self::logout();
            return null;
        }
        $admin = db()->row("SELECT * FROM admin_users WHERE id = ? AND status = 'active'", [$id]);
        if (!$admin) {
            self::logout();
            return null;
        }
        $_SESSION['admin_last'] = time();
        return self::$admin = $admin;
    }

    public static function login(array $admin): void
    {
        session_regenerate_id(true);
        $_SESSION['admin_id'] = (int) $admin['id'];
        $_SESSION['admin_last'] = time();
        unset($_SESSION['admin_2fa_pending']);
        db()->q('UPDATE admin_users SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?', [client_ip(), $admin['id']]);
        self::log('login', null, ['ua' => user_agent()]);
    }

    public static function logout(): void
    {
        unset($_SESSION['admin_id'], $_SESSION['admin_last'], $_SESSION['admin_2fa_pending']);
        self::$admin = null;
    }

    public static function can(string $ability): bool
    {
        $role = self::user()['role'] ?? '';
        if ($role === 'super') {
            return true;
        }
        $editor = ['content'];
        $admin = ['content', 'finance', 'users', 'settings', 'support'];
        return in_array($ability, $role === 'admin' ? $admin : $editor, true);
    }

    public static function log(string $action, ?string $target = null, array $meta = []): void
    {
        try {
            db()->insert('admin_logs', [
                'admin_id' => $_SESSION['admin_id'] ?? null,
                'action'   => $action,
                'target'   => $target,
                'ip'       => client_ip(),
                'meta'     => $meta ? json_encode($meta, JSON_UNESCAPED_UNICODE) : null,
            ]);
        } catch (Throwable $e) {
            Logger::error($e);
        }
    }
}
