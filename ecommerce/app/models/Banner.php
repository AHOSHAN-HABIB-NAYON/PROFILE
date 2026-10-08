<?php
/**
 * Home page hero banners.
 */
final class Banner
{
    public static function active(int $limit = 5): array
    {
        return Cache::remember('catalog:banners:' . $limit, 600, static function () use ($limit) {
            return DB::all(
                'SELECT id, title, subtitle, cta_text, link, image, ext FROM banners
                 WHERE deleted_at IS NULL AND is_active = 1
                   AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW())
                 ORDER BY sort_order, id LIMIT ' . max(1, min(10, $limit))
            );
        });
    }
}
