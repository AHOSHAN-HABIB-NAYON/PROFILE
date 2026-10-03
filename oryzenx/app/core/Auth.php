<?php
final class Auth
{
    private static array|false|null $user = null;

    public static function user(): ?array
    {
        if (self::$user !== null) return self::$user ?: null;
        self::$user = false;
        if (!INSTALLED || empty($_SESSION['uid']) || empty($_SESSION['stoken'])) return null;

        $hash = hash('sha256', $_SESSION['stoken']);
        $row = DB::row('SELECT u.*, s.id AS session_row, s.last_seen_at FROM user_sessions s JOIN users u ON u.id = s.user_id
                        WHERE s.session_hash = ? AND s.revoked_at IS NULL AND u.id = ?', [$hash, (int)$_SESSION['uid']]);
        if (!$row || !self::isAllowed($row)) { self::clearSession(); return null; }

        if (!$row['last_seen_at'] || strtotime($row['last_seen_at']) < time() - 300) {
            DB::q('UPDATE user_sessions SET last_seen_at = NOW(), ip = ? WHERE id = ?', [client_ip(), $row['session_row']]);
        }
        unset($row['password_hash']);
        return self::$user = $row;
    }

    public static function id(): ?int { return ($u = self::user()) ? (int)$u['id'] : null; }
    public static function isAdmin(): bool { return (self::user()['role'] ?? '') === 'admin'; }

    /** Returns false when the account may not sign in (ban, suspension, deletion). Lifts expired bans. */
    public static function isAllowed(array $u): bool
    {
        if (!empty($u['deleted_at'])) return false;
        if ($u['status'] === 'suspended') return false;
        if ($u['status'] === 'banned') {
            if ($u['banned_until'] && strtotime($u['banned_until']) <= time()) {
                DB::q("UPDATE users SET status='active', banned_until=NULL, ban_reason=NULL WHERE id=?", [$u['id']]);
                return true;
            }
            return false;
        }
        return true;
    }

    public static function blockedMessage(array $u): string
    {
        if (!empty($u['deleted_at'])) return t('auth.deleted');
        if ($u['status'] === 'suspended') return t('auth.suspended');
        if ($u['status'] === 'banned') return t('auth.banned', ['until' => $u['banned_until'] ? fmt_date($u['banned_until'], true) : '—']);
        return t('error.generic');
    }

    public static function login(array $u, string $method = 'password', bool $remember = false): void
    {
        session_regenerate_id(true);
        unset($_SESSION['pending_login']);
        $token = bin2hex(random_bytes(32));
        $_SESSION['uid'] = (int)$u['id'];
        $_SESSION['stoken'] = $token;
        $_SESSION['_csrf'] = bin2hex(random_bytes(32));
        Session::remember($remember);
        $ua = user_agent();
        DB::insert('user_sessions', [
            'user_id' => $u['id'], 'session_hash' => hash('sha256', $token), 'ip' => client_ip(),
            'user_agent' => mb_substr($ua, 0, 255), 'device' => UA::summary($ua), 'last_seen_at' => now(),
        ]);
        DB::q('UPDATE users SET last_login_at = NOW() WHERE id = ?', [$u['id']]);
        self::logAttempt((int)$u['id'], $u['email'], $method, true);
        self::$user = null;
    }

    public static function logout(): void
    {
        if (!empty($_SESSION['stoken'])) {
            DB::q('UPDATE user_sessions SET revoked_at = NOW() WHERE session_hash = ?', [hash('sha256', $_SESSION['stoken'])]);
        }
        self::clearSession();
    }

    public static function revokeOthers(int $userId): int
    {
        $current = !empty($_SESSION['stoken']) ? hash('sha256', $_SESSION['stoken']) : '';
        return DB::q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL AND session_hash <> ?', [$userId, $current])->rowCount();
    }

    public static function currentSessionHash(): string
    {
        return !empty($_SESSION['stoken']) ? hash('sha256', $_SESSION['stoken']) : '';
    }

    private static function clearSession(): void
    {
        $keep = ['lang' => $_SESSION['lang'] ?? null];
        $_SESSION = array_filter($keep);
        session_regenerate_id(true);
        self::$user = false;
    }

    public static function logAttempt(?int $userId, ?string $email, string $method, bool $success, ?string $reason = null): void
    {
        DB::insert('login_attempts', [
            'user_id' => $userId, 'email' => $email ? mb_strtolower($email) : null, 'ip' => client_ip(),
            'user_agent' => mb_substr(user_agent(), 0, 255), 'method' => $method, 'success' => $success ? 1 : 0, 'reason' => $reason,
        ]);
    }

    /** Lockout after N failures for an email or IP inside the lock window. */
    public static function isLocked(string $email): bool
    {
        $max = max(3, (int)setting('security_max_attempts'));
        $mins = max(1, (int)setting('security_lock_minutes'));
        $fails = (int)DB::val('SELECT COUNT(*) FROM login_attempts WHERE success = 0 AND (email = ? OR ip = ?)
                               AND created_at > (NOW() - INTERVAL ? MINUTE)', [mb_strtolower($email), client_ip(), $mins]);
        return $fails >= $max * ($email === '' ? 3 : 1);
    }

    public static function activity(string $action, string $details = '', ?int $userId = null): void
    {
        DB::insert('activity_logs', ['user_id' => $userId ?? self::id(), 'action' => $action, 'details' => mb_substr($details, 0, 500), 'ip' => client_ip()]);
    }

    public static function hash(string $password): string
    {
        return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
    }

    /** Issues a single-use token; returns the raw token (only its hash is stored). */
    public static function issueToken(int $userId, string $type, int $minutes, ?string $raw = null): string
    {
        DB::q('DELETE FROM user_tokens WHERE user_id = ? AND type = ?', [$userId, $type]);
        $raw ??= bin2hex(random_bytes(32));
        DB::insert('user_tokens', ['user_id' => $userId, 'type' => $type, 'token_hash' => hash('sha256', $type . '|' . $raw),
            'expires_at' => date('Y-m-d H:i:s', time() + $minutes * 60)]);
        return $raw;
    }

    /** Validates and consumes a token. Returns the user id or null. */
    public static function consumeToken(string $type, string $raw, ?int $userId = null, bool $consume = true): ?int
    {
        $row = DB::row('SELECT * FROM user_tokens WHERE token_hash = ? AND type = ? AND used_at IS NULL AND expires_at > NOW()',
            [hash('sha256', $type . '|' . $raw), $type]);
        if (!$row || ($userId !== null && (int)$row['user_id'] !== $userId)) return null;
        if ($consume) DB::q('UPDATE user_tokens SET used_at = NOW() WHERE id = ?', [$row['id']]);
        return (int)$row['user_id'];
    }

    public static function validatePassword(string $p): ?string
    {
        if (mb_strlen($p) < 8) return t('auth.pw_short');
        if (!preg_match('/[A-Za-z]/', $p) || !preg_match('/\d/', $p)) return t('auth.pw_weak');
        if (strlen($p) > 72) return t('auth.pw_long');
        return null;
    }
}
