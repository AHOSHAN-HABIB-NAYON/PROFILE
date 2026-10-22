<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Decimal as D;
use OryzenX\Core\HttpException;

/**
 * Profit allocation of REALIZED profit only.
 *  eligible = max(0, net realized P/L in the period)   (unrealized market gains are never eligible)
 *  each category receives eligible × percent / 100 (truncated to cents), total ≤ eligible.
 * A scope (platform or one user) can be allocated once per period; overlapping periods are rejected.
 * Each allocation is a ledger event on platform allocation accounts (alloc_pool → alloc_<category>).
 */
final class AllocationService
{
    public const CATEGORIES = ['retained', 'salary', 'reinvestment', 'fees'];

    public function __construct(private Database $db, private LedgerService $ledger, private AuditService $audit)
    {
    }

    public function rules(): array
    {
        return $this->db->all('SELECT * FROM profit_allocation_rules ORDER BY sort_order, id');
    }

    /** @param array<int, array{category:string, label?:string, percent:string, is_active:bool}> $rules */
    public function saveRules(array $rules, ?int $actorId): array
    {
        $total = '0';
        $seen = [];
        foreach ($rules as $r) {
            $cat = (string) ($r['category'] ?? '');
            if (!in_array($cat, self::CATEGORIES, true) || isset($seen[$cat])) {
                throw HttpException::validation(['rules' => 'Each allocation category may appear once.']);
            }
            $seen[$cat] = true;
            $pct = (string) ($r['percent'] ?? '0');
            if (!D::isValid($pct) || D::isNegative($pct) || D::cmp($pct, '100') > 0) {
                throw HttpException::validation(['rules' => 'Percentages must be between 0 and 100.']);
            }
            if (!empty($r['is_active'])) {
                $total = D::add($total, $pct);
            }
        }
        if (D::cmp($total, '100') > 0) {
            throw HttpException::validation(['rules' => 'Active allocation percentages total ' . D::normalize($total) . '%. The total cannot exceed 100%.']);
        }
        $before = $this->rules();
        $this->db->transaction(function () use ($rules, $actorId) {
            foreach ($rules as $i => $r) {
                $this->db->run(
                    'INSERT INTO profit_allocation_rules (category, label, percent, is_active, sort_order, updated_by, updated_at)
                     VALUES (:c, :l, :p, :a, :s, :u, :n)
                     ON DUPLICATE KEY UPDATE label = VALUES(label), percent = VALUES(percent), is_active = VALUES(is_active), sort_order = VALUES(sort_order),
                        updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)',
                    ['c' => $r['category'], 'l' => mb_substr(strip_tags((string) ($r['label'] ?? ucfirst($r['category']))), 0, 80),
                     'p' => D::normalize((string) $r['percent']), 'a' => !empty($r['is_active']) ? 1 : 0, 's' => $i, 'u' => $actorId, 'n' => Database::now()]
                );
            }
        });
        $this->audit->log($actorId, 'allocation.rules_updated', 'allocation_rules', null, ['before' => $before, 'after' => $rules]);
        return $this->rules();
    }

    private function scopeKey(?int $userId): string
    {
        return $userId === null ? 'platform' : 'user:' . $userId;
    }

    /** Calculates an allocation without recording it. Dates are inclusive business dates (YYYY-MM-DD, UTC boundaries). */
    public function preview(?int $userId, string $start, string $end): array
    {
        foreach (['period_start' => $start, 'period_end' => $end] as $k => $d) {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $d)) {
                throw HttpException::validation([$k => 'Use the format YYYY-MM-DD.']);
            }
        }
        if ($end < $start) {
            throw HttpException::validation(['period_end' => 'End date must be on or after the start date.']);
        }
        if ($end >= gmdate('Y-m-d')) {
            throw HttpException::validation(['period_end' => 'Only completed periods (ending before today) can be allocated.']);
        }
        $from = $start . ' 00:00:00';
        $to = date('Y-m-d', strtotime($end . ' +1 day')) . ' 00:00:00';
        $realized = D::round($this->ledger->realizedPnl($userId, $from, $to), 8);
        $eligible = D::cmp($realized, '0') > 0 ? $realized : '0';
        $overlap = $this->db->one(
            'SELECT id, period_start, period_end FROM profit_allocations WHERE scope_key = :s AND status = "completed" AND period_start <= :e AND period_end >= :b LIMIT 1',
            ['s' => $this->scopeKey($userId), 'e' => $end, 'b' => $start]
        );
        $lines = [];
        $allocated = '0';
        foreach ($this->rules() as $r) {
            if (!(int) $r['is_active'] || D::isZero($r['percent'])) {
                continue;
            }
            $amt = D::truncate(D::div(D::mul($eligible, $r['percent']), '100', 10), 2);
            $lines[] = ['category' => $r['category'], 'label' => $r['label'], 'percent' => D::normalize($r['percent']), 'amount_usd' => $amt];
            $allocated = D::add($allocated, $amt);
        }
        if (D::cmp($allocated, $eligible) > 0) {
            throw new \LogicException('Allocation exceeds eligible amount');
        }
        return [
            'scope' => $this->scopeKey($userId),
            'period_start' => $start,
            'period_end' => $end,
            'realized_profit_usd' => $realized,
            'eligible_usd' => $eligible,
            'allocated_usd' => $allocated,
            'unallocated_usd' => D::sub($eligible, $allocated),
            'lines' => $lines,
            'already_allocated' => $overlap !== null,
            'conflict' => $overlap,
            'explanation' => D::cmp($realized, '0') <= 0
                ? 'There is no net realized profit in this period, so nothing is eligible. Unrealized market gains are never allocated.'
                : 'Only net realized profit (closed trades, investment sales and loan settlements, after fees) is allocated.',
        ];
    }

    public function run(?int $userId, string $start, string $end, ?string $notes, ?int $actorId): array
    {
        return $this->db->transaction(function () use ($userId, $start, $end, $notes, $actorId) {
            // serialize allocation runs
            $this->db->value('SELECT GET_LOCK("oryzenx_allocation", 10)');
            try {
                $p = $this->preview($userId, $start, $end);
                if ($p['already_allocated']) {
                    throw HttpException::conflict('This period overlaps an existing allocation (' . $p['conflict']['period_start'] . ' to ' . $p['conflict']['period_end'] . '). Reverse it first to re-allocate.', 'already_allocated');
                }
                if (D::isZero($p['allocated_usd'])) {
                    throw HttpException::conflict('There is no eligible realized profit to allocate for this period.', 'nothing_to_allocate');
                }
                $allocId = $this->db->insert('profit_allocations', [
                    'scope_key' => $p['scope'], 'user_id' => $userId, 'period_start' => $start, 'period_end' => $end,
                    'realized_profit_usd' => $p['realized_profit_usd'], 'eligible_usd' => $p['eligible_usd'], 'allocated_usd' => $p['allocated_usd'],
                    'status' => 'completed', 'notes' => $notes ? mb_substr(strip_tags($notes), 0, 500) : null, 'created_by' => $actorId, 'created_at' => Database::now(),
                ]);
                $lines = [['account' => 'alloc_pool', 'amount' => $p['allocated_usd'], 'user_id' => null]];
                foreach ($p['lines'] as $l) {
                    $this->db->insert('profit_allocation_lines', ['allocation_id' => $allocId] + $l);
                    if (!D::isZero($l['amount_usd'])) {
                        $lines[] = ['account' => 'alloc_' . $l['category'], 'amount' => D::neg($l['amount_usd']), 'user_id' => null];
                    }
                }
                $txId = $this->ledger->post([
                    'type' => 'profit_allocation', 'user_id' => $userId, 'amount_usd' => $p['allocated_usd'],
                    'effective_at' => $end . ' 23:59:59', 'notes' => 'Profit allocation ' . $start . ' to ' . $end,
                    'idempotency_key' => 'alloc-' . $allocId, 'related_type' => 'profit_allocation', 'related_id' => $allocId, 'created_by' => $actorId,
                ], $lines);
                $this->db->update('profit_allocations', ['transaction_id' => $txId], 'id = :id', ['id' => $allocId]);
                $this->audit->log($actorId, 'allocation.recorded', 'profit_allocation', $allocId, $p);
                return $this->db->one('SELECT * FROM profit_allocations WHERE id = :id', ['id' => $allocId]) + ['lines' => $p['lines']];
            } finally {
                $this->db->value('SELECT RELEASE_LOCK("oryzenx_allocation")');
            }
        });
    }

    public function reverse(int $allocId, ?int $actorId, string $reason): void
    {
        $this->db->transaction(function () use ($allocId, $actorId, $reason) {
            $a = $this->db->one('SELECT * FROM profit_allocations WHERE id = :id FOR UPDATE', ['id' => $allocId]);
            if (!$a) {
                throw HttpException::notFound('Allocation not found.');
            }
            if ($a['status'] !== 'completed') {
                throw HttpException::conflict('Already reversed.', 'already_reversed');
            }
            $this->ledger->reverse((int) $a['transaction_id'], $actorId, $reason);
            $this->db->update('profit_allocations', ['status' => 'reversed'], 'id = :id', ['id' => $allocId]);
            $this->audit->log($actorId, 'allocation.reversed', 'profit_allocation', $allocId, ['reason' => $reason]);
        });
    }

    public function history(int $page, int $perPage): array
    {
        $total = (int) $this->db->value('SELECT COUNT(*) FROM profit_allocations');
        $rows = $this->db->all(
            'SELECT pa.*, u.full_name AS user_name, cb.full_name AS created_by_name FROM profit_allocations pa
             LEFT JOIN users u ON u.id = pa.user_id LEFT JOIN users cb ON cb.id = pa.created_by
             ORDER BY pa.period_end DESC, pa.id DESC LIMIT :l OFFSET :o',
            ['l' => $perPage, 'o' => ($page - 1) * $perPage]
        );
        foreach ($rows as &$r) {
            $r['lines'] = $this->db->all('SELECT category, label, percent, amount_usd FROM profit_allocation_lines WHERE allocation_id = :id', ['id' => $r['id']]);
        }
        return [$rows, $total];
    }

    /** Totals per allocation account (platform). */
    public function balances(): array
    {
        $out = [];
        foreach (['alloc_retained', 'alloc_salary', 'alloc_reinvestment', 'alloc_fees', 'alloc_pool'] as $acct) {
            $out[$acct] = $this->ledger->balance(null, $acct);
        }
        return $out;
    }
}
