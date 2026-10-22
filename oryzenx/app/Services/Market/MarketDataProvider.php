<?php
declare(strict_types=1);

namespace OryzenX\Services\Market;

/**
 * Adapter contract for market data providers. Portfolio maths never depends on a specific provider.
 * Prices are returned as decimal strings in USD (or a USD stablecoin, see quoteNote()).
 */
interface MarketDataProvider
{
    public function id(): string;

    public function label(): string;

    /** Short disclosure about the quote currency (e.g. USDT pairs used as a USD proxy). */
    public function quoteNote(): string;

    /**
     * @param array<int, array{id:int, symbol:string, coingecko_id:?string, binance_symbol:?string}> $assets
     * @return array<string, array{price:string, change_24h:?string, source_updated_at:?string}> keyed by symbol
     * @throws MarketDataException
     */
    public function prices(array $assets): array;

    /**
     * Candles for a chart.
     * @param string $range one of 1D, 7D, 1M, 3M, 1Y
     * @return array<int, array{time:int, open:string, high:string, low:string, close:string}>
     * @throws MarketDataException
     */
    public function ohlc(array $asset, string $range): array;
}
