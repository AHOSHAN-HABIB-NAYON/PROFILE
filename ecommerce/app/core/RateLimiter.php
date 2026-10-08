<?php
/**
 * Fixed-window rate limiter backed by MySQL (works on shared hosting).
 */
final class RateLimiter
{
    /** Returns true if the action is allowed, false when the limit is exceeded. */
    public static function hit(string $key, int $max, int $windowSeconds): bool
    {
        $hash = hash('sha256', $key);
        $now = time();
        DB::exec(
            'INSERT INTO rate_limits (key_hash, hits, reset_at) VALUES (?, 1, ?)
             ON DUPLICATE KEY UPDATE
               hits = IF(reset_at < ?, 1, hits + 1),
               reset_at = IF(reset_at < ?, VALUES(reset_at), reset_at)',
            [$hash, $now + $windowSeconds, $now, $now]
        );
        $hits = (int)DB::value('SELECT hits FROM rate_limits WHERE key_hash = ?', [$hash]);
        if (random_int(1, 200) === 1) {
            DB::exec('DELETE FROM rate_limits WHERE reset_at < ?', [$now - 3600]);
        }
        return $hits <= $max;
    }

    public static function clear(string $key): void
    {
        DB::exec('DELETE FROM rate_limits WHERE key_hash = ?', [hash('sha256', $key)]);
    }
}
