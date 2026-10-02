<?php
final class Banner
{
    public static function active(): array
    {
        return DB::all('SELECT * FROM banners WHERE is_active = 1 AND deleted_at IS NULL ORDER BY sort_order, id');
    }
}
