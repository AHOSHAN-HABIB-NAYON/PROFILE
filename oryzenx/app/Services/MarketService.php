<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Config;
use OryzenX\Core\Database;
use OryzenX\Core\Logger;
use OryzenX\Services\Market\BinanceProvider;
use OryzenX\Services\Market\CoinGeckoProvider;
use OryzenX\Services\Market\MarketDataException;
use OryzenX\Services\Market\MarketDataProvider;
use OryzenX\Services\Market\SimulatedProvider;

/**
 * Server-side market prices. API keys never reach clients. Prices are refreshed by the scheduler,
 * or on demand when the cached price is older than the poll interval (for hosts without cron).
 * When a provider fails the last valid price is kept and flagged stale — never invented.
 */
final class MarketService
{
    private ?MarketDataProvider $provider = null;

    public function __construct(private Database $db, private SettingsService $settings)
    {
    }

    public function setProvider(MarketDataProvider $p): void
    {
        $this->provider = $p;
    }

    public function provider(): MarketDataProvider
    {
        if ($this->provider !== null) {
            return $this->provider;
        }
        $id = (string) $this->settings->get('market_provider', 'coingecko');
        return $this->provider = match ($id) {
            'binance' => new BinanceProvider(),
            'simulated' => Config::demoMode() ? new SimulatedProvider() : new CoinGeckoProvider($this->settings->get('market_api_key'), (string) $this->settings->get('market_api_plan', 'demo')),
            default => new CoinGeckoProvider($this->settings->get('market_api_key'), (string) $this->settings->get('market_api_plan', 'demo')),
        };
    }

    public static function availableProviders(): array
    {
        $list = [
            ['id' => 'coingecko', 'label' => 'CoinGecko', 'needs_key' => false, 'note' => 'Public tier works without a key but is rate-limited; add a Demo or Pro key for production.'],
            ['id' => 'binance', 'label' => 'Binance (USDT pairs)', 'needs_key' => false, 'note' => 'Public endpoints; USDT used as USD proxy. Not available in some regions.'],
        ];
        if (Config::demoMode()) {
            $list[] = ['id' => 'simulated', 'label' => 'Simulated (demo mode only)', 'needs_key' => false, 'note' => 'Fake prices for demos. Clearly labelled in every screen.'];
        }
        return $list;
    }

    public function activeAssets(): array
    {
        return $this->db->all('SELECT id, symbol, name, coingecko_id, binance_symbol, price_decimals, quantity_decimals, logo_path, color, is_active, sort_order
                               FROM assets WHERE is_active = 1 ORDER BY sort_order, symbol');
    }

    /** Fetches prices from the provider and stores snapshots. */
    public function refresh(): array
    {
        $assets = $this->activeAssets();
        $provider = $this->provider();
        $started = microtime(true);
        try {
            $prices = $provider->prices($assets);
        } catch (MarketDataException $e) {
            $this->settings->set('market_last_error', mb_substr($e->getMessage(), 0, 300));
            $this->settings->set('market_last_error_at', Database::now());
            Logger::warning('Market data refresh failed', ['provider' => $provider->id(), 'error' => $e->getMessage()]);
            return ['ok' => false, 'provider' => $provider->id(), 'error' => $e->getMessage(), 'updated' => 0];
        }
        $now = Database::now();
        $updated = 0;
        $missing = [];
        foreach ($assets as $a) {
            $p = $prices[$a['symbol']] ?? null;
            if ($p === null || $p['price'] === null || \OryzenX\Core\Decimal::cmp($p['price'], '0') <= 0) {
                $missing[] = $a['symbol'];
                continue;
            }
            $this->db->insert('market_price_snapshots', [
                'asset_id' => $a['id'],
                'price_usd' => $p['price'],
                'change_24h_pct' => $p['change_24h'],
                'source' => $provider->id(),
                'source_updated_at' => $p['source_updated_at'],
                'fetched_at' => $now,
            ]);
            $this->db->run(
                'REPLACE INTO asset_latest_prices (asset_id, price_usd, change_24h_pct, source, fetched_at) VALUES (:a, :p, :c, :s, :f)',
                ['a' => $a['id'], 'p' => $p['price'], 'c' => $p['change_24h'], 's' => $provider->id(), 'f' => $now]
            );
            $updated++;
        }
        $this->settings->set('market_last_success_at', $now);
        $this->settings->set('market_last_refresh_ms', (string) (int) ((microtime(true) - $started) * 1000));
        if ($missing) {
            $this->settings->set('market_last_error', 'No price returned for: ' . implode(', ', $missing));
            $this->settings->set('market_last_error_at', $now);
        }
        return ['ok' => true, 'provider' => $provider->id(), 'updated' => $updated, 'missing' => $missing];
    }

    /** Refreshes if prices are older than the poll interval. Uses a DB lock so only one request fetches. */
    public function ensureFresh(): void
    {
        $poll = max(30, $this->settings->int('market_poll_seconds', 60));
        $last = $this->settings->get('market_last_attempt_at');
        if ($last && strtotime($last . ' UTC') > time() - $poll) {
            return;
        }
        $got = (int) $this->db->value('SELECT GET_LOCK("oryzenx_market_refresh", 0)');
        if ($got !== 1) {
            return;
        }
        try {
            $this->settings->set('market_last_attempt_at', Database::now());
            $this->refresh();
        } finally {
            $this->db->value('SELECT RELEASE_LOCK("oryzenx_market_refresh")');
        }
    }

    /** Latest valid price per asset with staleness info. Keyed by asset id. */
    public function latest(): array
    {
        $stale = max(60, $this->settings->int('market_stale_seconds', 600));
        $rows = $this->db->all(
            'SELECT a.id, a.symbol, a.name, a.price_decimals, a.quantity_decimals, a.logo_path, a.color, a.is_active,
                    p.price_usd, p.change_24h_pct, p.source, p.fetched_at
             FROM assets a LEFT JOIN asset_latest_prices p ON p.asset_id = a.id
             ORDER BY a.sort_order, a.symbol'
        );
        $out = [];
        foreach ($rows as $r) {
            $age = $r['fetched_at'] ? time() - strtotime($r['fetched_at'] . ' UTC') : null;
            $out[(int) $r['id']] = [
                'asset_id' => (int) $r['id'],
                'symbol' => $r['symbol'],
                'name' => $r['name'],
                'price_decimals' => (int) $r['price_decimals'],
                'quantity_decimals' => (int) $r['quantity_decimals'],
                'logo_url' => $r['logo_path'] ? \OryzenX\Core\View::url($r['logo_path']) : null,
                'color' => $r['color'],
                'is_active' => (bool) $r['is_active'],
                'price' => $r['price_usd'] !== null ? \OryzenX\Core\Decimal::normalize($r['price_usd']) : null,
                'change_24h_pct' => $r['change_24h_pct'] !== null ? \OryzenX\Core\Decimal::normalize($r['change_24h_pct']) : null,
                'source' => $r['source'],
                'simulated' => $r['source'] === 'simulated',
                'updated_at' => $r['fetched_at'],
                'age_seconds' => $age,
                'stale' => $age === null || $age > $stale,
            ];
        }
        return $out;
    }

    public function priceFor(int $assetId): ?array
    {
        return $this->latest()[$assetId] ?? null;
    }

    /** Candles with a short DB cache to respect provider rate limits. */
    public function ohlc(int $assetId, string $range): array
    {
        if (!in_array($range, ['1D', '7D', '1M', '3M', '1Y'], true)) {
            $range = '1D';
        }
        $asset = $this->db->one('SELECT * FROM assets WHERE id = :id', ['id' => $assetId]);
        if (!$asset) {
            throw \OryzenX\Core\HttpException::notFound('Asset not found.');
        }
        $provider = $this->provider();
        $key = 'ohlc:' . $provider->id() . ':' . $assetId . ':' . $range;
        $ttl = ['1D' => 120, '7D' => 600, '1M' => 1800, '3M' => 3600, '1Y' => 7200][$range];
        $cached = $this->db->one('SELECT value, expires_at FROM cache_items WHERE cache_key = :k', ['k' => $key]);
        if ($cached && strtotime($cached['expires_at'] . ' UTC') > time()) {
            return json_decode($cached['value'], true) + ['cached' => true];
        }
        try {
            $candles = $provider->ohlc($asset, $range);
            $payload = ['candles' => $candles, 'source' => $provider->id(), 'simulated' => $provider->id() === 'simulated', 'fetched_at' => Database::now(), 'stale' => false, 'note' => $provider->quoteNote()];
            $this->db->run('REPLACE INTO cache_items (cache_key, value, expires_at) VALUES (:k, :v, :e)', [
                'k' => $key, 'v' => json_encode($payload), 'e' => gmdate('Y-m-d H:i:s', time() + $ttl),
            ]);
            return $payload;
        } catch (MarketDataException $e) {
            if ($cached) {
                return json_decode($cached['value'], true) + ['stale' => true, 'error' => 'Live chart data is temporarily unavailable; showing the last saved chart.'];
            }
            // fall back to stored snapshots (line-like candles) — real prices we already recorded
            $snaps = $this->db->all(
                'SELECT UNIX_TIMESTAMP(fetched_at) t, price_usd p FROM market_price_snapshots WHERE asset_id = :a AND fetched_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY) ORDER BY fetched_at LIMIT 2000',
                ['a' => $assetId]
            );
            $candles = array_map(fn ($s) => ['time' => (int) $s['t'], 'open' => $s['p'], 'high' => $s['p'], 'low' => $s['p'], 'close' => $s['p']], $snaps);
            return ['candles' => $candles, 'source' => 'snapshots', 'simulated' => false, 'fetched_at' => null, 'stale' => true,
                    'error' => 'Live chart data is unavailable. Showing prices previously recorded by OryzenX.', 'note' => ''];
        }
    }

    public function status(): array
    {
        $p = $this->provider();
        $latest = $this->latest();
        $staleCount = count(array_filter($latest, fn ($r) => $r['is_active'] && $r['stale']));
        return [
            'provider' => $p->id(),
            'provider_label' => $p->label(),
            'quote_note' => $p->quoteNote(),
            'api_key_configured' => $this->settings->has('market_api_key'),
            'poll_seconds' => $this->settings->int('market_poll_seconds', 60),
            'stale_seconds' => $this->settings->int('market_stale_seconds', 600),
            'last_success_at' => $this->settings->get('market_last_success_at'),
            'last_error' => $this->settings->get('market_last_error'),
            'last_error_at' => $this->settings->get('market_last_error_at'),
            'last_refresh_ms' => $this->settings->get('market_last_refresh_ms'),
            'stale_assets' => $staleCount,
            'healthy' => $staleCount === 0 && $this->settings->get('market_last_success_at') !== null,
        ];
    }

    /** Price history from stored snapshots (for small sparklines). */
    public function history(int $assetId, int $hours = 24): array
    {
        return $this->db->all(
            'SELECT fetched_at AS t, price_usd AS p FROM market_price_snapshots WHERE asset_id = :a AND fetched_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL :h HOUR) ORDER BY fetched_at',
            ['a' => $assetId, 'h' => $hours]
        );
    }

    public function prune(int $days = 180): int
    {
        return $this->db->run('DELETE FROM market_price_snapshots WHERE fetched_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL :d DAY)', ['d' => $days])->rowCount();
    }
}
