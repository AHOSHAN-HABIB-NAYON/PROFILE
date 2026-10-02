<?php
/**
 * Privacy-conscious analytics: a random first-party visitor id (hashed),
 * no raw IPs stored, coarse device/browser/OS/country only.
 */
defined('APP') || exit;

function parse_ua(string $ua): array
{
    $u = strtolower($ua);
    $bot = (bool)preg_match('~bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|python|curl|wget|httpclient~', $u);
    $device = $bot ? 'bot' : (preg_match('~ipad|tablet|(android(?!.*mobile))~', $u) ? 'tablet' : (preg_match('~mobi|iphone|android~', $u) ? 'mobile' : 'desktop'));
    $browser = match (true) {
        str_contains($u, 'edg/') => 'Edge',
        str_contains($u, 'opr/') || str_contains($u, 'opera') => 'Opera',
        str_contains($u, 'samsungbrowser') => 'Samsung Internet',
        str_contains($u, 'ucbrowser') => 'UC Browser',
        str_contains($u, 'fban') || str_contains($u, 'fbav') => 'Facebook',
        str_contains($u, 'firefox') || str_contains($u, 'fxios') => 'Firefox',
        str_contains($u, 'chrome') || str_contains($u, 'crios') => 'Chrome',
        str_contains($u, 'safari') => 'Safari',
        default => 'Other',
    };
    $os = match (true) {
        str_contains($u, 'android') => 'Android',
        (bool)preg_match('~iphone|ipad|ipod~', $u) => 'iOS',
        str_contains($u, 'windows') => 'Windows',
        str_contains($u, 'cros') => 'ChromeOS',
        str_contains($u, 'mac os') || str_contains($u, 'macintosh') => 'macOS',
        str_contains($u, 'linux') => 'Linux',
        default => 'Other',
    };
    return ['device' => $device, 'browser' => $browser, 'os' => $os, 'bot' => $bot];
}

function traffic_source(string $referrer): string
{
    $utm = input('utm_source');
    if ($utm !== '') return mb_substr(strtolower($utm), 0, 80);
    if ($referrer === '') return 'direct';
    $host = strtolower((string)parse_url($referrer, PHP_URL_HOST));
    if ($host === '' || $host === strtolower((string)parse_url(BASE_URL, PHP_URL_HOST))) return 'direct';
    foreach (['google' => 'google', 'bing' => 'bing', 'facebook' => 'facebook', 'fb.' => 'facebook', 'instagram' => 'instagram',
                 't.co' => 'x', 'twitter' => 'x', 'x.com' => 'x', 'youtube' => 'youtube', 'tiktok' => 'tiktok', 'linkedin' => 'linkedin',
                 'whatsapp' => 'whatsapp', 'telegram' => 't.me', 'duckduckgo' => 'duckduckgo', 'yahoo' => 'yahoo'] as $needle => $name) {
        if (str_contains($host, $needle)) return $name;
    }
    return mb_substr(preg_replace('~^www\.~', '', $host), 0, 80);
}

function visitor_cookie(): string
{
    $v = $_COOKIE['vid'] ?? '';
    if (!preg_match('~^[A-Za-z0-9_-]{22,64}$~', $v)) {
        $v = b64url_encode(random_bytes(18));
        setcookie('vid', $v, ['expires' => time() + 2 * 31536000, 'path' => '/', 'secure' => IS_HTTPS, 'httponly' => true, 'samesite' => 'Lax']);
        $_COOKIE['vid'] = $v;
    }
    return $v;
}

function visitor_hash(): string
{
    return token_hash('v:' . visitor_cookie());
}

function geo_lookup(): array
{
    $country = strtoupper((string)($_SERVER['HTTP_CF_IPCOUNTRY'] ?? ''));
    $geo = ['country' => preg_match('~^[A-Z]{2}$~', $country) && $country !== 'XX' ? $country : null,
        'region' => $_SERVER['HTTP_CF_REGION'] ?? null, 'city' => $_SERVER['HTTP_CF_IPCITY'] ?? null];
    if (!$geo['country'] && setting_bool('analytics.geo_lookup')) {
        $ip = client_ip();
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            $r = http_request('GET', 'https://ipapi.co/' . $ip . '/json/', ['timeout' => 3]);
            $j = $r['json'] ?? [];
            if (!empty($j['country_code'])) $geo = ['country' => substr($j['country_code'], 0, 2), 'region' => $j['region'] ?? null, 'city' => $j['city'] ?? null];
        }
    }
    if ($geo['region']) $geo['region'] = mb_substr(trim(preg_replace('~\s+division$~i', '', (string)$geo['region'])), 0, 80);
    if ($geo['city']) $geo['city'] = mb_substr((string)$geo['city'], 0, 80);
    return $geo;
}

/** Record one page view (called by the client beacon after each navigation). */
function record_view(string $path, string $type, int $ref, string $referrer): void
{
    if (!setting_bool('analytics.enabled')) return;
    $ua = parse_ua(user_agent());
    if ($ua['bot']) return;

    $path = mb_substr('/' . ltrim(parse_url($path, PHP_URL_PATH) ?: '/', '/'), 0, 255);
    if (str_starts_with($path, '/admin') || str_starts_with($path, '/api')) return;
    $hash = visitor_hash();
    $uid = user()['id'] ?? null;
    $v = row('SELECT id, last_seen FROM analytics WHERE visitor_hash = ?', [$hash]);
    $source = traffic_source($referrer);
    if (!$v) {
        $geo = geo_lookup();
        $vid = insert('analytics', ['visitor_hash' => $hash, 'user_id' => $uid, 'pageviews' => 1, 'device' => $ua['device'], 'browser' => $ua['browser'],
            'os' => $ua['os'], 'country' => $geo['country'], 'region' => $geo['region'], 'city' => $geo['city'], 'source' => $source]);
        $country = $geo['country'];
    } else {
        $vid = (int)$v['id'];
        $newVisit = strtotime($v['last_seen']) < time() - 1800;
        q('UPDATE analytics SET last_seen = NOW(), pageviews = pageviews + 1' . ($newVisit ? ', visits = visits + 1' : '') . ($uid ? ', user_id = ' . (int)$uid : '') . ' WHERE id = ?', [$vid]);
        $country = val('SELECT country FROM analytics WHERE id = ?', [$vid]);
    }
    $type = preg_match('~^[a-z]{1,30}$~', $type) ? $type : null;
    insert('page_views', ['visitor_id' => $vid, 'path' => $path, 'page_type' => $type, 'ref_id' => $ref ?: null,
        'source' => $source === 'direct' ? null : $source, 'device' => $ua['device'], 'country' => $country]);
    // per-item view counters
    if ($ref > 0) {
        $table = ['service' => 'services', 'news' => 'news', 'product' => 'products'][$type] ?? null;
        if ($table) q('UPDATE ' . ident($table) . ' SET views = views + 1 WHERE id = ?', [$ref]);
    }
}

function online_count(): int
{
    $m = max(1, (int)setting('analytics.online_minutes', 5));
    return (int)val('SELECT COUNT(*) FROM analytics WHERE last_seen > NOW() - INTERVAL ? MINUTE', [$m]);
}

/** Heartbeat from the notification poller keeps "online" accurate without extra requests. */
function touch_visitor(): void
{
    if (!isset($_COOKIE['vid'])) return;
    q('UPDATE analytics SET last_seen = NOW() WHERE visitor_hash = ?', [visitor_hash()]);
}

function country_flag(?string $cc): string
{
    if (!$cc || !preg_match('~^[A-Z]{2}$~', $cc)) return '🌐';
    return mb_chr(0x1F1E6 + ord($cc[0]) - 65) . mb_chr(0x1F1E6 + ord($cc[1]) - 65);
}
