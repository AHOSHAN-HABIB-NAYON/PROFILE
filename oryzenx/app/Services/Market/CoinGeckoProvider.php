<?php
declare(strict_types=1);

namespace OryzenX\Services\Market;

use OryzenX\Services\HttpClient;

/**
 * CoinGecko API (https://www.coingecko.com/en/api). Works keyless on the public tier with tight rate limits;
 * a Demo key (x-cg-demo-api-key) or Pro key (x-cg-pro-api-key, pro-api host) is recommended for production.
 */
final class CoinGeckoProvider implements MarketDataProvider
{
    public function __construct(private ?string $apiKey = null, private string $plan = 'demo')
    {
    }

    public function id(): string
    {
        return 'coingecko';
    }

    public function label(): string
    {
        return 'CoinGecko';
    }

    public function quoteNote(): string
    {
        return 'Prices quoted in USD by CoinGecko (aggregated across exchanges).';
    }

    private function base(): string
    {
        return $this->apiKey && $this->plan === 'pro' ? 'https://pro-api.coingecko.com/api/v3' : 'https://api.coingecko.com/api/v3';
    }

    private function headers(): array
    {
        $h = ['Accept' => 'application/json'];
        if ($this->apiKey) {
            $h[$this->plan === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key'] = $this->apiKey;
        }
        return $h;
    }

    public function prices(array $assets): array
    {
        $map = [];
        foreach ($assets as $a) {
            if (!empty($a['coingecko_id'])) {
                $map[$a['coingecko_id']] = $a['symbol'];
            }
        }
        if (!$map) {
            return [];
        }
        $url = $this->base() . '/simple/price?' . http_build_query([
            'ids' => implode(',', array_keys($map)),
            'vs_currencies' => 'usd',
            'include_24hr_change' => 'true',
            'include_last_updated_at' => 'true',
            'precision' => 'full',
        ]);
        $res = HttpClient::get($url, $this->headers(), 10);
        if ($res['status'] !== 200) {
            throw new MarketDataException('CoinGecko HTTP ' . $res['status'] . ($res['error'] ? ' (' . $res['error'] . ')' : ''));
        }
        // keep numbers as strings to avoid float rounding
        $data = json_decode($res['body'], true, 16, JSON_BIGINT_AS_STRING);
        if (!is_array($data)) {
            throw new MarketDataException('CoinGecko returned an invalid response');
        }
        $raw = $this->rawNumbers($res['body']);
        $out = [];
        foreach ($map as $cgId => $symbol) {
            if (!isset($data[$cgId]['usd'])) {
                continue;
            }
            $price = $raw[$cgId]['usd'] ?? self::num($data[$cgId]['usd']);
            if ($price === null) {
                continue;
            }
            $out[$symbol] = [
                'price' => $price,
                'change_24h' => isset($data[$cgId]['usd_24h_change']) ? self::num($data[$cgId]['usd_24h_change'], 4) : null,
                'source_updated_at' => isset($data[$cgId]['last_updated_at']) ? gmdate('Y-m-d H:i:s', (int) $data[$cgId]['last_updated_at']) : null,
            ];
        }
        return $out;
    }

    /** Extracts "usd": <number> literally from JSON so very small prices (PEPE) keep every digit. */
    private function rawNumbers(string $json): array
    {
        $out = [];
        if (preg_match_all('/"([a-z0-9-]+)"\s*:\s*\{[^{}]*?"usd"\s*:\s*(-?[0-9.]+(?:[eE][-+]?\d+)?)/', $json, $m, PREG_SET_ORDER)) {
            foreach ($m as $row) {
                $n = self::num($row[2]);
                if ($n !== null) {
                    $out[$row[1]]['usd'] = $n;
                }
            }
        }
        return $out;
    }

    public function ohlc(array $asset, string $range): array
    {
        if (empty($asset['coingecko_id'])) {
            throw new MarketDataException('Asset has no CoinGecko id');
        }
        $days = ['1D' => 1, '7D' => 7, '1M' => 30, '3M' => 90, '1Y' => 365][$range] ?? 1;
        $url = $this->base() . '/coins/' . rawurlencode($asset['coingecko_id']) . '/ohlc?vs_currency=usd&days=' . $days;
        $res = HttpClient::get($url, $this->headers(), 12);
        if ($res['status'] !== 200) {
            throw new MarketDataException('CoinGecko OHLC HTTP ' . $res['status']);
        }
        $rows = json_decode($res['body'], true);
        if (!is_array($rows)) {
            throw new MarketDataException('Invalid OHLC response');
        }
        $out = [];
        foreach ($rows as $r) {
            if (!is_array($r) || count($r) < 5) {
                continue;
            }
            $out[] = ['time' => intdiv((int) $r[0], 1000), 'open' => self::num($r[1]), 'high' => self::num($r[2]), 'low' => self::num($r[3]), 'close' => self::num($r[4])];
        }
        return $out;
    }

    /** Converts a JSON number (possibly in exponent form) to a plain decimal string. */
    public static function num(mixed $v, int $maxScale = 18): ?string
    {
        if (is_string($v) && preg_match('/^-?\d+(\.\d+)?$/', $v)) {
            return \OryzenX\Core\Decimal::normalize($v);
        }
        if (is_int($v)) {
            return (string) $v;
        }
        if (is_float($v) || (is_string($v) && is_numeric($v))) {
            $f = (float) $v;
            if (!is_finite($f)) {
                return null;
            }
            return \OryzenX\Core\Decimal::normalize(rtrim(rtrim(sprintf('%.' . $maxScale . 'F', $f), '0'), '.') ?: '0');
        }
        return null;
    }
}
