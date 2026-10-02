<?php
/** Soft delete → Trash → Restore / Permanent delete. */
final class TrashService
{
    public const ENTITIES = [
        'product'  => ['table' => 'products', 'title' => 'name', 'label' => 'পণ্য'],
        'order'    => ['table' => 'orders', 'title' => 'order_code', 'label' => 'অর্ডার'],
        'category' => ['table' => 'categories', 'title' => 'name', 'label' => 'ক্যাটাগরি'],
        'banner'   => ['table' => 'banners', 'title' => 'title', 'label' => 'ব্যানার'],
        'coupon'   => ['table' => 'coupons', 'title' => 'code', 'label' => 'কুপন'],
        'combo'    => ['table' => 'combos', 'title' => 'name', 'label' => 'কম্বো'],
    ];

    public static function trash(string $entity, int $id): bool
    {
        $e = self::ENTITIES[$entity] ?? null;
        if (!$e) {
            return false;
        }
        $row = DB::one("SELECT * FROM `{$e['table']}` WHERE id = ? AND deleted_at IS NULL", [$id]);
        if (!$row) {
            return false;
        }
        DB::transaction(static function () use ($e, $entity, $id, $row) {
            DB::update($e['table'], ['deleted_at' => date('Y-m-d H:i:s')], 'id = ?', [$id]);
            DB::run('INSERT INTO trash (entity, entity_id, title, admin_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE deleted_at = NOW(), title = VALUES(title)',
                [$entity, $id, mb_substr((string) ($row[$e['title']] ?: ('#' . $id)), 0, 255), Auth::id()]);
        });
        return true;
    }

    public static function restore(int $trashId): bool
    {
        $t = DB::one('SELECT * FROM trash WHERE id = ?', [$trashId]);
        $e = $t ? (self::ENTITIES[$t['entity']] ?? null) : null;
        if (!$e) {
            return false;
        }
        DB::transaction(static function () use ($e, $t) {
            DB::update($e['table'], ['deleted_at' => null], 'id = ?', [$t['entity_id']]);
            DB::run('DELETE FROM trash WHERE id = ?', [$t['id']]);
        });
        return true;
    }

    public static function purge(int $trashId): bool
    {
        $t = DB::one('SELECT * FROM trash WHERE id = ?', [$trashId]);
        $e = $t ? (self::ENTITIES[$t['entity']] ?? null) : null;
        if (!$e) {
            return false;
        }
        $id = (int) $t['entity_id'];
        $files = [];
        DB::transaction(static function () use ($t, $e, $id, &$files) {
            switch ($t['entity']) {
                case 'product':
                    $files = DB::all('SELECT path FROM product_images WHERE product_id = ?', [$id]);
                    $files = array_column($files, 'path');
                    $files[] = DB::val('SELECT og_image FROM products WHERE id = ?', [$id]);
                    DB::run('DELETE FROM combo_items WHERE product_id = ?', [$id]);
                    break;
                case 'order':
                    $order = Order::find($id, true);
                    if ($order && !in_array($order['status'], ['delivered'], true)) {
                        StockService::restore($order);
                    }
                    break;
                case 'category':
                    DB::run('UPDATE products SET category_id = NULL WHERE category_id = ?', [$id]);
                    $files[] = DB::val('SELECT image FROM categories WHERE id = ?', [$id]);
                    break;
                case 'banner':
                case 'combo':
                    $files[] = DB::val("SELECT image FROM `{$e['table']}` WHERE id = ?", [$id]);
                    break;
            }
            DB::run("DELETE FROM `{$e['table']}` WHERE id = ? AND deleted_at IS NOT NULL", [$id]);
            DB::run('DELETE FROM trash WHERE id = ?', [$t['id']]);
        });
        foreach (array_filter($files) as $f) {
            ImageProcessor::delete($f);
        }
        return true;
    }
}
