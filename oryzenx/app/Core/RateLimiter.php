<?php
declare(strict_types=1);

namespace OryzenX\Core;

/** Fixed-window rate limiter backed by the rate_limits table. */
final class RateLimiter
{
    public function __construct(private Database $db)
    {
    }

    /**
     * Records a hit and throws 429 when the limit is exceeded.
     * @param string $bucket e.g. "login"
     * @param string $key    e.g. ip or email (hashed before storage)
     */
    public function hit(string $bucket, string $key, int $max, int $windowSeconds): void
    {
        $remaining = $this->attempt($bucket, $key, $max, $windowSeconds);
        if ($remaining < 0) {
            throw HttpException::tooMany($this->retryAfter($bucket, $key, $windowSeconds));
        }
    }

    /** @return int remaining attempts after this hit (negative = blocked) */
    public function attempt(string $bucket, string $key, int $max, int $windowSeconds): int
    {
        $id = hash('sha256', $bucket . '|' . $key);
        $window = (int) (floor(time() / $windowSeconds) * $windowSeconds);
        $this->db->run(
            'INSERT INTO rate_limits (bucket_key, bucket, window_start, hits) VALUES (:k, :b, :w, 1)
             ON DUPLICATE KEY UPDATE hits = IF(window_start = VALUES(window_start), hits + 1, 1), window_start = VALUES(window_start)',
            ['k' => $id, 'b' => $bucket, 'w' => $window]
        );
        $hits = (int) $this->db->value('SELECT hits FROM rate_limits WHERE bucket_key = :k', ['k' => $id]);
        return $max - $hits;
    }

    public function clear(string $bucket, string $key): void
    {
        $this->db->run('DELETE FROM rate_limits WHERE bucket_key = :k', ['k' => hash('sha256', $bucket . '|' . $key)]);
    }

    private function retryAfter(string $bucket, string $key, int $windowSeconds): int
    {
        $window = (int) (floor(time() / $windowSeconds) * $windowSeconds);
        return max(1, $window + $windowSeconds - time());
    }
}
