<?php
/**
 * Approximate IP geolocation for admin order review.
 * Results are APPROXIMATE (ISP/region level) — never a customer's exact location.
 * Lookups run after the response (or on demand in admin) and are stored on the order.
 */
final class GeoIp
{
    public static function lookup(string $ip): ?array
    {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return ['ip' => $ip, 'country' => 'Private/Local network', 'approximate' => true, 'source' => 'local'];
        }
        $cached = Cache::get('geoip:' . $ip, $found);
        if ($found) {
            return $cached;
        }
        $geo = (static function () use ($ip) {
            $res = HttpClient::get('https://ipwho.is/' . rawurlencode($ip) . '?fields=success,country,country_code,region,city,connection,timezone', ['timeout' => 5]);
            $j = $res['json'];
            if ($res['status'] === 200 && is_array($j) && ($j['success'] ?? false)) {
                return [
                    'ip'       => $ip,
                    'country'  => $j['country'] ?? null,
                    'country_code' => $j['country_code'] ?? null,
                    'region'   => $j['region'] ?? null,
                    'city'     => $j['city'] ?? null,
                    'isp'      => $j['connection']['isp'] ?? ($j['connection']['org'] ?? null),
                    'asn'      => isset($j['connection']['asn']) ? 'AS' . $j['connection']['asn'] : null,
                    'timezone' => $j['timezone']['id'] ?? null,
                    'approximate' => true,
                    'source'   => 'ipwho.is',
                ];
            }
            return null;
        })();
        if ($geo !== null) {
            Cache::set('geoip:' . $ip, $geo, 7 * 86400);
        }
        return $geo;
    }

    public static function attachToOrder(int $orderId, string $ip): ?array
    {
        $geo = self::lookup($ip);
        if ($geo) {
            DB::exec('UPDATE orders SET geo_json = ? WHERE id = ?', [json_encode($geo, JSON_UNESCAPED_UNICODE), $orderId]);
        }
        return $geo;
    }
}
