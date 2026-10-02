<?php
/** Server-side approximate IP location (admin-only, looked up lazily and cached on the order). */
final class GeoIp
{
    public static function lookup(string $ip): array
    {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return ['ok' => false, 'note' => 'লোকাল/প্রাইভেট নেটওয়ার্ক — লোকেশন পাওয়া যায় না'];
        }
        $res = Http::get('https://ipwho.is/' . rawurlencode($ip) . '?fields=success,message,country,country_code,region,city,latitude,longitude,connection', [], 5);
        $j = $res['json'];
        if (!$res['ok'] || !$j || empty($j['success'])) {
            Logger::api('GeoIP failed', ['status' => $res['status'], 'message' => $j['message'] ?? $res['error']]);
            return ['ok' => false, 'note' => 'লোকেশন সার্ভিসে এই মুহূর্তে সংযোগ করা যায়নি'];
        }
        return [
            'ok' => true, 'country' => $j['country'] ?? null, 'country_code' => $j['country_code'] ?? null,
            'region' => $j['region'] ?? null, 'city' => $j['city'] ?? null,
            'isp' => $j['connection']['isp'] ?? ($j['connection']['org'] ?? null),
            'lat' => $j['latitude'] ?? null, 'lng' => $j['longitude'] ?? null,
            'checked_at' => date('Y-m-d H:i:s'),
        ];
    }

    public static function forOrder(array $order, bool $refresh = false): array
    {
        $geo = $order['geo'] ? json_decode($order['geo'], true) : null;
        if (!$refresh && is_array($geo) && ($geo['ok'] || isset($geo['note']) && str_contains($geo['note'], 'প্রাইভেট'))) {
            return $geo;
        }
        $geo = self::lookup((string) $order['ip']);
        DB::update('orders', ['geo' => json_encode($geo, JSON_UNESCAPED_UNICODE)], 'id = ?', [$order['id']]);
        return $geo;
    }
}
