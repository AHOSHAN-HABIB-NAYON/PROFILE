<?php
/**
 * Lightweight first-party analytics: daily counters + unique visitors.
 * Writes are deferred until after the response is sent.
 */
final class Analytics
{
    public const FUNNEL = ['visitors', 'page_views', 'product_views', 'add_to_cart', 'checkout', 'orders'];

    public static function record(string $metric, int $value = 1, string $dim = ''): void
    {
        $date = date('Y-m-d');
        Deferred::add(static function () use ($date, $metric, $value, $dim) {
            DB::exec(
                'INSERT INTO analytics (`date`, metric, dim, value) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = value + VALUES(value)',
                [$date, $metric, mb_substr($dim, 0, 100), max(0, $value)]
            );
        });
    }

    /** Count a storefront page view + unique visitor (bots excluded). */
    public static function pageView(Request $r, string $page): void
    {
        $ua = $r->userAgent();
        if ($ua === '' || device_type($ua) === 'bot') {
            return;
        }
        self::record('page_views', 1, '');
        if ($page !== '') {
            self::record('page:' . $page, 1, '');
        }
        $visitor = substr(hash_hmac('sha256', date('Y-m-d') . '|' . device_id(), APP_KEY), 0, 32);
        Deferred::add(static function () use ($visitor) {
            $new = DB::exec('INSERT IGNORE INTO analytics_visitors (`date`, visitor_hash) VALUES (?, ?)', [date('Y-m-d'), $visitor]);
            if ($new > 0) {
                DB::exec(
                    'INSERT INTO analytics (`date`, metric, dim, value) VALUES (?, "visitors", "", 1) ON DUPLICATE KEY UPDATE value = value + 1',
                    [date('Y-m-d')]
                );
            }
            if (random_int(1, 500) === 1) {
                DB::exec('DELETE FROM analytics_visitors WHERE `date` < ?', [date('Y-m-d', strtotime('-60 days'))]);
            }
        });
    }

    /** @return array{0:string,1:string} [from, to] dates for a range key. */
    public static function range(string $key, ?string $from = null, ?string $to = null): array
    {
        $today = date('Y-m-d');
        return match ($key) {
            'today'  => [$today, $today],
            '7d'     => [date('Y-m-d', strtotime('-6 days')), $today],
            'custom' => [
                $from && strtotime($from) ? date('Y-m-d', strtotime($from)) : date('Y-m-d', strtotime('-29 days')),
                $to && strtotime($to) ? date('Y-m-d', strtotime($to)) : $today,
            ],
            default  => [date('Y-m-d', strtotime('-29 days')), $today],
        };
    }

    /** Full report for the analytics page / API. */
    public static function report(string $from, string $to): array
    {
        $start = $from . ' 00:00:00';
        $end = $to . ' 23:59:59';
        $valid = "o.deleted_at IS NULL AND o.status NOT IN ('cancelled','fraud','blocked')";

        $totals = DB::one(
            "SELECT COUNT(*) AS orders, COALESCE(SUM(o.total),0) AS sales, COALESCE(SUM(o.subtotal - o.discount),0) AS revenue
             FROM orders o WHERE $valid AND o.created_at BETWEEN ? AND ?",
            [$start, $end]
        );
        $productsSold = (int)DB::value(
            "SELECT COALESCE(SUM(oi.quantity),0) FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE $valid AND o.created_at BETWEEN ? AND ?",
            [$start, $end]
        );
        $statusRows = DB::all('SELECT status, COUNT(*) AS c FROM orders WHERE deleted_at IS NULL AND created_at BETWEEN ? AND ? GROUP BY status', [$start, $end]);
        $daily = DB::all(
            "SELECT DATE(o.created_at) AS d, COUNT(*) AS orders, COALESCE(SUM(o.total),0) AS sales
             FROM orders o WHERE $valid AND o.created_at BETWEEN ? AND ? GROUP BY DATE(o.created_at) ORDER BY d",
            [$start, $end]
        );
        $topProducts = DB::all(
            "SELECT oi.product_id, oi.product_name AS name, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS amount
             FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE $valid AND o.created_at BETWEEN ? AND ?
             GROUP BY oi.product_id, oi.product_name ORDER BY qty DESC LIMIT 10",
            [$start, $end]
        );
        $topCategories = DB::all(
            "SELECT COALESCE(c.name, 'Uncategorized') AS name, SUM(oi.quantity) AS qty, SUM(oi.line_total) AS amount
             FROM order_items oi JOIN orders o ON o.id = oi.order_id
             LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN categories c ON c.id = p.category_id
             WHERE $valid AND o.created_at BETWEEN ? AND ? GROUP BY c.id, c.name ORDER BY amount DESC LIMIT 10",
            [$start, $end]
        );
        $districts = DB::all(
            "SELECT o.district AS name, COUNT(*) AS orders, SUM(o.total) AS amount FROM orders o
             WHERE $valid AND o.created_at BETWEEN ? AND ? GROUP BY o.district ORDER BY orders DESC LIMIT 10",
            [$start, $end]
        );
        $metricRows = DB::all(
            'SELECT metric, SUM(value) AS v FROM analytics WHERE `date` BETWEEN ? AND ? AND metric IN ("visitors","page_views","product_views","add_to_cart","checkout") GROUP BY metric',
            [$from, $to]
        );
        $metrics = array_map('intval', array_column($metricRows, 'v', 'metric'));
        $orders = (int)$totals['orders'];

        // Fill daily series including empty days.
        $series = [];
        $byDay = array_column($daily, null, 'd');
        for ($t = strtotime($from); $t <= strtotime($to); $t += 86400) {
            $d = date('Y-m-d', $t);
            $series[] = ['date' => $d, 'orders' => (int)($byDay[$d]['orders'] ?? 0), 'sales' => (float)($byDay[$d]['sales'] ?? 0)];
        }

        return [
            'from' => $from, 'to' => $to,
            'orders' => $orders,
            'sales' => (float)$totals['sales'],
            'revenue' => (float)$totals['revenue'],
            'aov' => $orders > 0 ? round((float)$totals['sales'] / $orders, 2) : 0,
            'products_sold' => $productsSold,
            'statuses' => array_map('intval', array_column($statusRows, 'c', 'status')),
            'series' => $series,
            'top_products' => $topProducts,
            'top_categories' => $topCategories,
            'districts' => $districts,
            'funnel' => [
                'visitors' => $metrics['visitors'] ?? 0,
                'page_views' => $metrics['page_views'] ?? 0,
                'product_views' => $metrics['product_views'] ?? 0,
                'add_to_cart' => $metrics['add_to_cart'] ?? 0,
                'checkout' => $metrics['checkout'] ?? 0,
                'orders' => $orders,
            ],
            'conversion_rate' => !empty($metrics['visitors']) ? round($orders / $metrics['visitors'] * 100, 2) : null,
        ];
    }
}
