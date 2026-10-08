<?php
/**
 * Product queries and product-level business rules (stock, discount, variants).
 */
final class Product
{
    public const CARD_COLS = 'p.id, p.name, p.slug, p.price, p.old_price, p.stock, p.track_stock, p.allow_backorder,
        p.is_free_delivery, p.is_flash_sale, p.is_combo, p.is_featured, p.sizes, p.colors, p.sold_count, p.category_id,
        (SELECT CONCAT(i.path, "|", i.ext) FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image';

    public const SORTS = [
        'manual'     => 'p.sort_order ASC, p.id DESC',
        'latest'     => 'p.id DESC',
        'popular'    => 'p.sold_count DESC, p.views DESC, p.id DESC',
        'price_asc'  => 'p.price ASC, p.id DESC',
        'price_desc' => 'p.price DESC, p.id DESC',
    ];

    public const SORT_LABELS = [
        'manual'     => 'প্রস্তাবিত',
        'latest'     => 'নতুন',
        'popular'    => 'জনপ্রিয়',
        'price_asc'  => 'দাম: কম থেকে বেশি',
        'price_desc' => 'দাম: বেশি থেকে কম',
    ];

    private const VISIBLE = 'p.deleted_at IS NULL AND p.status = "active"';

    /** Home page section (flag = featured|flash|combo|free_delivery|popular|latest). Cached. */
    public static function section(string $flag, int $limit, string $sort): array
    {
        $limit = max(1, min(48, $limit));
        return Cache::remember("catalog:section:$flag:$limit:$sort", 600, static function () use ($flag, $limit, $sort) {
            $where = self::VISIBLE;
            $where .= match ($flag) {
                'featured'      => ' AND p.is_featured = 1',
                'flash'         => ' AND p.is_flash_sale = 1',
                'combo'         => ' AND p.is_combo = 1',
                'free_delivery' => ' AND p.is_free_delivery = 1',
                default         => '',
            };
            $order = self::SORTS[$sort] ?? self::SORTS['manual'];
            return self::hydrateCards(DB::all('SELECT ' . self::CARD_COLS . " FROM products p WHERE $where ORDER BY $order LIMIT $limit"));
        });
    }

    /**
     * Filtered, paginated listing.
     * @return array{items: array, total: int, page: int, pages: int, per_page: int}
     */
    public static function listing(array $f): array
    {
        $where = [self::VISIBLE];
        $params = [];
        if (!empty($f['category_ids'])) {
            $ph = DB::placeholders($f['category_ids']);
            $where[] = "(p.category_id IN ($ph) OR p.subcategory_id IN ($ph))";
            array_push($params, ...$f['category_ids'], ...$f['category_ids']);
        }
        if (!empty($f['q'])) {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $f['q']) . '%';
            $where[] = '(p.name LIKE ? OR p.sku LIKE ? OR p.tags LIKE ? OR p.category_id IN (SELECT id FROM categories WHERE name LIKE ? AND deleted_at IS NULL))';
            array_push($params, $like, $like, $like, $like);
        }
        if (!empty($f['flag']) && in_array($f['flag'], ['is_featured', 'is_flash_sale', 'is_combo', 'is_free_delivery'], true)) {
            $where[] = 'p.' . $f['flag'] . ' = 1';
        }
        if (isset($f['min']) && $f['min'] !== '' && is_numeric($f['min'])) {
            $where[] = 'p.price >= ?';
            $params[] = (float)$f['min'];
        }
        if (isset($f['max']) && $f['max'] !== '' && is_numeric($f['max'])) {
            $where[] = 'p.price <= ?';
            $params[] = (float)$f['max'];
        }
        if (!empty($f['in_stock'])) {
            $where[] = '(p.track_stock = 0 OR p.stock > 0)';
        }
        $perPage = max(1, min(96, (int)($f['per_page'] ?? setting('products_per_page', 24))));
        $page = max(1, (int)($f['page'] ?? 1));
        $order = self::SORTS[$f['sort'] ?? 'manual'] ?? self::SORTS['manual'];
        $whereSql = implode(' AND ', $where);

        $total = (int)DB::value("SELECT COUNT(*) FROM products p WHERE $whereSql", $params);
        $pages = max(1, (int)ceil($total / $perPage));
        $page = min($page, $pages);
        $offset = ($page - 1) * $perPage;
        $items = DB::all('SELECT ' . self::CARD_COLS . " FROM products p WHERE $whereSql ORDER BY $order LIMIT $perPage OFFSET $offset", $params);

        return ['items' => self::hydrateCards($items), 'total' => $total, 'page' => $page, 'pages' => $pages, 'per_page' => $perPage];
    }

    /** Full product for the details page (cached per slug). */
    public static function findBySlug(string $slug): ?array
    {
        $product = Cache::remember('catalog:product:' . md5($slug), 600, static function () use ($slug) {
            $p = DB::one(
                'SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.is_free_delivery AS category_free_delivery
                 FROM products p LEFT JOIN categories c ON c.id = p.category_id
                 WHERE p.slug = ? AND ' . self::VISIBLE . ' LIMIT 1',
                [$slug]
            );
            if (!$p) {
                return false;
            }
            $p['images'] = DB::all('SELECT id, path, ext, width, height, alt FROM product_images WHERE product_id = ? ORDER BY sort_order, id', [$p['id']]);
            $p['variants'] = DB::all('SELECT id, size, color, sku, price, stock FROM product_variants WHERE product_id = ? AND status = "active" ORDER BY id', [$p['id']]);
            return self::hydrate($p);
        });
        return $product ?: null;
    }

    /** Raw row for admin & server-side cart pricing (no cache). */
    public static function find(int $id, bool $withTrashed = false): ?array
    {
        $p = DB::one('SELECT * FROM products WHERE id = ?' . ($withTrashed ? '' : ' AND deleted_at IS NULL'), [$id]);
        return $p ? self::hydrate($p) : null;
    }

    /** Related products: manual picks first, then same category. */
    public static function related(array $product, int $limit = 8): array
    {
        return Cache::remember('catalog:related:' . $product['id'] . ':' . $limit, 900, static function () use ($product, $limit) {
            $manual = DB::all(
                'SELECT ' . self::CARD_COLS . ' FROM product_relations r JOIN products p ON p.id = r.related_id
                 WHERE r.product_id = ? AND ' . self::VISIBLE . ' ORDER BY r.sort_order LIMIT ' . (int)$limit,
                [$product['id']]
            );
            $ids = array_merge([(int)$product['id']], array_map('intval', array_column($manual, 'id')));
            $remaining = $limit - count($manual);
            $auto = [];
            if ($remaining > 0 && $product['category_id']) {
                $auto = DB::all(
                    'SELECT ' . self::CARD_COLS . ' FROM products p
                     WHERE ' . self::VISIBLE . ' AND p.category_id = ? AND p.id NOT IN (' . DB::placeholders($ids) . ')
                     ORDER BY p.sold_count DESC, p.id DESC LIMIT ' . (int)$remaining,
                    array_merge([(int)$product['category_id']], $ids)
                );
            }
            return self::hydrateCards(array_merge($manual, $auto));
        });
    }

    /** Lightweight search suggestions. */
    public static function suggest(string $q, int $limit = 6): array
    {
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $q) . '%';
        $rows = DB::all(
            'SELECT ' . self::CARD_COLS . ' FROM products p
             WHERE ' . self::VISIBLE . ' AND (p.name LIKE ? OR p.sku LIKE ? OR p.tags LIKE ?)
             ORDER BY (p.name LIKE ?) DESC, p.sold_count DESC LIMIT ' . (int)$limit,
            [$like, $like, $like, str_replace('%', '', $like) . '%']
        );
        return self::hydrateCards($rows);
    }

    public static function hydrate(array $p): array
    {
        $p['sizes'] = is_array($p['sizes'] ?? null) ? $p['sizes'] : json_list($p['sizes'] ?? null);
        $p['colors'] = is_array($p['colors'] ?? null) ? $p['colors'] : json_list($p['colors'] ?? null);
        foreach (['specifications', 'features'] as $k) {
            if (array_key_exists($k, $p) && !is_array($p[$k])) {
                $p[$k] = json_list($p[$k]);
            }
        }
        $p['discount_percent'] = self::discountPercent($p);
        $p['in_stock'] = self::inStock($p);
        return $p;
    }

    public static function hydrateCards(array $rows): array
    {
        return array_map(static function ($p) {
            $p = self::hydrate($p);
            [$p['image_path'], $p['image_ext']] = array_pad(explode('|', (string)($p['image'] ?? '')), 2, 'webp');
            $p['needs_options'] = $p['sizes'] !== [] || $p['colors'] !== [];
            return $p;
        }, $rows);
    }

    public static function discountPercent(array $p): int
    {
        $old = (float)($p['old_price'] ?? 0);
        $price = (float)$p['price'];
        return $old > $price && $old > 0 ? (int)round(($old - $price) / $old * 100) : 0;
    }

    public static function canBackorder(array $p): bool
    {
        return (int)($p['allow_backorder'] ?? 0) === 1 || setting('allow_backorder') === '1';
    }

    public static function inStock(array $p, ?array $variant = null): bool
    {
        if ((int)($p['track_stock'] ?? 1) === 0 || self::canBackorder($p)) {
            return true;
        }
        if ($variant !== null) {
            return (int)$variant['stock'] > 0;
        }
        return (int)$p['stock'] > 0;
    }

    public static function primaryImage(array $p, string $size = 'md'): string
    {
        $img = $p['images'][0] ?? null;
        if ($img) {
            return image_url($img['path'], $size, $img['ext']);
        }
        return !empty($p['image_path']) ? image_url($p['image_path'], $size, $p['image_ext'] ?? 'webp') : asset('images/placeholder.svg');
    }

    public static function url(array $p): string
    {
        return url('/product/' . $p['slug']);
    }

    public static function incrementViews(int $id): void
    {
        Deferred::add(static fn() => DB::exec('UPDATE products SET views = views + 1 WHERE id = ?', [$id]));
    }

    /** Products with stock at/below threshold (tracked, not deleted). */
    public static function lowStock(int $limit = 20): array
    {
        $threshold = (int)setting('low_stock_threshold', 10);
        return DB::all(
            'SELECT p.id, p.name, p.sku, p.stock, p.slug,
                    (SELECT CONCAT(i.path, "|", i.ext) FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image
             FROM products p WHERE p.deleted_at IS NULL AND p.track_stock = 1 AND p.stock <= ?
             ORDER BY p.stock ASC LIMIT ' . (int)$limit,
            [$threshold]
        );
    }
}
