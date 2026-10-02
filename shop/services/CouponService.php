<?php
final class CouponService
{
    /** @return array{coupon:?array, discount:float, error:?string} */
    public static function evaluate(?string $code, float $subtotal, bool $lock = false): array
    {
        if (!$code) {
            return ['coupon' => null, 'discount' => 0.0, 'error' => null];
        }
        if (!Settings::on('coupon_enabled')) {
            return ['coupon' => null, 'discount' => 0.0, 'error' => 'এই মুহূর্তে কুপন ব্যবহার করা যাচ্ছে না।'];
        }
        $c = DB::one('SELECT * FROM coupons WHERE code = ? AND deleted_at IS NULL' . ($lock ? ' FOR UPDATE' : ''), [mb_strtoupper(trim($code))]);
        $now = time();
        $error = match (true) {
            !$c || !(int) $c['is_active'] => 'কুপন কোডটি সঠিক নয়।',
            $c['starts_at'] && strtotime($c['starts_at']) > $now => 'এই কুপন এখনো চালু হয়নি।',
            $c['expires_at'] && strtotime($c['expires_at']) < $now => 'এই কুপনের মেয়াদ শেষ হয়ে গেছে।',
            $c['usage_limit'] !== null && (int) $c['used_count'] >= (int) $c['usage_limit'] => 'এই কুপনের ব্যবহার সীমা শেষ হয়ে গেছে।',
            $subtotal < (float) $c['min_order'] => 'এই কুপন ব্যবহারে সর্বনিম্ন ' . money($c['min_order']) . ' টাকার অর্ডার প্রয়োজন।',
            default => null,
        };
        if ($error) {
            return ['coupon' => null, 'discount' => 0.0, 'error' => $error];
        }
        $discount = $c['type'] === 'percent' ? round($subtotal * (float) $c['value'] / 100, 2) : (float) $c['value'];
        if ($c['max_discount'] !== null && (float) $c['max_discount'] > 0) {
            $discount = min($discount, (float) $c['max_discount']);
        }
        return ['coupon' => $c, 'discount' => min($discount, $subtotal), 'error' => null];
    }

    public static function highlighted(): ?array
    {
        if (!Settings::on('coupon_enabled')) {
            return null;
        }
        return DB::one('SELECT * FROM coupons WHERE is_highlighted = 1 AND is_active = 1 AND deleted_at IS NULL
            AND (starts_at IS NULL OR starts_at <= NOW()) AND (expires_at IS NULL OR expires_at > NOW())
            AND (usage_limit IS NULL OR used_count < usage_limit) ORDER BY id DESC LIMIT 1');
    }
}
