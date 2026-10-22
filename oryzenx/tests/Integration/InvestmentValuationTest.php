<?php
declare(strict_types=1);

namespace OryzenX\Tests\Integration;

use OryzenX\Core\App;
use OryzenX\Core\Decimal as D;
use OryzenX\Core\HttpException;
use OryzenX\Services\InvestmentService;
use OryzenX\Services\PortfolioService;
use OryzenX\Services\ReconciliationService;

final class InvestmentValuationTest extends IntegrationTestCase
{
    private function holding(int $userId, string $symbol): array
    {
        foreach (App::get(PortfolioService::class)->holdings($userId) as $h) {
            if ($h['symbol'] === $symbol) {
                return $h;
            }
        }
        $this->fail("No $symbol holding");
    }

    /** The specification's SOL example, end to end through the services and the price feed. */
    public function testSolExampleGainThenLoss(): void
    {
        $u = $this->createUser();
        $this->useFixedPrices(['SOL' => '106']);
        App::get(InvestmentService::class)->addEntry($u, ['asset_id' => $this->assetId('SOL'), 'quantity' => '1', 'unit_price' => '106', 'fee_usd' => '0', 'funding' => 'external'], null);

        $h = $this->holding($u, 'SOL');
        $this->assertSame('106', $h['cost_basis_usd']);
        $this->assertSame('106', D::normalize($h['average_price']));

        $this->setPrice('SOL', '120');
        $h = $this->holding($u, 'SOL');
        $this->assertSame('120', $h['market_value_usd']);
        $this->assertSame('14', $h['unrealized_pnl_usd']);
        $this->assertSame('13.21', $h['return_pct']);

        $this->setPrice('SOL', '100');
        $h = $this->holding($u, 'SOL');
        $this->assertSame('100', $h['market_value_usd']);
        $this->assertSame('-6', $h['unrealized_pnl_usd']);
        $this->assertSame('-5.66', $h['return_pct']);

        // the historical acquisition price is never overwritten by market moves
        $lot = $this->db->one('SELECT unit_price, cost_basis_usd FROM investment_entries WHERE user_id = :u', ['u' => $u]);
        $this->assertSame('106', D::normalize($lot['unit_price']));
        $this->assertSame('106', D::normalize($lot['cost_basis_usd']));
        // unrealized moves never create realized P/L
        $this->assertSame('0', App::get(\OryzenX\Services\LedgerService::class)->realizedPnl($u, null, null));
    }

    public function testSolExampleThroughDashboardApi(): void
    {
        $u = $this->createUser();
        $this->useFixedPrices(['SOL' => '120']);
        App::get(InvestmentService::class)->addEntry($u, ['asset_id' => $this->assetId('SOL'), 'quantity' => '1', 'unit_price' => '106', 'funding' => 'external'], null);
        $r = $this->api('GET', '/api/dashboard', [], $this->token($u));
        $this->assertSame(200, $r['status']);
        $d = $r['json']['data'];
        $this->assertSame('120', $d['investment_balance_usd']);
        $this->assertSame('14', $d['unrealized_pnl_usd']);
        $this->assertSame('13.21', $d['unrealized_return_pct']);
        $this->assertSame('0', $d['todays_profit_usd'], 'unrealized gain must not appear as today\'s profit');
        $this->assertArrayNotHasKey('admin_total_users', $d, 'ordinary users never see platform user counts');
    }

    public function testFeesAreIncludedInCostBasis(): void
    {
        $u = $this->createUser();
        $this->useFixedPrices(['ETH' => '3000']);
        App::get(InvestmentService::class)->addEntry($u, ['asset_id' => $this->assetId('ETH'), 'quantity' => '0.5', 'unit_price' => '2950', 'fee_usd' => '2.5', 'funding' => 'external'], null);
        $h = $this->holding($u, 'ETH');
        $this->assertSame('1477.5', $h['cost_basis_usd']);
        $this->assertSame('1500', $h['market_value_usd']);
        $this->assertSame('22.5', $h['unrealized_pnl_usd']);
    }

    public function testPartialSaleUsesAverageCostAndRealizesSeparately(): void
    {
        $u = $this->createUser();
        $this->useFixedPrices(['SOL' => '130']);
        $svc = App::get(InvestmentService::class);
        $sol = $this->assetId('SOL');
        $svc->addEntry($u, ['asset_id' => $sol, 'quantity' => '1', 'unit_price' => '100', 'funding' => 'external'], null);
        $svc->addEntry($u, ['asset_id' => $sol, 'quantity' => '1', 'unit_price' => '120', 'funding' => 'external'], null);
        // average cost 110; sell 0.5 at 130 with fee 1 → proceeds 65, cost removed 55, realized 65 − 1 − 55 = 9
        $sale = $svc->sell($u, ['asset_id' => $sol, 'quantity' => '0.5', 'unit_price' => '130', 'fee_usd' => '1'], null);
        $this->assertSame('9', $sale['realized_pnl_usd']);
        $h = $this->holding($u, 'SOL');
        $this->assertSame('1.5', $h['quantity']);
        $this->assertSame('165', $h['cost_basis_usd']);
        $this->assertSame('110', D::normalize($h['average_price']));
        $this->assertSame('30', $h['unrealized_pnl_usd']); // 1.5 × 130 − 165
        $this->assertSame('9', App::get(\OryzenX\Services\LedgerService::class)->realizedPnl($u, null, null));
        $this->assertSame('64', App::get(\OryzenX\Services\LedgerService::class)->balance($u, 'cash'));
        $this->assertTrue(App::get(ReconciliationService::class)->run($u)['ok']);
    }

    public function testCannotSellMoreThanHeld(): void
    {
        $u = $this->createUser();
        App::get(InvestmentService::class)->addEntry($u, ['asset_id' => $this->assetId('SOL'), 'quantity' => '1', 'unit_price' => '100', 'funding' => 'external'], null);
        $this->expectException(HttpException::class);
        App::get(InvestmentService::class)->sell($u, ['asset_id' => $this->assetId('SOL'), 'quantity' => '1.5', 'unit_price' => '100'], null);
    }

    public function testCashFundedPurchaseNeedsSufficientCash(): void
    {
        $u = $this->createUser();
        $this->deposit($u, '50');
        try {
            App::get(InvestmentService::class)->addEntry($u, ['asset_id' => $this->assetId('SOL'), 'quantity' => '1', 'unit_price' => '106', 'funding' => 'cash'], null);
            $this->fail('Expected insufficient cash');
        } catch (HttpException $e) {
            $this->assertSame(422, $e->status);
        }
        $this->assertSame('50', App::get(\OryzenX\Services\LedgerService::class)->balance($u, 'cash'));
    }

    public function testDuplicateSubmissionWithSameIdempotencyKeyIsRecordedOnce(): void
    {
        $u = $this->createUser();
        $svc = App::get(InvestmentService::class);
        $in = ['asset_id' => $this->assetId('SOL'), 'quantity' => '1', 'unit_price' => '106', 'funding' => 'external', 'idempotency_key' => 'same-key-123456'];
        $a = $svc->addEntry($u, $in, null);
        $b = $svc->addEntry($u, $in, null);
        $this->assertFalse($a['duplicate']);
        $this->assertTrue($b['duplicate']);
        $this->assertSame($a['transaction_id'], $b['transaction_id']);
        $this->assertSame(1, (int) $this->db->value('SELECT COUNT(*) FROM investment_entries WHERE user_id = :u', ['u' => $u]));
        $this->assertSame('1', $this->holding($u, 'SOL')['quantity']);
    }

    public function testReversalsAreAuditableAndNewestFirst(): void
    {
        $u = $this->createUser();
        $svc = App::get(InvestmentService::class);
        $sol = $this->assetId('SOL');
        $e1 = $svc->addEntry($u, ['asset_id' => $sol, 'quantity' => '2', 'unit_price' => '100', 'funding' => 'external'], null);
        $sale = $svc->sell($u, ['asset_id' => $sol, 'quantity' => '1', 'unit_price' => '150'], null);
        try {
            $svc->reverseEntry($e1['entry_id'], null, 'wrong order test');
            $this->fail('Older entry must not be reversible while a newer sale exists');
        } catch (HttpException $e) {
            $this->assertSame('not_latest', $e->errorCode);
        }
        $svc->reverseSale($sale['sale_id'], null, 'customer error');
        $svc->reverseEntry($e1['entry_id'], null, 'entered twice');
        // originals remain, marked reversed; the reversal entries cancel them exactly
        $this->assertSame(2, (int) $this->db->value('SELECT COUNT(*) FROM financial_transactions WHERE user_id = :u AND status = "reversed"', ['u' => $u]));
        $this->assertSame(2, (int) $this->db->value('SELECT COUNT(*) FROM financial_transactions WHERE user_id = :u AND status = "reversal"', ['u' => $u]));
        $this->assertSame('0', App::get(\OryzenX\Services\LedgerService::class)->realizedPnl($u, null, null));
        $pos = $this->db->one('SELECT quantity, cost_basis_usd FROM investment_positions WHERE user_id = :u', ['u' => $u]);
        $this->assertSame('0', D::normalize($pos['quantity']));
        $this->assertTrue(App::get(ReconciliationService::class)->run($u)['ok']);
    }

    public function testMissingPriceIsReportedNotInvented(): void
    {
        $u = $this->createUser();
        App::get(InvestmentService::class)->addEntry($u, ['asset_id' => $this->assetId('ZEC'), 'quantity' => '3', 'unit_price' => '40', 'funding' => 'external'], null);
        $s = App::get(PortfolioService::class)->summary($u);
        $this->assertSame(['ZEC'], $s['unpriced_assets']);
        $this->assertSame('0', $s['investment_balance_usd']);
        $this->assertNull($s['holdings'][0]['market_value_usd']);
    }

    public function testStalePriceKeepsLastValidValueWithWarning(): void
    {
        $u = $this->createUser();
        $this->useFixedPrices(['SOL' => '120']);
        App::get(InvestmentService::class)->addEntry($u, ['asset_id' => $this->assetId('SOL'), 'quantity' => '1', 'unit_price' => '106', 'funding' => 'external'], null);
        $this->db->run('UPDATE asset_latest_prices SET fetched_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR)');
        $this->prices = ['__fail__' => '1'];
        $r = App::get(\OryzenX\Services\MarketService::class)->refresh();
        $this->assertFalse($r['ok']);
        $s = App::get(PortfolioService::class)->summary($u);
        $this->assertSame('120', $s['investment_balance_usd'], 'last valid price is kept');
        $this->assertSame(['SOL'], $s['stale_assets']);
    }
}
