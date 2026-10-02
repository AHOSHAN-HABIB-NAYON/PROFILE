<?php
final class CheckoutController
{
    public static function newToken(): string
    {
        $t = bin2hex(random_bytes(20));
        Session::set('checkout_token', $t);
        return $t;
    }

    public function show(): void
    {
        $summary = CartService::summary();
        $eventId = 'ic-' . bin2hex(random_bytes(6));
        if ($summary['lines']) {
            Analytics::event('checkout', null, $summary['total']);
            MetaCapi::queue('InitiateCheckout', $eventId, ['currency' => 'BDT', 'value' => $summary['total'], 'num_items' => $summary['count'],
                'content_ids' => array_map(static fn ($l) => ($l['type'] === 'combo' ? 'combo-' : '') . $l['id'], $summary['lines']), 'content_type' => 'product']);
        }
        View::page('pages/checkout', [
            's' => $summary, 'token' => Session::get('checkout_token') ?: self::newToken(), 'event_id' => $eventId,
        ], ['title' => 'চেকআউট', 'page' => 'checkout', 'robots' => 'noindex,nofollow', 'nav' => 'cart']);
    }

    public function success(string $code): void
    {
        $order = Order::findByCode($code);
        if (!$order) {
            Response::notFound();
        }
        // Personal details are shown only to the browser session that placed the order.
        $mine = MyOrders::owns($order['order_code']);
        View::page('pages/success', [
            'order' => $order, 'items' => $mine ? Order::items((int) $order['id']) : [], 'mine' => $mine,
            'history' => array_column(DB::all('SELECT status, MIN(created_at) at FROM order_status_history WHERE order_id = ? GROUP BY status', [$order['id']]), 'at', 'status'),
        ], ['title' => 'অর্ডার নিশ্চিত হয়েছে', 'page' => 'success', 'robots' => 'noindex,nofollow', 'nav' => 'home']);
    }

    public function myOrders(): void
    {
        $filter = in_array(Request::query('status'), ['active', 'delivered', 'cancelled'], true) ? Request::query('status') : 'all';
        $orders = MyOrders::orders();
        if ($filter !== 'all') {
            $orders = array_values(array_filter($orders, static fn ($o) => match ($filter) {
                'delivered' => $o['status'] === 'delivered',
                'cancelled' => in_array($o['status'], ['cancelled', 'returned', 'failed'], true),
                default => in_array($o['status'], ['pending', 'confirmed', 'processing', 'courier_sent'], true),
            }));
        }
        View::page('pages/my-orders', ['orders' => $orders, 'filter' => $filter], ['title' => 'আমার অর্ডার', 'page' => 'my-orders', 'robots' => 'noindex,nofollow', 'nav' => 'more']);
    }
}
