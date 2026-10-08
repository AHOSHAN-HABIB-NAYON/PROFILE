<?php
/**
 * Customers (auto-created from orders): list, profile with order history, block/unblock.
 */
final class AdminCustomerController extends AdminController
{
    public function index(Request $r): Response
    {
        $q = trim((string)$r->get('q', ''));
        $where = '1 = 1';
        $params = [];
        if ($q !== '') {
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $q) . '%';
            $where = '(name LIKE ? OR phone LIKE ? OR district LIKE ?)';
            $params = [$like, $like, $like];
        }
        $sort = match ((string)$r->get('sort', '')) {
            'orders' => 'total_orders DESC', 'spent' => 'total_spent DESC', 'risk' => '(cancelled_orders + returned_orders + fraud_orders) DESC',
            default => 'id DESC',
        };
        $perPage = 25;
        $total = (int)DB::value("SELECT COUNT(*) FROM customers WHERE $where", $params);
        $pages = max(1, (int)ceil($total / $perPage));
        $page = min(max(1, (int)$r->get('page', 1)), $pages);
        $rows = DB::all(
            "SELECT id, name, phone, district, total_orders, delivered_orders, cancelled_orders, returned_orders, fraud_orders, total_spent, is_blocked, last_order_at
             FROM customers WHERE $where ORDER BY $sort LIMIT $perPage OFFSET " . (($page - 1) * $perPage),
            $params
        );
        return $this->page('customers', ['rows' => $rows, 'total' => $total, 'page' => $page, 'pages' => $pages, 'q' => $q, 'sort' => (string)$r->get('sort', '')],
            ['title' => 'Customers', 'nav' => 'customers', 'page' => 'customers']);
    }

    public function show(Request $r, string $id): Response
    {
        $c = DB::one('SELECT * FROM customers WHERE id = ?', [(int)$id]);
        if (!$c) {
            throw new HttpException(404, 'Customer not found.');
        }
        $orders = DB::all('SELECT id, order_number, total, status, created_at FROM orders WHERE customer_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 100', [$c['id']]);
        $addresses = DB::all('SELECT district, address, last_used_at FROM addresses WHERE customer_id = ? ORDER BY last_used_at DESC LIMIT 10', [$c['id']]);
        return $this->page('customer', ['c' => $c, 'orders' => $orders, 'addresses' => $addresses], ['title' => $c['name'], 'nav' => 'customers', 'page' => 'customer']);
    }

    public function toggleBlock(Request $r, string $id): Response
    {
        $c = DB::one('SELECT id, is_blocked, notes FROM customers WHERE id = ?', [(int)$id]);
        if (!$c) {
            return $this->fail('Customer not found.', 404);
        }
        $blocked = (int)$c['is_blocked'] === 1 ? 0 : 1;
        DB::exec('UPDATE customers SET is_blocked = ?, notes = ? WHERE id = ?', [$blocked, $this->strOrNull($r, 'notes', 2000) ?? $c['notes'], $c['id']]);
        Audit::log($blocked ? 'customer.block' : 'customer.unblock', 'customer', (int)$c['id']);
        return $this->done($blocked ? 'Customer blocked from ordering.' : 'Customer unblocked.');
    }
}
