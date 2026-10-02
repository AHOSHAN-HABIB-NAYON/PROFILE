<?php
final class RateLimiter
{
    /** Returns true if the action is allowed; records a hit. */
    public static function hit(string $key, int $max, int $windowSeconds): bool
    {
        $key = mb_substr($key, 0, 120);
        $now = time();
        $row = DB::one('SELECT hits, window_start FROM rate_limits WHERE rl_key = ?', [$key]);
        if (!$row || $now - (int) $row['window_start'] >= $windowSeconds) {
            DB::run('INSERT INTO rate_limits (rl_key, hits, window_start) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE hits = 1, window_start = VALUES(window_start)', [$key, $now]);
            return true;
        }
        if ((int) $row['hits'] >= $max) {
            return false;
        }
        DB::run('UPDATE rate_limits SET hits = hits + 1 WHERE rl_key = ?', [$key]);
        return true;
    }

    public static function tooMany(string $key, int $max, int $windowSeconds): bool
    {
        $row = DB::one('SELECT hits, window_start FROM rate_limits WHERE rl_key = ?', [$key]);
        return $row && time() - (int) $row['window_start'] < $windowSeconds && (int) $row['hits'] >= $max;
    }

    public static function clear(string $key): void
    {
        DB::run('DELETE FROM rate_limits WHERE rl_key = ?', [$key]);
    }

    /** Occasional cleanup without cron. */
    public static function gc(): void
    {
        if (random_int(1, 200) === 1) {
            DB::run('DELETE FROM rate_limits WHERE window_start < ?', [time() - 86400 * 2]);
        }
    }
}
