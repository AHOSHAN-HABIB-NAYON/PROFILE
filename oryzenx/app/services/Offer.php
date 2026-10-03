<?php
/**
 * Site-wide promo ("20% off any service"): visitors claim it once per account,
 * and only one account per IP address can claim the same campaign.
 */
final class Offer
{
    public static function enabled(): bool
    {
        if (setting('offer_enabled') !== '1' || self::percent() <= 0) return false;
        $until = (string)setting('offer_until');
        return $until === '' || strtotime($until) === false || strtotime($until) > time();
    }

    public static function percent(): int { return max(0, min(90, (int)setting('offer_percent'))); }

    /** Changing the campaign number starts a fresh offer everybody can claim again. */
    public static function key(): string { return 'c' . max(1, (int)setting('offer_campaign')); }

    public static function claim(?int $userId): ?array
    {
        return $userId ? DB::row('SELECT * FROM offer_claims WHERE user_id = ? AND offer_key = ?', [$userId, self::key()]) : null;
    }

    /** Claim that is ready to be used on the next purchase. */
    public static function usable(?int $userId): ?array
    {
        if (!self::enabled()) return null;
        $c = self::claim($userId);
        return $c && !$c['used_at'] ? $c : null;
    }

    /** 'claimed' | 'already' | 'ip' | 'disabled' */
    public static function tryClaim(int $userId): string
    {
        if (!self::enabled()) return 'disabled';
        if (self::claim($userId)) return 'already';
        $ip = client_ip();
        if (DB::val('SELECT 1 FROM offer_claims WHERE ip = ? AND offer_key = ? AND user_id <> ?', [$ip, self::key(), $userId])) {
            Auth::activity('offer_ip_blocked', $ip, $userId);
            return 'ip';
        }
        try {
            DB::insert('offer_claims', ['user_id' => $userId, 'offer_key' => self::key(), 'percent' => self::percent(), 'ip' => $ip]);
        } catch (PDOException) { return 'already'; }
        Auth::activity('offer_claimed', self::percent() . '%', $userId);
        Notifier::send([$userId], t('offer.claimed_title', ['p' => num(self::percent())]), t('offer.claimed_text', ['p' => num(self::percent())]),
            ['icon' => 'fa-solid fa-gift', 'link' => '/services', 'push' => false]);
        return 'claimed';
    }

    /** Discounted price for a service: [final, discount, percent]. */
    public static function price(array $s, ?int $userId): array
    {
        $price = (float)$s['price'];
        $c = self::usable($userId);
        if (!$c) return [$price, 0.0, 0];
        $disc = round($price * (int)$c['percent'] / 100, 2);
        return [round($price - $disc, 2), $disc, (int)$c['percent']];
    }

    public static function markUsed(int $userId, int $paymentId): void
    {
        DB::q('UPDATE offer_claims SET used_at = NOW(), payment_id = ? WHERE user_id = ? AND offer_key = ? AND used_at IS NULL', [$paymentId, $userId, self::key()]);
    }

    /** A rejected payment gives the discount back so it can be used again. */
    public static function release(int $paymentId): void
    {
        DB::q('UPDATE offer_claims SET used_at = NULL, payment_id = NULL WHERE payment_id = ?', [$paymentId]);
    }

    public static function boot(?array $user): ?array
    {
        if (!self::enabled()) return null;
        $c = $user ? self::claim((int)$user['id']) : null;
        return [
            'key' => self::key() . '-' . self::percent(), 'percent' => self::percent(), 'percent_txt' => num(self::percent()),
            'title' => lang() === 'bn' ? (setting('offer_title_bn') ?: setting('offer_title')) : setting('offer_title'),
            'text' => lang() === 'bn' ? (setting('offer_text_bn') ?: setting('offer_text')) : setting('offer_text'),
            'until' => (string)setting('offer_until') !== '' && strtotime((string)setting('offer_until')) ? date('c', strtotime((string)setting('offer_until'))) : '',
            'state' => $c ? ($c['used_at'] ? 'used' : 'claimed') : 'open',
            'i' => array_map(fn($k) => t('offer.' . $k, ['p' => num(self::percent())]), array_combine($k = ['badge', 'off', 'claim', 'claim_login', 'later', 'claimed_title', 'claimed_text', 'already', 'used', 'ip_title', 'ip_warning', 'ends_in', 'go_services', 'rules'], $k)),
        ];
    }
}
