<?php
/**
 * Coupon validation and discount calculation. Always evaluated server-side.
 */
final class Coupon
{
    /**
     * @return array{coupon: ?array, discount: float, error: ?string}
     */
    public static function evaluate(string $code, float $subtotal, ?string $phone = null): array
    {
        $none = ['coupon' => null, 'discount' => 0.0, 'error' => null];
        $code = strtoupper(trim($code));
        if ($code === '') {
            return $none;
        }
        if (setting('coupon_enabled') !== '1') {
            return ['coupon' => null, 'discount' => 0.0, 'error' => 'কুপন সুবিধা এখন বন্ধ আছে।'];
        }
        $c = DB::one('SELECT * FROM coupons WHERE code = ? AND deleted_at IS NULL', [$code]);
        $error = match (true) {
            !$c || (int)$c['is_active'] !== 1                         => 'কুপন কোডটি সঠিক নয়।',
            $c['starts_at'] && strtotime($c['starts_at']) > time()     => 'কুপনটি এখনো চালু হয়নি।',
            $c['expires_at'] && strtotime($c['expires_at']) < time()   => 'কুপনের মেয়াদ শেষ হয়ে গেছে।',
            $c['usage_limit'] !== null && (int)$c['used_count'] >= (int)$c['usage_limit'] => 'কুপনটির ব্যবহারসীমা শেষ।',
            $subtotal < (float)$c['min_order'] => 'এই কুপনের জন্য সর্বনিম্ন অর্ডার ' . money($c['min_order']) . '।',
            default => null,
        };
        if ($error === null && $phone && $c['per_user_limit'] !== null) {
            $used = (int)DB::value('SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = ? AND phone = ?', [$c['id'], $phone]);
            if ($used >= (int)$c['per_user_limit']) {
                $error = 'আপনি এই কুপনটি ইতিমধ্যে ব্যবহার করেছেন।';
            }
        }
        if ($error !== null) {
            return ['coupon' => null, 'discount' => 0.0, 'error' => $error];
        }
        $discount = $c['type'] === 'percent' ? $subtotal * (float)$c['value'] / 100 : (float)$c['value'];
        if ($c['max_discount'] !== null && (float)$c['max_discount'] > 0) {
            $discount = min($discount, (float)$c['max_discount']);
        }
        return ['coupon' => $c, 'discount' => round(min($discount, $subtotal), 2), 'error' => null];
    }

    /** Coupon highlighted on the home page (cached). */
    public static function highlight(): ?array
    {
        if (setting('coupon_enabled') !== '1') {
            return null;
        }
        $c = Cache::remember('catalog:coupon-highlight', 600, static function () {
            return DB::one(
                'SELECT code, description, type, value, min_order, max_discount, expires_at FROM coupons
                 WHERE deleted_at IS NULL AND is_active = 1 AND show_on_home = 1
                   AND (starts_at IS NULL OR starts_at <= NOW()) AND (expires_at IS NULL OR expires_at > NOW())
                   AND (usage_limit IS NULL OR used_count < usage_limit)
                 ORDER BY id DESC LIMIT 1'
            ) ?: false;
        });
        return $c ?: null;
    }

    public static function label(array $c): string
    {
        return $c['type'] === 'percent' ? num((float)$c['value'] + 0) . '% ছাড়' : money($c['value']) . ' ছাড়';
    }
}
