<?php
/**
 * Courier plugin registry + order ↔ courier workflow.
 * Credentials are stored encrypted in `couriers.credentials` and only
 * decrypted server-side when a request to the courier is made.
 */
final class CourierManager
{
    /** Register new courier plugins here. */
    public const CLASSES = [
        'bdcourier' => BdCourier::class,
        'steadfast' => SteadfastCourier::class,
        'pathao'    => PathaoCourier::class,
        'redx'      => RedxCourier::class,
    ];

    /** @return array<string, CourierPluginInterface> */
    public static function all(): array
    {
        $out = [];
        foreach (array_keys(self::CLASSES) as $slug) {
            $out[$slug] = self::make($slug);
        }
        return $out;
    }

    public static function make(string $slug, bool $configure = true): CourierPluginInterface
    {
        $class = self::CLASSES[$slug] ?? throw new HttpException(404, 'Unknown courier.');
        $plugin = new $class();
        if ($configure) {
            $row = self::row($slug);
            $plugin->configure(Crypto::decryptArray($row['credentials'] ?? null), json_list($row['settings'] ?? null));
        }
        return $plugin;
    }

    public static function row(string $slug): array
    {
        $row = DB::one('SELECT * FROM couriers WHERE slug = ?', [$slug]);
        if (!$row) {
            $plugin = self::make($slug, false);
            DB::insert('couriers', ['slug' => $slug, 'name' => $plugin->name()]);
            $row = DB::one('SELECT * FROM couriers WHERE slug = ?', [$slug]);
        }
        return $row;
    }

    /** Enabled couriers that support a capability. */
    public static function enabledWith(string $capability): array
    {
        $out = [];
        foreach (DB::all('SELECT slug FROM couriers WHERE is_enabled = 1 ORDER BY is_default DESC, id') as $r) {
            if (isset(self::CLASSES[$r['slug']])) {
                $p = self::make($r['slug']);
                if (in_array($capability, $p->capabilities(), true)) {
                    $out[$r['slug']] = $p;
                }
            }
        }
        return $out;
    }

    public static function saveConfig(string $slug, bool $enabled, bool $isDefault, array $credentials, array $settings): void
    {
        $plugin = self::make($slug, false);
        $row = self::row($slug);
        $currentCreds = Crypto::decryptArray($row['credentials']);
        foreach (array_keys($plugin->credentialFields()) as $key) {
            $v = trim((string)($credentials[$key] ?? ''));
            if ($v !== '') {
                $currentCreds[$key] = mb_substr($v, 0, 2000);
            }
        }
        $cleanSettings = [];
        foreach (array_keys($plugin->settingFields()) as $key) {
            $cleanSettings[$key] = mb_substr(trim(clean_text((string)($settings[$key] ?? ''))), 0, 300);
        }
        if (isset($cleanSettings['base_url']) && $cleanSettings['base_url'] !== '' && !preg_match('#^https://[a-z0-9.-]+(/[\w./-]*)?$#i', $cleanSettings['base_url'])) {
            throw new HttpException(422, 'Base URL must be an https:// URL.');
        }
        if ($isDefault) {
            DB::exec('UPDATE couriers SET is_default = 0');
        }
        DB::update('couriers', [
            'is_enabled'  => $enabled ? 1 : 0,
            'is_default'  => $isDefault ? 1 : 0,
            'credentials' => Crypto::encryptArray($currentCreds),
            'settings'    => json_encode($cleanSettings, JSON_UNESCAPED_UNICODE),
        ], 'slug = ?', [$slug]);
        Audit::log('courier.config', 'courier', (int)$row['id'], null, ['slug' => $slug, 'enabled' => $enabled]);
    }

    public static function test(string $slug): CourierResult
    {
        $result = self::make($slug)->testConnection();
        DB::update('couriers', [
            'connected' => $result->ok ? 1 : 0,
            'last_tested_at' => date('Y-m-d H:i:s'),
            'last_error' => $result->ok ? null : mb_substr($result->message, 0, 490),
        ], 'slug = ?', [$slug]);
        return $result;
    }

    /**
     * Send an order to a courier. $overrides (admin-reviewed): name, phone, address, amount, note.
     */
    public static function send(array $order, string $slug, array $overrides): CourierResult
    {
        if (!in_array($order['status'], ['pending', 'confirmed', 'processing'], true)) {
            return CourierResult::fail('Only pending/confirmed/processing orders can be sent to a courier.');
        }
        $plugin = self::make($slug);
        if (!in_array(CourierPluginInterface::CAP_CREATE, $plugin->capabilities(), true)) {
            return CourierResult::unsupported('order creation');
        }
        if ((int)self::row($slug)['is_enabled'] !== 1) {
            return CourierResult::fail($plugin->name() . ' is disabled. Enable it in Plugins.');
        }
        $phone = normalize_phone((string)($overrides['phone'] ?? $order['phone']));
        $name = trim(clean_text((string)($overrides['name'] ?? $order['customer_name'])));
        $address = trim(clean_text((string)($overrides['address'] ?? $order['address'])));
        $amount = (float)($overrides['amount'] ?? $order['total']);
        if (!$phone || $name === '' || mb_strlen($address) < 5 || $amount < 0) {
            return CourierResult::fail('Name, valid phone, address and amount are required.');
        }
        $items = $order['items'];
        $parcel = [
            'invoice'     => $order['order_number'],
            'name'        => mb_substr($name, 0, 100),
            'phone'       => $phone,
            'address'     => mb_substr($address, 0, 400),
            'district'    => $order['district'],
            'amount'      => round($amount, 2),
            'note'        => mb_substr(trim(clean_text((string)($overrides['note'] ?? $order['note'] ?? ''))), 0, 250),
            'quantity'    => array_sum(array_map(static fn($i) => (int)$i['quantity'], $items)),
            'weight_kg'   => self::weightKg($items),
            'description' => mb_substr(implode(', ', array_map(static fn($i) => $i['product_name'] . ' x' . $i['quantity'], $items)), 0, 250),
        ];
        $result = $plugin->createOrder($parcel);
        if (!$result->ok) {
            Notification::create('courier_error', 'Courier failed: #' . $order['order_number'], $result->message, url('/admin/orders/' . $order['id']));
            Order::addHistory((int)$order['id'], 'courier_failed', $slug, null, $result->message);
            return $result;
        }
        DB::transaction(static function () use ($order, $slug, $parcel, $result) {
            DB::insert('courier_orders', [
                'order_id' => $order['id'], 'courier_slug' => $slug,
                'consignment_id' => $result->data['consignment_id'] ?: null,
                'tracking_code' => $result->data['tracking_code'] ?: null,
                'status' => $result->data['status'] ?? null,
                'cod_amount' => $parcel['amount'],
                'request_payload' => json_encode($parcel, JSON_UNESCAPED_UNICODE),
                'response_payload' => json_encode($result->raw, JSON_UNESCAPED_UNICODE),
                'created_by' => AdminAuth::id(),
            ]);
            DB::exec('UPDATE orders SET status = "sent_to_courier", courier_status = ? WHERE id = ?', [$result->data['status'] ?? 'created', $order['id']]);
            Order::addHistory((int)$order['id'], 'courier_sent', $slug, $order['status'], 'sent_to_courier (' . ($result->data['tracking_code'] ?? '') . ')');
        });
        Notification::create('courier', 'Sent to ' . $plugin->name() . ': #' . $order['order_number'], 'Tracking: ' . ($result->data['tracking_code'] ?? '-'), url('/admin/orders/' . $order['id']));
        Audit::log('courier.send', 'order', (int)$order['id'], null, ['courier' => $slug, 'tracking' => $result->data['tracking_code'] ?? null]);
        return $result;
    }

    /** Refresh a courier order's status and map terminal states onto the order. */
    public static function sync(array $courierOrder): CourierResult
    {
        $plugin = self::make($courierOrder['courier_slug']);
        $result = $plugin->checkStatus($courierOrder);
        if (!$result->ok) {
            return $result;
        }
        $status = mb_substr((string)$result->data['status'], 0, 60);
        DB::exec('UPDATE courier_orders SET status = ? WHERE id = ?', [$status, $courierOrder['id']]);
        DB::exec('UPDATE orders SET courier_status = ? WHERE id = ?', [$status, $courierOrder['order_id']]);
        $order = Order::find((int)$courierOrder['order_id']);
        if ($order) {
            $mapped = match (AbstractCourier::normalizeStatus($status)) {
                'delivered' => 'delivered',
                'returned', 'cancelled' => 'returned',
                'in_transit' => 'shipped',
                default => null,
            };
            if ($mapped && $mapped !== $order['status'] && !in_array($order['status'], ['delivered', 'returned', 'cancelled'], true)) {
                OrderService::changeStatus($order, $mapped, 'courier sync');
            }
        }
        return $result;
    }

    /** Fraud check with a 24-hour cache per phone. */
    public static function fraudCheck(string $phone, bool $refresh = false): CourierResult
    {
        $phone = normalize_phone($phone);
        if (!$phone) {
            return CourierResult::fail('Invalid phone number.');
        }
        $providers = self::enabledWith(CourierPluginInterface::CAP_FRAUD);
        if (!$providers) {
            return CourierResult::fail('No fraud-check courier is enabled (enable BD Courier in Plugins).');
        }
        $slug = array_key_first($providers);
        if (!$refresh) {
            $cached = DB::one('SELECT result, created_at FROM fraud_checks WHERE phone = ? AND provider = ? AND created_at > ? ORDER BY id DESC LIMIT 1',
                [$phone, $slug, date('Y-m-d H:i:s', time() - 86400)]);
            if ($cached) {
                return CourierResult::ok('Cached result from ' . $cached['created_at'], json_list($cached['result']) + ['cached_at' => $cached['created_at']]);
            }
        }
        $result = $providers[$slug]->fraudCheck($phone);
        if ($result->ok) {
            DB::insert('fraud_checks', ['phone' => $phone, 'provider' => $slug, 'result' => json_encode($result->data, JSON_UNESCAPED_UNICODE)]);
        }
        return $result;
    }

    private static function weightKg(array $items): float
    {
        $ids = array_values(array_filter(array_map(static fn($i) => (int)$i['product_id'], $items)));
        $weights = $ids ? array_column(DB::all('SELECT id, weight_grams FROM products WHERE id IN (' . DB::placeholders($ids) . ')', $ids), 'weight_grams', 'id') : [];
        $grams = 0;
        foreach ($items as $i) {
            $grams += (int)($weights[$i['product_id']] ?? 500) * (int)$i['quantity'];
        }
        return round(max(500, $grams) / 1000, 2);
    }
}
