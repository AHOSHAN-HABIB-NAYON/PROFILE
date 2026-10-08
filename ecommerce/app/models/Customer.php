<?php
/**
 * Customers are created automatically from orders (no registration).
 *
 * Privacy-safe autofill: previous details are only returned to a browser that
 * is already linked to that customer (via the signed, HttpOnly device cookie
 * set when they ordered). Typing someone else's phone number on another
 * device reveals nothing.
 */
final class Customer
{
    public static function upsertFromOrder(string $name, string $phone, string $district, string $address): int
    {
        $existing = DB::one('SELECT id FROM customers WHERE phone = ?', [$phone]);
        if ($existing) {
            DB::exec(
                'UPDATE customers SET name = ?, district = ?, address = ?, last_order_at = NOW() WHERE id = ?',
                [$name, $district, $address, $existing['id']]
            );
            $id = (int)$existing['id'];
        } else {
            $id = DB::insert('customers', [
                'name' => $name, 'phone' => $phone, 'district' => $district, 'address' => $address,
                'first_order_at' => date('Y-m-d H:i:s'), 'last_order_at' => date('Y-m-d H:i:s'),
            ]);
        }
        DB::exec(
            'INSERT INTO addresses (customer_id, district, address, address_hash, last_used_at) VALUES (?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE last_used_at = NOW(), district = VALUES(district)',
            [$id, $district, $address, sha1(mb_strtolower($district . '|' . $address))]
        );
        return $id;
    }

    public static function linkDevice(int $customerId, string $deviceHash): void
    {
        DB::exec(
            'INSERT INTO customer_devices (device_hash, customer_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_seen_at = NOW()',
            [$deviceHash, $customerId]
        );
    }

    /** Recompute cached order counters for a customer. */
    public static function refreshStats(?int $customerId): void
    {
        if (!$customerId) {
            return;
        }
        DB::exec(
            "UPDATE customers c SET
                total_orders     = (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.deleted_at IS NULL),
                delivered_orders = (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'delivered' AND o.deleted_at IS NULL),
                cancelled_orders = (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'cancelled' AND o.deleted_at IS NULL),
                returned_orders  = (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'returned' AND o.deleted_at IS NULL),
                fraud_orders     = (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status IN ('fraud','blocked') AND o.deleted_at IS NULL),
                total_spent      = (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.customer_id = c.id AND o.status = 'delivered' AND o.deleted_at IS NULL)
             WHERE c.id = ?",
            [$customerId]
        );
    }

    /** Customers linked to this browser (most recent first). */
    public static function forDevice(string $deviceHash): array
    {
        return DB::all(
            'SELECT c.id, c.name, c.phone, c.district, c.address
             FROM customer_devices d JOIN customers c ON c.id = d.customer_id
             WHERE d.device_hash = ? AND c.is_blocked = 0 ORDER BY d.last_seen_at DESC LIMIT 5',
            [$deviceHash]
        );
    }

    /** Autofill lookup restricted to customers already linked to this device. */
    public static function lookupForDevice(string $deviceHash, ?string $phone, ?string $name): ?array
    {
        foreach (self::forDevice($deviceHash) as $c) {
            if ($phone !== null && $c['phone'] === $phone) {
                return $c;
            }
            if ($name !== null && mb_strlen($name) >= 3 && mb_stripos($c['name'], $name) === 0) {
                return $c;
            }
        }
        return null;
    }
}
