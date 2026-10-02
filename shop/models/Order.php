<?php
final class Order
{
    public const STATUSES = ['pending', 'confirmed', 'processing', 'courier_sent', 'delivered', 'cancelled', 'returned', 'failed'];
    /** Statuses in which reserved stock goes back to inventory. */
    public const RESTOCK = ['cancelled', 'returned', 'failed'];

    public static function findByCode(string $code): ?array
    {
        return DB::one('SELECT * FROM orders WHERE order_code = ? AND deleted_at IS NULL', [$code]);
    }

    public static function find(int $id, bool $withTrashed = false): ?array
    {
        return DB::one('SELECT * FROM orders WHERE id = ?' . ($withTrashed ? '' : ' AND deleted_at IS NULL'), [$id]);
    }

    public static function items(int $orderId): array
    {
        return DB::all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [$orderId]);
    }

    public static function history(int $orderId): array
    {
        return DB::all('SELECT h.*, a.name AS admin_name FROM order_status_history h LEFT JOIN admins a ON a.id = h.admin_id WHERE h.order_id = ? ORDER BY h.id DESC', [$orderId]);
    }

    public static function generateCode(): string
    {
        $alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        do {
            $rand = '';
            for ($i = 0; $i < 5; $i++) {
                $rand .= $alphabet[random_int(0, strlen($alphabet) - 1)];
            }
            $code = 'ORD-' . date('Ymd') . '-' . $rand;
        } while (DB::val('SELECT 1 FROM orders WHERE order_code = ?', [$code]));
        return $code;
    }
}
