<?php
final class AdminAnalyticsController extends AdminController
{
    public function index(): void
    {
        $days = in_array((int) Request::query('days', '7'), [1, 7, 30, 90], true) ? (int) Request::query('days', '7') : 7;
        $since = date('Y-m-d 00:00:00', strtotime('-' . ($days - 1) . ' days'));
        $ev = array_column(DB::all('SELECT event, COUNT(*) n FROM analytics_events WHERE created_at >= ? GROUP BY event', [$since]), 'n', 'event');
        $visitors = (int) DB::val('SELECT COUNT(DISTINCT visitor_id) FROM analytics_events WHERE created_at >= ? AND visitor_id IS NOT NULL', [$since]);
        $newVisitors = (int) DB::val('SELECT COUNT(*) FROM visitors WHERE first_seen >= ?', [$since]);
        $orders = (int) DB::val('SELECT COUNT(*) FROM orders WHERE created_at >= ? AND deleted_at IS NULL', [$since]);
        $revenue = (float) DB::val("SELECT COALESCE(SUM(total),0) FROM orders WHERE created_at >= ? AND deleted_at IS NULL AND status NOT IN ('cancelled','returned','failed')", [$since]);
        $group = static fn (string $col) => DB::all("SELECT COALESCE(v.{$col}, 'অজানা') label, COUNT(DISTINCT v.id) n FROM visitors v
            WHERE v.id IN (SELECT DISTINCT visitor_id FROM analytics_events WHERE created_at >= ?) GROUP BY label ORDER BY n DESC LIMIT 8", [$since]);
        $daily = DB::all("SELECT DATE(created_at) d, SUM(event = 'page_view') views, COUNT(DISTINCT visitor_id) visitors, SUM(event = 'purchase') orders
            FROM analytics_events WHERE created_at >= ? GROUP BY DATE(created_at) ORDER BY d", [$since]);
        $topProducts = DB::all("SELECT p.id, p.name, SUM(e.event = 'product_view') views, SUM(e.event = 'product_click') clicks, SUM(e.event = 'add_to_cart') carts
            FROM analytics_events e JOIN products p ON p.id = e.product_id WHERE e.created_at >= ? AND e.product_id IS NOT NULL
            GROUP BY p.id, p.name ORDER BY views DESC LIMIT 10", [$since]);
        $locations = DB::all("SELECT JSON_UNQUOTE(JSON_EXTRACT(geo, '$.city')) city, JSON_UNQUOTE(JSON_EXTRACT(geo, '$.region')) region, COUNT(*) n
            FROM orders WHERE created_at >= ? AND geo LIKE '%\"ok\":true%' GROUP BY city, region ORDER BY n DESC LIMIT 8", [$since]);
        $districts = DB::all('SELECT district label, COUNT(*) n FROM orders WHERE created_at >= ? AND deleted_at IS NULL GROUP BY district ORDER BY n DESC LIMIT 8', [$since]);
        View::admin('analytics', [
            'days' => $days, 'ev' => $ev, 'visitors' => $visitors, 'newVisitors' => $newVisitors, 'orders' => $orders, 'revenue' => $revenue,
            'conversion' => $visitors > 0 ? round($orders / $visitors * 100, 2) : 0,
            'devices' => $group('device'), 'browsers' => $group('browser'), 'oses' => $group('os'), 'sources' => $group('source'), 'countries' => $group('country'),
            'daily' => $daily, 'topProducts' => $topProducts, 'locations' => $locations, 'districts' => $districts,
            'metaStatus' => setting('meta_status'), 'metaMessage' => setting('meta_status_message'),
            'gtagOn' => Settings::on('gtag_enabled') && setting('gtag_id'),
        ], 'অ্যানালিটিক্স', 'analytics');
    }
}
