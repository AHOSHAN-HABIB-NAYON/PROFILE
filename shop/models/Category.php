<?php
final class Category
{
    public static function active(): array
    {
        return DB::all('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1 AND p.deleted_at IS NULL) AS product_count,
            (SELECT pi.path FROM products p JOIN product_images pi ON pi.product_id = p.id WHERE p.category_id = c.id AND p.is_active = 1 AND p.deleted_at IS NULL
             ORDER BY p.is_featured DESC, p.sold DESC, pi.sort_order LIMIT 1) AS cover
            FROM categories c WHERE c.is_active = 1 AND c.deleted_at IS NULL ORDER BY c.sort_order, c.name');
    }

    public static function findBySlug(string $slug): ?array
    {
        return DB::one('SELECT * FROM categories WHERE slug = ? AND is_active = 1 AND deleted_at IS NULL', [$slug]);
    }

    public static function options(): array
    {
        return DB::all('SELECT id, name FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, name');
    }
}
