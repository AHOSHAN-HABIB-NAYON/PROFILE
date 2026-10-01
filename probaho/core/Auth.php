<?php
/**
 * End-user authentication: PHP session + tracked device sessions
 * (user_sessions) with optional "remember me" cookie (selector/validator).
 */
declare(strict_types=1);

final class Auth
{
    private const COOKIE = 'pb_remember';
    private static ?array $user = null;
    private static bool $resolved = false;

    public static function user(): ?array
    {
        if (self::$resolved) {
            return self::$user;
        }
        self::$resolved = true;
        if (!config('installed')) {
            return null;
        }

        $uid = (int) ($_SESSION['uid'] ?? 0);
        $sid = (int) ($_SESSION['sid'] ?? 0);
        if ($uid && $sid) {
            $session = db()->row('SELECT * FROM user_sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > NOW()', [$sid, $uid]);
            $timeout = max(5, (int) setting('security_session_timeout', '120')) * 60;
            $idle = time() - (int) ($_SESSION['last_activity'] ?? time());
            if (!$session || (!$session['remember'] && $idle > $timeout)) {
                if ($session) {
                    db()->q('UPDATE user_sessions SET revoked_at = NOW() WHERE id = ?', [$sid]);
                }
                self::clearLocal();
            } else {
                self::$user = self::loadUser($uid);
                if (self::$user) {
                    $_SESSION['last_activity'] = time();
                    if (strtotime($session['last_seen_at']) < time() - 300) {
                        db()->q('UPDATE user_sessions SET last_seen_at = NOW(), ip = ? WHERE id = ?', [client_ip(), $sid]);
                    }
                    return self::$user;
                }
                self::clearLocal();
            }
        }
        return self::$user = self::fromRememberCookie();
    }

    public static function id(): int
    {
        return (int) (self::user()['id'] ?? 0);
    }

    public static function check(): bool
    {
        return self::user() !== null;
    }

    private static function loadUser(int $id): ?array
    {
        $u = db()->row('SELECT * FROM users WHERE id = ?', [$id]);
        return ($u && $u['status'] === 'active') ? $u : null;
    }

    private static function fromRememberCookie(): ?array
    {
        $cookie = (string) ($_COOKIE[self::COOKIE] ?? '');
        if (!preg_match('/^([A-Za-z0-9_-]{24}):([A-Za-z0-9_-]{43})$/', $cookie, $m)) {
            return null;
        }
        $session = db()->row('SELECT * FROM user_sessions WHERE selector = ? AND remember = 1 AND revoked_at IS NULL AND expires_at > NOW()', [$m[1]]);
        if (!$session || !hash_equals($session['validator_hash'], hash('sha256', $m[2]))) {
            self::forgetCookie();
            return null;
        }
        $user = self::loadUser((int) $session['user_id']);
        if (!$user) {
            return null;
        }
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $user['id'];
        $_SESSION['sid'] = (int) $session['id'];
        $_SESSION['last_activity'] = time();
        db()->q('UPDATE user_sessions SET last_seen_at = NOW(), ip = ? WHERE id = ?', [client_ip(), $session['id']]);
        return $user;
    }

    /** Complete a successful login (password, Google or passkey). */
    public static function login(array $user, bool $remember, string $method): void
    {
        session_regenerate_id(true);
        $selector = b64url_encode(random_bytes(18));
        $validator = b64url_encode(random_bytes(32));
        $days = max(1, (int) setting('security_remember_days', '30'));
        $expires = $remember ? date('Y-m-d H:i:s', time() + $days * 86400) : date('Y-m-d H:i:s', time() + 86400);

        $sid = db()->insert('user_sessions', [
            'user_id'        => $user['id'],
            'selector'       => $selector,
            'validator_hash' => hash('sha256', $validator),
            'remember'       => $remember ? 1 : 0,
            'method'         => $method,
            'user_agent'     => user_agent(),
            'ip'             => client_ip(),
            'expires_at'     => $expires,
        ]);
        if ($remember) {
            setcookie(self::COOKIE, $selector . ':' . $validator, [
                'expires' => time() + $days * 86400, 'path' => base_path() . '/',
                'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax',
            ]);
        }
        $_SESSION['uid'] = (int) $user['id'];
        $_SESSION['sid'] = $sid;
        $_SESSION['last_activity'] = time();
        unset($_SESSION['pending_2fa']);

        db()->q('UPDATE users SET last_login_at = NOW(), last_login_ip = ? WHERE id = ?', [client_ip(), $user['id']]);
        self::$user = self::loadUser((int) $user['id']);
        self::$resolved = true;

        if (setting_on('security_login_alerts') && strtotime((string) $user['created_at']) < time() - 120) {
            $labels = ['password' => 'পাসওয়ার্ড', 'google' => 'Google', 'passkey' => 'Passkey'];
            $device = device_label(user_agent());
            Notify::user((int) $user['id'], 'security', 'নতুন লগইন শনাক্ত হয়েছে', ($labels[$method] ?? $method) . ' দিয়ে ' . $device . ' থেকে লগইন হয়েছে। আপনি না হলে এখনই পাসওয়ার্ড পরিবর্তন করুন।', '/settings', [
                'push'  => false,
                'email' => ['login_alert', ['device' => $device, 'ip' => client_ip(), 'method' => $labels[$method] ?? $method, 'time' => bn_date(now())]],
            ]);
        }
    }

    public static function logout(): void
    {
        if (!empty($_SESSION['sid'])) {
            db()->q('UPDATE user_sessions SET revoked_at = NOW() WHERE id = ?', [(int) $_SESSION['sid']]);
        }
        self::forgetCookie();
        self::clearLocal();
        self::$user = null;
    }

    private static function clearLocal(): void
    {
        unset($_SESSION['uid'], $_SESSION['sid'], $_SESSION['last_activity'], $_SESSION['pending_2fa']);
    }

    private static function forgetCookie(): void
    {
        if (isset($_COOKIE[self::COOKIE])) {
            setcookie(self::COOKIE, '', ['expires' => time() - 3600, 'path' => base_path() . '/', 'secure' => is_https(), 'httponly' => true, 'samesite' => 'Lax']);
        }
    }

    public static function refresh(): void
    {
        if (self::$user) {
            self::$user = self::loadUser((int) self::$user['id']);
        }
    }

    /** Create a user + wallet. Returns the new user row. */
    public static function createUser(array $data): array
    {
        return db()->tx(static function (DB $db) use ($data) {
            do {
                $uid = random_code(8, '0123456789');
            } while ($db->val('SELECT 1 FROM users WHERE uid = ?', [$uid]));
            $id = $db->insert('users', [
                'uid'               => $uid,
                'name'              => $data['name'],
                'email'             => strtolower($data['email']),
                'phone'             => $data['phone'] ?: null,
                'password_hash'     => isset($data['password']) ? password_hash($data['password'], PASSWORD_DEFAULT) : null,
                'google_id'         => $data['google_id'] ?? null,
                'avatar'            => $data['avatar'] ?? null,
                'webauthn_handle'   => b64url_encode(random_bytes(32)),
                'email_verified_at' => $data['email_verified_at'] ?? null,
            ]);
            $db->insert('wallets', ['user_id' => $id]);
            return $db->row('SELECT * FROM users WHERE id = ?', [$id]);
        });
    }

    public static function needsVerification(?array $user = null): bool
    {
        $user ??= self::user();
        return $user && setting_on('auth_email_verification') && empty($user['email_verified_at']);
    }
}
