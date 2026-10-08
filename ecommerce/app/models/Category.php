<?php
/**
 * Category queries. Public lists are cached in the "catalog" cache group.
 */
final class Category
{
    private const COLS = 'c.id, c.parent_id, c.name, c.slug, c.description, c.image, c.icon_type, c.icon, c.icon_image, c.is_free_delivery, c.status, c.sort_order, c.seo_title, c.seo_description';

    /** Active categories with active product counts (cached). */
    public static function activeWithCounts(): array
    {
        return Cache::remember('catalog:categories', 900, static function () {
            return DB::all(
                'SELECT ' . self::COLS . ',
                        (SELECT COUNT(*) FROM products p
                          WHERE (p.category_id = c.id OR p.subcategory_id = c.id)
                            AND p.deleted_at IS NULL AND p.status = "active") AS product_count
                 FROM categories c
                 WHERE c.deleted_at IS NULL AND c.status = "active"
                 ORDER BY c.sort_order, c.name'
            );
        });
    }

    public static function topLevel(): array
    {
        return array_values(array_filter(self::activeWithCounts(), static fn($c) => $c['parent_id'] === null));
    }

    public static function children(int $parentId): array
    {
        return array_values(array_filter(self::activeWithCounts(), static fn($c) => (int)$c['parent_id'] === $parentId));
    }

    public static function findBySlug(string $slug): ?array
    {
        foreach (self::activeWithCounts() as $c) {
            if ($c['slug'] === $slug) {
                return $c;
            }
        }
        return null;
    }

    public static function find(int $id, bool $withTrashed = false): ?array
    {
        return DB::one('SELECT ' . self::COLS . ', c.deleted_at FROM categories c WHERE c.id = ?' . ($withTrashed ? '' : ' AND c.deleted_at IS NULL'), [$id]);
    }

    /** Admin list (all statuses, not deleted). */
    public static function adminList(): array
    {
        return DB::all(
            'SELECT ' . self::COLS . ', p.name AS parent_name,
                    (SELECT COUNT(*) FROM products pr WHERE (pr.category_id = c.id OR pr.subcategory_id = c.id) AND pr.deleted_at IS NULL) AS product_count
             FROM categories c LEFT JOIN categories p ON p.id = c.parent_id
             WHERE c.deleted_at IS NULL ORDER BY c.parent_id IS NOT NULL, c.sort_order, c.name'
        );
    }

    public static function options(): array
    {
        return DB::all('SELECT id, parent_id, name FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name');
    }

    /** Renders the category icon (Font Awesome or uploaded image). */
    public static function iconHtml(array $c, string $class = ''): string
    {
        if ($c['icon_type'] === 'image' && !empty($c['icon_image'])) {
            return '<img src="' . e(upload_url($c['icon_image'])) . '" alt="" class="cat-icon-img ' . e($class) . '" width="40" height="40" loading="lazy" decoding="async">';
        }
        return '<i class="' . e($c['icon'] ?: 'fa-solid fa-tag') . ' ' . e($class) . '" aria-hidden="true"></i>';
    }
}
