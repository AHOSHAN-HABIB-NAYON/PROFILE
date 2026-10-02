<?php
/**
 * Guest cart (no customer accounts). Identified by an HttpOnly token cookie and stored in `carts`.
 * Only ids/sizes/quantities are stored — prices are always recomputed from the database.
 */
final class CartService
{
    private const COOKIE = 'cart_token';
    private const MAX_QTY = 20;
    private static ?array $state = null;

    private static function token(bool $create = false): ?string
    {
        $t = $_COOKIE[self::COOKIE] ?? '';
        if (is_string($t) && preg_match('/^[a-f0-9]{40}$/', $t)) {
            return $t;
        }
        if (!$create) {
            return null;
        }
        $t = bin2hex(random_bytes(20));
        setcookie(self::COOKIE, $t, ['expires' => time() + 86400 * 30, 'path' => '/', 'secure' => Request::isHttps(), 'httponly' => true, 'samesite' => 'Lax']);
        $_COOKIE[self::COOKIE] = $t;
        return $t;
    }

    public static function state(): array
    {
        if (self::$state !== null) {
            return self::$state;
        }
        $token = self::token();
        $row = $token ? DB::one('SELECT items, coupon_code FROM carts WHERE token = ?', [$token]) : null;
        $items = $row ? (json_decode($row['items'], true) ?: []) : [];
        return self::$state = ['items' => $items, 'coupon' => $row['coupon_code'] ?? null];
    }

    private static function save(array $state): void
    {
        $token = self::token(true);
        self::$state = $state;
        DB::run('INSERT INTO carts (token, items, coupon_code) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE items = VALUES(items), coupon_code = VALUES(coupon_code)', [
            $token, json_encode(array_values($state['items']), JSON_UNESCAPED_UNICODE), $state['coupon'],
        ]);
    }

    public static function key(string $type, int $id, ?string $size): string
    {
        return $type[0] . ':' . $id . ':' . ($size ?? '');
    }

    /** @return string|null error message */
    public static function add(string $type, int $id, ?string $size, int $qty): ?string
    {
        $qty = max(1, min(self::MAX_QTY, $qty));
        if ($type === 'combo') {
            if (!Settings::on('combo_enabled')) {
                return 'কম্বো অফারটি এখন বন্ধ আছে।';
            }
            $combo = Combo::find($id);
            if (!$combo) {
                return 'দুঃখিত, এই কম্বোটি পাওয়া যায়নি।';
            }
            if ((int) $combo['stock'] <= 0) {
                return 'দুঃখিত, এই পণ্যটি বর্তমানে স্টকে নেই।';
            }
            $size = null;
            $stock = (int) $combo['stock'];
        } else {
            $p = Product::find($id);
            if (!$p) {
                return 'দুঃখিত, পণ্যটি পাওয়া যায়নি।';
            }
            if ($p['stock'] <= 0) {
                return 'দুঃখিত, এই পণ্যটি বর্তমানে স্টকে নেই।';
            }
            if ($p['sizes']) {
                $valid = array_column(array_filter($p['sizes'], static fn ($s) => $s['available']), 'size');
                if ($size === null || $size === '') {
                    return 'দয়া করে সাইজ নির্বাচন করুন।';
                }
                if (!in_array($size, $valid, true)) {
                    return 'নির্বাচিত সাইজটি বর্তমানে পাওয়া যাচ্ছে না।';
                }
            } else {
                $size = null;
            }
            $stock = (int) $p['stock'];
        }
        $state = self::state();
        $key = self::key($type, $id, $size);
        $existing = 0;
        foreach ($state['items'] as $i => $it) {
            if ($it['key'] === $key) {
                $existing = (int) $it['qty'];
                unset($state['items'][$i]);
            }
        }
        $newQty = min(self::MAX_QTY, $existing + $qty);
        if ($newQty > $stock) {
            return 'দুঃখিত, স্টকে মাত্র ' . bn_num($stock) . 'টি আছে।';
        }
        $state['items'][] = ['key' => $key, 'type' => $type, 'id' => $id, 'size' => $size, 'qty' => $newQty];
        self::save($state);
        return null;
    }

    public static function update(string $key, int $qty): ?string
    {
        $state = self::state();
        foreach ($state['items'] as $i => $it) {
            if ($it['key'] !== $key) {
                continue;
            }
            if ($qty <= 0) {
                unset($state['items'][$i]);
            } else {
                $stock = $it['type'] === 'combo' ? (int) (Combo::find((int) $it['id'])['stock'] ?? 0) : (int) (Product::find((int) $it['id'])['stock'] ?? 0);
                if ($qty > $stock) {
                    return 'দুঃখিত, স্টকে মাত্র ' . bn_num($stock) . 'টি আছে।';
                }
                $state['items'][$i]['qty'] = min(self::MAX_QTY, $qty);
            }
            self::save($state);
            return null;
        }
        return 'পণ্যটি কার্টে পাওয়া যায়নি।';
    }

    public static function remove(string $key): void
    {
        $state = self::state();
        $state['items'] = array_values(array_filter($state['items'], static fn ($it) => $it['key'] !== $key));
        self::save($state);
    }

    public static function setCoupon(?string $code): void
    {
        $state = self::state();
        $state['coupon'] = $code ? mb_strtoupper(trim($code)) : null;
        self::save($state);
    }

    public static function clear(): void
    {
        $token = self::token();
        if ($token) {
            DB::run('DELETE FROM carts WHERE token = ?', [$token]);
        }
        self::$state = ['items' => [], 'coupon' => null];
    }

    public static function count(): int
    {
        return array_sum(array_map(static fn ($i) => (int) $i['qty'], self::state()['items']));
    }

    /**
     * Server-side pricing of the whole cart.
     * @param bool $lock use SELECT … FOR UPDATE (inside the order transaction)
     */
    public static function summary(string $district = '', bool $lock = false, ?array $state = null): array
    {
        $state ??= self::state();
        $lines = [];
        $notices = [];
        $allFree = true;
        $productIds = [];
        $comboIds = [];
        foreach ($state['items'] as $it) {
            $it['type'] === 'combo' ? $comboIds[] = (int) $it['id'] : $productIds[] = (int) $it['id'];
        }
        $products = [];
        if ($productIds) {
            $ids = array_values(array_unique($productIds));
            sort($ids);
            if ($lock) {
                DB::all('SELECT id FROM products WHERE id IN (' . DB::in($ids) . ') ORDER BY id FOR UPDATE', $ids);
            }
            foreach ($ids as $id) {
                if ($p = Product::find($id)) {
                    $products[$id] = $p;
                }
            }
        }
        $combos = [];
        if ($comboIds) {
            $ids = array_values(array_unique($comboIds));
            sort($ids);
            if ($lock) {
                DB::all('SELECT id FROM combos WHERE id IN (' . DB::in($ids) . ') ORDER BY id FOR UPDATE', $ids);
            }
            foreach ($ids as $id) {
                if (Settings::on('combo_enabled') && ($c = Combo::find($id))) {
                    $combos[$id] = $c;
                }
            }
        }
        $subtotal = 0.0;
        $stockUse = [];
        foreach ($state['items'] as $it) {
            $qty = (int) $it['qty'];
            if ($it['type'] === 'combo') {
                $c = $combos[$it['id']] ?? null;
                if (!$c) {
                    $notices[] = 'একটি কম্বো অফার আর পাওয়া যাচ্ছে না, তাই কার্ট থেকে সরানো হয়েছে।';
                    continue;
                }
                $price = (float) $c['price'];
                $stock = (int) $c['stock'];
                $free = (int) $c['free_delivery'] === 1 && Settings::on('free_delivery_enabled');
                $line = ['key' => $it['key'], 'type' => 'combo', 'id' => (int) $c['id'], 'name' => $c['name'], 'size' => null,
                    'image' => $c['image'], 'url' => '/#combo', 'unit_price' => $price, 'old_price' => $c['original_price'] ? (float) $c['original_price'] : null];
            } else {
                $p = $products[$it['id']] ?? null;
                if (!$p) {
                    $notices[] = 'একটি পণ্য আর পাওয়া যাচ্ছে না, তাই কার্ট থেকে সরানো হয়েছে।';
                    continue;
                }
                $price = (float) $p['effective_price'];
                $stock = (int) $p['stock'];
                $free = $p['free_delivery'];
                $line = ['key' => $it['key'], 'type' => 'product', 'id' => (int) $p['id'], 'name' => $p['name'], 'size' => $it['size'],
                    'image' => $p['image'], 'url' => '/product/' . rawurlencode($p['slug']), 'unit_price' => $price, 'old_price' => $p['compare_price']];
                if ($p['sizes'] && !in_array($it['size'], array_column(array_filter($p['sizes'], static fn ($s) => $s['available']), 'size'), true)) {
                    $line['error'] = 'নির্বাচিত সাইজটি বর্তমানে পাওয়া যাচ্ছে না।';
                }
            }
            $useKey = $line['type'] . ':' . $line['id'];
            $stockUse[$useKey] = ($stockUse[$useKey] ?? 0) + $qty;
            if ($stock <= 0) {
                $line['error'] = 'দুঃখিত, এই পণ্যটি বর্তমানে স্টকে নেই।';
            } elseif ($stockUse[$useKey] > $stock) {
                $line['error'] = 'স্টকে মাত্র ' . bn_num($stock) . 'টি আছে।';
            }
            $allFree = $allFree && $free;
            $line['free_delivery'] = $free;
            $line['qty'] = $qty;
            $line['stock'] = $stock;
            $line['line_total'] = round($price * $qty, 2);
            $line['image_url'] = img_url($line['image'], 'sm');
            $subtotal += $line['line_total'];
            $lines[] = $line;
        }
        $allFree = $allFree && $lines !== [];
        $coupon = CouponService::evaluate($state['coupon'], $subtotal, $lock);
        $delivery = DeliveryService::quote($district, $allFree);
        $discount = $coupon['discount'];
        return [
            'lines'          => $lines,
            'count'          => array_sum(array_column($lines, 'qty')),
            'subtotal'       => round($subtotal, 2),
            'discount'       => round($discount, 2),
            'coupon_code'    => $coupon['coupon']['code'] ?? null,
            'coupon_id'      => $coupon['coupon']['id'] ?? null,
            'coupon_error'   => $state['coupon'] ? $coupon['error'] : null,
            'delivery'       => $delivery,
            'delivery_charge'=> $delivery['charge'],
            'free_delivery'  => $allFree,
            'total'          => round(max(0, $subtotal - $discount) + $delivery['charge'], 2),
            'has_errors'     => (bool) array_filter($lines, static fn ($l) => isset($l['error'])),
            'notices'        => $notices,
        ];
    }

    /** JSON-safe summary with Bengali formatted amounts for the UI. */
    public static function forClient(array $s): array
    {
        $s['lines'] = array_map(static function ($l) {
            $l['unit_price_text'] = money($l['unit_price']);
            $l['old_price_text'] = $l['old_price'] ? money($l['old_price']) : null;
            $l['line_total_text'] = money($l['line_total']);
            unset($l['image'], $l['stock']);
            return $l;
        }, $s['lines']);
        foreach (['subtotal', 'discount', 'delivery_charge', 'total'] as $k) {
            $s[$k . '_text'] = money($s[$k]);
        }
        unset($s['coupon_id']);
        return $s;
    }
}
