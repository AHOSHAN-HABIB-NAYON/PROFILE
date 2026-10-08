<?php
/**
 * Anti-fake / duplicate order protection.
 *
 * Signals (each toggleable in Admin → Security):
 *   - phone number   (strong: same person)
 *   - device cookie  (strong: same browser)
 *   - IP address     (weak: mobile carriers/offices share IPs — admins may turn it off)
 * Repeated blocked attempts raise a security alert and can temporarily block the IP
 * (only for checkout — browsing is never blocked).
 */
final class FraudGuard
{
    public const BLOCKED_MESSAGE = 'দুঃখিত, এই মুহূর্তে আপনার অর্ডার গ্রহণ করা যাচ্ছে না। সাহায্যের জন্য আমাদের সাপোর্টে যোগাযোগ করুন।';
    public const DUPLICATE_MESSAGE = 'আপনি সম্প্রতি একটি অর্ডার করেছেন। নতুন অর্ডার বা পরিবর্তনের জন্য অনুগ্রহ করে সাপোর্টে যোগাযোগ করুন।';

    public static function isIpBlocked(string $ip): bool
    {
        return (bool)DB::value(
            "SELECT 1 FROM blocked_ips WHERE ip = ? AND (type = 'permanent' OR expires_at > NOW()) LIMIT 1",
            [$ip]
        );
    }

    /** Returns an error message if the order must be rejected, otherwise null. */
    public static function check(string $ip, string $phone, string $deviceHash): ?string
    {
        if (self::isIpBlocked($ip)) {
            self::recordAttempt($ip, $phone, $deviceHash, 'blocked_ip');
            return self::BLOCKED_MESSAGE;
        }
        if (DB::value('SELECT is_blocked FROM customers WHERE phone = ?', [$phone])) {
            self::recordAttempt($ip, $phone, $deviceHash, 'blocked_customer');
            return self::BLOCKED_MESSAGE;
        }
        if (setting('dup_enabled') !== '1') {
            return null;
        }
        $since = date('Y-m-d H:i:s', time() - max(1, (int)setting('dup_window_hours', 24)) * 3600);
        $conditions = [];
        $params = [];
        if (setting('dup_check_phone') === '1') {
            $conditions[] = 'phone = ?';
            $params[] = $phone;
        }
        if (setting('dup_check_device') === '1') {
            $conditions[] = 'device_hash = ?';
            $params[] = $deviceHash;
        }
        if (setting('dup_check_ip') === '1') {
            $conditions[] = 'ip = ?';
            $params[] = $ip;
        }
        if (!$conditions) {
            return null;
        }
        $match = DB::one(
            "SELECT id, order_number, phone = ? AS by_phone, device_hash = ? AS by_device, ip = ? AS by_ip
             FROM orders WHERE created_at >= ? AND status NOT IN ('cancelled') AND (" . implode(' OR ', $conditions) . ') ORDER BY id DESC LIMIT 1',
            array_merge([$phone, $deviceHash, $ip, $since], $params)
        );
        if (!$match) {
            return null;
        }
        $reason = $match['by_phone'] ? 'duplicate_phone' : ($match['by_device'] ? 'duplicate_device' : 'duplicate_ip');
        self::recordAttempt($ip, $phone, $deviceHash, $reason, $match['order_number']);
        return self::DUPLICATE_MESSAGE;
    }

    private static function recordAttempt(string $ip, string $phone, string $deviceHash, string $reason, ?string $orderNumber = null): void
    {
        DB::insert('order_attempts', ['ip' => $ip, 'phone' => $phone, 'device_hash' => $deviceHash, 'reason' => $reason]);
        $windowStart = date('Y-m-d H:i:s', time() - max(1, (int)setting('dup_window_hours', 24)) * 3600);
        $attempts = (int)DB::value('SELECT COUNT(*) FROM order_attempts WHERE ip = ? AND created_at >= ?', [$ip, $windowStart]);
        $max = max(1, (int)setting('dup_max_attempts', 3));

        if ($attempts === 1 && str_starts_with($reason, 'duplicate')) {
            Notification::create('duplicate', 'Duplicate order attempt', "Phone " . mask_phone($phone) . " / IP $ip" . ($orderNumber ? " (existing #$orderNumber)" : ''), url('/admin/security'));
        }
        if ($attempts >= $max && $reason !== 'blocked_ip') {
            $hours = max(1, (int)setting('dup_block_hours', 24));
            self::block($ip, "Auto: $attempts repeated order attempts ($reason)", 'temporary', $hours, $attempts);
            DB::insert('security_alerts', [
                'type' => 'repeated_order_attempts', 'severity' => 'high',
                'title' => "IP $ip temporarily blocked",
                'message' => "$attempts blocked order attempts within the duplicate window. Last reason: $reason.",
                'ip' => $ip, 'meta' => json_encode(['phone' => mask_phone($phone), 'reason' => $reason]),
            ]);
            Notification::create('security', 'IP auto-blocked: ' . $ip, "$attempts repeated order attempts", url('/admin/security'));
        }
    }

    public static function block(string $ip, string $reason, string $type, int $hours = 24, int $attempts = 0): void
    {
        if (!filter_var($ip, FILTER_VALIDATE_IP)) {
            throw new HttpException(422, 'Invalid IP address.');
        }
        $expires = $type === 'permanent' ? null : date('Y-m-d H:i:s', time() + $hours * 3600);
        DB::exec(
            'INSERT INTO blocked_ips (ip, reason, type, attempts, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE reason = VALUES(reason), type = VALUES(type), attempts = attempts + VALUES(attempts),
                                     expires_at = VALUES(expires_at), created_by = VALUES(created_by)',
            [$ip, mb_substr($reason, 0, 250), $type, $attempts, $expires, AdminAuth::id()]
        );
    }
}
