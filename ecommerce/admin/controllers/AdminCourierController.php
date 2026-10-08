<?php
/**
 * Courier overview: parcels sent, statuses, balances, and orders waiting for courier.
 */
final class AdminCourierController extends AdminController
{
    public function index(Request $r): Response
    {
        $parcels = DB::all(
            'SELECT co.*, o.order_number, o.customer_name, o.phone, o.status AS order_status
             FROM courier_orders co JOIN orders o ON o.id = co.order_id
             WHERE o.deleted_at IS NULL ORDER BY co.id DESC LIMIT 100'
        );
        $waiting = DB::all(
            "SELECT o.id, o.order_number, o.customer_name, o.district, o.total, o.status, o.created_at FROM orders o
             WHERE o.deleted_at IS NULL AND o.status IN ('confirmed','processing')
               AND NOT EXISTS (SELECT 1 FROM courier_orders c WHERE c.order_id = o.id) ORDER BY o.id ASC LIMIT 50"
        );
        $couriers = [];
        foreach (CourierManager::all() as $slug => $p) {
            $row = CourierManager::row($slug);
            $couriers[] = ['slug' => $slug, 'name' => $p->name(), 'icon' => $p->icon(), 'enabled' => (int)$row['is_enabled'] === 1,
                'connected' => (int)$row['connected'] === 1, 'balance' => in_array('balance', $p->capabilities(), true), 'default' => (int)$row['is_default'] === 1];
        }
        return $this->page('courier', ['parcels' => $parcels, 'waiting' => $waiting, 'couriers' => $couriers],
            ['title' => 'Courier', 'nav' => 'courier', 'page' => 'courier', 'scripts' => ['orders']]);
    }
}
