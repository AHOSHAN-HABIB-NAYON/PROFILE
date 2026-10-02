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
        $mine = in_array($order['order_code'], (array) Session::get('my_orders', []), true);
        View::page('pages/success', [
            'order' => $order, 'items' => $mine ? Order::items((int) $order['id']) : [], 'mine' => $mine,
        ], ['title' => 'অর্ডার নিশ্চিত হয়েছে', 'page' => 'success', 'robots' => 'noindex,nofollow', 'nav' => 'home']);
    }
}
