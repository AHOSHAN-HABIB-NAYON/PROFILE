<?php
/** First-party analytics: visitors + events (no third-party dependency). */
final class Analytics
{
    public const EVENTS = ['page_view', 'product_view', 'product_click', 'add_to_cart', 'checkout', 'purchase'];
    private static ?int $visitorId = null;

    public static function visitorId(): ?int
    {
        if (self::$visitorId !== null || !Settings::on('analytics_enabled')) {
            return self::$visitorId;
        }
        $ua = Request::userAgent();
        $info = UserAgent::parse($ua);
        if ($info['bot'] || $ua === '') {
            return null;
        }
        $key = $_COOKIE['vid'] ?? '';
        if (!is_string($key) || !preg_match('/^[a-f0-9]{32}$/', $key)) {
            $key = bin2hex(random_bytes(16));
            setcookie('vid', $key, ['expires' => time() + 86400 * 365, 'path' => '/', 'secure' => Request::isHttps(), 'httponly' => true, 'samesite' => 'Lax']);
            $_COOKIE['vid'] = $key;
        }
        $id = DB::val('SELECT id FROM visitors WHERE visitor_key = ?', [$key]);
        if ($id) {
            DB::run('UPDATE visitors SET last_seen = NOW() WHERE id = ? AND last_seen < (NOW() - INTERVAL 5 MINUTE)', [$id]);
            return self::$visitorId = (int) $id;
        }
        return self::$visitorId = DB::insert('visitors', [
            'visitor_key' => $key, 'ip' => Request::ip(), 'device' => $info['device'], 'browser' => $info['browser'], 'os' => $info['os'],
            'country' => self::country(), 'source' => self::source(), 'landing' => mb_substr(Request::fullUrl(), 0, 255),
        ]);
    }

    private static function country(): ?string
    {
        $cc = $_SERVER['HTTP_CF_IPCOUNTRY'] ?? null;
        return is_string($cc) && preg_match('/^[A-Z]{2}$/', $cc) ? $cc : null;
    }

    private static function source(): string
    {
        $utm = Request::query('utm_source');
        if ($utm !== '') {
            return mb_substr($utm, 0, 120);
        }
        if (Request::query('fbclid') !== '') {
            return 'facebook';
        }
        if (Request::query('gclid') !== '') {
            return 'google-ads';
        }
        $ref = $_SERVER['HTTP_REFERER'] ?? '';
        $host = $ref ? (parse_url($ref, PHP_URL_HOST) ?: '') : '';
        if ($host === '' || $host === ($_SERVER['HTTP_HOST'] ?? '')) {
            return 'direct';
        }
        return mb_substr(preg_replace('/^(www\.|m\.|l\.|lm\.)/', '', $host) ?? $host, 0, 120);
    }

    public static function event(string $event, ?int $productId = null, ?float $value = null, ?string $url = null): void
    {
        if (!in_array($event, self::EVENTS, true) || !Settings::on('analytics_enabled') || ($_SERVER['HTTP_X_PREFETCH'] ?? '') === '1') {
            return;
        }
        try {
            $vid = self::visitorId();
            if ($vid === null && $event !== 'purchase') {
                return;
            }
            DB::insert('analytics_events', ['visitor_id' => $vid, 'event' => $event, 'product_id' => $productId, 'url' => mb_substr($url ?? Request::path(), 0, 255), 'value' => $value]);
        } catch (Throwable $e) {
            Logger::error('Analytics failed: ' . $e->getMessage());
        }
    }
}
