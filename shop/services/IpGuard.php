<?php
/** Double-order protection and IP blocking. */
final class IpGuard
{
    public static function blocked(string $ip): ?array
    {
        return DB::one("SELECT * FROM blocked_ips WHERE ip = ? AND (block_type = 'lifetime' OR blocked_until > NOW())", [$ip]);
    }

    /** @return string|null Bengali error if the IP may not order now. */
    public static function checkOrder(string $ip): ?string
    {
        if (self::blocked($ip)) {
            Logger::security('Blocked IP tried to order', ['ip' => $ip]);
            return 'দুঃখিত, এই মুহূর্তে আপনার অর্ডার গ্রহণ করা যাচ্ছে না। সাহায্যের জন্য WhatsApp-এ যোগাযোগ করুন।';
        }
        if (!Settings::on('order_limit_enabled')) {
            return null;
        }
        $hours = max(1, (int) setting('order_limit_hours', 24));
        $limit = max(1, (int) setting('order_limit_count', 1));
        $count = (int) DB::val('SELECT COUNT(*) FROM orders WHERE ip = ? AND created_at > (NOW() - INTERVAL ? HOUR) AND deleted_at IS NULL', [$ip, $hours]);
        if ($count < $limit) {
            return null;
        }
        // Repeated attempt → warn, alert admin, and block after the attempt limit.
        $attemptLimit = max(1, (int) setting('order_attempt_limit', 3));
        RateLimiter::hit('dup:' . $ip, 1000, $hours * 3600);
        $attempts = (int) DB::val('SELECT hits FROM rate_limits WHERE rl_key = ?', ['dup:' . $ip]);
        Notifier::add('duplicate', 'ডুপ্লিকেট অর্ডারের চেষ্টা', "IP {$ip} থেকে {$hours} ঘণ্টার মধ্যে আবার অর্ডারের চেষ্টা ({$attempts} বার)।", '/admin/blocked-ips');
        Logger::security('Duplicate order attempt', ['ip' => $ip, 'attempts' => $attempts]);
        if ($attempts >= $attemptLimit) {
            $type = setting('order_block_type') === 'lifetime' ? 'lifetime' : 'temporary';
            self::block($ip, 'বারবার ডুপ্লিকেট অর্ডারের চেষ্টা', $type, (int) setting('order_block_hours', 72), $attempts);
            return 'বারবার চেষ্টার কারণে সাময়িকভাবে অর্ডার গ্রহণ বন্ধ করা হয়েছে। সাহায্যের জন্য WhatsApp-এ যোগাযোগ করুন।';
        }
        return 'আপনি ইতিমধ্যে একটি অর্ডার করেছেন। নতুন অর্ডার বা পরিবর্তনের জন্য WhatsApp-এ যোগাযোগ করুন।';
    }

    public static function block(string $ip, string $reason, string $type = 'temporary', int $hours = 72, int $attempts = 0): void
    {
        $until = $type === 'lifetime' ? null : date('Y-m-d H:i:s', time() + max(1, $hours) * 3600);
        DB::run('INSERT INTO blocked_ips (ip, reason, attempts, block_type, blocked_until) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE reason = VALUES(reason), attempts = VALUES(attempts), block_type = VALUES(block_type), blocked_until = VALUES(blocked_until), created_at = NOW()',
            [$ip, mb_substr($reason, 0, 255), $attempts, $type, $until]);
        Notifier::add('blocked_ip', 'IP ব্লক করা হয়েছে', "{$ip} — {$reason}", '/admin/blocked-ips');
        Logger::security('IP blocked', ['ip' => $ip, 'type' => $type, 'reason' => $reason]);
    }

    public static function unblock(int $id): void
    {
        $ip = DB::val('SELECT ip FROM blocked_ips WHERE id = ?', [$id]);
        DB::run('DELETE FROM blocked_ips WHERE id = ?', [$id]);
        if ($ip) {
            RateLimiter::clear('dup:' . $ip);
            Logger::security('IP unblocked', ['ip' => $ip, 'admin' => Auth::id()]);
        }
    }
}
