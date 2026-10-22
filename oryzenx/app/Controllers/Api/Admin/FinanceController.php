<?php
declare(strict_types=1);

namespace OryzenX\Controllers\Api\Admin;

use OryzenX\Controllers\Controller;
use OryzenX\Core\HttpException;
use OryzenX\Core\Request;
use OryzenX\Core\Response;
use OryzenX\Core\Validator;
use OryzenX\Services\AllocationService;
use OryzenX\Services\InvestmentService;
use OryzenX\Services\LedgerService;
use OryzenX\Services\LoanService;
use OryzenX\Services\ReconciliationService;
use OryzenX\Services\SettingsService;
use OryzenX\Services\TradeService;

/** Administrative financial entry. All writes are idempotent (idempotency_key) and audited. */
final class FinanceController extends Controller
{
    public function __construct(
        private InvestmentService $investments,
        private TradeService $trades,
        private LedgerService $ledger,
        private LoanService $loans,
        private AllocationService $allocation,
        private ReconciliationService $recon,
        private SettingsService $settings
    ) {
    }

    private function targetUser(Request $req): int
    {
        $uid = $req->int('user_id');
        $u = \OryzenX\Core\App::get(\OryzenX\Core\Database::class)->one('SELECT id, status FROM users WHERE id = :id', ['id' => $uid]);
        if (!$u) {
            throw HttpException::validation(['user_id' => 'Select an account.']);
        }
        if ($u['status'] !== 'active') {
            throw HttpException::validation(['user_id' => 'This account is suspended. Reactivate it before recording new entries.']);
        }
        return $uid;
    }

    // ---------------------------------------------------------------- investments
    public function investments(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 25);
        [$rows, $total] = $this->investments->entries(null, $this->filters($req, ['user_id', 'asset_id', 'status']), $page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    public function addInvestment(Request $req): Response
    {
        $uid = $this->targetUser($req);
        $d = Validator::make($req->json(), [
            'asset_id' => 'required|int',
            'quantity' => 'required|decimal|gt:0',
            'unit_price' => 'required|decimal|gt:0',
            'fee_usd' => 'nullable|decimal|gte:0',
            'acquired_at' => 'nullable|string',
            'funding' => 'required|in:cash,external',
            'notes' => 'nullable|string|max:1000',
            'idempotency_key' => 'required|string|max:80',
        ])->validated();
        $d['acquired_at'] = $this->toUtc($d['acquired_at'] ?? null, 'acquired_at') ?? \OryzenX\Core\Database::now();
        return Response::ok($this->investments->addEntry($uid, $d, $this->uid($req)));
    }

    public function sales(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 25);
        [$rows, $total] = $this->investments->sales(null, $this->filters($req, ['user_id', 'asset_id']), $page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    public function sell(Request $req): Response
    {
        $uid = $this->targetUser($req);
        $d = Validator::make($req->json(), [
            'asset_id' => 'required|int',
            'quantity' => 'required|decimal|gt:0',
            'unit_price' => 'required|decimal|gt:0',
            'fee_usd' => 'nullable|decimal|gte:0',
            'sold_at' => 'nullable|string',
            'notes' => 'nullable|string|max:1000',
            'idempotency_key' => 'required|string|max:80',
        ])->validated();
        $d['sold_at'] = $this->toUtc($d['sold_at'] ?? null, 'sold_at') ?? \OryzenX\Core\Database::now();
        return Response::ok($this->investments->sell($uid, $d, $this->uid($req)));
    }

    public function reverseInvestment(Request $req): Response
    {
        return Response::ok(['reversal_transaction_id' => $this->investments->reverseEntry($this->id($req), $this->uid($req), $this->reason($req))]);
    }

    public function reverseSale(Request $req): Response
    {
        return Response::ok(['reversal_transaction_id' => $this->investments->reverseSale($this->id($req), $this->uid($req), $this->reason($req))]);
    }

    public function investmentNotes(Request $req): Response
    {
        $this->investments->updateNotes($this->id($req), $req->str('notes') ?: null, $this->uid($req));
        return Response::ok(['updated' => true]);
    }

    public function archiveInvestment(Request $req): Response
    {
        $this->investments->archive($this->id($req), $this->uid($req));
        return Response::ok(['archived' => true]);
    }

    // ---------------------------------------------------------------- trades
    public function trades(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 25);
        [$rows, $total] = $this->trades->list(null, $this->filters($req, ['user_id', 'status', 'asset_id', 'from', 'to', 'q']), $page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    public function addTrade(Request $req): Response
    {
        $uid = $this->targetUser($req);
        $d = Validator::make($req->json(), [
            'asset_id' => 'required|int',
            'direction' => 'required|in:long,short',
            'trade_type' => 'nullable|in:spot,futures,margin,other',
            'quantity' => 'required|decimal|gt:0',
            'entry_price' => 'required|decimal|gt:0',
            'exit_price' => 'nullable|decimal|gt:0',
            'fee_usd' => 'nullable|decimal|gte:0',
            'opened_at' => 'nullable|string',
            'closed_at' => 'nullable|string',
            'reference' => 'nullable|string|max:100',
            'notes' => 'nullable|string|max:1000',
            'idempotency_key' => 'required|string|max:80',
        ])->validated();
        $d['opened_at'] = $this->toUtc($d['opened_at'] ?? null, 'opened_at') ?? \OryzenX\Core\Database::now();
        $d['closed_at'] = $this->toUtc($d['closed_at'] ?? null, 'closed_at');
        return Response::ok($this->trades->record($uid, $d, $this->uid($req)));
    }

    public function closeTrade(Request $req): Response
    {
        $d = Validator::make($req->json(), [
            'exit_price' => 'required|decimal|gt:0',
            'extra_fee_usd' => 'nullable|decimal|gte:0',
            'closed_at' => 'nullable|string',
            'idempotency_key' => 'required|string|max:80',
        ])->validated();
        return Response::ok($this->trades->close($this->id($req), $d['exit_price'], $this->toUtc($d['closed_at'] ?? null, 'closed_at'), $d['extra_fee_usd'] ?? '0', $this->uid($req), $d['idempotency_key']));
    }

    public function reverseTrade(Request $req): Response
    {
        $this->trades->reverse($this->id($req), $this->uid($req), $this->reason($req));
        return Response::ok(['reversed' => true]);
    }

    public function tradeNotes(Request $req): Response
    {
        $this->trades->updateNotes($this->id($req), $req->str('notes') ?: null, $this->uid($req));
        return Response::ok(['updated' => true]);
    }

    public function tradingMonitor(Request $req): Response
    {
        return Response::ok($this->trades->monitor($req->int('user_id'), $this->settings->timezone()));
    }

    // ---------------------------------------------------------------- ledger
    public function ledger(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 25);
        [$rows, $total] = $this->ledger->search(null, $this->filters($req, ['user_id', 'type', 'status', 'asset', 'from', 'to', 'q']), $page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    public function transaction(Request $req): Response
    {
        $tx = $this->ledger->transactionWithLines($this->id($req));
        if (!$tx) {
            throw HttpException::notFound();
        }
        return Response::ok($tx);
    }

    public function movement(Request $req): Response
    {
        $uid = $this->targetUser($req);
        $d = Validator::make($req->json(), [
            'type' => 'required|in:deposit,withdrawal,transfer,adjustment',
            'amount' => 'required|decimal|gt:0',
            'from' => 'nullable|in:cash,trading',
            'to' => 'nullable|in:cash,trading',
            'direction' => 'nullable|in:credit,debit',
            'effective_at' => 'nullable|string',
            'reference' => 'nullable|string|max:100',
            'notes' => 'nullable|string|max:1000',
            'idempotency_key' => 'required|string|max:80',
        ])->validated();
        if ($d['type'] === 'transfer' && (empty($d['from']) || empty($d['to']))) {
            throw HttpException::validation(['to' => 'Choose both balances for a transfer.']);
        }
        if ($d['type'] === 'adjustment' && mb_strlen((string) $d['notes']) < 5) {
            throw HttpException::validation(['notes' => 'Adjustments require an explanation in the notes.']);
        }
        $d['effective_at'] = $this->toUtc($d['effective_at'] ?? null, 'effective_at') ?? \OryzenX\Core\Database::now();
        return Response::ok($this->ledger->recordCashMovement($uid, array_filter($d, fn ($v) => $v !== null), $this->uid($req)));
    }

    public function reverseMovement(Request $req): Response
    {
        return Response::ok(['reversal_transaction_id' => $this->ledger->reverseCashMovement($this->id($req), $this->uid($req), $this->reason($req))]);
    }

    public function exportLedger(Request $req): Response
    {
        [$rows] = $this->ledger->search(null, $this->filters($req, ['user_id', 'type', 'status', 'asset', 'from', 'to', 'q']), 1, 20000);
        \OryzenX\Core\App::get(\OryzenX\Services\AuditService::class)->log($this->uid($req), 'finance.export', 'ledger', null, ['rows' => count($rows), 'filters' => $req->query]);
        return $this->csv('oryzenx-ledger-' . gmdate('Ymd') . '.csv',
            ['id', 'uuid', 'user_id', 'user', 'type', 'status', 'asset', 'quantity', 'unit_price', 'amount_usd', 'fee_usd', 'realized_pnl_usd', 'effective_at_utc', 'reference', 'notes', 'reversal_of', 'reversed_by', 'created_by'],
            array_map(fn ($r) => [$r['id'], $r['uuid'], $r['user_id'], $r['user_email'], $r['type'], $r['status'], $r['asset_symbol'], $r['quantity'], $r['unit_price'], $r['amount_usd'], $r['fee_usd'], $r['realized_pnl_usd'], $r['effective_at'], $r['reference'], $r['notes'], $r['reversal_of_id'], $r['reversed_by_id'], $r['created_by_name']], $rows));
    }

    // ---------------------------------------------------------------- loans
    public function loans(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 25);
        [$rows, $total] = $this->loans->list(null, $this->filters($req, ['user_id', 'status']), $page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    public function loan(Request $req): Response
    {
        return Response::ok($this->loans->detail($this->id($req)));
    }

    public function addLoan(Request $req): Response
    {
        $uid = $this->targetUser($req);
        $d = Validator::make($req->json(), [
            'denomination' => 'required|in:USD,COIN',
            'asset_id' => 'nullable|int',
            'quantity' => 'nullable|decimal|gt:0',
            'principal_usd' => 'nullable|decimal|gt:0',
            'origination_price' => 'nullable|decimal|gt:0',
            'credited_to' => 'required|in:cash,holdings,external',
            'loan_date' => 'nullable|string',
            'due_date' => 'nullable|date',
            'interest_rate_pct' => 'nullable|decimal|gte:0|lte:1000',
            'reference' => 'nullable|string|max:100',
            'notes' => 'nullable|string|max:1000',
            'idempotency_key' => 'required|string|max:80',
        ])->validated();
        $d['loan_date'] = $this->toUtc($d['loan_date'] ?? null, 'loan_date') ?? \OryzenX\Core\Database::now();
        return Response::ok($this->loans->create($uid, $d, $this->uid($req)));
    }

    public function repayLoan(Request $req): Response
    {
        $d = Validator::make($req->json(), [
            'amount_usd' => 'nullable|decimal|gt:0',
            'quantity' => 'nullable|decimal|gt:0',
            'price' => 'nullable|decimal|gt:0',
            'paid_from' => 'required|in:cash,external',
            'paid_at' => 'nullable|string',
            'notes' => 'nullable|string|max:1000',
            'idempotency_key' => 'required|string|max:80',
        ])->validated();
        $d['paid_at'] = $this->toUtc($d['paid_at'] ?? null, 'paid_at') ?? \OryzenX\Core\Database::now();
        return Response::ok($this->loans->repay($this->id($req), $d, $this->uid($req)));
    }

    public function chargeLoan(Request $req): Response
    {
        $d = Validator::make($req->json(), [
            'charge_type' => 'required|in:fee,interest',
            'amount_usd' => 'nullable|decimal|gt:0',
            'quantity' => 'nullable|decimal|gt:0',
            'price' => 'nullable|decimal|gt:0',
            'charged_at' => 'nullable|string',
            'notes' => 'nullable|string|max:500',
            'idempotency_key' => 'required|string|max:80',
        ])->validated();
        $d['charged_at'] = $this->toUtc($d['charged_at'] ?? null, 'charged_at') ?? \OryzenX\Core\Database::now();
        return Response::ok($this->loans->charge($this->id($req), $d, $this->uid($req)));
    }

    public function reverseLoan(Request $req): Response
    {
        $this->loans->reverse($this->id($req), $this->uid($req), $this->reason($req));
        return Response::ok(['reversed' => true]);
    }

    public function reverseLoanEvent(Request $req): Response
    {
        $this->loans->reverseRepayment($this->id($req), $this->uid($req), $this->reason($req));
        return Response::ok(['reversed' => true]);
    }

    // ---------------------------------------------------------------- allocation & reconciliation
    public function allocationRules(Request $req): Response
    {
        return Response::ok(['rules' => $this->allocation->rules(), 'balances' => $this->allocation->balances()]);
    }

    public function saveAllocationRules(Request $req): Response
    {
        $rules = $req->input('rules', []);
        return Response::ok($this->allocation->saveRules(is_array($rules) ? $rules : [], $this->uid($req)));
    }

    public function allocationPreview(Request $req): Response
    {
        $uid = $req->int('user_id') ?: null;
        return Response::ok($this->allocation->preview($uid, $req->str('period_start'), $req->str('period_end')));
    }

    public function allocationRun(Request $req): Response
    {
        $uid = $req->int('user_id') ?: null;
        return Response::ok($this->allocation->run($uid, $req->str('period_start'), $req->str('period_end'), $req->str('notes') ?: null, $this->uid($req)));
    }

    public function allocationHistory(Request $req): Response
    {
        [$page, $per] = $this->paging($req, 25);
        [$rows, $total] = $this->allocation->history($page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    public function allocationReverse(Request $req): Response
    {
        $this->allocation->reverse($this->id($req), $this->uid($req), $this->reason($req));
        return Response::ok(['reversed' => true]);
    }

    public function reconciliation(Request $req): Response
    {
        return Response::ok($this->recon->run($req->int('user_id') ?: null));
    }
}
