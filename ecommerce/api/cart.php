<?php
/**
 * Cart API. The cart is stored in the browser; the server validates and prices it.
 */
final class CartApi
{
    /** Validate one product line before it is added (stock/variant), fire AddToCart. */
    public function add(Request $r): Response
    {
        $item = [
            'product_id' => $r->int('product_id'),
            'size'       => $r->str('size', 60),
            'color'      => $r->str('color', 60),
            'qty'        => max(1, min(CartService::MAX_QTY, $r->int('qty', 1))),
        ];
        $cart = CartService::price([$item]);
        $line = $cart['lines'][0] ?? null;
        if (!$line || empty($line['available'])) {
            return Response::error($line['message'] ?? 'পণ্যটি যোগ করা যায়নি।', 422);
        }
        Analytics::record('add_to_cart', 1);
        $event = Tracking::event('AddToCart', [
            'content_ids' => [(string)$line['product_id']], 'content_type' => 'product', 'content_name' => $line['name'],
            'value' => round($line['unit_price'] * $line['qty'], 2), 'currency' => setting('currency', 'BDT'),
            'contents' => [['id' => (string)$line['product_id'], 'quantity' => $line['qty'], 'item_price' => $line['unit_price']]],
        ]);
        return Response::success('কার্টে যোগ হয়েছে', [
            'item' => [
                'product_id' => $line['product_id'], 'size' => $line['size'], 'color' => $line['color'], 'qty' => $line['qty'],
                'max_qty' => $line['max_qty'], 'name' => $line['name'],
            ],
            'track' => $event,
        ]);
    }

    /** Price the full cart (+ optional coupon/district) and optionally fire InitiateCheckout. */
    public function price(Request $r): Response
    {
        $items = $r->input('items', []);
        $cart = CartService::price(
            is_array($items) ? $items : [],
            $r->str('coupon', 40),
            $r->str('district', 80),
            normalize_phone($r->str('phone', 20))
        );
        $data = ['cart' => CartService::present($cart)];
        $eventId = preg_replace('/[^a-z0-9_]/i', '', (string)$r->input('initiate_checkout', ''));
        if ($eventId !== '' && $cart['item_count'] > 0 && RateLimiter::hit('ic:' . $eventId, 1, 3600)) {
            $custom = [
                'value' => $cart['total'], 'currency' => setting('currency', 'BDT'), 'num_items' => $cart['item_count'],
                'content_ids' => array_values(array_map(static fn($l) => (string)$l['product_id'], array_filter($cart['lines'], static fn($l) => !empty($l['available'])))),
                'content_type' => 'product',
            ];
            Tracking::server('InitiateCheckout', $eventId, $custom, [], absolute_url('/checkout'));
            $data['track'] = ['name' => 'InitiateCheckout', 'event_id' => $eventId, 'data' => $custom];
        }
        return Response::success('OK', $data);
    }
}
