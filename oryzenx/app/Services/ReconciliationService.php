<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Decimal as D;

/** Verifies that derived balances agree with the ledger. Every check returns pass/fail with details. */
final class ReconciliationService
{
    public function __construct(private Database $db)
    {
    }

    public function run(?int $userId = null): array
    {
        $checks = [];
        $uf = $userId !== null ? ' AND ft.user_id = ' . (int) $userId : '';
        $ufp = $userId !== null ? ' AND p.user_id = ' . (int) $userId : '';
        $ufl = $userId !== null ? ' AND l.user_id = ' . (int) $userId : '';

        // 1. every transaction balances to zero
        $bad = $this->db->all("SELECT ft.id, SUM(le.amount_usd) s FROM financial_transactions ft JOIN ledger_entries le ON le.transaction_id = ft.id
                               WHERE 1=1 $uf GROUP BY ft.id HAVING ABS(SUM(le.amount_usd)) > 0.00000001 LIMIT 50");
        $checks[] = ['key' => 'balanced_transactions', 'label' => 'Every transaction balances to zero', 'ok' => !$bad, 'details' => $bad];

        // 2. positions agree with entries and sales
        $rows = $this->db->all("SELECT p.user_id, p.asset_id, p.quantity, p.cost_basis_usd,
                (SELECT COALESCE(SUM(quantity),0) FROM investment_entries e WHERE e.user_id = p.user_id AND e.asset_id = p.asset_id AND e.status <> 'reversed') qin,
                (SELECT COALESCE(SUM(quantity),0) FROM investment_sales s WHERE s.user_id = p.user_id AND s.asset_id = p.asset_id AND s.status = 'completed') qout,
                (SELECT COALESCE(SUM(amount_usd),0) FROM ledger_entries le WHERE le.user_id = p.user_id AND le.asset_id = p.asset_id AND le.account = 'investment') lcost,
                (SELECT COALESCE(SUM(quantity),0) FROM ledger_entries le2 WHERE le2.user_id = p.user_id AND le2.asset_id = p.asset_id AND le2.account = 'investment') lqty
             FROM investment_positions p WHERE 1=1 $ufp");
        $mismatch = [];
        foreach ($rows as $r) {
            $expQty = D::sub($r['qin'], $r['qout']);
            if (D::cmp($expQty, $r['quantity']) !== 0 || D::cmp($r['lqty'], $r['quantity']) !== 0 || D::cmp(D::round($r['lcost'], 8), D::round($r['cost_basis_usd'], 8)) !== 0) {
                $mismatch[] = ['user_id' => (int) $r['user_id'], 'asset_id' => (int) $r['asset_id'], 'position_qty' => D::normalize($r['quantity']),
                    'entries_minus_sales' => $expQty, 'ledger_qty' => D::normalize($r['lqty']), 'position_cost' => D::normalize($r['cost_basis_usd']), 'ledger_cost' => D::normalize($r['lcost'])];
            }
        }
        $checks[] = ['key' => 'positions', 'label' => 'Holdings match investment entries, sales and the ledger', 'ok' => !$mismatch, 'details' => $mismatch];

        // 3. loan book values agree with loan ledger lines
        $rows = $this->db->all("SELECT l.id, l.book_value_usd, l.status,
                (SELECT COALESCE(SUM(le.amount_usd),0) FROM ledger_entries le JOIN financial_transactions ft ON ft.id = le.transaction_id
                  WHERE le.account = 'loan' AND ft.related_type = 'loan' AND ft.related_id = l.id) lsum
             FROM loans l WHERE 1=1 $ufl");
        $mismatch = [];
        foreach ($rows as $r) {
            $expected = $r['status'] === 'reversed' ? '0' : D::neg($r['book_value_usd']);
            if (D::cmp(D::round($r['lsum'], 8), D::round($expected, 8)) !== 0) {
                $mismatch[] = ['loan_id' => (int) $r['id'], 'book_value' => D::normalize($r['book_value_usd']), 'ledger' => D::normalize($r['lsum'])];
            }
        }
        $checks[] = ['key' => 'loans', 'label' => 'Loan book values match the ledger', 'ok' => !$mismatch, 'details' => $mismatch];

        // 4. closed trades' realized P/L matches ledger pnl lines of their close transactions
        $tf = $userId !== null ? ' AND t.user_id = ' . (int) $userId : '';
        $rows = $this->db->all("SELECT t.id, t.realized_pnl_usd, (SELECT COALESCE(SUM(amount_usd),0) FROM ledger_entries le WHERE le.transaction_id = t.close_transaction_id AND le.account = 'pnl') l
             FROM trades t WHERE t.status = 'closed' $tf");
        $mismatch = [];
        foreach ($rows as $r) {
            if (D::cmp(D::round(D::neg($r['l']), 8), D::round($r['realized_pnl_usd'], 8)) !== 0) {
                $mismatch[] = ['trade_id' => (int) $r['id'], 'realized' => D::normalize($r['realized_pnl_usd']), 'ledger' => D::neg($r['l'])];
            }
        }
        $checks[] = ['key' => 'trades', 'label' => 'Closed trade P/L matches the ledger', 'ok' => !$mismatch, 'details' => $mismatch];

        // 5. no negative cash/trading balances
        $nf = $userId !== null ? ' AND user_id = ' . (int) $userId : '';
        $neg = $this->db->all("SELECT user_id, account, SUM(amount_usd) s FROM ledger_entries WHERE account IN ('cash','trading') AND user_id IS NOT NULL $nf
                               GROUP BY user_id, account HAVING SUM(amount_usd) < 0 LIMIT 50");
        $checks[] = ['key' => 'non_negative', 'label' => 'No negative cash or trading balances', 'ok' => !$neg, 'details' => $neg];

        // 6. paid salary records have a ledger posting
        $sf = $userId !== null ? ' AND user_id = ' . (int) $userId : '';
        $missing = $this->db->all("SELECT id, user_id, period FROM salary_records WHERE status = 'paid' AND transaction_id IS NULL $sf LIMIT 50");
        $checks[] = ['key' => 'salary', 'label' => 'Paid salaries are posted to the ledger', 'ok' => !$missing, 'details' => $missing];

        // 7. reversals reference a reversed original
        $orph = $this->db->all("SELECT ft.id FROM financial_transactions ft LEFT JOIN financial_transactions o ON o.id = ft.reversal_of_id
                                WHERE ft.status = 'reversal' AND (o.id IS NULL OR o.status <> 'reversed') $uf LIMIT 50");
        $checks[] = ['key' => 'reversals', 'label' => 'Every reversal points to a reversed original', 'ok' => !$orph, 'details' => $orph];

        $platformTotal = (string) $this->db->value("SELECT COALESCE(SUM(amount_usd),0) FROM ledger_entries");
        return [
            'ok' => !in_array(false, array_column($checks, 'ok'), true),
            'checked_at' => Database::now(),
            'scope' => $userId === null ? 'platform' : 'user:' . $userId,
            'ledger_total_usd' => D::normalize($platformTotal),
            'checks' => $checks,
        ];
    }
}
