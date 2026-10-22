<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Decimal as D;

/**
 * Portfolio valuation. Definitions (shown to users in the app):
 *  market value        = holding quantity × latest valid market price
 *  unrealized P/L      = market value − remaining cost basis
 *  return %            = unrealized P/L ÷ remaining cost basis × 100
 *  investment balance  = Σ market value of holdings
 *  all balance (gross) = cash + trading balance + investment balance
 *  loan balance        = Σ current liability value of active loans (coin loans revalued at market price)
 *  net value           = all balance − loan balance
 *  today's profit      = net realized P/L recorded today (business timezone): closed trades, sales, loan settlements, after fees
 *  loss balance        = Σ of realized losses (absolute), all time
 */
final class PortfolioService
{
    public function __construct(
        private Database $db,
        private LedgerService $ledger,
        private MarketService $market,
        private LoanService $loans,
        private SettingsService $settings
    ) {
    }

    /** Pure valuation of one holding — used by the API and the unit tests. */
    public static function valueHolding(string $quantity, string $costBasis, ?string $price): array
    {
        if ($price === null) {
            return ['market_value' => null, 'unrealized_pnl' => null, 'return_pct' => null];
        }
        $mv = D::round(D::mul($quantity, $price), 8);
        $pnl = D::sub($mv, $costBasis);
        $pct = D::cmp($costBasis, '0') > 0 ? D::round(D::mul(D::div($pnl, $costBasis, 12), '100'), 2) : null;
        return ['market_value' => $mv, 'unrealized_pnl' => D::round($pnl, 8), 'return_pct' => $pct];
    }

    public function holdings(int $userId, ?array $prices = null): array
    {
        $prices ??= $this->market->latest();
        $rows = $this->db->all(
            'SELECT p.asset_id, p.quantity, p.cost_basis_usd, p.realized_pnl_usd, p.updated_at
             FROM investment_positions p JOIN assets a ON a.id = p.asset_id
             WHERE p.user_id = :u AND (p.quantity > 0 OR p.realized_pnl_usd <> 0) ORDER BY a.sort_order, a.symbol',
            ['u' => $userId]
        );
        $loanQty = [];
        foreach ($this->db->all('SELECT asset_id, SUM(outstanding_quantity) q FROM loans WHERE user_id = :u AND status = "active" AND denomination = "COIN" AND credited_to = "holdings" GROUP BY asset_id', ['u' => $userId]) as $l) {
            $loanQty[(int) $l['asset_id']] = D::normalize($l['q']);
        }
        $out = [];
        foreach ($rows as $r) {
            $pr = $prices[(int) $r['asset_id']] ?? null;
            $qty = D::normalize($r['quantity']);
            $cost = D::normalize($r['cost_basis_usd']);
            $v = self::valueHolding($qty, $cost, $pr['price'] ?? null);
            $avg = D::cmp($qty, '0') > 0 ? D::round(D::div($cost, $qty, 18), 10) : null;
            $out[] = [
                'asset_id' => (int) $r['asset_id'],
                'symbol' => $pr['symbol'] ?? '',
                'name' => $pr['name'] ?? '',
                'logo_url' => $pr['logo_url'] ?? null,
                'color' => $pr['color'] ?? null,
                'price_decimals' => $pr['price_decimals'] ?? 2,
                'quantity' => $qty,
                'borrowed_quantity' => $loanQty[(int) $r['asset_id']] ?? '0',
                'average_price' => $avg,
                'cost_basis_usd' => $cost,
                'current_price' => $pr['price'] ?? null,
                'change_24h_pct' => $pr['change_24h_pct'] ?? null,
                'price_source' => $pr['source'] ?? null,
                'price_simulated' => $pr['simulated'] ?? false,
                'price_updated_at' => $pr['updated_at'] ?? null,
                'price_stale' => $pr['stale'] ?? true,
                'market_value_usd' => $v['market_value'],
                'unrealized_pnl_usd' => $v['unrealized_pnl'],
                'return_pct' => $v['return_pct'],
                'realized_pnl_usd' => D::normalize($r['realized_pnl_usd']),
            ];
        }
        return $out;
    }

    public function summary(int $userId): array
    {
        $prices = $this->market->latest();
        $bal = $this->ledger->balances($userId);
        $holdings = $this->holdings($userId, $prices);
        $investmentValue = '0';
        $unrealized = '0';
        $cost = '0';
        $unpriced = [];
        $stale = [];
        foreach ($holdings as $h) {
            if (D::isZero($h['quantity'])) {
                continue;
            }
            if ($h['market_value_usd'] === null) {
                $unpriced[] = $h['symbol'];
                continue;
            }
            if ($h['price_stale']) {
                $stale[] = $h['symbol'];
            }
            $investmentValue = D::add($investmentValue, $h['market_value_usd']);
            $unrealized = D::add($unrealized, $h['unrealized_pnl_usd']);
            $cost = D::add($cost, $h['cost_basis_usd']);
        }
        [$loanRows] = $this->loans->list($userId, ['status' => 'active'], 1, 200);
        $liabilities = '0';
        foreach ($loanRows as $l) {
            $liabilities = D::add($liabilities, $l['current_liability_usd']);
            if ($l['price_stale'] && $l['denomination'] === 'COIN') {
                $stale[] = $l['symbol'] . ' (loan)';
            }
        }
        $gross = D::add(D::add($bal['cash'], $bal['trading']), $investmentValue);
        $tz = $this->settings->timezone();
        $todayStart = (new \DateTimeImmutable('today', $tz))->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        $today = $this->ledger->realizedPnl($userId, $todayStart, null);
        $losses = (string) $this->db->value(
            'SELECT COALESCE(SUM(realized_pnl_usd),0) FROM financial_transactions WHERE user_id = :u AND status = "completed" AND realized_pnl_usd < 0',
            ['u' => $userId]
        );
        $lastUpdate = null;
        foreach ($prices as $p) {
            if ($p['updated_at'] && ($lastUpdate === null || $p['updated_at'] > $lastUpdate)) {
                $lastUpdate = $p['updated_at'];
            }
        }
        $total = D::cmp($gross, '0') > 0 ? $gross : null;
        $allocation = [];
        foreach ([['Cash', $bal['cash'], null], ['Trading', $bal['trading'], null]] as [$label, $v, $c]) {
            if (D::cmp($v, '0') > 0) {
                $allocation[] = ['label' => $label, 'value_usd' => $v, 'pct' => $total ? D::round(D::mul(D::div($v, $total, 12), '100'), 2) : '0', 'color' => $c];
            }
        }
        foreach ($holdings as $h) {
            if ($h['market_value_usd'] !== null && D::cmp($h['market_value_usd'], '0') > 0) {
                $allocation[] = ['label' => $h['symbol'], 'value_usd' => $h['market_value_usd'], 'pct' => $total ? D::round(D::mul(D::div($h['market_value_usd'], $total, 12), '100'), 2) : '0', 'color' => $h['color']];
            }
        }
        $simulated = count(array_filter($holdings, fn ($h) => $h['price_simulated'])) > 0;
        return [
            'currency' => 'USD',
            'all_balance_usd' => D::round($gross, 8),
            'cash_balance_usd' => $bal['cash'],
            'trading_balance_usd' => $bal['trading'],
            'investment_balance_usd' => D::round($investmentValue, 8),
            'investment_cost_basis_usd' => D::round($cost, 8),
            'unrealized_pnl_usd' => D::round($unrealized, 8),
            'unrealized_return_pct' => D::cmp($cost, '0') > 0 ? D::round(D::mul(D::div($unrealized, $cost, 12), '100'), 2) : null,
            'loan_balance_usd' => D::round($liabilities, 8),
            'net_value_usd' => D::round(D::sub($gross, $liabilities), 8),
            'todays_profit_usd' => D::round($today, 8),
            'loss_balance_usd' => D::abs($losses),
            'realized_pnl_all_time_usd' => $this->ledger->realizedPnl($userId, null, null),
            'salary_received_usd' => $bal['salary'],
            'holdings' => $holdings,
            'allocation' => $allocation,
            'active_loans' => count($loanRows),
            'unpriced_assets' => $unpriced,
            'stale_assets' => array_values(array_unique($stale)),
            'prices_simulated' => $simulated,
            'last_market_update' => $lastUpdate,
            'timezone' => $tz->getName(),
            'generated_at' => Database::now(),
        ];
    }

    /** Daily snapshots of net value for the performance chart (written by the scheduler). */
    public function snapshot(int $userId): array
    {
        $s = $this->summary($userId);
        $date = (new \DateTimeImmutable('now', $this->settings->timezone()))->format('Y-m-d');
        $this->db->run(
            'REPLACE INTO portfolio_snapshots (user_id, snapshot_date, gross_assets_usd, liabilities_usd, net_value_usd, created_at) VALUES (:u, :d, :g, :l, :n, :c)',
            ['u' => $userId, 'd' => $date, 'g' => $s['all_balance_usd'], 'l' => $s['loan_balance_usd'], 'n' => $s['net_value_usd'], 'c' => Database::now()]
        );
        return $s;
    }

    public function performance(int $userId, int $days = 90): array
    {
        return $this->db->all(
            'SELECT snapshot_date AS date, gross_assets_usd, liabilities_usd, net_value_usd FROM portfolio_snapshots
             WHERE user_id = :u AND snapshot_date >= DATE_SUB(CURDATE(), INTERVAL :d DAY) ORDER BY snapshot_date',
            ['u' => $userId, 'd' => $days]
        );
    }

    /** Asset detail: holding + related transactions. */
    public function assetDetail(int $userId, int $assetId): array
    {
        $prices = $this->market->latest();
        $asset = $prices[$assetId] ?? null;
        if ($asset === null) {
            throw \OryzenX\Core\HttpException::notFound('Asset not found.');
        }
        $holding = null;
        foreach ($this->holdings($userId, $prices) as $h) {
            if ($h['asset_id'] === $assetId) {
                $holding = $h;
            }
        }
        $txs = $this->db->all(
            'SELECT id, type, status, quantity, unit_price, amount_usd, fee_usd, realized_pnl_usd, effective_at, reference
             FROM financial_transactions WHERE user_id = :u AND asset_id = :a ORDER BY effective_at DESC, id DESC LIMIT 50',
            ['u' => $userId, 'a' => $assetId]
        );
        $lots = $this->db->all(
            'SELECT id, quantity, unit_price, fee_usd, cost_basis_usd, acquired_at, funding, status FROM investment_entries
             WHERE user_id = :u AND asset_id = :a AND status <> "reversed" ORDER BY acquired_at DESC LIMIT 50',
            ['u' => $userId, 'a' => $assetId]
        );
        return ['asset' => $asset, 'holding' => $holding, 'lots' => $lots, 'transactions' => $txs];
    }
}
