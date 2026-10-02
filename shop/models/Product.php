<?php
final class Product
{
    private const SELECT = "SELECT p.*, c.name AS category_name, c.slug AS category_slug,
        (SELECT pi.path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order, pi.id LIMIT 1) AS image,
        (SELECT GROUP_CONCAT(CONCAT(ps.size, ':', ps.is_available) ORDER BY ps.sort_order, ps.id SEPARATOR '|') FROM product_sizes ps WHERE ps.product_id = p.id) AS size_list
        FROM products p LEFT JOIN categories c ON c.id = p.category_id";

    private const VISIBLE = 'p.is_active = 1 AND p.deleted_at IS NULL';

    /** Adds computed pricing/stock fields. Price is always derived server-side. */
    public static function decorate(array $p): array
    {
        $now = time();
        $flashActive = Settings::on('flash_enabled') && (int) $p['is_flash'] === 1 && $p['flash_price'] !== null
            && (!$p['flash_start'] || strtotime($p['flash_start']) <= $now)
            && (!$p['flash_end'] || strtotime($p['flash_end']) > $now);
        $price = $flashActive ? (float) $p['flash_price'] : (float) $p['price'];
        $old = $flashActive ? max((float) $p['price'], (float) ($p['old_price'] ?? 0)) : (float) ($p['old_price'] ?? 0);
        $p['flash_active'] = $flashActive;
        $p['effective_price'] = $price;
        $p['compare_price'] = $old > $price ? $old : null;
        $p['discount_pct'] = $old > $price && $old > 0 ? (int) round(($old - $price) / $old * 100) : 0;
        $threshold = $p['low_stock_threshold'] !== null ? (int) $p['low_stock_threshold'] : (int) setting('low_stock_threshold', 10);
        $p['stock_status'] = $p['stock'] <= 0 ? 'out' : ($p['stock'] <= $threshold ? 'low' : 'in');
        $p['free_delivery'] = Settings::on('free_delivery_enabled') && (int) $p['free_delivery'] === 1;
        $sizes = [];
        if (!empty($p['size_list'])) {
            foreach (explode('|', $p['size_list']) as $s) {
                $pos = strrpos($s, ':');
                $sizes[] = ['size' => substr($s, 0, $pos), 'available' => substr($s, $pos + 1) === '1'];
            }
        }
        $p['sizes'] = $sizes;
        return $p;
    }

    private static function many(string $where, array $params, string $order = 'p.created_at DESC', int $limit = 12, int $offset = 0): array
    {
        $rows = DB::all(self::SELECT . " WHERE {$where} ORDER BY {$order} LIMIT {$limit} OFFSET {$offset}", $params);
        return array_map([self::class, 'decorate'], $rows);
    }

    public static function find(int $id, bool $visibleOnly = true): ?array
    {
        $row = DB::one(self::SELECT . ' WHERE p.id = ?' . ($visibleOnly ? ' AND ' . self::VISIBLE : ''), [$id]);
        return $row ? self::decorate($row) : null;
    }

    public static function findBySlug(string $slug): ?array
    {
        $row = DB::one(self::SELECT . ' WHERE p.slug = ? AND ' . self::VISIBLE, [$slug]);
        return $row ? self::decorate($row) : null;
    }

    public static function images(int $id): array
    {
        return DB::all('SELECT id, path, width, height FROM product_images WHERE product_id = ? ORDER BY sort_order, id', [$id]);
    }

    public static function sizes(int $id): array
    {
        return DB::all('SELECT id, size, is_available FROM product_sizes WHERE product_id = ? ORDER BY sort_order, id', [$id]);
    }

    public static function sortSql(string $sort): string
    {
        return match ($sort) {
            'price_asc'  => 'p.price ASC',
            'price_desc' => 'p.price DESC',
            'popular'    => 'p.sold DESC, p.views DESC',
            default      => 'p.created_at DESC',
        };
    }

    /** @return array{0: array, 1: int} */
    public static function paginate(array $f, int $page, int $perPage): array
    {
        $where = [self::VISIBLE];
        $params = [];
        if (!empty($f['category_id'])) {
            $where[] = 'p.category_id = ?';
            $params[] = (int) $f['category_id'];
        }
        if (!empty($f['q'])) {
            $where[] = '(p.name LIKE ? OR p.sku = ? OR c.name LIKE ? OR p.short_description LIKE ?)';
            $like = '%' . addcslashes($f['q'], '%_\\') . '%';
            array_push($params, $like, $f['q'], $like, $like);
        }
        if (!empty($f['flash'])) {
            $where[] = 'p.is_flash = 1 AND (p.flash_end IS NULL OR p.flash_end > NOW()) AND (p.flash_start IS NULL OR p.flash_start <= NOW())';
        }
        if (!empty($f['free'])) {
            $where[] = 'p.free_delivery = 1';
        }
        if (!empty($f['featured'])) {
            $where[] = 'p.is_featured = 1';
        }
        $w = implode(' AND ', $where);
        $total = (int) DB::val("SELECT COUNT(*) FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE {$w}", $params);
        $page = max(1, $page);
        $items = self::many($w, $params, self::sortSql($f['sort'] ?? ''), $perPage, ($page - 1) * $perPage);
        return [$items, $total];
    }

    public static function latest(int $limit): array
    {
        return self::many(self::VISIBLE, [], 'p.created_at DESC', $limit);
    }

    public static function featured(int $limit): array
    {
        return self::many(self::VISIBLE . ' AND p.is_featured = 1', [], 'p.updated_at DESC', $limit);
    }

    public static function flash(int $limit): array
    {
        return self::many(self::VISIBLE . ' AND p.is_flash = 1 AND p.flash_price IS NOT NULL AND (p.flash_start IS NULL OR p.flash_start <= NOW()) AND (p.flash_end IS NULL OR p.flash_end > NOW())', [], 'p.flash_end IS NULL, p.flash_end ASC', $limit);
    }

    public static function freeDelivery(int $limit): array
    {
        return self::many(self::VISIBLE . ' AND p.free_delivery = 1', [], 'p.sold DESC, p.created_at DESC', $limit);
    }

    public static function recommended(int $limit): array
    {
        return self::many(self::VISIBLE . ' AND p.stock > 0', [], 'p.sold DESC, p.views DESC', $limit);
    }

    public static function related(array $p, int $limit = 8): array
    {
        $manual = self::many(self::VISIBLE . ' AND p.id IN (SELECT related_id FROM product_related WHERE product_id = ?)', [$p['id']], 'p.sold DESC', $limit);
        if (count($manual) >= $limit) {
            return $manual;
        }
        $exclude = array_merge([$p['id']], array_column($manual, 'id'));
        $more = self::many(self::VISIBLE . ' AND p.category_id <=> ? AND p.id NOT IN (' . DB::in($exclude) . ')', array_merge([$p['category_id']], $exclude), 'p.sold DESC, p.created_at DESC', $limit - count($manual));
        $all = array_merge($manual, $more);
        if (count($all) < $limit) {
            $exclude = array_merge($exclude, array_column($more, 'id'));
            $all = array_merge($all, self::many(self::VISIBLE . ' AND p.id NOT IN (' . DB::in($exclude) . ')', $exclude, 'p.sold DESC', $limit - count($all)));
        }
        return $all;
    }

    public static function search(string $q, int $limit = 8): array
    {
        $like = '%' . addcslashes($q, '%_\\') . '%';
        return self::many(self::VISIBLE . ' AND (p.name LIKE ? OR p.sku = ? OR c.name LIKE ?)', [$like, $q, $like], 'p.sold DESC', $limit);
    }

    /** Lightweight card data for JSON (search suggestions, cart). */
    public static function card(array $p): array
    {
        return [
            'id' => (int) $p['id'], 'name' => $p['name'], 'slug' => $p['slug'],
            'url' => '/product/' . rawurlencode($p['slug']),
            'image' => img_url($p['image'], 'sm'),
            'price' => $p['effective_price'], 'price_text' => money($p['effective_price']),
            'old_price_text' => $p['compare_price'] ? money($p['compare_price']) : null,
            'category' => $p['category_name'],
        ];
    }
}
