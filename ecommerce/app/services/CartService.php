<?php
/**
 * Server-side cart pricing. The browser keeps only {product_id, size, color, qty};
 * every price, stock level, delivery charge and discount is computed here.
 */
final class CartService
{
    public const MAX_LINES = 30;
    public const MAX_QTY = 20;

    /**
     * @param array $items [{product_id, size?, color?, qty}]
     */
    public static function price(array $items, string $couponCode = '', string $district = '', ?string $phone = null): array
    {
        $items = array_slice(array_values(array_filter($items, 'is_array')), 0, self::MAX_LINES);
        $ids = array_values(array_unique(array_filter(array_map(static fn($i) => (int)($i['product_id'] ?? 0), $items))));
        $products = [];
        $variants = [];
        if ($ids) {
            $ph = DB::placeholders($ids);
            foreach (DB::all(
                "SELECT p.id, p.name, p.slug, p.sku, p.price, p.old_price, p.stock, p.track_stock, p.allow_backorder, p.sizes, p.colors,
                        p.is_free_delivery, p.category_id, c.is_free_delivery AS category_free,
                        (SELECT CONCAT(i.path, '|', i.ext) FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image
                 FROM products p LEFT JOIN categories c ON c.id = p.category_id
                 WHERE p.id IN ($ph) AND p.deleted_at IS NULL AND p.status = 'active'",
                $ids
            ) as $row) {
                $products[(int)$row['id']] = Product::hydrate($row);
            }
            foreach (DB::all("SELECT id, product_id, size, color, sku, price, stock FROM product_variants WHERE product_id IN ($ph) AND status = 'active'", $ids) as $v) {
                $variants[(int)$v['product_id']][] = $v;
            }
        }

        $lines = [];
        $errors = [];
        $subtotal = 0.0;
        $allFree = true;
        $count = 0;
        foreach ($items as $item) {
            $pid = (int)($item['product_id'] ?? 0);
            $p = $products[$pid] ?? null;
            $size = mb_substr(trim((string)($item['size'] ?? '')), 0, 60);
            $color = mb_substr(trim((string)($item['color'] ?? '')), 0, 60);
            $qty = max(1, min(self::MAX_QTY, (int)($item['qty'] ?? 1)));
            $key = $pid . '|' . $size . '|' . $color;
            if (!$p) {
                $lines[] = ['key' => $key, 'product_id' => $pid, 'available' => false, 'message' => 'পণ্যটি আর পাওয়া যাচ্ছে না।', 'name' => '', 'qty' => 0, 'line_total' => 0];
                continue;
            }
            $line = [
                'key' => $key, 'product_id' => $pid, 'variant_id' => null, 'name' => $p['name'], 'slug' => $p['slug'],
                'url' => Product::url($p), 'sku' => $p['sku'],
                'image' => packed_image_url($p['image']), 'image_path' => $p['image'],
                'size' => $size, 'color' => $color, 'qty' => $qty, 'unit_price' => (float)$p['price'],
                'old_price' => $p['old_price'] !== null ? (float)$p['old_price'] : null,
                'available' => true, 'message' => null, 'max_qty' => self::MAX_QTY,
            ];
            if ($p['sizes'] !== [] && !in_array($size, $p['sizes'], true)) {
                $line['available'] = false;
                $line['message'] = 'সাইজ নির্বাচন করুন';
            }
            $colorNames = array_column($p['colors'], 'name');
            if ($line['available'] && $colorNames !== [] && !in_array($color, $colorNames, true)) {
                $line['available'] = false;
                $line['message'] = 'রং নির্বাচন করুন';
            }
            $variant = null;
            if ($line['available'] && !empty($variants[$pid])) {
                foreach ($variants[$pid] as $v) {
                    if ((string)$v['size'] === $size && (string)$v['color'] === $color) {
                        $variant = $v;
                        break;
                    }
                }
                if ($variant) {
                    $line['variant_id'] = (int)$variant['id'];
                    if ($variant['price'] !== null) {
                        $line['unit_price'] = (float)$variant['price'];
                    }
                    if ($variant['sku']) {
                        $line['sku'] = $variant['sku'];
                    }
                }
            }
            if ($line['available'] && (int)$p['track_stock'] === 1 && !Product::canBackorder($p)) {
                $stock = $variant ? (int)$variant['stock'] : (int)$p['stock'];
                if ($stock <= 0) {
                    $line['available'] = false;
                    $line['message'] = 'স্টক শেষ';
                } else {
                    $line['max_qty'] = min(self::MAX_QTY, $stock);
                    if ($qty > $stock) {
                        $line['qty'] = $qty = $stock;
                        $line['message'] = 'স্টকে মাত্র ' . num($stock) . 'টি আছে';
                    }
                }
            }
            $line['line_total'] = $line['available'] ? round($line['unit_price'] * $qty, 2) : 0.0;
            if ($line['available']) {
                $subtotal += $line['line_total'];
                $count += $qty;
                if ((int)$p['is_free_delivery'] !== 1 && (int)($p['category_free'] ?? 0) !== 1) {
                    $allFree = false;
                }
            } elseif ($line['message']) {
                $errors[] = $p['name'] . ': ' . $line['message'];
            }
            $lines[] = $line;
        }

        $zone = $district !== '' ? self::zoneFor($district) : null;
        $freeReason = null;
        if ($count > 0 && $allFree) {
            $freeReason = 'ফ্রি ডেলিভারি পণ্য';
        } elseif (setting('free_delivery_enabled') === '1') {
            $threshold = (float)setting('free_delivery_threshold', 0);
            if ($threshold <= 0) {
                $freeReason = 'ফ্রি ডেলিভারি অফার';
            } elseif ($subtotal >= $threshold) {
                $freeReason = money($threshold) . '+ অর্ডারে ফ্রি ডেলিভারি';
            }
        }
        $delivery = 0.0;
        if ($count > 0 && $freeReason === null && $zone !== null) {
            $delivery = (float)setting($zone === 'inside' ? 'delivery_inside' : 'delivery_outside', 0);
        }

        $couponResult = Coupon::evaluate($couponCode, $subtotal, $phone);
        $discount = $count > 0 ? $couponResult['discount'] : 0.0;
        $total = max(0, round($subtotal - $discount + $delivery, 2));

        return [
            'lines'          => $lines,
            'item_count'     => $count,
            'subtotal'       => round($subtotal, 2),
            'delivery_zone'  => $zone,
            'delivery_charge'=> $delivery,
            'delivery_free'  => $freeReason,
            'delivery_rates' => ['inside' => (float)setting('delivery_inside'), 'outside' => (float)setting('delivery_outside')],
            'discount'       => $discount,
            'coupon'         => $couponResult['coupon'] ? ['id' => (int)$couponResult['coupon']['id'], 'code' => $couponResult['coupon']['code'], 'label' => Coupon::label($couponResult['coupon'])] : null,
            'coupon_error'   => $couponResult['error'],
            'total'          => $total,
            'errors'         => $errors,
        ];
    }

    public static function zoneFor(string $district): string
    {
        $inside = array_filter(array_map('trim', explode(',', (string)setting('inside_districts', 'ঢাকা'))));
        return in_array(trim($district), $inside, true) ? 'inside' : 'outside';
    }

    /** Format a priced cart for JSON (adds display strings). */
    public static function present(array $cart): array
    {
        foreach ($cart['lines'] as &$l) {
            if (!empty($l['available'])) {
                $l['unit_price_text'] = money($l['unit_price']);
                $l['old_price_text'] = $l['old_price'] && $l['old_price'] > $l['unit_price'] ? money($l['old_price']) : null;
                $l['line_total_text'] = money($l['line_total']);
            }
            unset($l['image_path']);
        }
        unset($l);
        $cart['subtotal_text'] = money($cart['subtotal']);
        $cart['delivery_text'] = $cart['delivery_free'] ? 'ফ্রি' : ($cart['delivery_zone'] ? money($cart['delivery_charge']) : 'জেলা নির্বাচন করুন');
        $cart['discount_text'] = money($cart['discount']);
        $cart['total_text'] = money($cart['total']);
        return $cart;
    }
}
