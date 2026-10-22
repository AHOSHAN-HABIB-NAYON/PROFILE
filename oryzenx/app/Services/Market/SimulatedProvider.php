<?php
declare(strict_types=1);

namespace OryzenX\Services\Market;

use OryzenX\Core\Decimal as D;

/**
 * DEMO MODE ONLY. Generates deterministic, clearly labelled simulated prices so the UI can be
 * exercised without network access. Never selectable when demo_mode is off; every price it
 * produces is stored with source "simulated" and shown with a "Simulated" badge.
 */
final class SimulatedProvider implements MarketDataProvider
{
    private const BASE = ['SOL' => '150', 'ETH' => '3200', 'XRP' => '0.6', 'SUI' => '1.8', 'ZEC' => '45', 'PEPE' => '0.00001'];

    public function id(): string
    {
        return 'simulated';
    }

    public function label(): string
    {
        return 'Simulated (demo)';
    }

    public function quoteNote(): string
    {
        return 'SIMULATED demo prices — not real market data.';
    }

    private function factor(string $symbol, int $t): float
    {
        $seed = crc32($symbol);
        $x = sin($t / 3600 + $seed) * 0.04 + sin($t / 517 + $seed / 7) * 0.012 + sin($t / 86400 * 2 + $seed / 3) * 0.08;
        return 1 + $x;
    }

    private function priceAt(string $symbol, int $t): string
    {
        $base = self::BASE[$symbol] ?? '10';
        $f = sprintf('%.8F', $this->factor($symbol, $t));
        return D::round(D::mul($base, $f), D::cmp($base, '1') < 0 ? 12 : 4);
    }

    public function prices(array $assets): array
    {
        $now = time();
        $out = [];
        foreach ($assets as $a) {
            $p = $this->priceAt($a['symbol'], $now);
            $prev = $this->priceAt($a['symbol'], $now - 86400);
            $out[$a['symbol']] = [
                'price' => $p,
                'change_24h' => D::round(D::mul(D::div(D::sub($p, $prev), $prev, 10), '100'), 4),
                'source_updated_at' => gmdate('Y-m-d H:i:s', $now),
            ];
        }
        return $out;
    }

    public function ohlc(array $asset, string $range): array
    {
        [$step, $count] = ['1D' => [900, 96], '7D' => [3600, 168], '1M' => [14400, 180], '3M' => [86400, 90], '1Y' => [86400, 365]][$range] ?? [900, 96];
        $end = intdiv(time(), $step) * $step;
        $out = [];
        for ($i = $count - 1; $i >= 0; $i--) {
            $t = $end - $i * $step;
            $o = $this->priceAt($asset['symbol'], $t);
            $c = $this->priceAt($asset['symbol'], $t + $step);
            $mid1 = $this->priceAt($asset['symbol'], $t + intdiv($step, 3));
            $mid2 = $this->priceAt($asset['symbol'], $t + intdiv($step * 2, 3));
            $out[] = ['time' => $t, 'open' => $o, 'high' => D::max(D::max($o, $c), D::max($mid1, $mid2)), 'low' => D::min(D::min($o, $c), D::min($mid1, $mid2)), 'close' => $c];
        }
        return $out;
    }
}
