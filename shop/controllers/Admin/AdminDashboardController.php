<?php
final class AdminDashboardController extends AdminController
{
    public function index(): void
    {
        $today = date('Y-m-d');
        $byStatus = array_column(DB::all('SELECT status, COUNT(*) n FROM orders WHERE deleted_at IS NULL GROUP BY status'), 'n', 'status');
        $threshold = (int) setting('low_stock_threshold', 10);
        $stats = [
            'today_orders'  => (int) DB::val('SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND DATE(created_at) = ?', [$today]),
            'today_revenue' => (float) DB::val("SELECT COALESCE(SUM(total),0) FROM orders WHERE deleted_at IS NULL AND DATE(created_at) = ? AND status NOT IN ('cancelled','returned','failed')", [$today]),
            'revenue'       => (float) DB::val("SELECT COALESCE(SUM(total),0) FROM orders WHERE deleted_at IS NULL AND status = 'delivered'"),
            'month_revenue' => (float) DB::val("SELECT COALESCE(SUM(total),0) FROM orders WHERE deleted_at IS NULL AND status NOT IN ('cancelled','returned','failed') AND created_at >= ?", [date('Y-m-01')]),
            'pending'       => (int) ($byStatus['pending'] ?? 0),
            'confirmed'     => (int) ($byStatus['confirmed'] ?? 0) + (int) ($byStatus['processing'] ?? 0),
            'delivered'     => (int) ($byStatus['delivered'] ?? 0),
            'cancelled'     => (int) ($byStatus['cancelled'] ?? 0),
            'courier'       => (int) ($byStatus['courier_sent'] ?? 0),
            'products'      => (int) DB::val('SELECT COUNT(*) FROM products WHERE deleted_at IS NULL'),
            'low_stock'     => (int) DB::val('SELECT COUNT(*) FROM products WHERE deleted_at IS NULL AND is_active = 1 AND stock <= COALESCE(low_stock_threshold, ?)', [$threshold]),
            'fraud'         => (int) DB::val("SELECT COUNT(*) FROM orders WHERE deleted_at IS NULL AND risk_level IN ('high','review') AND status IN ('pending','confirmed')"),
            'blocked'       => (int) DB::val("SELECT COUNT(*) FROM blocked_ips WHERE block_type = 'lifetime' OR blocked_until > NOW()"),
            'visitors'      => (int) DB::val('SELECT COUNT(*) FROM visitors WHERE last_seen >= ?', [$today]),
        ];
        $daily = DB::all("SELECT DATE(created_at) d, COUNT(*) orders, COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned','failed') THEN total END),0) revenue
            FROM orders WHERE deleted_at IS NULL AND created_at >= (CURDATE() - INTERVAL 13 DAY) GROUP BY DATE(created_at)");
        $dailyMap = array_column($daily, null, 'd');
        $days = [];
        for ($i = 13; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-{$i} day"));
            $days[] = ['label' => date('d/m', strtotime($d)), 'orders' => (int) ($dailyMap[$d]['orders'] ?? 0), 'revenue' => (float) ($dailyMap[$d]['revenue'] ?? 0)];
        }
        $monthly = DB::all("SELECT DATE_FORMAT(created_at, '%Y-%m') m, COALESCE(SUM(CASE WHEN status NOT IN ('cancelled','returned','failed') THEN total END),0) revenue, COUNT(*) orders
            FROM orders WHERE deleted_at IS NULL AND created_at >= (DATE_FORMAT(CURDATE(), '%Y-%m-01') - INTERVAL 11 MONTH) GROUP BY m ORDER BY m");
        $topProducts = DB::all("SELECT oi.name, SUM(oi.quantity) qty, SUM(oi.line_total) amount FROM order_items oi JOIN orders o ON o.id = oi.order_id
            WHERE o.deleted_at IS NULL AND o.status NOT IN ('cancelled','returned','failed') AND o.created_at >= (CURDATE() - INTERVAL 30 DAY)
            GROUP BY oi.name ORDER BY qty DESC LIMIT 6");
        $recent = DB::all('SELECT id, order_code, customer_name, phone, total, status, risk_level, created_at FROM orders WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 8');
        $couriers = DB::all('SELECT name, is_enabled, last_test_status, last_test_at FROM courier_accounts WHERE is_enabled = 1');
        $lowStock = DB::all('SELECT id, name, stock FROM products WHERE deleted_at IS NULL AND is_active = 1 AND stock <= COALESCE(low_stock_threshold, ?) ORDER BY stock ASC LIMIT 6', [$threshold]);
        View::admin('dashboard', compact('stats', 'days', 'monthly', 'topProducts', 'recent', 'couriers', 'lowStock'), 'ড্যাশবোর্ড', 'dashboard');
    }
}
