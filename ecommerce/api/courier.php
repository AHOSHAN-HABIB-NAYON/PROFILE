<?php
/**
 * Admin courier API: send order, sync status, fraud check, test connection, balance.
 * Credentials never leave the server — responses contain only results.
 */
final class CourierApi
{
    public function send(Request $r, string $id): Response
    {
        $order = Order::find((int)$id);
        if (!$order) {
            return Response::error('Order not found', 404);
        }
        $slug = (string)$r->input('courier', '');
        $result = CourierManager::send($order, $slug, [
            'name'    => $r->str('name', 100),
            'phone'   => $r->str('phone', 20),
            'address' => $r->str('address', 400),
            'amount'  => is_numeric($r->input('amount')) ? (float)$r->input('amount') : $order['total'],
            'note'    => $r->str('note', 250),
        ]);
        if (!$result->ok) {
            return Response::error($result->message, 422);
        }
        return Response::success($result->message, ['courier' => $slug] + $result->data + ['reload' => true]);
    }

    public function sync(Request $r, string $id): Response
    {
        $co = DB::one('SELECT * FROM courier_orders WHERE order_id = ? ORDER BY id DESC LIMIT 1', [(int)$id]);
        if (!$co) {
            return Response::error('This order has not been sent to a courier.', 404);
        }
        $result = CourierManager::sync($co);
        return $result->ok ? Response::success('Courier status: ' . $result->data['status'], $result->data + ['reload' => true]) : Response::error($result->message, 422);
    }

    public function syncAll(Request $r): Response
    {
        @set_time_limit(120);
        $rows = DB::all(
            "SELECT co.* FROM courier_orders co JOIN orders o ON o.id = co.order_id
             WHERE o.status IN ('sent_to_courier','shipped') AND o.deleted_at IS NULL
               AND co.id = (SELECT MAX(id) FROM courier_orders c2 WHERE c2.order_id = co.order_id)
             ORDER BY co.updated_at ASC LIMIT 40"
        );
        $ok = 0;
        $failed = 0;
        foreach ($rows as $co) {
            CourierManager::sync($co)->ok ? $ok++ : $failed++;
        }
        return Response::success("Synced $ok parcel(s)" . ($failed ? ", $failed failed" : ''), ['ok' => $ok, 'failed' => $failed, 'reload' => true]);
    }

    public function fraud(Request $r, string $id): Response
    {
        $order = Order::find((int)$id);
        if (!$order) {
            return Response::error('Order not found', 404);
        }
        $result = CourierManager::fraudCheck($order['phone'], $r->bool('refresh'));
        $internal = Order::phoneHistory($order['phone'], (int)$order['id']);
        if (!$result->ok) {
            return Response::json(['success' => false, 'message' => $result->message, 'data' => ['internal' => $internal]], 200);
        }
        return Response::success('OK', ['courier' => $result->data, 'internal' => $internal]);
    }

    public function test(Request $r, string $slug): Response
    {
        $result = CourierManager::test($slug);
        return $result->ok ? Response::success($result->message, ['reload' => true]) : Response::error($result->message, 422);
    }

    public function balance(Request $r, string $slug): Response
    {
        $result = CourierManager::make($slug)->balance();
        return $result->ok ? Response::success($result->message, $result->data) : Response::error($result->message, 422);
    }
}
