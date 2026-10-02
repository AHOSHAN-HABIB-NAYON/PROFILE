<?php
final class AdminOrderController extends AdminController
{
    public function index(): void
    {
        $status = Request::query('status');
        $q = mb_substr(Request::query('q'), 0, 60);
        $risk = Request::query('risk');
        $page = max(1, (int) Request::query('page', '1'));
        $per = 20;
        $where = ['o.deleted_at IS NULL'];
        $params = [];
        if (in_array($status, Order::STATUSES, true)) {
            $where[] = 'o.status = ?';
            $params[] = $status;
        }
        if (in_array($risk, ['new', 'normal', 'review', 'high'], true)) {
            $where[] = 'o.risk_level = ?';
            $params[] = $risk;
        }
        if ($q !== '') {
            $where[] = '(o.order_code LIKE ? OR o.phone LIKE ? OR o.customer_name LIKE ?)';
            $like = '%' . addcslashes($q, '%_\\') . '%';
            array_push($params, $like, $like, $like);
        }
        $w = implode(' AND ', $where);
        $total = (int) DB::val("SELECT COUNT(*) FROM orders o WHERE {$w}", $params);
        $orders = DB::all("SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) items,
            (SELECT COUNT(*) FROM orders o2 WHERE o2.phone = o.phone AND o2.deleted_at IS NULL) phone_orders
            FROM orders o WHERE {$w} ORDER BY o.id DESC LIMIT {$per} OFFSET " . (($page - 1) * $per), $params);
        $counts = array_column(DB::all('SELECT status, COUNT(*) n FROM orders WHERE deleted_at IS NULL GROUP BY status'), 'n', 'status');
        View::admin('orders', compact('orders', 'total', 'page', 'status', 'q', 'risk', 'counts') + ['pages' => (int) ceil($total / $per)], 'অর্ডার', 'orders');
    }

    public function show(string $id): void
    {
        $order = Order::find($this->id($id));
        if (!$order) {
            Response::notFound();
        }
        $oid = (int) $order['id'];
        View::admin('order', [
            'o' => $order,
            'items' => Order::items($oid),
            'history' => Order::history($oid),
            'courierOrders' => DB::all('SELECT co.*, ca.name courier_name FROM courier_orders co LEFT JOIN courier_accounts ca ON ca.code = co.courier_code WHERE co.order_id = ? ORDER BY co.id DESC', [$oid]),
            'couriers' => CourierManager::enabled(),
            'fraud' => DB::one('SELECT * FROM fraud_checks WHERE phone = ? ORDER BY id DESC LIMIT 1', [$order['phone']]),
            'courierCheck' => DB::one('SELECT * FROM courier_checks WHERE phone = ? ORDER BY id DESC LIMIT 1', [$order['phone']]),
            'local' => FraudService::local($order['phone']),
            'geo' => $order['geo'] ? json_decode($order['geo'], true) : null,
            'blocked' => $order['ip'] ? IpGuard::blocked($order['ip']) : null,
            'otherOrders' => DB::all('SELECT id, order_code, total, status, created_at FROM orders WHERE phone = ? AND id <> ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 5', [$order['phone'], $oid]),
        ], 'অর্ডার ' . $order['order_code'], 'order');
    }

    public function status(string $id): void
    {
        $err = OrderService::changeStatus($this->id($id), Request::str('status'), mb_substr(Request::str('note'), 0, 400));
        $err ? Response::fail($err) : Response::ok(null, 'স্ট্যাটাস আপডেট হয়েছে।');
    }

    public function update(string $id): void
    {
        $oid = $this->id($id);
        $order = Order::find($oid);
        if (!$order) {
            Response::fail('অর্ডার পাওয়া যায়নি।', [], 404);
        }
        $phone = normalize_phone(Request::str('phone'));
        $name = Request::str('customer_name');
        $address = Request::str('address');
        $errors = [];
        if (mb_strlen($name) < 2) $errors['customer_name'] = 'নাম দিন।';
        if (!$phone) $errors['phone'] = 'সঠিক ফোন নম্বর দিন।';
        if (mb_strlen($address) < 5) $errors['address'] = 'ঠিকানা দিন।';
        if ($errors) {
            Response::fail(reset($errors), $errors);
        }
        $delivery = self::money(Request::input('delivery_charge', $order['delivery_charge']));
        $discount = self::money(Request::input('discount', $order['discount']));
        $total = max(0, (float) $order['subtotal'] - $discount + $delivery);
        DB::update('orders', [
            'customer_name' => mb_substr($name, 0, 120), 'phone' => $phone, 'district' => mb_substr(Request::str('district', $order['district']), 0, 80),
            'address' => mb_substr($address, 0, 500), 'note' => mb_substr(Request::str('note'), 0, 500) ?: null,
            'admin_note' => mb_substr(Request::str('admin_note'), 0, 500) ?: null,
            'delivery_charge' => $delivery, 'discount' => $discount, 'total' => $total,
        ], 'id = ?', [$oid]);
        DB::insert('order_status_history', ['order_id' => $oid, 'status' => $order['status'], 'note' => 'অর্ডারের তথ্য সম্পাদনা করা হয়েছে', 'admin_id' => Auth::id()]);
        Response::ok(['total' => $total], 'অর্ডার আপডেট হয়েছে।');
    }

    public function sendCourier(string $id): void
    {
        $oid = $this->id($id);
        $order = Order::find($oid);
        if (!$order) {
            Response::fail('অর্ডার পাওয়া যায়নি।', [], 404);
        }
        if (in_array($order['status'], ['cancelled', 'returned', 'failed', 'delivered'], true)) {
            Response::fail('এই স্ট্যাটাসের অর্ডার কুরিয়ারে পাঠানো যাবে না।');
        }
        $phone = normalize_phone(Request::str('phone'));
        if (!$phone || mb_strlen(Request::str('name')) < 2 || mb_strlen(Request::str('address')) < 5) {
            Response::fail('নাম, সঠিক ফোন ও ঠিকানা দিন।');
        }
        $items = Order::items($oid);
        $shipment = [
            'invoice' => $order['order_code'], 'name' => Request::str('name'), 'phone' => $phone,
            'address' => Request::str('address'), 'district' => Request::str('district', $order['district']),
            'amount' => self::money(Request::input('amount', $order['total'])), 'note' => Request::str('note'),
            'items_count' => array_sum(array_column($items, 'quantity')), 'weight' => max(0.1, (float) Request::input('weight', 0.5)),
            'description' => implode(', ', array_map(static fn ($i) => $i['name'] . ' x' . $i['quantity'], $items)),
        ];
        $r = CourierManager::send($oid, Request::str('courier'), $shipment);
        $r['ok'] ? Response::ok(['consignment_id' => $r['consignment_id'] ?? null, 'tracking_code' => $r['tracking_code'] ?? null], $r['message'])
            : Response::fail($r['message']);
    }

    public function syncCourier(string $id): void
    {
        $r = CourierManager::sync_status($this->id($id));
        $r['ok'] ? Response::ok(['status' => $r['status']], $r['message'] . ' (' . $r['status'] . ')') : Response::fail($r['message']);
    }

    public function geo(string $id): void
    {
        $order = Order::find($this->id($id));
        if (!$order) {
            Response::fail('অর্ডার পাওয়া যায়নি।', [], 404);
        }
        $geo = GeoIp::forOrder($order, true);
        $geo['ok'] ? Response::ok($geo, 'লোকেশন আপডেট হয়েছে।') : Response::fail($geo['note'] ?? 'লোকেশন পাওয়া যায়নি।');
    }

    public function fraud(string $id): void
    {
        $order = Order::find($this->id($id));
        if (!$order) {
            Response::fail('অর্ডার পাওয়া যায়নি।', [], 404);
        }
        $r = FraudService::evaluate($order['phone'], (int) $order['id'], true);
        Response::ok($r, 'চেক সম্পন্ন: ' . $r['risk_label'] . ($r['courier_error'] ? ' (' . $r['courier_error'] . ')' : ''));
    }

    public function blockIp(string $id): void
    {
        $order = Order::find($this->id($id));
        if (!$order || !$order['ip']) {
            Response::fail('IP পাওয়া যায়নি।');
        }
        $type = Request::str('type') === 'lifetime' ? 'lifetime' : 'temporary';
        IpGuard::block($order['ip'], 'অর্ডার ' . $order['order_code'] . ' থেকে ম্যানুয়াল ব্লক', $type, max(1, Request::int('hours', 72)));
        Response::ok(null, 'IP ব্লক করা হয়েছে।');
    }

    public function trash(string $id): void
    {
        TrashService::trash('order', $this->id($id)) ? Response::json(true, 'অর্ডার ট্র্যাশে পাঠানো হয়েছে।', null, [], '/admin/orders') : Response::fail('মুছে ফেলা যায়নি।');
    }
}
