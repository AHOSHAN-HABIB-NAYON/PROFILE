<?php
declare(strict_types=1);

namespace OryzenX\Services\Market;

use OryzenX\Services\HttpClient;

/** Binance public market data (no key). Uses USDT pairs as a USD proxy — disclosed in the UI. */
final class BinanceProvider implements MarketDataProvider
{
    public function __construct(private string $base = 'https://api.binance.com')
    {
    }

    public function id(): string
    {
        return 'binance';
    }

    public function label(): string
    {
        return 'Binance';
    }

    public function quoteNote(): string
    {
        return 'Prices are Binance USDT pairs used as a USD reference (1 USDT ≈ 1 USD).';
    }

    public function prices(array $assets): array
    {
        $map = [];
        foreach ($assets as $a) {
            if (!empty($a['binance_symbol']) && preg_match('/^[A-Z0-9]{4,20}$/', $a['binance_symbol'])) {
                $map[$a['binance_symbol']] = $a['symbol'];
            }
        }
        if (!$map) {
            return [];
        }
        $url = $this->base . '/api/v3/ticker/24hr?symbols=' . rawurlencode((string) json_encode(array_keys($map)));
        $res = HttpClient::get($url, ['Accept' => 'application/json'], 10);
        if ($res['status'] !== 200) {
            throw new MarketDataException('Binance HTTP ' . $res['status'] . ($res['error'] ? ' (' . $res['error'] . ')' : ''));
        }
        $rows = json_decode($res['body'], true);
        if (!is_array($rows)) {
            throw new MarketDataException('Binance returned an invalid response');
        }
        $out = [];
        foreach ($rows as $r) {
            $sym = $map[$r['symbol'] ?? ''] ?? null;
            if ($sym === null || !isset($r['lastPrice']) || !is_numeric($r['lastPrice'])) {
                continue;
            }
            $out[$sym] = [
                'price' => CoinGeckoProvider::num((string) $r['lastPrice']),
                'change_24h' => isset($r['priceChangePercent']) ? CoinGeckoProvider::num((string) $r['priceChangePercent'], 4) : null,
                'source_updated_at' => isset($r['closeTime']) ? gmdate('Y-m-d H:i:s', intdiv((int) $r['closeTime'], 1000)) : null,
            ];
        }
        return $out;
    }

    public function ohlc(array $asset, string $range): array
    {
        if (empty($asset['binance_symbol'])) {
            throw new MarketDataException('Asset has no Binance pair');
        }
        [$interval, $limit] = ['1D' => ['15m', 96], '7D' => ['1h', 168], '1M' => ['4h', 180], '3M' => ['1d', 90], '1Y' => ['1d', 365]][$range] ?? ['15m', 96];
        $url = $this->base . '/api/v3/klines?' . http_build_query(['symbol' => $asset['binance_symbol'], 'interval' => $interval, 'limit' => $limit]);
        $res = HttpClient::get($url, ['Accept' => 'application/json'], 12);
        if ($res['status'] !== 200) {
            throw new MarketDataException('Binance klines HTTP ' . $res['status']);
        }
        $rows = json_decode($res['body'], true);
        if (!is_array($rows)) {
            throw new MarketDataException('Invalid klines response');
        }
        return array_map(fn ($r) => [
            'time' => intdiv((int) $r[0], 1000),
            'open' => CoinGeckoProvider::num((string) $r[1]),
            'high' => CoinGeckoProvider::num((string) $r[2]),
            'low' => CoinGeckoProvider::num((string) $r[3]),
            'close' => CoinGeckoProvider::num((string) $r[4]),
        ], $rows);
    }
}
