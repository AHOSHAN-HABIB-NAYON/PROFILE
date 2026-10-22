<?php
declare(strict_types=1);

namespace OryzenX\Controllers\Api;

use OryzenX\Controllers\Controller;
use OryzenX\Core\HttpException;
use OryzenX\Core\Request;
use OryzenX\Core\Response;
use OryzenX\Services\AuthService;
use OryzenX\Services\LedgerService;
use OryzenX\Services\LoanService;
use OryzenX\Services\MarketService;
use OryzenX\Services\PortfolioService;
use OryzenX\Services\SalaryService;
use OryzenX\Services\SettingsService;
use OryzenX\Services\TradeService;

/**
 * Read-only financial views for the signed-in user. Every query is scoped to the caller's user id —
 * there is no parameter that can select another user's records (IDOR-safe by construction).
 */
final class FinanceController extends Controller
{
    public function __construct(
        private PortfolioService $portfolio,
        private MarketService $market,
        private LedgerService $ledger,
        private TradeService $trades,
        private LoanService $loans,
        private SalaryService $salary,
        private SettingsService $settings,
        private AuthService $auth
    ) {
    }

    public function dashboard(Request $req): Response
    {
        $this->market->ensureFresh();
        $uid = $this->uid($req);
        $summary = $this->portfolio->summary($uid);
        [$recent] = $this->ledger->search($uid, [], 1, 6);
        [$recentTrades] = $this->trades->list($uid, [], 1, 5);
        $data = $summary + ['recent_transactions' => $recent, 'recent_trades' => $recentTrades];
        // platform user count only for administrators with the permission
        $u = $this->user($req);
        if ((int) $u['is_admin'] && $this->auth->can($u, 'dashboard.view')) {
            $data['admin_total_users'] = (int) \OryzenX\Core\App::get(\OryzenX\Core\Database::class)->value('SELECT COUNT(*) FROM users');
        }
        return Response::ok($data);
    }

    public function portfolio(Request $req): Response
    {
        $this->market->ensureFresh();
        $uid = $this->uid($req);
        return Response::ok([
            'summary' => $this->portfolio->summary($uid),
            'performance' => $this->portfolio->performance($uid, $req->int('days', 90)),
        ]);
    }

    public function assets(Request $req): Response
    {
        $this->market->ensureFresh();
        $status = $this->market->status();
        $rows = array_values(array_filter($this->market->latest(), fn ($a) => $a['is_active']));
        return Response::ok($rows, [
            'provider' => $status['provider_label'],
            'quote_note' => $status['quote_note'],
            'last_success_at' => $status['last_success_at'],
            'poll_seconds' => $status['poll_seconds'],
        ]);
    }

    public function asset(Request $req): Response
    {
        return Response::ok($this->portfolio->assetDetail($this->uid($req), $this->id($req)));
    }

    public function ohlc(Request $req): Response
    {
        return Response::ok($this->market->ohlc($this->id($req), $req->str('range', '1D')));
    }

    public function tradingMonitor(Request $req): Response
    {
        $this->market->ensureFresh();
        return Response::ok($this->trades->monitor($this->uid($req), $this->settings->timezone()));
    }

    public function trades(Request $req): Response
    {
        [$page, $per] = $this->paging($req);
        [$rows, $total] = $this->trades->list($this->uid($req), $this->filters($req, ['status', 'asset_id', 'from', 'to', 'q']), $page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    public function trade(Request $req): Response
    {
        [$rows] = $this->trades->list($this->uid($req), [], 1, 1000);
        foreach ($rows as $r) {
            if ((int) $r['id'] === $this->id($req)) {
                return Response::ok($r);
            }
        }
        throw HttpException::notFound('Trade not found.');
    }

    public function transactions(Request $req): Response
    {
        [$page, $per] = $this->paging($req);
        [$rows, $total] = $this->ledger->search($this->uid($req), $this->filters($req, ['type', 'status', 'asset', 'from', 'to', 'q']), $page, $per);
        return $this->paged($rows, $total, $page, $per);
    }

    public function transaction(Request $req): Response
    {
        $tx = $this->ledger->transactionWithLines($this->id($req), $this->uid($req));
        if (!$tx) {
            throw HttpException::notFound('Transaction not found.');
        }
        unset($tx['created_by'], $tx['updated_by'], $tx['created_by_name'], $tx['updated_by_name'], $tx['idempotency_key']);
        return Response::ok($tx);
    }

    public function exportTransactions(Request $req): Response
    {
        [$rows] = $this->ledger->search($this->uid($req), $this->filters($req, ['type', 'status', 'asset', 'from', 'to', 'q']), 1, 5000);
        return $this->csv('oryzenx-transactions.csv', ['id', 'date_utc', 'type', 'status', 'asset', 'quantity', 'unit_price', 'amount_usd', 'fee_usd', 'realized_pnl_usd', 'reference'],
            array_map(fn ($r) => [$r['id'], $r['effective_at'], $r['type'], $r['status'], $r['asset_symbol'], $r['quantity'], $r['unit_price'], $r['amount_usd'], $r['fee_usd'], $r['realized_pnl_usd'], $r['reference']], $rows));
    }

    public function loans(Request $req): Response
    {
        $this->market->ensureFresh();
        [$page, $per] = $this->paging($req);
        [$rows, $total] = $this->loans->list($this->uid($req), $this->filters($req, ['status']), $page, $per);
        foreach ($rows as &$r) {
            unset($r['created_by'], $r['updated_by'], $r['user_name']);
        }
        return $this->paged($rows, $total, $page, $per);
    }

    public function loan(Request $req): Response
    {
        $l = $this->loans->detail($this->id($req), $this->uid($req));
        unset($l['created_by'], $l['updated_by']);
        foreach ($l['events'] as &$e) {
            unset($e['created_by']);
        }
        return Response::ok($l);
    }

    public function salary(Request $req): Response
    {
        $uid = $this->uid($req);
        [$page, $per] = $this->paging($req, 24);
        [$rows, $total] = $this->salary->records($uid, $this->filters($req, ['status', 'from', 'to']), $page, $per);
        return Response::ok([
            'schedule' => $this->salary->schedule($uid),
            'records' => $rows,
            'payment_details' => $this->salary->userPaymentDetails($uid),
            'note' => 'Salary payments are recorded separately and are not counted as investment profit.',
        ], ['page' => $page, 'per_page' => $per, 'total' => $total]);
    }

    public function paymentMethods(Request $req): Response
    {
        return Response::ok(array_map(fn ($m) => array_intersect_key($m, array_flip(['id', 'code', 'name', 'type', 'logo_url', 'fields', 'instructions'])), $this->salary->paymentMethods(true)));
    }

    public function paymentDetails(Request $req): Response
    {
        return Response::ok($this->salary->userPaymentDetails($this->uid($req)));
    }

    public function savePaymentDetails(Request $req): Response
    {
        $u = $this->user($req);
        if ($this->settings->bool('require_identity_verification', true) && $u['identity_status'] !== 'approved') {
            throw new HttpException(403, 'identity_required', 'Complete identity verification before adding payment details.');
        }
        $values = $req->input('details', []);
        return Response::ok($this->salary->savePaymentDetails((int) $u['id'], $req->int('payment_method_id'), is_array($values) ? $values : []));
    }

    public function primaryPaymentDetails(Request $req): Response
    {
        $this->salary->setPrimary($this->uid($req), $this->id($req));
        return Response::ok($this->salary->userPaymentDetails($this->uid($req)));
    }

    public function deletePaymentDetails(Request $req): Response
    {
        $this->salary->deletePaymentDetails($this->uid($req), $this->id($req));
        return Response::ok($this->salary->userPaymentDetails($this->uid($req)));
    }
}
