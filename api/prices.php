<?php
/**
 * Public crypto price feed for coin chips: GET /api/prices?s=BTC,ETH
 * Uses Binance 24h tickers (USDT pairs), cached for 60 seconds per symbol.
 */
defined('APP') || exit;

rate_limit('prices:' . client_ip(), 120, 300);
$syms = array_slice(array_unique(array_filter(array_map(
    fn($s) => strtoupper(preg_replace('~[^A-Za-z0-9]~', '', $s)),
    explode(',', input('s'))
), fn($s) => preg_match('~^[A-Z][A-Z0-9]{1,9}$~', $s))), 0, 20);

$dir = ROOT . '/storage/cache/prices';
if (!is_dir($dir)) @mkdir($dir, 0755, true);
$out = [];
foreach ($syms as $s) {
    if (in_array($s, ['USDT', 'USDC', 'BUSD', 'FDUSD', 'DAI'], true)) { $out[$s] = ['p' => 1.0, 'c' => 0.0]; continue; }
    $f = "$dir/$s.json";
    if (is_file($f) && filemtime($f) > time() - 60) {
        $c = json_decode((string)file_get_contents($f), true);
        if (is_array($c)) { if ($c) $out[$s] = $c; continue; }
    }
    $r = http_request('GET', 'https://api.binance.com/api/v3/ticker/24hr?symbol=' . $s . 'USDT', ['timeout' => 6]);
    $j = $r['json'];
    $c = ($r['status'] === 200 && isset($j['lastPrice'])) ? ['p' => (float)$j['lastPrice'], 'c' => round((float)$j['priceChangePercent'], 2)] : [];
    // failed lookups are cached too (empty) so unknown symbols don't hammer the API
    if ($c || $r['status'] === 400) @file_put_contents($f, json_encode($c), LOCK_EX);
    if ($c) $out[$s] = $c;
}
header('Cache-Control: public, max-age=30');
json_out(['ok' => true, 'prices' => (object)$out]);
