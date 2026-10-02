<?php
final class OrderService
{
    /** Server-side validation of checkout input. Returns [clean, errors]. */
    public static function validate(array $in): array
    {
        $errors = [];
        $name = trim(preg_replace('/\s+/u', ' ', (string) ($in['name'] ?? '')) ?? '');
        $phone = normalize_phone((string) ($in['phone'] ?? ''));
        $district = trim((string) ($in['district'] ?? ''));
        $address = trim(preg_replace('/\s+/u', ' ', (string) ($in['address'] ?? '')) ?? '');
        $note = trim((string) ($in['note'] ?? ''));
        if (mb_strlen($name) < 2) {
            $errors['name'] = 'দয়া করে আপনার নাম লিখুন।';
        } elseif (mb_strlen($name) > 100 || preg_match('/[<>{}$]/', $name) || !preg_match('/[\p{L}]/u', $name)) {
            $errors['name'] = 'সঠিক নাম লিখুন।';
        }
        if (!$phone) {
            $errors['phone'] = 'সঠিক ফোন নম্বর দিন।';
        }
        if (mb_strlen($district) < 2 || mb_strlen($district) > 60) {
            $errors['district'] = 'দয়া করে আপনার জেলার নাম লিখুন।';
        }
        if (mb_strlen($address) < 10) {
            $errors['address'] = 'দয়া করে পূর্ণ ঠিকানা লিখুন (গ্রাম/রোড, থানা সহ)।';
        } elseif (mb_strlen($address) > 400) {
            $errors['address'] = 'ঠিকানা অনেক বড় হয়ে গেছে।';
        }
        if (mb_strlen($note) > 400) {
            $errors['note'] = 'নোট সর্বোচ্চ ৪০০ অক্ষরের হতে পারবে।';
        }
        return [compact('name', 'phone', 'district', 'address', 'note'), $errors];
    }

    /**
     * Places a COD order atomically: order + items + stock + coupon usage + status history.
     * Prices are recomputed from the DB under row locks; the client never decides amounts.
     * @return array{order?:array, error?:string, errors?:array}
     */
    public static function place(array $input, string $idempotencyKey): array
    {
        [$data, $errors] = self::validate($input);
        if ($errors) {
            return ['error' => reset($errors), 'errors' => $errors];
        }
        if ($existing = DB::one('SELECT * FROM orders WHERE idempotency_key = ?', [$idempotencyKey])) {
            return ['order' => $existing, 'duplicate' => true];
        }
        $ip = Request::ip();
        if ($err = IpGuard::checkOrder($ip)) {
            return ['error' => $err];
        }
        $state = CartService::state();
        if (!$state['items']) {
            return ['error' => 'আপনার কার্ট খালি। আগে পণ্য যোগ করুন।'];
        }
        $ua = Request::userAgent();
        $uaInfo = UserAgent::parse($ua);

        try {
            $order = DB::transaction(static function () use ($data, $state, $idempotencyKey, $ip, $ua, $uaInfo) {
                $sum = CartService::summary($data['district'], true, $state);
                if (!$sum['lines']) {
                    throw new DomainException('আপনার কার্ট খালি। আগে পণ্য যোগ করুন।');
                }
                foreach ($sum['lines'] as $l) {
                    if (isset($l['error'])) {
                        throw new DomainException($l['name'] . ': ' . $l['error']);
                    }
                }
                if ($state['coupon'] && $sum['coupon_error']) {
                    throw new DomainException($sum['coupon_error']);
                }
                $code = Order::generateCode();
                $orderId = DB::insert('orders', [
                    'order_code' => $code, 'idempotency_key' => $idempotencyKey,
                    'customer_name' => $data['name'], 'phone' => $data['phone'], 'district' => $data['district'],
                    'address' => $data['address'], 'note' => $data['note'] ?: null,
                    'subtotal' => $sum['subtotal'], 'delivery_charge' => $sum['delivery_charge'], 'discount' => $sum['discount'],
                    'total' => $sum['total'], 'coupon_code' => $sum['coupon_code'],
                    'delivery_zone' => in_array($sum['delivery']['zone'], ['inside', 'outside', 'free'], true) ? $sum['delivery']['zone'] : 'outside',
                    'payment_method' => 'COD', 'status' => 'pending', 'stock_deducted' => 1,
                    'ip' => $ip, 'user_agent' => $ua, 'device' => $uaInfo['device'], 'browser' => $uaInfo['browser'], 'os' => $uaInfo['os'],
                ]);
                foreach ($sum['lines'] as $l) {
                    DB::insert('order_items', [
                        'order_id' => $orderId, 'item_type' => $l['type'],
                        'product_id' => $l['type'] === 'product' ? $l['id'] : null,
                        'combo_id' => $l['type'] === 'combo' ? $l['id'] : null,
                        'name' => $l['name'], 'image' => $l['image'], 'size' => $l['size'],
                        'unit_price' => $l['unit_price'], 'quantity' => $l['qty'], 'line_total' => $l['line_total'],
                    ]);
                    // Guarded decrement: never lets stock go negative even under concurrency.
                    $affected = $l['type'] === 'combo'
                        ? DB::run('UPDATE combos SET stock = stock - ? WHERE id = ? AND stock >= ?', [$l['qty'], $l['id'], $l['qty']])->rowCount()
                        : DB::run('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ? AND stock >= ?', [$l['qty'], $l['qty'], $l['id'], $l['qty']])->rowCount();
                    if ($affected !== 1) {
                        throw new DomainException('দুঃখিত, "' . $l['name'] . '" পর্যাপ্ত স্টকে নেই।');
                    }
                }
                if ($sum['coupon_id']) {
                    DB::run('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [$sum['coupon_id']]);
                    DB::insert('coupon_usage', ['coupon_id' => $sum['coupon_id'], 'order_id' => $orderId, 'phone' => $data['phone'], 'discount' => $sum['discount']]);
                }
                DB::insert('order_status_history', ['order_id' => $orderId, 'status' => 'pending', 'note' => 'অর্ডার গ্রহণ করা হয়েছে (ক্যাশ অন ডেলিভারি)']);
                $o = Order::find($orderId);
                $o['_product_ids'] = array_column(array_filter($sum['lines'], static fn ($l) => $l['type'] === 'product'), 'id');
                return $o;
            });
        } catch (DomainException $e) {
            return ['error' => $e->getMessage()];
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? 0) === 1062 && ($dup = DB::one('SELECT * FROM orders WHERE idempotency_key = ?', [$idempotencyKey]))) {
                return ['order' => $dup, 'duplicate' => true];
            }
            Logger::order('Order failed: ' . $e->getMessage(), ['ip' => $ip]);
            Notifier::add('system_error', 'অর্ডার তৈরি ব্যর্থ', 'একটি অর্ডার সংরক্ষণ করতে সমস্যা হয়েছে। লগ দেখুন।');
            return ['error' => GENERIC_ERROR];
        }

        CartService::clear();
        $productIds = $order['_product_ids'];
        unset($order['_product_ids']);
        Notifier::add('new_order', 'নতুন অর্ডার: ' . $order['order_code'], $order['customer_name'] . ' — ' . money($order['total']), '/admin/orders/' . $order['id']);
        StockService::notifyLow($productIds);
        Analytics::event('purchase', null, (float) $order['total']);
        Logger::order('Order placed', ['code' => $order['order_code'], 'total' => $order['total']]);

        $orderId = (int) $order['id'];
        Deferred::add(static function () use ($orderId) {
            $o = Order::find($orderId);
            if (!$o) {
                return;
            }
            if (Settings::on('fraud_enabled') && Settings::on('fraud_auto_check')) {
                FraudService::evaluate($o['phone'], $orderId);
            }
            MetaCapi::purchase($o, Order::items($orderId));
        });
        return ['order' => $order];
    }

    /** Admin status change with history and stock restore/re-deduct. */
    public static function changeStatus(int $orderId, string $status, string $note = ''): ?string
    {
        if (!in_array($status, Order::STATUSES, true)) {
            return 'অবৈধ স্ট্যাটাস।';
        }
        try {
            DB::transaction(static function () use ($orderId, $status, $note) {
                $order = DB::one('SELECT * FROM orders WHERE id = ? FOR UPDATE', [$orderId]);
                if (!$order) {
                    throw new DomainException('অর্ডার পাওয়া যায়নি।');
                }
                if ($order['status'] === $status) {
                    return;
                }
                if (in_array($status, Order::RESTOCK, true)) {
                    StockService::restore($order);
                } else {
                    StockService::deduct($order);
                }
                DB::update('orders', ['status' => $status], 'id = ?', [$orderId]);
                DB::insert('order_status_history', ['order_id' => $orderId, 'status' => $status, 'note' => $note ?: null, 'admin_id' => Auth::id()]);
            });
        } catch (DomainException $e) {
            return $e->getMessage();
        }
        return null;
    }
}
