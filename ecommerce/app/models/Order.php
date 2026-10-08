<?php
/**
 * Order queries (creation logic lives in OrderService).
 */
final class Order
{
    public static function find(int $id, bool $withTrashed = false): ?array
    {
        $o = DB::one('SELECT * FROM orders WHERE id = ?' . ($withTrashed ? '' : ' AND deleted_at IS NULL'), [$id]);
        return $o ? self::withRelations($o) : null;
    }

    public static function findByNumber(string $number): ?array
    {
        $o = DB::one('SELECT * FROM orders WHERE order_number = ? AND deleted_at IS NULL', [strtoupper($number)]);
        return $o ? self::withRelations($o) : null;
    }

    private static function withRelations(array $o): array
    {
        $o['items'] = DB::all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [$o['id']]);
        $o['courier'] = DB::one('SELECT * FROM courier_orders WHERE order_id = ? ORDER BY id DESC LIMIT 1', [$o['id']]);
        return $o;
    }

    /**
     * Admin listing with filters: status, q (number/name/phone), from, to, page.
     */
    public static function adminList(array $f, int $perPage = 25): array
    {
        $where = ['o.deleted_at IS NULL'];
        $params = [];
        if (!empty($f['status']) && isset(config('order_statuses')[$f['status']])) {
            $where[] = 'o.status = ?';
            $params[] = $f['status'];
        }
        if (!empty($f['q'])) {
            $q = trim((string)$f['q']);
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $q) . '%';
            $where[] = '(o.order_number LIKE ? OR o.customer_name LIKE ? OR o.phone LIKE ? OR o.ip = ?)';
            array_push($params, $like, $like, $like, $q);
        }
        if (!empty($f['from']) && strtotime($f['from'])) {
            $where[] = 'o.created_at >= ?';
            $params[] = date('Y-m-d 00:00:00', strtotime($f['from']));
        }
        if (!empty($f['to']) && strtotime($f['to'])) {
            $where[] = 'o.created_at <= ?';
            $params[] = date('Y-m-d 23:59:59', strtotime($f['to']));
        }
        if (!empty($f['courier']) && $f['courier'] === 'pending') {
            $where[] = "o.status IN ('confirmed','processing') AND NOT EXISTS (SELECT 1 FROM courier_orders co WHERE co.order_id = o.id)";
        }
        $whereSql = implode(' AND ', $where);
        $total = (int)DB::value("SELECT COUNT(*) FROM orders o WHERE $whereSql", $params);
        $pages = max(1, (int)ceil($total / $perPage));
        $page = min(max(1, (int)($f['page'] ?? 1)), $pages);
        $offset = ($page - 1) * $perPage;
        $rows = DB::all(
            "SELECT o.id, o.order_number, o.customer_name, o.phone, o.district, o.address, o.total, o.delivery_charge,
                    o.status, o.courier_status, o.ip, o.user_agent, o.device_type, o.created_at,
                    (SELECT GROUP_CONCAT(CONCAT(oi.product_name, ' ×', oi.quantity) SEPARATOR ', ') FROM order_items oi WHERE oi.order_id = o.id) AS products,
                    (SELECT CONCAT(co.courier_slug, '|', COALESCE(co.tracking_code, co.consignment_id, '')) FROM courier_orders co WHERE co.order_id = o.id ORDER BY co.id DESC LIMIT 1) AS courier_ref
             FROM orders o WHERE $whereSql ORDER BY o.id DESC LIMIT $perPage OFFSET $offset",
            $params
        );
        return ['items' => $rows, 'total' => $total, 'page' => $page, 'pages' => $pages];
    }

    public static function statusCounts(): array
    {
        $rows = DB::all('SELECT status, COUNT(*) AS c FROM orders WHERE deleted_at IS NULL GROUP BY status');
        return array_column($rows, 'c', 'status');
    }

    /** Order history for a phone number (fraud/trust signal for admins). */
    public static function phoneHistory(string $phone, int $excludeId = 0): array
    {
        $row = DB::one(
            "SELECT COUNT(*) AS total,
                    SUM(status = 'delivered') AS delivered,
                    SUM(status = 'cancelled') AS cancelled,
                    SUM(status = 'returned') AS returned,
                    SUM(status IN ('fraud','blocked')) AS fraud,
                    SUM(status IN ('pending','confirmed','processing','sent_to_courier','shipped')) AS active
             FROM orders WHERE phone = ? AND id <> ?",
            [$phone, $excludeId]
        );
        return array_map('intval', $row ?: []);
    }

    public static function history(int $orderId): array
    {
        return DB::all(
            'SELECT h.*, a.name AS admin_name FROM order_history h LEFT JOIN admins a ON a.id = h.admin_id
             WHERE h.order_id = ? ORDER BY h.id DESC LIMIT 100',
            [$orderId]
        );
    }

    public static function addHistory(int $orderId, string $action, ?string $field = null, mixed $old = null, mixed $new = null): void
    {
        DB::insert('order_history', [
            'order_id'  => $orderId,
            'admin_id'  => AdminAuth::id(),
            'action'    => $action,
            'field'     => $field,
            'old_value' => $old === null ? null : mb_substr(is_scalar($old) ? (string)$old : json_encode($old, JSON_UNESCAPED_UNICODE), 0, 2000),
            'new_value' => $new === null ? null : mb_substr(is_scalar($new) ? (string)$new : json_encode($new, JSON_UNESCAPED_UNICODE), 0, 2000),
            'ip'        => Request::current()->ip(),
        ]);
    }

    public static function isLocked(array $order): bool
    {
        return in_array($order['status'], config('locked_statuses'), true);
    }
}
