<?php
/** Privacy-aware page view tracking. IPs are never stored; only a daily rotating hash. */
final class Analytics
{
    private static bool $tracked = false;

    public static function track(string $pageKey, ?int $refId = null, ?string $path = null): void
    {
        if (self::$tracked || !INSTALLED || setting('analytics_enabled') !== '1') return;
        $ua = user_agent();
        if (UA::isBot($ua) || ($_SERVER['HTTP_PURPOSE'] ?? $_SERVER['HTTP_SEC_PURPOSE'] ?? '') === 'prefetch' || ($_SERVER['HTTP_X_PREFETCH'] ?? '') === '1') return;
        self::$tracked = true;
        try {
            $p = UA::parse($ua);
            $vh = Crypto::visitorHash();
            $geo = self::geo();
            $ref = parse_url((string)($_SERVER['HTTP_X_REFERRER'] ?? $_SERVER['HTTP_REFERER'] ?? ''), PHP_URL_HOST);
            if ($ref && $ref === ($_SERVER['HTTP_HOST'] ?? '')) $ref = null;
            $isNew = !DB::val('SELECT 1 FROM page_views WHERE visitor_hash = ? AND created_at >= CURDATE() LIMIT 1', [$vh]);
            DB::insert('page_views', [
                'path' => mb_substr($path ?? current_path(), 0, 255), 'page_key' => mb_substr(str_replace('pages/', '', $pageKey), 0, 60), 'ref_id' => $refId,
                'referrer' => $ref ? mb_substr($ref, 0, 190) : null, 'device' => $p['device'], 'browser' => $p['browser'], 'os' => $p['os'],
                'country' => $geo['country'], 'region' => $geo['region'], 'city' => $geo['city'], 'visitor_hash' => $vh, 'user_id' => Auth::id(),
            ]);
            DB::q('INSERT INTO analytics (day, views, uniques) VALUES (CURDATE(), 1, ?) ON DUPLICATE KEY UPDATE views = views + 1, uniques = uniques + VALUES(uniques)', [$isNew ? 1 : 0]);
        } catch (Throwable $e) {
            ErrorHandler::log('analytics', $e->getMessage());
        }
    }

    /** Country from the CDN header; optional region/city lookup (admin opt-in, cached per IP hash). */
    private static function geo(): array
    {
        $cc = strtoupper((string)($_SERVER['HTTP_CF_IPCOUNTRY'] ?? ''));
        $out = ['country' => preg_match('/^[A-Z]{2}$/', $cc) && $cc !== 'XX' ? $cc : null, 'region' => null, 'city' => null];
        if (setting('analytics_geo_lookup') !== '1') return $out;
        $ip = client_ip();
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return $out;
        $h = hash('sha256', $ip . ($GLOBALS['config']['app_key'] ?? ''));
        $row = DB::row('SELECT country, region, city FROM geo_cache WHERE ip_hash = ?', [$h]);
        if (!$row) {
            $r = Http::request('GET', 'http://ip-api.com/json/' . rawurlencode($ip) . '?fields=status,countryCode,regionName,city', [], null, 2);
            $j = json_decode($r['body'], true);
            $row = ['country' => null, 'region' => null, 'city' => null];
            if (($j['status'] ?? '') === 'success') {
                $row = ['country' => substr((string)$j['countryCode'], 0, 2), 'region' => mb_substr((string)$j['regionName'], 0, 80), 'city' => mb_substr((string)$j['city'], 0, 80)];
            }
            DB::q('REPLACE INTO geo_cache (ip_hash, country, region, city) VALUES (?,?,?,?)', [$h, $row['country'], $row['region'], $row['city']]);
        }
        return ['country' => $out['country'] ?? $row['country'], 'region' => $row['region'], 'city' => $row['city']];
    }
}
