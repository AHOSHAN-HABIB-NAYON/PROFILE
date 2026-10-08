<?php
/**
 * Checkout API: privacy-safe autofill lookup and order placement.
 */
final class CheckoutApi
{
    /**
     * Returns previous details ONLY when this browser is already linked to the
     * customer (device cookie from an earlier order). Nothing is revealed for a
     * phone number typed on an unknown device.
     */
    public function lookup(Request $r): Response
    {
        $phone = normalize_phone($r->str('phone', 20));
        $name = $r->str('name', 100);
        $match = Customer::lookupForDevice(device_hash(), $phone, $name !== '' ? $name : null);
        if (!$match) {
            return Response::success('OK', ['found' => false]);
        }
        return Response::success('আগের তথ্য পাওয়া গেছে', [
            'found'    => true,
            'name'     => $match['name'],
            'phone'    => $match['phone'],
            'district' => $match['district'],
            'address'  => $match['address'],
        ]);
    }

    public function place(Request $r): Response
    {
        $result = OrderService::place($r);
        $order = $result['order'];
        return Response::success('অর্ডার সফল হয়েছে', [
            'order_number' => $order['order_number'],
            'redirect'     => url('/order/success/' . $order['order_number']),
            'track'        => ['name' => 'Purchase', 'event_id' => $result['event_id'], 'data' => Tracking::purchaseData($order), 'once' => 'purchase-' . $order['order_number']],
        ], 201);
    }
}
