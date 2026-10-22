<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Decimal as D;

/** Platform-wide metrics for administrators. Every figure is computed from database records. */
final class AdminDashboardService
{
    public function __construct(
        private Database $db,
        private LedgerService $ledger,
        private MarketService $market,
        private MailService $mail,
        private PushService $push,
        private SettingsService $settings
    ) {
    }

    public function metrics(): array
    {
        $users = $this->db->one(
            'SELECT COUNT(*) total,
                    SUM(email_verified_at IS NOT NULL) email_verified,
                    SUM(identity_status = "approved") identity_verified,
                    SUM(identity_status = "pending") pending_verification,
                    SUM(status = "suspended") suspended,
                    SUM(is_demo = 1) demo
             FROM users'
        );
        $prices = $this->market->latest();
        $investmentValue = '0';
        $cost = '0';
        $unpriced = 0;
        foreach ($this->db->all('SELECT asset_id, SUM(quantity) q, SUM(cost_basis_usd) c FROM investment_positions WHERE quantity > 0 GROUP BY asset_id') as $r) {
            $cost = D::add($cost, $r['c']);
            $pr = $prices[(int) $r['asset_id']]['price'] ?? null;
            if ($pr === null) {
                $unpriced++;
                continue;
            }
            $investmentValue = D::add($investmentValue, D::mul($r['q'], $pr));
        }
        $liab = '0';
        foreach ($this->db->all('SELECT denomination, asset_id, outstanding_usd, outstanding_quantity, book_value_usd FROM loans WHERE status = "active"') as $l) {
            if ($l['denomination'] === 'USD') {
                $liab = D::add($liab, $l['outstanding_usd']);
            } else {
                $pr = $prices[(int) $l['asset_id']]['price'] ?? null;
                $liab = D::add($liab, $pr !== null ? D::mul($l['outstanding_quantity'], $pr) : $l['book_value_usd']);
            }
        }
        $sum = fn (string $acct) => D::normalize((string) $this->db->value('SELECT COALESCE(SUM(amount_usd),0) FROM ledger_entries WHERE account = :a AND user_id IS NOT NULL', ['a' => $acct]));
        $salary = $this->db->one(
            'SELECT SUM(status IN ("pending","processed")) open_count, COALESCE(SUM(CASE WHEN status IN ("pending","processed") THEN expected_amount END),0) open_amount,
                    SUM(status = "paid") paid_count, SUM(status = "pending" AND due_date < CURDATE()) overdue
             FROM salary_records WHERE currency = "USD"'
        );
        $salaryOtherCurrency = (int) $this->db->value('SELECT COUNT(*) FROM salary_records WHERE currency <> "USD" AND status IN ("pending","processed")');
        $recent = $this->db->all(
            'SELECT ft.id, ft.type, ft.status, ft.amount_usd, ft.realized_pnl_usd, ft.effective_at, a.symbol, u.full_name AS user_name
             FROM financial_transactions ft LEFT JOIN assets a ON a.id = ft.asset_id LEFT JOIN users u ON u.id = ft.user_id
             ORDER BY ft.id DESC LIMIT 8'
        );
        $activity = $this->db->all(
            'SELECT a.action, a.entity_type, a.entity_id, a.created_at, u.full_name AS actor_name FROM admin_audit_logs a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 8'
        );
        return [
            'users' => array_map('intval', $users),
            'investment_value_usd' => D::round($investmentValue, 8),
            'investment_cost_basis_usd' => D::round($cost, 8),
            'unrealized_pnl_usd' => D::round(D::sub($investmentValue, $cost), 8),
            'unpriced_assets' => $unpriced,
            'cash_balances_usd' => $sum('cash'),
            'trading_balances_usd' => $sum('trading'),
            'realized_pnl_usd' => $this->ledger->realizedPnl(null, null, null),
            'loan_liabilities_usd' => D::round($liab, 8),
            'salary' => [
                'open_count' => (int) $salary['open_count'],
                'open_amount_usd' => D::normalize($salary['open_amount']),
                'paid_count' => (int) $salary['paid_count'],
                'overdue_count' => (int) $salary['overdue'],
                'open_non_usd_count' => $salaryOtherCurrency,
            ],
            'recent_transactions' => $recent,
            'recent_activity' => $activity,
            'market' => $this->market->status(),
            'email' => $this->mail->stats() + ['configured' => $this->mail->smtpConfigured(), 'last_test_status' => $this->settings->get('smtp_last_test_status'), 'last_test_at' => $this->settings->get('smtp_last_test_at')],
            'push' => ['configured' => $this->push->configured(), 'devices' => (int) $this->db->value('SELECT COUNT(*) FROM push_tokens WHERE invalidated_at IS NULL')],
            'support_new' => (int) $this->db->value('SELECT COUNT(*) FROM support_requests WHERE status = "new"'),
            'definitions' => [
                'investment_value_usd' => 'Σ holding quantity × latest valid market price, all users.',
                'unrealized_pnl_usd' => 'Investment value − remaining cost basis (not realized).',
                'realized_pnl_usd' => 'Net realized P/L from closed trades, investment sales and loan settlements, after fees.',
                'loan_liabilities_usd' => 'Outstanding USD loans + coin loans at the latest price (book value when no price exists).',
            ],
        ];
    }
}
