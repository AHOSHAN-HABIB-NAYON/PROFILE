<?php
declare(strict_types=1);

namespace OryzenX\Tests\Integration;

use OryzenX\Core\App;
use OryzenX\Core\Decimal as D;
use OryzenX\Core\HttpException;
use OryzenX\Services\AllocationService;
use OryzenX\Services\LedgerService;
use OryzenX\Services\LoanService;
use OryzenX\Services\PortfolioService;
use OryzenX\Services\ReconciliationService;
use OryzenX\Services\SalaryService;
use OryzenX\Services\TradeService;

final class TradeLoanAllocationTest extends IntegrationTestCase
{
    public function testClosedTradesRealizeNetOfFeesAndOpenTradesStayUnrealized(): void
    {
        $u = $this->createUser();
        $this->useFixedPrices(['SOL' => '150']);
        $t = App::get(TradeService::class);
        $t->record($u, ['asset_id' => $this->assetId('SOL'), 'direction' => 'long', 'quantity' => '2', 'entry_price' => '140', 'exit_price' => '152', 'fee_usd' => '1.2', 'opened_at' => gmdate('Y-m-d H:i:s', time() - 7200), 'closed_at' => gmdate('Y-m-d H:i:s', time() - 60)], null);
        $t->record($u, ['asset_id' => $this->assetId('SOL'), 'direction' => 'short', 'quantity' => '1', 'entry_price' => '160', 'exit_price' => '170', 'fee_usd' => '0.5', 'opened_at' => gmdate('Y-m-d H:i:s', time() - 7200), 'closed_at' => gmdate('Y-m-d H:i:s', time() - 60)], null);
        $open = $t->record($u, ['asset_id' => $this->assetId('SOL'), 'direction' => 'long', 'quantity' => '1', 'entry_price' => '140', 'opened_at' => gmdate('Y-m-d H:i:s', time() - 60)], null);
        $m = $t->monitor($u, new \DateTimeZone('UTC'));
        // (152−140)×2 − 1.2 = 22.8 ; (160−170)×1 − 0.5 = −10.5 ; total 12.3
        $this->assertSame('12.3', $m['periods']['today']);
        $this->assertSame('12.3', $m['periods']['all_time']);
        $this->assertSame('0', $m['periods']['yesterday']);
        $this->assertSame('10.5', $m['realized_losses_usd']);
        $this->assertSame('10', $m['unrealized_pnl_usd'], 'open trade valued at market, kept separate');
        $this->assertSame('12.3', $m['trading_balance_usd']);
        $this->assertSame('1.7', $m['fees_total_usd']);

        // closing the open trade realizes it once; closing again is rejected
        $t->close($open['trade_id'], '155', null, '0.3', null, 'close-key-0001');
        $dup = $t->close($open['trade_id'], '155', null, '0.3', null, 'close-key-0001');
        $this->assertTrue($dup['duplicate']);
        $this->assertSame('27', App::get(LedgerService::class)->realizedPnl($u, null, null)); // 12.3 + 14.7
        $this->assertTrue(App::get(ReconciliationService::class)->run($u)['ok']);
    }

    public function testDuplicateTradeReferenceRejected(): void
    {
        $u = $this->createUser();
        $t = App::get(TradeService::class);
        $in = ['asset_id' => $this->assetId('ETH'), 'direction' => 'long', 'quantity' => '1', 'entry_price' => '3000', 'reference' => 'EXCH-42'];
        $t->record($u, $in, null);
        $this->expectException(HttpException::class);
        $t->record($u, $in, null);
    }

    /** Coin loan example from the specification: 1 SOL borrowed at $106, revalued at $120 and $100. */
    public function testCoinLoanIsRevaluedAndNeverCountedAsEquity(): void
    {
        $u = $this->createUser();
        $this->useFixedPrices(['SOL' => '106']);
        $loan = App::get(LoanService::class)->create($u, ['denomination' => 'COIN', 'asset_id' => $this->assetId('SOL'), 'quantity' => '1', 'origination_price' => '106', 'credited_to' => 'holdings'], null);
        $p = App::get(PortfolioService::class);
        $s = $p->summary($u);
        $this->assertSame('106', $s['loan_balance_usd']);
        $this->assertSame('0', $s['net_value_usd']);

        $this->setPrice('SOL', '120');
        $s = $p->summary($u);
        $this->assertSame('120', $s['loan_balance_usd']);
        $this->assertSame('120', $s['investment_balance_usd']);
        $this->assertSame('0', $s['net_value_usd'], 'borrowed coins are not equity');
        $this->assertSame('0', $s['todays_profit_usd'], 'borrowed funds are not profit');

        $this->setPrice('SOL', '100');
        $s = $p->summary($u);
        $this->assertSame('100', $s['loan_balance_usd']);
        $detail = App::get(LoanService::class)->detail($loan['loan_id'], $u);
        $this->assertSame('1', D::normalize($detail['principal_quantity']), 'original quantity preserved');
        $this->assertSame('106', D::normalize($detail['principal_usd']), 'historical valuation preserved');
        $this->assertTrue(App::get(ReconciliationService::class)->run($u)['ok']);
    }

    public function testCoinLoanRepaymentRealizesTheValuationDifference(): void
    {
        $u = $this->createUser();
        $this->deposit($u, '500');
        $this->useFixedPrices(['SOL' => '106']);
        $loan = App::get(LoanService::class)->create($u, ['denomination' => 'COIN', 'asset_id' => $this->assetId('SOL'), 'quantity' => '1', 'origination_price' => '106', 'credited_to' => 'external'], null);
        // repay half at $120: pays 60, book reduction 53 → realized −7
        App::get(LoanService::class)->repay($loan['loan_id'], ['quantity' => '0.5', 'price' => '120', 'paid_from' => 'cash'], null);
        $l = App::get(LoanService::class)->detail($loan['loan_id'], $u);
        $this->assertSame('0.5', D::normalize($l['outstanding_quantity']));
        $this->assertSame('53', D::normalize($l['book_value_usd']));
        $this->assertSame('-7', App::get(LedgerService::class)->realizedPnl($u, null, null));
        $this->assertSame('440', App::get(LedgerService::class)->balance($u, 'cash'));
        App::get(LoanService::class)->repay($loan['loan_id'], ['quantity' => '0.5', 'price' => '100', 'paid_from' => 'cash'], null);
        $l = App::get(LoanService::class)->detail($loan['loan_id'], $u);
        $this->assertSame('repaid', $l['status']);
        $this->assertSame('-4', App::get(LedgerService::class)->realizedPnl($u, null, null)); // −7 + 3
        $this->assertTrue(App::get(ReconciliationService::class)->run($u)['ok']);
    }

    public function testUsdLoanRepaymentAndChargeOnlyWhenRecorded(): void
    {
        $u = $this->createUser();
        $svc = App::get(LoanService::class);
        $loan = $svc->create($u, ['denomination' => 'USD', 'principal_usd' => '500', 'credited_to' => 'cash', 'interest_rate_pct' => '5'], null);
        $this->assertSame('500', App::get(LedgerService::class)->balance($u, 'cash'));
        $this->assertSame('0', App::get(LedgerService::class)->realizedPnl($u, null, null), 'a loan is not profit');
        $l = $svc->detail($loan['loan_id'], $u);
        $this->assertSame('500', D::normalize($l['current_liability_usd']), 'no interest accrues unless explicitly charged');
        $svc->charge($loan['loan_id'], ['charge_type' => 'interest', 'amount_usd' => '2.5'], null);
        $svc->repay($loan['loan_id'], ['amount_usd' => '200', 'paid_from' => 'cash'], null);
        $l = $svc->detail($loan['loan_id'], $u);
        $this->assertSame('302.5', D::normalize($l['current_liability_usd']));
        $this->expectException(HttpException::class);
        $svc->repay($loan['loan_id'], ['amount_usd' => '1000', 'paid_from' => 'external'], null);
    }

    public function testAllocationUsesOnlyRealizedProfitAndCannotRepeat(): void
    {
        $u = $this->createUser();
        $this->useFixedPrices(['SOL' => '500']);
        $day = gmdate('Y-m-d', strtotime('-3 days'));
        App::get(TradeService::class)->record($u, ['asset_id' => $this->assetId('SOL'), 'direction' => 'long', 'quantity' => '1', 'entry_price' => '100', 'exit_price' => '200', 'fee_usd' => '0', 'opened_at' => $day . ' 08:00:00', 'closed_at' => $day . ' 10:00:00'], null);
        // a huge unrealized gain must not be allocated
        App::get(\OryzenX\Services\InvestmentService::class)->addEntry($u, ['asset_id' => $this->assetId('SOL'), 'quantity' => '10', 'unit_price' => '100', 'funding' => 'external', 'acquired_at' => $day . ' 09:00:00'], null);
        $a = App::get(AllocationService::class);
        $p = $a->preview(null, $day, $day);
        $this->assertSame('100', $p['eligible_usd']);
        $this->assertSame('100', $p['allocated_usd']); // 40 + 30 + 25 + 5
        $this->assertSame(['40', '30', '25', '5'], array_column($p['lines'], 'amount_usd'));
        $run = $a->run(null, $day, $day, null, null);
        try {
            $a->run(null, $day, $day, null, null);
            $this->fail('Repeated allocation must be rejected');
        } catch (HttpException $e) {
            $this->assertSame('already_allocated', $e->errorCode);
        }
        $a->reverse((int) $run['id'], null, 'redo with new rules');
        $this->assertFalse($a->preview(null, $day, $day)['already_allocated']);
        $this->assertTrue(App::get(ReconciliationService::class)->run()['ok']);
    }

    public function testAllocationRulesCannotExceedHundredPercent(): void
    {
        $this->expectException(HttpException::class);
        App::get(AllocationService::class)->saveRules([
            ['category' => 'retained', 'percent' => '60', 'is_active' => true],
            ['category' => 'salary', 'percent' => '50', 'is_active' => true],
        ], null);
    }

    public function testSalaryIsSeparateFromProfitAndPostsToLedgerOnce(): void
    {
        $u = $this->createUser();
        $s = App::get(SalaryService::class);
        $s->upsertSchedule($u, ['amount' => '300', 'currency' => 'USD', 'pay_day' => 5, 'start_date' => '2026-01-01', 'is_active' => true], null);
        $this->assertSame(1, $s->generateForPeriod('2026-09', null));
        $this->assertSame(0, $s->generateForPeriod('2026-09', null), 'generation is idempotent');
        $rec = $this->db->one('SELECT id FROM salary_records WHERE user_id = :u', ['u' => $u]);
        $s->updateRecord((int) $rec['id'], ['status' => 'paid', 'payment_date' => '2026-09-05'], null);
        $this->assertSame('300', App::get(LedgerService::class)->balance($u, 'salary'));
        $this->assertSame('0', App::get(LedgerService::class)->realizedPnl($u, null, null), 'salary is never profit');
        $this->assertSame('0', App::get(PortfolioService::class)->summary($u)['all_balance_usd']);
        // reverting to processed reverses the ledger posting with a visible reversal
        $s->updateRecord((int) $rec['id'], ['status' => 'processed'], null);
        $this->assertSame('0', App::get(LedgerService::class)->balance($u, 'salary'));
        $this->assertSame(1, (int) $this->db->value('SELECT COUNT(*) FROM financial_transactions WHERE status = "reversal" AND user_id = :u', ['u' => $u]));
        $this->assertTrue(App::get(ReconciliationService::class)->run($u)['ok']);
    }

    public function testNonUsdSalaryRequiresConversionRate(): void
    {
        $u = $this->createUser();
        $s = App::get(SalaryService::class);
        $s->upsertSchedule($u, ['amount' => '30000', 'currency' => 'BDT', 'pay_day' => 1, 'start_date' => '2026-01-01', 'is_active' => true], null);
        $s->generateForPeriod('2026-09', null);
        $id = (int) $this->db->value('SELECT id FROM salary_records WHERE user_id = :u', ['u' => $u]);
        try {
            $s->updateRecord($id, ['status' => 'paid'], null);
            $this->fail('Missing rate must be rejected');
        } catch (HttpException $e) {
            $this->assertArrayHasKey('usd_rate', $e->fields);
        }
        $s->updateRecord($id, ['status' => 'paid', 'usd_rate' => '0.0082'], null);
        $this->assertSame('246', App::get(LedgerService::class)->balance($u, 'salary'));
    }

    public function testUnbalancedLedgerPostingIsImpossible(): void
    {
        $this->expectException(\LogicException::class);
        App::get(LedgerService::class)->post(['type' => 'adjustment', 'user_id' => null], [
            ['account' => 'cash', 'amount' => '10'],
            ['account' => 'external', 'amount' => '-9.99'],
        ]);
    }

    public function testWithdrawalCannotOverdraw(): void
    {
        $u = $this->createUser();
        $this->deposit($u, '100');
        $this->expectException(HttpException::class);
        App::get(LedgerService::class)->recordCashMovement($u, ['type' => 'withdrawal', 'amount' => '100.01'], null);
    }

    /** Two processes sell the same holding at the same moment: row locking allows only one to succeed. */
    public function testConcurrentSalesCannotOversell(): void
    {
        if (!function_exists('pcntl_fork')) {
            $this->markTestSkipped('pcntl not available');
        }
        $u = $this->createUser();
        App::get(\OryzenX\Services\InvestmentService::class)->addEntry($u, ['asset_id' => $this->assetId('SOL'), 'quantity' => '1', 'unit_price' => '100', 'funding' => 'external'], null);
        $sol = $this->assetId('SOL');
        $pids = [];
        for ($i = 0; $i < 2; $i++) {
            $pid = pcntl_fork();
            if ($pid === 0) {
                \OryzenX\Core\Database::setInstance(null);
                \OryzenX\Core\App::reset();
                try {
                    App::get(\OryzenX\Services\InvestmentService::class)->sell($u, ['asset_id' => $sol, 'quantity' => '0.8', 'unit_price' => '120'], null);
                    exit(0);
                } catch (\Throwable) {
                    exit(3);
                }
            }
            $pids[] = $pid;
        }
        $codes = [];
        foreach ($pids as $pid) {
            pcntl_waitpid($pid, $status);
            $codes[] = pcntl_wexitstatus($status);
        }
        sort($codes);
        \OryzenX\Core\Database::setInstance(null);
        $this->db = \OryzenX\Core\Database::instance();
        $this->assertSame([0, 3], $codes, 'exactly one sale succeeds');
        $this->assertSame('0.2', D::normalize((string) $this->db->value('SELECT quantity FROM investment_positions WHERE user_id = :u', ['u' => $u])));
    }
}
