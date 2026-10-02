<?php
final class CheckoutApi
{
    public function quote(): void
    {
        $district = mb_substr(Request::query('district'), 0, 60);
        $s = CartService::summary($district);
        Response::ok([
            'summary' => CartService::forClient($s),
            'html' => View::render('components/checkout-summary', ['s' => $s]),
        ]);
    }

    public function place(): void
    {
        $ip = Request::ip();
        if (!RateLimiter::hit('checkout:' . $ip, 10, 600)) {
            Response::fail('অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', [], 429);
        }
        $token = Request::str('checkout_token');
        if (!preg_match('/^[a-f0-9]{40}$/', $token)) {
            Response::fail('পাতাটি রিফ্রেশ করে আবার চেষ্টা করুন।');
        }
        if (Request::input('payment_method', 'COD') !== 'COD') {
            Response::fail('শুধুমাত্র ক্যাশ অন ডেলিভারি গ্রহণযোগ্য।');
        }
        $result = OrderService::place(Request::all(), $token);
        if (isset($result['error'])) {
            Response::fail($result['error'], $result['errors'] ?? []);
        }
        $order = $result['order'];
        $mine = (array) Session::get('my_orders', []);
        $mine[] = $order['order_code'];
        Session::set('my_orders', array_slice(array_unique($mine), -10));
        CheckoutController::newToken();
        // Device-bound permission to auto-fill the address next time (never exposed to other devices).
        setcookie('cust', hash_hmac('sha256', $order['phone'], (string) Config::get('key')), [
            'expires' => time() + 86400 * 365, 'path' => '/', 'secure' => Request::isHttps(), 'httponly' => true, 'samesite' => 'Lax',
        ]);
        $items = Order::items((int) $order['id']);
        Response::json(true, 'আপনার অর্ডার গ্রহণ করা হয়েছে।', [
            'order_code' => $order['order_code'],
            'track' => [
                'event_id' => $order['order_code'], 'value' => (float) $order['total'],
                'content_ids' => array_values(array_filter(array_map(static fn ($i) => $i['product_id'] ? (string) $i['product_id'] : ($i['combo_id'] ? 'combo-' . $i['combo_id'] : null), $items))),
                'num_items' => array_sum(array_column($items, 'quantity')),
            ],
        ], [], '/order-success/' . rawurlencode($order['order_code']));
    }

    /** Returning-customer suggestion. Address is only returned to the device that placed that order. */
    public function lookup(): void
    {
        $phone = normalize_phone(Request::query('phone'));
        if (!$phone) {
            Response::fail('সঠিক ফোন নম্বর দিন।');
        }
        if (!RateLimiter::hit('lookup:' . Request::ip(), 15, 3600)) {
            Response::ok(null);
        }
        $o = DB::one('SELECT customer_name, district, address FROM orders WHERE phone = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [$phone]);
        if (!$o) {
            Response::ok(null);
        }
        $cookie = is_string($_COOKIE['cust'] ?? null) ? $_COOKIE['cust'] : '';
        $sameDevice = $cookie !== '' && hash_equals(hash_hmac('sha256', $phone, (string) Config::get('key')), $cookie);
        Response::ok(['name' => $o['customer_name'], 'district' => $o['district'], 'address' => $sameDevice ? $o['address'] : null]);
    }
}
