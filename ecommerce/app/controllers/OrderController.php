<?php
/**
 * Order confirmation (/order/success/{code}) and "my orders"/tracking (/orders).
 * Full order details are shown only to the browser that placed the order
 * (signed cookie) or to someone who knows both the order number and phone.
 */
final class OrderController
{
    public function success(Request $r, string $code): Response
    {
        $order = Order::findByNumber($code);
        if (!$order) {
            throw new HttpException(404, 'অর্ডারটি পাওয়া যায়নি।');
        }
        $owner = OrderService::belongsToDevice($order['order_number']);
        $track = [];
        if ($owner && strtotime($order['created_at']) > time() - 3600) {
            $track[] = ['name' => 'Purchase', 'event_id' => $order['event_id'], 'data' => Tracking::purchaseData($order), 'once' => 'purchase-' . $order['order_number']];
        }
        return View::page('pages/order-success', ['order' => $order, 'owner' => $owner], [
            'title'     => 'অর্ডার নিশ্চিত হয়েছে',
            'robots'    => 'noindex, nofollow',
            'styles'    => ['order'],
            'scripts'   => ['order-success'],
            'page'      => 'order-success',
            'nav'       => 'orders',
            'track'     => $track,
            'cacheable' => false,
        ]);
    }

    public function index(Request $r): Response
    {
        $numbers = OrderService::deviceOrderNumbers();
        $orders = [];
        if ($numbers) {
            $orders = DB::all(
                'SELECT o.order_number, o.status, o.total, o.created_at,
                        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
                        (SELECT oi.product_name FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.id LIMIT 1) AS first_item
                 FROM orders o WHERE o.order_number IN (' . DB::placeholders($numbers) . ') AND o.deleted_at IS NULL ORDER BY o.id DESC',
                $numbers
            );
        }

        $tracked = null;
        $trackError = null;
        $number = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)$r->get('order', '')));
        $phone = normalize_phone((string)$r->get('phone', ''));
        if ($number !== '' || $r->get('phone')) {
            if (!RateLimiter::hit('track:' . $r->ip(), 20, 600)) {
                $trackError = 'অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।';
            } elseif ($number === '' || !$phone) {
                $trackError = 'অর্ডার নম্বর ও সঠিক ফোন নাম্বার দিন।';
            } else {
                $o = Order::findByNumber($number);
                if ($o && hash_equals($o['phone'], $phone)) {
                    $tracked = $o;
                } else {
                    $trackError = 'এই তথ্যের সাথে কোনো অর্ডার মেলেনি।';
                }
            }
        }

        return View::page('pages/orders', [
            'orders' => $orders, 'tracked' => $tracked, 'trackError' => $trackError,
            'number' => $number, 'phoneInput' => (string)$r->get('phone', ''),
        ], [
            'title'     => 'আমার অর্ডার',
            'robots'    => 'noindex, nofollow',
            'styles'    => ['order'],
            'page'      => 'orders',
            'nav'       => 'orders',
            'cacheable' => false,
        ]);
    }
}
