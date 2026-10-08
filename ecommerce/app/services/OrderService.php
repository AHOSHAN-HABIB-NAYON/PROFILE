<?php
/**
 * Order placement (COD), status workflow, admin edits and stock bookkeeping.
 */
final class OrderService
{
    private const NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    private const RECENT_COOKIE = 'ns_orders';

    /**
     * Validate and place an order. Returns ['order' => row, 'event_id' => string]
     * or throws HttpException with a customer-friendly Bengali message.
     */
    public static function place(Request $r): array
    {
        $ip = $r->ip();
        if (!RateLimiter::hit('order:' . $ip, 12, 3600)) {
            throw new HttpException(429);
        }
        $idempotency = preg_replace('/[^a-zA-Z0-9-]/', '', (string)$r->input('idempotency_key', ''));
        if ($idempotency !== '' && ($existing = Cache::get('orders:idem:' . $idempotency))) {
            $order = Order::findByNumber($existing);
            if ($order) {
                return ['order' => $order, 'event_id' => $order['event_id'], 'duplicate' => true];
            }
        }

        $data = [
            'name'     => $r->str('name', 100),
            'phone'    => $r->str('phone', 20),
            'district' => $r->str('district', 80),
            'address'  => $r->str('address', 400),
            'note'     => $r->str('note', 500),
        ];
        $v = Validator::make($data, [
            'name' => 'required|min:2|max:100', 'phone' => 'required|phone',
            'district' => 'required', 'address' => 'required|min:8|max:400', 'note' => 'max:500',
        ], ['name' => 'পূর্ণ নাম', 'phone' => 'ফোন নাম্বার', 'district' => 'জেলা', 'address' => 'পূর্ণ ঠিকানা', 'note' => 'নোট']);
        if (!in_array($data['district'], config('districts'), true)) {
            throw new HttpException(422, 'সঠিক জেলা নির্বাচন করুন।');
        }
        if ($v->fails()) {
            throw new ValidationException($v->errors());
        }
        $phone = normalize_phone($data['phone']);
        $deviceHash = device_hash();

        $items = $r->input('items', []);
        if (!is_array($items) || $items === []) {
            throw new HttpException(422, 'আপনার কার্ট খালি।');
        }
        $cart = CartService::price($items, (string)$r->input('coupon', ''), $data['district'], $phone);
        if ($cart['errors']) {
            throw new HttpException(422, implode(' ', array_slice($cart['errors'], 0, 3)));
        }
        if ($cart['item_count'] === 0) {
            throw new HttpException(422, 'আপনার কার্ট খালি।');
        }
        $min = (float)setting('order_min_amount', 0);
        if ($min > 0 && $cart['subtotal'] < $min) {
            throw new HttpException(422, 'সর্বনিম্ন অর্ডার ' . money($min) . '।');
        }
        if ($r->input('coupon') && $cart['coupon_error']) {
            throw new HttpException(422, $cart['coupon_error']);
        }

        $reject = FraudGuard::check($ip, $phone, $deviceHash);
        if ($reject !== null) {
            throw new HttpException(429, $reject);
        }

        $ua = $r->userAgent();
        $eventId = 'purchase_' . Crypto::token(8);
        $order = DB::transaction(static function () use ($data, $phone, $cart, $ip, $ua, $deviceHash, $eventId) {
            self::reserveStock($cart['lines']);
            $customerId = Customer::upsertFromOrder($data['name'], $phone, $data['district'], $data['address']);
            $orderId = DB::insert('orders', [
                'order_number'    => self::newNumber(),
                'customer_id'     => $customerId,
                'customer_name'   => $data['name'],
                'phone'           => $phone,
                'district'        => $data['district'],
                'address'         => $data['address'],
                'note'            => $data['note'] ?: null,
                'delivery_zone'   => $cart['delivery_zone'] ?? 'outside',
                'subtotal'        => $cart['subtotal'],
                'delivery_charge' => $cart['delivery_charge'],
                'discount'        => $cart['discount'],
                'total'           => $cart['total'],
                'coupon_id'       => $cart['coupon']['id'] ?? null,
                'coupon_code'     => $cart['coupon']['code'] ?? null,
                'payment_method'  => 'cod',
                'status'          => 'pending',
                'ip'              => $ip,
                'user_agent'      => $ua,
                'device_type'     => device_type($ua),
                'device_hash'     => $deviceHash,
                'event_id'        => $eventId,
            ]);
            foreach ($cart['lines'] as $l) {
                if (empty($l['available'])) {
                    continue;
                }
                DB::insert('order_items', [
                    'order_id' => $orderId, 'product_id' => $l['product_id'], 'variant_id' => $l['variant_id'],
                    'product_name' => $l['name'], 'sku' => $l['sku'], 'size' => $l['size'] ?: null, 'color' => $l['color'] ?: null,
                    'image' => $l['image_path'] ?: null, 'unit_price' => $l['unit_price'], 'quantity' => $l['qty'], 'line_total' => $l['line_total'],
                ]);
                DB::exec('UPDATE products SET sold_count = sold_count + ? WHERE id = ?', [$l['qty'], $l['product_id']]);
            }
            if ($cart['coupon']) {
                DB::exec('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [$cart['coupon']['id']]);
                DB::insert('coupon_usages', ['coupon_id' => $cart['coupon']['id'], 'order_id' => $orderId, 'phone' => $phone]);
            }
            Customer::linkDevice($customerId, $deviceHash);
            Customer::refreshStats($customerId);
            return Order::find($orderId);
        });

        if ($idempotency !== '') {
            Cache::set('orders:idem:' . $idempotency, $order['order_number'], 900);
        }
        self::rememberOnDevice($order['order_number']);
        self::afterPlaced($order, $cart);
        return ['order' => $order, 'event_id' => $eventId, 'duplicate' => false];
    }

    /** Lock & decrement stock inside the order transaction. */
    private static function reserveStock(array $lines): void
    {
        foreach ($lines as $l) {
            if (empty($l['available'])) {
                continue;
            }
            $p = DB::one('SELECT id, name, stock, track_stock, allow_backorder FROM products WHERE id = ? FOR UPDATE', [$l['product_id']]);
            if (!$p) {
                throw new HttpException(422, 'একটি পণ্য আর পাওয়া যাচ্ছে না।');
            }
            if ((int)$p['track_stock'] !== 1) {
                continue;
            }
            $backorder = Product::canBackorder($p);
            if ($l['variant_id']) {
                $vStock = (int)DB::value('SELECT stock FROM product_variants WHERE id = ? FOR UPDATE', [$l['variant_id']]);
                if (!$backorder && $vStock < $l['qty']) {
                    throw new HttpException(422, $p['name'] . ': স্টক শেষ');
                }
                DB::exec('UPDATE product_variants SET stock = stock - ? WHERE id = ?', [$l['qty'], $l['variant_id']]);
            } elseif (!$backorder && (int)$p['stock'] < $l['qty']) {
                throw new HttpException(422, $p['name'] . ': স্টক শেষ');
            }
            DB::exec('UPDATE products SET stock = stock - ? WHERE id = ?', [$l['qty'], $l['product_id']]);
        }
    }

    private static function afterPlaced(array $order, array $cart): void
    {
        Cache::flushGroup('catalog');
        Notification::create('order', 'New order #' . $order['order_number'], $order['customer_name'] . ' — ' . money_en($order['total']), url('/admin/orders/' . $order['id']));
        self::notifyLowStock(array_column($order['items'], 'product_id'));
        Analytics::record('orders', 1);
        Analytics::record('revenue', (int)round($order['total']));
        Deferred::add(static fn() => Tracking::serverPurchase($order));
        if (setting('geoip_enabled') === '1') {
            Deferred::add(static fn() => GeoIp::attachToOrder((int)$order['id'], (string)$order['ip']));
        }
    }

    public static function notifyLowStock(array $productIds): void
    {
        $ids = array_values(array_unique(array_filter(array_map('intval', $productIds))));
        if (!$ids) {
            return;
        }
        $threshold = (int)setting('low_stock_threshold', 10);
        $rows = DB::all('SELECT id, name, stock FROM products WHERE id IN (' . DB::placeholders($ids) . ') AND track_stock = 1 AND stock <= ?', array_merge($ids, [$threshold]));
        foreach ($rows as $p) {
            Notification::create('stock', ($p['stock'] <= 0 ? 'Out of stock: ' : 'Low stock: ') . $p['name'], 'Stock left: ' . $p['stock'], url('/admin/products?filter=low_stock'));
        }
    }

    /** Change status with stock release/re-reserve and history. */
    public static function changeStatus(array $order, string $status, string $note = ''): void
    {
        if (!isset(config('order_statuses')[$status]) || $order['status'] === $status) {
            return;
        }
        $release = config('stock_release_statuses');
        $wasReleased = in_array($order['status'], $release, true);
        $nowReleased = in_array($status, $release, true);
        DB::transaction(static function () use ($order, $status, $wasReleased, $nowReleased, $note) {
            if (!$wasReleased && $nowReleased) {
                self::adjustStock($order['items'], +1);
            } elseif ($wasReleased && !$nowReleased) {
                self::adjustStock($order['items'], -1);
            }
            DB::exec('UPDATE orders SET status = ? WHERE id = ?', [$status, $order['id']]);
            Order::addHistory((int)$order['id'], 'status', 'status', $order['status'], $status . ($note !== '' ? " ($note)" : ''));
            if (in_array($status, ['fraud', 'blocked'], true)) {
                DB::insert('security_alerts', [
                    'type' => 'order_marked_' . $status, 'severity' => 'medium',
                    'title' => 'Order #' . $order['order_number'] . ' marked ' . $status,
                    'message' => 'Phone ' . mask_phone($order['phone']), 'ip' => $order['ip'],
                ]);
            }
        });
        Customer::refreshStats($order['customer_id'] ? (int)$order['customer_id'] : null);
        Audit::log('order.status', 'order', (int)$order['id'], ['status' => $order['status']], ['status' => $status]);
        Cache::flushGroup('catalog');
    }

    /** $direction +1 returns stock, -1 takes it again. */
    private static function adjustStock(array $items, int $direction): void
    {
        foreach ($items as $it) {
            if (!$it['product_id']) {
                continue;
            }
            $qty = (int)$it['quantity'] * $direction;
            DB::exec('UPDATE products SET stock = stock + ?, sold_count = GREATEST(0, CAST(sold_count AS SIGNED) - ?) WHERE id = ? AND track_stock = 1', [$qty, $qty, $it['product_id']]);
            if ($it['variant_id']) {
                DB::exec('UPDATE product_variants SET stock = stock + ? WHERE id = ?', [$qty, $it['variant_id']]);
            }
        }
    }

    /**
     * Admin edit before courier submission. Totals are always recalculated here.
     * $input: customer_name, phone, district, address, note, delivery_charge, discount, items: {item_id: qty}
     */
    public static function adminUpdate(array $order, array $input): array
    {
        if (Order::isLocked($order)) {
            throw new HttpException(422, 'Order already handed to courier — editing is locked.');
        }
        $fields = [
            'customer_name' => mb_substr(trim(clean_text((string)($input['customer_name'] ?? $order['customer_name']))), 0, 150),
            'phone'         => normalize_phone((string)($input['phone'] ?? $order['phone'])),
            'district'      => trim((string)($input['district'] ?? $order['district'])),
            'address'       => mb_substr(trim(clean_text((string)($input['address'] ?? $order['address']))), 0, 500),
            'note'          => mb_substr(trim(clean_text((string)($input['note'] ?? $order['note']))), 0, 1000) ?: null,
            'admin_note'    => mb_substr(trim(clean_text((string)($input['admin_note'] ?? $order['admin_note']))), 0, 2000) ?: null,
            'delivery_charge' => max(0, round((float)($input['delivery_charge'] ?? $order['delivery_charge']), 2)),
            'discount'      => max(0, round((float)($input['discount'] ?? $order['discount']), 2)),
        ];
        if ($fields['phone'] === null) {
            throw new HttpException(422, 'Invalid phone number.');
        }
        if ($fields['customer_name'] === '' || $fields['address'] === '' || !in_array($fields['district'], config('districts'), true)) {
            throw new HttpException(422, 'Name, district and address are required.');
        }
        $fields['delivery_zone'] = CartService::zoneFor($fields['district']);
        $qtyInput = is_array($input['items'] ?? null) ? $input['items'] : [];
        $released = in_array($order['status'], config('stock_release_statuses'), true);

        DB::transaction(static function () use ($order, $fields, $qtyInput, $released) {
            $subtotal = 0.0;
            $remaining = 0;
            foreach ($order['items'] as $it) {
                $newQty = array_key_exists((string)$it['id'], $qtyInput) ? max(0, min(100, (int)$qtyInput[(string)$it['id']])) : (int)$it['quantity'];
                $diff = $newQty - (int)$it['quantity'];
                if ($diff !== 0) {
                    if (!$released && $it['product_id']) {
                        DB::exec('UPDATE products SET stock = stock - ? WHERE id = ? AND track_stock = 1', [$diff, $it['product_id']]);
                        if ($it['variant_id']) {
                            DB::exec('UPDATE product_variants SET stock = stock - ? WHERE id = ?', [$diff, $it['variant_id']]);
                        }
                    }
                    Order::addHistory((int)$order['id'], 'edit', 'qty:' . $it['product_name'], $it['quantity'], $newQty);
                    if ($newQty === 0) {
                        DB::exec('DELETE FROM order_items WHERE id = ?', [$it['id']]);
                    } else {
                        DB::exec('UPDATE order_items SET quantity = ?, line_total = unit_price * ? WHERE id = ?', [$newQty, $newQty, $it['id']]);
                    }
                }
                $subtotal += (float)$it['unit_price'] * $newQty;
                $remaining += $newQty;
            }
            if ($remaining === 0) {
                throw new HttpException(422, 'An order must keep at least one item. Cancel the order instead.');
            }
            $fields['subtotal'] = round($subtotal, 2);
            $fields['discount'] = min($fields['discount'], $fields['subtotal']);
            $fields['total'] = max(0, round($fields['subtotal'] - $fields['discount'] + $fields['delivery_charge'], 2));
            foreach ($fields as $k => $v) {
                if ((string)$order[$k] !== (string)$v) {
                    Order::addHistory((int)$order['id'], 'edit', $k, $order[$k], $v);
                }
            }
            DB::update('orders', $fields, 'id = ?', [$order['id']]);
        });
        [$old, $new] = Audit::diff($order, $fields);
        Audit::log('order.update', 'order', (int)$order['id'], $old, $new);
        return Order::find((int)$order['id']);
    }

    private static function newNumber(): string
    {
        for ($i = 0; $i < 10; $i++) {
            $n = '';
            for ($j = 0; $j < 8; $j++) {
                $n .= self::NUMBER_ALPHABET[random_int(0, strlen(self::NUMBER_ALPHABET) - 1)];
            }
            if (!DB::value('SELECT 1 FROM orders WHERE order_number = ?', [$n])) {
                return $n;
            }
        }
        throw new RuntimeException('Could not allocate order number');
    }

    /** Signed cookie listing this browser's recent orders (for the success page & "my orders"). */
    private static function rememberOnDevice(string $number): void
    {
        $list = self::deviceOrderNumbers();
        array_unshift($list, $number);
        $list = array_slice(array_values(array_unique($list)), 0, 20);
        set_cookie(self::RECENT_COOKIE, Crypto::sign(implode(',', $list)), 365 * 86400);
    }

    public static function deviceOrderNumbers(): array
    {
        $raw = Crypto::unsign($_COOKIE[self::RECENT_COOKIE] ?? null);
        return $raw ? array_values(array_filter(explode(',', $raw), static fn($n) => preg_match('/^[A-Z0-9]{6,16}$/', $n))) : [];
    }

    public static function belongsToDevice(string $number): bool
    {
        return in_array(strtoupper($number), self::deviceOrderNumbers(), true);
    }
}
