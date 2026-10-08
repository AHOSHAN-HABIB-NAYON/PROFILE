<?php
/**
 * Dashboard KPIs, charts, recent orders, low stock + notification polling & slug helper.
 */
final class AdminDashboardController extends AdminController
{
    public function index(Request $r): Response
    {
        $today = date('Y-m-d 00:00:00');
        $valid = "deleted_at IS NULL AND status NOT IN ('cancelled','fraud','blocked')";
        $kpi = DB::one(
            "SELECT
               (SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND created_at >= ?) AS today_orders,
               (SELECT COALESCE(SUM(total),0) FROM orders WHERE $valid AND created_at >= ?) AS today_sales,
               (SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL) AS total_orders,
               (SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND status = 'pending') AS pending,
               (SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND status = 'delivered') AS delivered,
               (SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND status = 'cancelled') AS cancelled,
               (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND track_stock = 1 AND stock <= ?) AS low_stock,
               (SELECT COUNT(*) FROM customers WHERE created_at >= ?) AS new_customers,
               (SELECT COUNT(*) FROM orders o WHERE o.deleted_at IS NULL AND o.status IN ('confirmed','processing')
                  AND NOT EXISTS (SELECT 1 FROM courier_orders c WHERE c.order_id = o.id)) AS courier_pending",
            [$today, $today, (int)setting('low_stock_threshold', 10), $today]
        );
        $from = date('Y-m-d', strtotime('-13 days'));
        $report = Analytics::report($from, date('Y-m-d'));
        $recent = DB::all(
            'SELECT id, order_number, customer_name, phone, total, status, created_at FROM orders WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 8'
        );
        $alerts = (int)DB::value('SELECT COUNT(*) FROM security_alerts WHERE is_resolved = 0');

        return $this->page('dashboard', [
            'kpi' => array_map('floatval', $kpi), 'series' => $report['series'], 'recent' => $recent,
            'lowStock' => Product::lowStock(8), 'alerts' => $alerts, 'user' => AdminAuth::user(),
        ], ['title' => 'Dashboard', 'nav' => 'dashboard', 'page' => 'dashboard', 'scripts' => ['charts']]);
    }

    /** Lightweight poll: unread count + notifications newer than ?after=id. */
    public function poll(Request $r): Response
    {
        $after = max(0, (int)$r->get('after', 0));
        $new = $after > 0 ? DB::all('SELECT id, type, title, link FROM notifications WHERE id > ? ORDER BY id DESC LIMIT 5', [$after]) : [];
        return Response::success('OK', [
            'unread' => Notification::unreadCount(),
            'latest' => (int)DB::value('SELECT COALESCE(MAX(id),0) FROM notifications'),
            'new' => $new,
        ]);
    }

    public function slug(Request $r): Response
    {
        return Response::success('OK', ['slug' => slugify((string)$r->get('text', ''))]);
    }
}
