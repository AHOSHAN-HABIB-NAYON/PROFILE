<?php
/** Shared read queries used across several pages. */
final class Content
{
    private static array $memo = [];

    public static function footerServices(): array
    {
        return self::$memo['fs'] ??= DB::all('SELECT slug, title, title_bn FROM services WHERE is_active = 1 AND is_featured = 1 ORDER BY sort_order, id LIMIT 5');
    }

    public static function latestPosts(int $n = 5): array
    {
        return DB::all("SELECT p.id, p.title, p.slug, p.icon, p.excerpt, p.featured_image, p.published_at, p.views, c.name AS cat_name, c.name_bn AS cat_name_bn
            FROM posts p LEFT JOIN post_categories c ON c.id = p.category_id
            WHERE p.status = 'published' AND p.published_at <= NOW() ORDER BY p.published_at DESC, p.id DESC LIMIT " . (int)$n);
    }

    public static function paymentMethods(): array
    {
        $rows = DB::all('SELECT * FROM payment_methods WHERE is_active = 1 ORDER BY sort_order, id');
        // A method without any receiving details is automatically hidden (e.g. Binance Pay left blank).
        return array_values(array_filter($rows, fn($m) => trim((string)$m['account_number']) !== '' || trim((string)$m['link']) !== '' || !empty($m['qr_image'])));
    }

    public static function postUrl(array $p): string { return url('/news/' . $p['id']); }

    public static function media(?string $path): string
    {
        if (!$path) return '';
        return str_starts_with($path, 'img/') ? asset($path) : upload_url($path);
    }
}
