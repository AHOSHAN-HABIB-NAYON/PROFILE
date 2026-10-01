<?php
/**
 * Login-attempt lockouts and generic fixed-window rate limits.
 */
declare(strict_types=1);

final class RateLimit
{
    /** True when identifier or IP exceeded the failed-login threshold. */
    public static function locked(string $scope, string $identifier): bool
    {
        $max = max(3, (int) setting('security_max_attempts', '5'));
        $minutes = max(1, (int) setting('security_lockout_minutes', '15'));
        $since = date('Y-m-d H:i:s', time() - $minutes * 60);
        $byId = (int) db()->val('SELECT COUNT(*) FROM login_attempts WHERE scope = ? AND identifier = ? AND success = 0 AND created_at > ?', [$scope, $identifier, $since]);
        $byIp = (int) db()->val('SELECT COUNT(*) FROM login_attempts WHERE scope = ? AND ip = ? AND success = 0 AND created_at > ?', [$scope, client_ip(), $since]);
        return $byId >= $max || $byIp >= $max * 4;
    }

    public static function record(string $scope, string $identifier, bool $success): void
    {
        db()->insert('login_attempts', ['scope' => $scope, 'identifier' => mb_substr($identifier, 0, 190), 'ip' => client_ip(), 'success' => $success ? 1 : 0]);
        if ($success) {
            db()->q('DELETE FROM login_attempts WHERE scope = ? AND identifier = ? AND success = 0', [$scope, $identifier]);
        }
        if (random_int(1, 50) === 1) {
            db()->q('DELETE FROM login_attempts WHERE created_at < ?', [date('Y-m-d H:i:s', time() - 86400 * 7)]);
        }
    }

    /** Returns false when more than $max hits happened inside $seconds. */
    public static function hit(string $key, int $max, int $seconds): bool
    {
        $key = mb_substr($key, 0, 120);
        $row = db()->row('SELECT hits, reset_at FROM rate_limits WHERE k = ?', [$key]);
        if (!$row || strtotime($row['reset_at']) < time()) {
            db()->q('REPLACE INTO rate_limits (k, hits, reset_at) VALUES (?, 1, ?)', [$key, date('Y-m-d H:i:s', time() + $seconds)]);
            return true;
        }
        if ((int) $row['hits'] >= $max) {
            return false;
        }
        db()->q('UPDATE rate_limits SET hits = hits + 1 WHERE k = ?', [$key]);
        return true;
    }
}
