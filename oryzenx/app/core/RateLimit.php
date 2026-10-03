<?php
final class RateLimit
{
    /** Returns true when the action is allowed, false when the limit is exceeded. */
    public static function hit(string $bucket, int $max, int $seconds): bool
    {
        $key = hash('sha256', $bucket);
        $row = DB::row('SELECT hits, reset_at FROM rate_limits WHERE rkey = ?', [$key]);
        if (!$row || strtotime($row['reset_at']) <= time()) {
            DB::q('REPLACE INTO rate_limits (rkey, hits, reset_at) VALUES (?, 1, ?)', [$key, date('Y-m-d H:i:s', time() + $seconds)]);
            if (random_int(1, 50) === 1) DB::q('DELETE FROM rate_limits WHERE reset_at < NOW()');
            return true;
        }
        if ((int)$row['hits'] >= $max) return false;
        DB::q('UPDATE rate_limits SET hits = hits + 1 WHERE rkey = ?', [$key]);
        return true;
    }
}
