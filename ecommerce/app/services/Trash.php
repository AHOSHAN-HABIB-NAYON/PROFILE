<?php
/**
 * Soft delete / restore / permanent delete for products, orders, categories, banners and coupons.
 */
final class Trash
{
    public const TYPES = [
        'product'  => ['table' => 'products',   'label' => 'name',         'name' => 'Product'],
        'order'    => ['table' => 'orders',     'label' => 'order_number', 'name' => 'Order'],
        'category' => ['table' => 'categories', 'label' => 'name',         'name' => 'Category'],
        'banner'   => ['table' => 'banners',    'label' => 'title',        'name' => 'Banner'],
        'coupon'   => ['table' => 'coupons',    'label' => 'code',         'name' => 'Coupon'],
    ];

    public static function softDelete(string $type, int $id): bool
    {
        $meta = self::meta($type);
        $row = DB::one("SELECT id, `{$meta['label']}` AS label FROM `{$meta['table']}` WHERE id = ? AND deleted_at IS NULL", [$id]);
        if (!$row) {
            return false;
        }
        DB::transaction(static function () use ($meta, $type, $id, $row) {
            DB::exec("UPDATE `{$meta['table']}` SET deleted_at = NOW() WHERE id = ?", [$id]);
            DB::exec(
                'INSERT INTO trash (entity_type, entity_id, label, deleted_by) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE deleted_at = NOW(), deleted_by = VALUES(deleted_by), label = VALUES(label)',
                [$type, $id, mb_substr((string)($row['label'] ?: '#' . $id), 0, 250), AdminAuth::id()]
            );
        });
        Audit::log($type . '.trash', $type, $id);
        self::afterChange($type);
        return true;
    }

    public static function restore(string $type, int $id): bool
    {
        $meta = self::meta($type);
        DB::exec("UPDATE `{$meta['table']}` SET deleted_at = NULL WHERE id = ?", [$id]);
        DB::exec('DELETE FROM trash WHERE entity_type = ? AND entity_id = ?', [$type, $id]);
        Audit::log($type . '.restore', $type, $id);
        self::afterChange($type);
        return true;
    }

    public static function purge(string $type, int $id): bool
    {
        $meta = self::meta($type);
        $row = DB::one("SELECT * FROM `{$meta['table']}` WHERE id = ? AND deleted_at IS NOT NULL", [$id]);
        if (!$row) {
            return false;
        }
        $files = self::filesFor($type, $row);
        DB::transaction(static function () use ($meta, $type, $id) {
            if ($type === 'category') {
                DB::exec('UPDATE categories SET parent_id = NULL WHERE parent_id = ?', [$id]);
            }
            DB::exec("DELETE FROM `{$meta['table']}` WHERE id = ?", [$id]);
            DB::exec('DELETE FROM trash WHERE entity_type = ? AND entity_id = ?', [$type, $id]);
        });
        foreach ($files as $f) {
            ImageService::deleteVariants($f['path'], $f['ext'], $f['type']);
        }
        Audit::log($type . '.purge', $type, $id, ['label' => $row[$meta['label']] ?? '']);
        self::afterChange($type);
        return true;
    }

    public static function items(?string $type = null): array
    {
        $sql = 'SELECT t.*, a.name AS admin_name FROM trash t LEFT JOIN admins a ON a.id = t.deleted_by';
        $params = [];
        if ($type && isset(self::TYPES[$type])) {
            $sql .= ' WHERE t.entity_type = ?';
            $params[] = $type;
        }
        return DB::all($sql . ' ORDER BY t.deleted_at DESC LIMIT 500', $params);
    }

    private static function filesFor(string $type, array $row): array
    {
        return match ($type) {
            'product'  => array_map(
                static fn($i) => ['path' => $i['path'], 'ext' => $i['ext'], 'type' => 'product'],
                DB::all('SELECT path, ext FROM product_images WHERE product_id = ?', [$row['id']])
            ),
            'banner'   => $row['image'] ? [['path' => $row['image'], 'ext' => $row['ext'], 'type' => 'banner']] : [],
            'category' => array_values(array_filter([
                $row['image'] ? ['path' => $row['image'], 'ext' => '', 'type' => 'single'] : null,
                $row['icon_image'] ? ['path' => $row['icon_image'], 'ext' => '', 'type' => 'single'] : null,
            ])),
            default => [],
        };
    }

    private static function meta(string $type): array
    {
        if (!isset(self::TYPES[$type])) {
            throw new HttpException(400);
        }
        return self::TYPES[$type];
    }

    private static function afterChange(string $type): void
    {
        if (in_array($type, ['product', 'category', 'banner', 'coupon'], true)) {
            Cache::catalogChanged();
        }
    }
}
