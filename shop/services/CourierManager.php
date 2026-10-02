<?php
/**
 * Multi-courier registry. Add a courier by writing a CourierDriver class and registering it here.
 * Couriers without a driver can still store credentials but cannot send/track yet.
 */
final class CourierManager
{
    public const REGISTRY = [
        'steadfast' => ['name' => 'Steadfast', 'driver' => SteadfastCourier::class, 'fields' => []],
        'pathao'    => ['name' => 'Pathao', 'driver' => PathaoCourier::class, 'fields' => ['username' => 'মার্চেন্ট ইমেইল', 'password' => 'মার্চেন্ট পাসওয়ার্ড', 'store_id' => 'Store ID', 'city_id' => 'ডিফল্ট City ID (ঐচ্ছিক)', 'zone_id' => 'ডিফল্ট Zone ID (ঐচ্ছিক)']],
        'redx'      => ['name' => 'RedX', 'driver' => RedxCourier::class, 'fields' => ['delivery_area' => 'ডিফল্ট Delivery Area', 'delivery_area_id' => 'Delivery Area ID', 'pickup_store_id' => 'Pickup Store ID (ঐচ্ছিক)']],
        'paperfly'  => ['name' => 'Paperfly', 'driver' => null, 'fields' => []],
        'ecourier'  => ['name' => 'eCourier', 'driver' => null, 'fields' => []],
        'sundarban' => ['name' => 'Sundarban', 'driver' => null, 'fields' => []],
        'carrybee'  => ['name' => 'Carrybee', 'driver' => null, 'fields' => []],
    ];

    /** Ensure every registry courier has a row. */
    public static function sync(): void
    {
        foreach (self::REGISTRY as $code => $c) {
            DB::run('INSERT IGNORE INTO courier_accounts (code, name) VALUES (?, ?)', [$code, $c['name']]);
        }
    }

    public static function accounts(): array
    {
        self::sync();
        return DB::all('SELECT * FROM courier_accounts ORDER BY is_default DESC, is_enabled DESC, id');
    }

    public static function enabled(): array
    {
        return array_values(array_filter(DB::all('SELECT * FROM courier_accounts WHERE is_enabled = 1 ORDER BY is_default DESC, id'), static fn ($a) => self::hasDriver($a['code'])));
    }

    public static function hasDriver(string $code): bool
    {
        return !empty(self::REGISTRY[$code]['driver']);
    }

    public static function driver(string $code): ?CourierDriver
    {
        $acc = DB::one('SELECT * FROM courier_accounts WHERE code = ?', [$code]);
        $class = self::REGISTRY[$code]['driver'] ?? null;
        return $acc && $class ? new $class($acc) : null;
    }

    public static function test(string $code): array
    {
        $d = self::driver($code);
        $r = $d ? $d->test() : ['ok' => false, 'message' => 'এই কুরিয়ারের API ড্রাইভার এখনো যুক্ত করা হয়নি।'];
        DB::update('courier_accounts', ['last_test_status' => $r['ok'] ? 'success' : 'error', 'last_test_message' => mb_substr($r['message'], 0, 255), 'last_test_at' => date('Y-m-d H:i:s')], 'code = ?', [$code]);
        Logger::courier('Connection test', ['courier' => $code, 'ok' => $r['ok'], 'message' => $r['message']]);
        return $r;
    }

    /** Sends an order to a courier using admin-edited shipment data. */
    public static function send(int $orderId, string $code, array $shipment): array
    {
        $acc = DB::one('SELECT * FROM courier_accounts WHERE code = ? AND is_enabled = 1', [$code]);
        $d = $acc ? self::driver($code) : null;
        if (!$d) {
            return ['ok' => false, 'message' => 'কুরিয়ারটি চালু বা কনফিগার করা নেই।'];
        }
        $r = $d->send($shipment);
        Logger::courier('Send order', ['courier' => $code, 'order' => $shipment['invoice'], 'ok' => $r['ok'], 'message' => $r['message']]);
        if (!$r['ok']) {
            Notifier::add('courier_error', 'কুরিয়ার API ত্রুটি (' . $acc['name'] . ')', $shipment['invoice'] . ': ' . $r['message'], '/admin/orders/' . $orderId);
            return $r;
        }
        DB::insert('courier_orders', [
            'order_id' => $orderId, 'courier_code' => $code, 'consignment_id' => $r['consignment_id'] ?? null,
            'tracking_code' => $r['tracking_code'] ?? null, 'reference' => $r['reference'] ?? null, 'status' => $r['status'] ?? null,
            'cod_amount' => $shipment['amount'], 'response' => json_encode(Logger::redact($r['raw'] ?? []), JSON_UNESCAPED_UNICODE), 'last_synced_at' => date('Y-m-d H:i:s'),
        ]);
        OrderService::changeStatus($orderId, 'courier_sent', $acc['name'] . ' — CID: ' . ($r['consignment_id'] ?? ''));
        return $r;
    }

    public static function sync_status(int $courierOrderId): array
    {
        $co = DB::one('SELECT * FROM courier_orders WHERE id = ?', [$courierOrderId]);
        $d = $co ? self::driver($co['courier_code']) : null;
        if (!$d) {
            return ['ok' => false, 'message' => 'কুরিয়ার ড্রাইভার পাওয়া যায়নি।'];
        }
        $r = $d->status($co);
        if ($r['ok']) {
            DB::update('courier_orders', ['status' => $r['status'], 'last_synced_at' => date('Y-m-d H:i:s')], 'id = ?', [$courierOrderId]);
            $map = ['delivered' => 'delivered', 'partial_delivered' => 'delivered', 'cancelled' => 'cancelled', 'returned' => 'returned', 'return' => 'returned'];
            $norm = strtolower(str_replace([' ', '-'], '_', (string) $r['status']));
            if (isset($map[$norm])) {
                OrderService::changeStatus((int) $co['order_id'], $map[$norm], 'কুরিয়ার স্ট্যাটাস সিঙ্ক: ' . $r['status']);
            }
        } else {
            Notifier::add('courier_error', 'কুরিয়ার স্ট্যাটাস সিঙ্ক ব্যর্থ', $r['message'], '/admin/orders/' . ($co['order_id'] ?? ''));
        }
        return $r;
    }
}
