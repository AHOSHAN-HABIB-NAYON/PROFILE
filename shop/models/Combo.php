<?php
final class Combo
{
    public static function active(int $limit = 8): array
    {
        $combos = DB::all("SELECT * FROM combos WHERE is_active = 1 AND deleted_at IS NULL ORDER BY sort_order, id DESC LIMIT {$limit}");
        return self::withItems($combos);
    }

    public static function find(int $id, bool $activeOnly = true): ?array
    {
        $row = DB::one('SELECT * FROM combos WHERE id = ? AND deleted_at IS NULL' . ($activeOnly ? ' AND is_active = 1' : ''), [$id]);
        return $row ? self::withItems([$row])[0] : null;
    }

    public static function withItems(array $combos): array
    {
        if (!$combos) {
            return [];
        }
        $ids = array_column($combos, 'id');
        $items = DB::all('SELECT ci.combo_id, ci.product_id, ci.quantity, p.name, p.slug, p.stock, p.is_active, p.deleted_at
            FROM combo_items ci JOIN products p ON p.id = ci.product_id WHERE ci.combo_id IN (' . DB::in($ids) . ')', $ids);
        $by = [];
        foreach ($items as $it) {
            $by[$it['combo_id']][] = $it;
        }
        foreach ($combos as &$c) {
            $c['items'] = $by[$c['id']] ?? [];
            $orig = (float) ($c['original_price'] ?? 0);
            $c['discount_pct'] = $orig > (float) $c['price'] ? (int) round(($orig - $c['price']) / $orig * 100) : 0;
        }
        return $combos;
    }
}
