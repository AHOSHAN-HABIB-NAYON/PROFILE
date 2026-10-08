<?php
/**
 * Order management: list/filter, details (edit before courier, fraud check,
 * approximate location, history), status workflow, print invoice, soft delete.
 */
final class AdminOrderController extends AdminController
{
    public function index(Request $r): Response
    {
        $filters = [
            'status' => (string)$r->get('status', ''), 'q' => (string)$r->get('q', ''), 'from' => (string)$r->get('from', ''),
            'to' => (string)$r->get('to', ''), 'courier' => (string)$r->get('courier', ''), 'page' => (int)$r->get('page', 1),
        ];
        return $this->page('orders', [
            'result' => Order::adminList($filters), 'filters' => $filters, 'counts' => Order::statusCounts(),
            'statuses' => config('order_statuses'),
        ], ['title' => 'Orders', 'nav' => 'orders', 'page' => 'orders']);
    }

    public function show(Request $r, string $id): Response
    {
        $order = Order::find((int)$id);
        if (!$order) {
            throw new HttpException(404, 'Order not found.');
        }
        $courierOptions = array_map(static fn($p) => ['slug' => $p->slug(), 'name' => $p->name()], array_values(CourierManager::enabledWith(CourierPluginInterface::CAP_CREATE)));
        $trackingUrl = $order['courier'] ? CourierManager::make($order['courier']['courier_slug'])->trackingUrl($order['courier']) : null;
        return $this->page('order', [
            'o' => $order,
            'history' => Order::history((int)$order['id']),
            'phoneHistory' => Order::phoneHistory($order['phone'], (int)$order['id']),
            'geo' => json_list($order['geo_json']),
            'statuses' => config('order_statuses'),
            'districts' => config('districts'),
            'locked' => Order::isLocked($order),
            'courierOptions' => $courierOptions,
            'trackingUrl' => $trackingUrl,
            'fraudEnabled' => (bool)CourierManager::enabledWith(CourierPluginInterface::CAP_FRAUD),
            'autoFraud' => PluginManager::enabled('fraud_check') && (PluginManager::config('fraud_check')['auto_check'] ?? '') === '1',
            'customer' => $order['customer_id'] ? DB::one('SELECT id, is_blocked, notes FROM customers WHERE id = ?', [$order['customer_id']]) : null,
        ], ['title' => 'Order #' . $order['order_number'], 'nav' => 'orders', 'page' => 'order', 'scripts' => ['orders']]);
    }

    public function update(Request $r, string $id): Response
    {
        $order = Order::find((int)$id);
        if (!$order) {
            return $this->fail('Order not found.', 404);
        }
        OrderService::adminUpdate($order, [
            'customer_name' => $r->str('customer_name', 150), 'phone' => $r->str('phone', 20), 'district' => $r->str('district', 80),
            'address' => $r->str('address', 500), 'note' => $r->str('note', 1000), 'admin_note' => $r->str('admin_note', 2000),
            'delivery_charge' => en_digits((string)$r->input('delivery_charge', $order['delivery_charge'])),
            'discount' => en_digits((string)$r->input('discount', $order['discount'])),
            'items' => (array)$r->input('items', []),
        ]);
        return $this->done('Order updated — totals recalculated.');
    }

    public function status(Request $r, string $id): Response
    {
        $order = Order::find((int)$id);
        $status = $r->str('status', 30);
        if (!$order || !isset(config('order_statuses')[$status])) {
            return $this->fail('Invalid order or status.');
        }
        OrderService::changeStatus($order, $status, $r->str('note', 200));
        if ($r->bool('block_customer') && $order['customer_id']) {
            DB::exec('UPDATE customers SET is_blocked = 1 WHERE id = ?', [$order['customer_id']]);
            Audit::log('customer.block', 'customer', (int)$order['customer_id']);
        }
        return $this->done('Status changed to ' . config('order_statuses')[$status]['label'] . '.');
    }

    public function bulkStatus(Request $r): Response
    {
        $status = $r->str('status', 30);
        $ids = array_slice(array_filter(array_map('intval', (array)$r->input('ids', []))), 0, 200);
        if (!$ids || !isset(config('order_statuses')[$status])) {
            return $this->fail('Select orders and a status.');
        }
        $n = 0;
        foreach ($ids as $oid) {
            if ($o = Order::find($oid)) {
                OrderService::changeStatus($o, $status, 'bulk');
                $n++;
            }
        }
        return $this->done("$n order(s) updated.");
    }

    public function delete(Request $r, string $id): Response
    {
        return Trash::softDelete('order', (int)$id) ? $this->done('Order moved to trash.', ['redirect' => url('/admin/orders')]) : $this->fail('Order not found.', 404);
    }

    public function print(Request $r, string $id): Response
    {
        $order = Order::find((int)$id);
        if (!$order) {
            throw new HttpException(404, 'Order not found.');
        }
        Audit::log('order.print', 'order', (int)$order['id']);
        return Response::html(View::render('admin:pages/invoice', ['o' => $order]), 200, ['Cache-Control' => 'no-store']);
    }
}
