<?php
/**
 * Orders API: customer tracking (order number + phone) and admin GeoIP refresh.
 */
final class OrdersApi
{
    public function track(Request $r): Response
    {
        $number = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $r->str('order', 20)));
        $phone = normalize_phone($r->str('phone', 20));
        $order = $number !== '' && $phone ? Order::findByNumber($number) : null;
        if (!$order || !hash_equals($order['phone'], $phone)) {
            return Response::error('এই তথ্যের সাথে কোনো অর্ডার মেলেনি।', 404);
        }
        $statuses = config('order_statuses');
        return Response::success('OK', [
            'order_number' => $order['order_number'],
            'status'       => $order['status'],
            'status_label' => $statuses[$order['status']]['bn'] ?? $order['status'],
            'total'        => money($order['total']),
            'created_at'   => bn_date($order['created_at'], true),
        ]);
    }

    public function geo(Request $r, string $id): Response
    {
        $order = Order::find((int)$id);
        if (!$order) {
            return Response::error('Order not found', 404);
        }
        $geo = GeoIp::attachToOrder((int)$order['id'], (string)$order['ip']);
        return $geo ? Response::success('Location updated (approximate)', ['geo' => $geo]) : Response::error('Lookup failed. Try again later.', 502);
    }
}
