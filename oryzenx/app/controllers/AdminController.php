<?php
final class AdminController
{
    private function page(string $view, array $data, string $title, string $nav): never
    {
        View::page('admin/' . $view, $data, ['layout' => 'admin', 'title' => $title, 'nav' => $nav, 'cache' => false]);
    }

    public function dashboard(): void
    {
        $s = DB::row("SELECT
            (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users,
            (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL 7 DAY) AS new_users,
            (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL 14 DAY AND created_at < NOW() - INTERVAL 7 DAY) AS prev_users,
            (SELECT COALESCE(SUM(views),0) FROM analytics) AS views,
            (SELECT COALESCE(SUM(uniques),0) FROM analytics) AS uniques,
            (SELECT COALESCE(SUM(views),0) FROM analytics WHERE day = CURDATE()) AS views_today,
            (SELECT COALESCE(SUM(uniques),0) FROM analytics WHERE day = CURDATE()) AS uniques_today,
            (SELECT COUNT(*) FROM payments) AS payments,
            (SELECT COUNT(*) FROM payments WHERE status = 'pending') AS pending,
            (SELECT COUNT(*) FROM payments WHERE status = 'approved') AS approved,
            (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status = 'approved' AND currency = 'USD') AS revenue_usd,
            (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status = 'approved' AND currency = 'BDT') AS revenue_bdt,
            (SELECT COUNT(*) FROM posts) AS posts,
            (SELECT COUNT(*) FROM services) AS services,
            (SELECT COUNT(*) FROM service_categories) AS categories,
            (SELECT COUNT(*) FROM contact_messages WHERE status = 'new') AS support_new,
            (SELECT COUNT(*) FROM contact_messages) AS support,
            (SELECT COUNT(*) FROM ai_messages WHERE role = 'user') AS ai,
            (SELECT COUNT(*) FROM ai_messages WHERE role = 'user' AND created_at >= CURDATE()) AS ai_today");
        $days = $this->series(14);
        $pendingList = DB::all("SELECT p.id, p.amount, p.currency, p.method_code, p.created_at, u.name, o.service_title FROM payments p
            JOIN users u ON u.id = p.user_id JOIN orders o ON o.id = p.order_id WHERE p.status = 'pending' ORDER BY p.id DESC LIMIT 6");
        $latestUsers = DB::all('SELECT id, name, email, avatar, created_at FROM users ORDER BY id DESC LIMIT 6');
        $topPages = DB::all('SELECT path, COUNT(*) c FROM page_views WHERE created_at >= NOW() - INTERVAL 30 DAY GROUP BY path ORDER BY c DESC LIMIT 6');
        $this->page('dashboard', compact('s', 'days', 'pendingList', 'latestUsers', 'topPages'), t('admin.dashboard'), 'dashboard');
    }

    private function series(int $n): array
    {
        $rows = array_column(DB::all('SELECT day, views, uniques, signups FROM analytics WHERE day >= CURDATE() - INTERVAL ? DAY', [$n - 1]), null, 'day');
        $out = [];
        for ($i = $n - 1; $i >= 0; $i--) {
            $d = date('Y-m-d', strtotime("-$i day"));
            $out[] = ['day' => $d, 'label' => date('d M', strtotime($d)), 'views' => (int)($rows[$d]['views'] ?? 0), 'uniques' => (int)($rows[$d]['uniques'] ?? 0), 'signups' => (int)($rows[$d]['signups'] ?? 0)];
        }
        return $out;
    }

    public function analytics(): void
    {
        $range = in_array((int)input('days'), [7, 30, 90, 365], true) ? (int)input('days') : 30;
        $since = date('Y-m-d 00:00:00', strtotime('-' . ($range - 1) . ' day'));
        $group = fn(string $col, int $lim = 8, string $extra = '') => DB::all("SELECT $col AS k, COUNT(*) AS c, COUNT(DISTINCT visitor_hash) AS u FROM page_views
            WHERE created_at >= ? $extra GROUP BY $col ORDER BY c DESC LIMIT $lim", [$since]);
        $data = [
            'range' => $range,
            'series' => $this->series(min($range, 90)),
            'totals' => DB::row('SELECT COUNT(*) AS views, COUNT(DISTINCT visitor_hash) AS uniques, COUNT(DISTINCT path) AS pages FROM page_views WHERE created_at >= ?', [$since]),
            'pages' => $group('path', 10),
            'refs' => $group("COALESCE(referrer, '(direct)')", 8),
            'devices' => $group('device', 4), 'browsers' => $group('browser', 8), 'os' => $group('os', 8),
            'countries' => $group("COALESCE(country, '??')", 12),
            'bd' => $group("COALESCE(region, '—')", 10, "AND country = 'BD'"),
            'cities' => $group("COALESCE(city, '—')", 10, 'AND city IS NOT NULL'),
            'services' => DB::all("SELECT s.title, s.slug, COUNT(*) c FROM page_views v JOIN services s ON s.id = v.ref_id WHERE v.page_key = 'service' AND v.created_at >= ? GROUP BY s.id ORDER BY c DESC LIMIT 8", [$since]),
            'hours' => DB::all('SELECT HOUR(created_at) h, COUNT(*) c FROM page_views WHERE created_at >= ? GROUP BY h ORDER BY h', [$since]),
            'geo' => setting('analytics_geo_lookup') === '1',
        ];
        $this->page('analytics', $data, t('admin.analytics'), 'analytics');
    }

    public function search(): void
    {
        $q = trim(mb_substr((string)input('q'), 0, 80));
        $res = [];
        if (mb_strlen($q) >= 2) {
            $like = '%' . $q . '%';
            $res = [
                'users' => DB::all('SELECT id, name, email FROM users WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? LIMIT 10', [$like, $like, $like]),
                'payments' => DB::all('SELECT p.id, p.transaction_id, p.amount, p.currency, p.status, u.name FROM payments p JOIN users u ON u.id = p.user_id WHERE p.transaction_id LIKE ? OR u.email LIKE ? OR p.sender LIKE ? ORDER BY p.id DESC LIMIT 10', [$like, $like, $like]),
                'orders' => DB::all('SELECT o.id, o.order_no, o.service_title, o.status, p.id AS payment_id FROM orders o LEFT JOIN payments p ON p.order_id = o.id WHERE o.order_no LIKE ? OR o.service_title LIKE ? ORDER BY o.id DESC LIMIT 10', [$like, $like]),
                'posts' => DB::all('SELECT id, title, status FROM posts WHERE title LIKE ? OR tags LIKE ? ORDER BY id DESC LIMIT 10', [$like, $like]),
                'services' => DB::all('SELECT id, title, slug FROM services WHERE title LIKE ? OR title_bn LIKE ? OR slug LIKE ? LIMIT 10', [$like, $like, $like]),
                'messages' => DB::all('SELECT id, name, subject FROM contact_messages WHERE subject LIKE ? OR email LIKE ? OR name LIKE ? ORDER BY id DESC LIMIT 10', [$like, $like, $like]),
            ];
        }
        $this->page('search', ['q' => $q, 'res' => $res], t('admin.search'), 'search');
    }

    public function logs(): void
    {
        $files = glob(STORAGE . '/logs/*.log') ?: [];
        rsort($files);
        $file = (string)input('file');
        $current = $file && in_array(STORAGE . '/logs/' . basename($file), $files, true) ? STORAGE . '/logs/' . basename($file) : ($files[0] ?? null);
        $lines = [];
        if ($current) {
            $fh = new SplFileObject($current);
            $fh->seek(PHP_INT_MAX);
            $last = $fh->key();
            for ($i = max(0, $last - 300); $i <= $last; $i++) { $fh->seek($i); if (trim((string)$fh->current()) !== '') $lines[] = rtrim((string)$fh->current()); }
            $lines = array_reverse($lines);
        }
        $activity = DB::all('SELECT a.*, u.name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id ORDER BY a.id DESC LIMIT 60');
        $this->page('logs', ['files' => array_map('basename', $files), 'current' => $current ? basename($current) : null, 'lines' => $lines, 'activity' => $activity], t('admin.logs'), 'logs');
    }

    public function clearLogs(): void
    {
        foreach (glob(STORAGE . '/logs/*.log') ?: [] as $f) @unlink($f);
        Auth::activity('admin_logs_cleared');
        respond(true, t('admin.logs_cleared'), '/admin/logs');
    }

    public function aiLogs(): void
    {
        $p = DB::paginate('m.*, c.user_id, u.name', 'FROM ai_messages m JOIN ai_conversations c ON c.id = m.conversation_id LEFT JOIN users u ON u.id = c.user_id ORDER BY m.id DESC', [], input_int('page', 1), 40);
        $this->page('ai-logs', ['p' => $p], t('admin.ai_logs'), 'ai');
    }
}
