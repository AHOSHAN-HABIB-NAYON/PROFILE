<?php
final class StockService
{
    /** Put an order's items back into inventory (cancel/return/fail). Call inside a transaction. */
    public static function restore(array $order): void
    {
        if (!(int) $order['stock_deducted']) {
            return;
        }
        foreach (Order::items((int) $order['id']) as $it) {
            if ($it['item_type'] === 'combo' && $it['combo_id']) {
                DB::run('UPDATE combos SET stock = stock + ? WHERE id = ?', [$it['quantity'], $it['combo_id']]);
            } elseif ($it['product_id']) {
                DB::run('UPDATE products SET stock = stock + ?, sold = GREATEST(0, sold - ?) WHERE id = ?', [$it['quantity'], $it['quantity'], $it['product_id']]);
            }
        }
        DB::update('orders', ['stock_deducted' => 0], 'id = ?', [$order['id']]);
    }

    /** Re-reserve stock when a cancelled order is re-activated. Returns error text on shortage. */
    public static function deduct(array $order): ?string
    {
        if ((int) $order['stock_deducted']) {
            return null;
        }
        foreach (Order::items((int) $order['id']) as $it) {
            if ($it['item_type'] === 'combo' && $it['combo_id']) {
                $ok = DB::run('UPDATE combos SET stock = stock - ? WHERE id = ? AND stock >= ?', [$it['quantity'], $it['combo_id'], $it['quantity']])->rowCount();
            } elseif ($it['product_id']) {
                $ok = DB::run('UPDATE products SET stock = stock - ?, sold = sold + ? WHERE id = ? AND stock >= ?', [$it['quantity'], $it['quantity'], $it['product_id'], $it['quantity']])->rowCount();
            } else {
                $ok = 1;
            }
            if (!$ok) {
                throw new DomainException('"' . $it['name'] . '" পর্যাপ্ত স্টকে নেই।');
            }
        }
        DB::update('orders', ['stock_deducted' => 1], 'id = ?', [$order['id']]);
        return null;
    }

    public static function notifyLow(array $productIds): void
    {
        if (!$productIds) {
            return;
        }
        $default = (int) setting('low_stock_threshold', 10);
        $rows = DB::all('SELECT id, name, stock, low_stock_threshold FROM products WHERE id IN (' . DB::in($productIds) . ')', array_values($productIds));
        foreach ($rows as $r) {
            $th = $r['low_stock_threshold'] !== null ? (int) $r['low_stock_threshold'] : $default;
            if ((int) $r['stock'] <= $th) {
                Notifier::add('low_stock', (int) $r['stock'] <= 0 ? 'স্টক শেষ' : 'লো স্টক অ্যালার্ট', $r['name'] . ' — বর্তমান স্টক: ' . bn_num($r['stock']), '/admin/stock');
            }
        }
    }
}
