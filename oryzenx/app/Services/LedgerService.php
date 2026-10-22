<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Decimal as D;
use OryzenX\Core\HttpException;
use OryzenX\Core\Security;

/**
 * Double-entry ledger — the source of truth for balances.
 *
 * Every financial_transactions row has ledger lines that sum to exactly zero (USD).
 * Sign convention: a positive amount increases an asset account (debit), a negative amount
 * increases a liability/income account (credit).
 *
 * Per-user accounts:
 *   cash        main USD balance (asset)
 *   trading     USD allocated to trading (asset)
 *   investment  crypto holdings at cost basis (asset; market value is computed separately)
 *   loan        loan liabilities at book value (negative balance = amount owed)
 *   pnl         realized profit & loss (negative balance = net profit, positive = net loss)
 *   external    funds entering/leaving the platform (contra account)
 *   salary      salary paid to the user (kept separate from portfolio metrics)
 * Platform accounts (user_id NULL): alloc_pool, alloc_retained, alloc_salary, alloc_reinvestment, alloc_fees.
 */
final class LedgerService
{
    public const ACCOUNTS = ['cash', 'trading', 'investment', 'loan', 'pnl', 'external', 'salary',
        'alloc_pool', 'alloc_retained', 'alloc_salary', 'alloc_reinvestment', 'alloc_fees'];

    public const TYPES = [
        'deposit', 'withdrawal', 'transfer', 'adjustment', 'investment_buy', 'investment_sale', 'trade_close',
        'loan_disbursement', 'loan_repayment', 'loan_charge', 'salary_payment', 'profit_allocation', 'reversal',
    ];

    public function __construct(private Database $db)
    {
    }

    /**
     * Posts a balanced transaction. Must be called inside a DB transaction that has locked the user row.
     * @param array $header financial_transactions columns (type, user_id, effective_at, amount_usd, ...)
     * @param array<int, array{account:string, amount:string, asset_id?:int|null, quantity?:string|null, user_id?:int|null}> $lines
     * @return int transaction id
     */
    public function post(array $header, array $lines): int
    {
        if (!in_array($header['type'] ?? '', self::TYPES, true)) {
            throw new \InvalidArgumentException('Unknown transaction type');
        }
        $sum = '0';
        foreach ($lines as $l) {
            if (!in_array($l['account'], self::ACCOUNTS, true)) {
                throw new \InvalidArgumentException('Unknown ledger account ' . $l['account']);
            }
            $sum = D::add($sum, D::round($l['amount'], 8));
        }
        if (!D::isZero($sum)) {
            throw new \LogicException('Unbalanced ledger transaction (sum ' . $sum . ')');
        }
        $now = Database::now();
        $effective = $header['effective_at'] ?? $now;
        $txId = $this->db->insert('financial_transactions', [
            'uuid' => Security::uuid(),
            'user_id' => $header['user_id'] ?? null,
            'type' => $header['type'],
            'status' => $header['status'] ?? 'completed',
            'asset_id' => $header['asset_id'] ?? null,
            'quantity' => $header['quantity'] ?? null,
            'unit_price' => $header['unit_price'] ?? null,
            'amount_usd' => D::round($header['amount_usd'] ?? '0', 8),
            'fee_usd' => D::round($header['fee_usd'] ?? '0', 8),
            'realized_pnl_usd' => isset($header['realized_pnl_usd']) ? D::round($header['realized_pnl_usd'], 8) : null,
            'effective_at' => $effective,
            'reference' => $header['reference'] ?? null,
            'notes' => $header['notes'] ?? null,
            'idempotency_key' => $header['idempotency_key'] ?? null,
            'related_type' => $header['related_type'] ?? null,
            'related_id' => $header['related_id'] ?? null,
            'reversal_of_id' => $header['reversal_of_id'] ?? null,
            'created_by' => $header['created_by'] ?? null,
            'updated_by' => $header['created_by'] ?? null,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        foreach ($lines as $l) {
            if (D::isZero($l['amount']) && empty($l['quantity'])) {
                continue;
            }
            $this->db->insert('ledger_entries', [
                'transaction_id' => $txId,
                'user_id' => array_key_exists('user_id', $l) ? $l['user_id'] : ($header['user_id'] ?? null),
                'account' => $l['account'],
                'asset_id' => $l['asset_id'] ?? null,
                'quantity' => $l['quantity'] ?? null,
                'amount_usd' => D::round($l['amount'], 8),
                'effective_at' => $effective,
                'created_at' => $now,
            ]);
        }
        return $txId;
    }

    /** Returns an existing transaction for an idempotency key (duplicate submission), or null. */
    public function findByIdempotencyKey(?string $key): ?array
    {
        if ($key === null || $key === '') {
            return null;
        }
        return $this->db->one('SELECT * FROM financial_transactions WHERE idempotency_key = :k', ['k' => $key]);
    }

    public static function validateIdempotencyKey(?string $key): ?string
    {
        if ($key === null || $key === '') {
            return null;
        }
        if (!preg_match('/^[A-Za-z0-9_-]{8,80}$/', $key)) {
            throw HttpException::validation(['idempotency_key' => 'Invalid request id.']);
        }
        return $key;
    }

    /**
     * Reverses a completed transaction with an equal-and-opposite entry. The original is kept and marked "reversed".
     * Domain services must undo their own state (positions, loan balances) in the same DB transaction.
     */
    public function reverse(int $txId, ?int $actorId, string $reason): int
    {
        $tx = $this->db->one('SELECT * FROM financial_transactions WHERE id = :id FOR UPDATE', ['id' => $txId]);
        if (!$tx) {
            throw HttpException::notFound('Transaction not found.');
        }
        if ($tx['status'] !== 'completed') {
            throw HttpException::conflict('This transaction has already been reversed or is itself a reversal.', 'already_reversed');
        }
        $lines = $this->db->all('SELECT * FROM ledger_entries WHERE transaction_id = :id', ['id' => $txId]);
        $reversed = array_map(fn ($l) => [
            'account' => $l['account'],
            'amount' => D::neg($l['amount_usd']),
            'asset_id' => $l['asset_id'] !== null ? (int) $l['asset_id'] : null,
            'quantity' => $l['quantity'] !== null ? D::neg($l['quantity']) : null,
            'user_id' => $l['user_id'] !== null ? (int) $l['user_id'] : null,
        ], $lines);
        $revId = $this->post([
            'type' => 'reversal',
            'status' => 'reversal',
            'user_id' => $tx['user_id'] !== null ? (int) $tx['user_id'] : null,
            'asset_id' => $tx['asset_id'],
            'quantity' => $tx['quantity'] !== null ? D::neg($tx['quantity']) : null,
            'unit_price' => $tx['unit_price'],
            'amount_usd' => D::neg($tx['amount_usd']),
            'fee_usd' => D::neg($tx['fee_usd']),
            'realized_pnl_usd' => $tx['realized_pnl_usd'] !== null ? D::neg($tx['realized_pnl_usd']) : null,
            'effective_at' => Database::now(),
            'reference' => $tx['reference'],
            'notes' => mb_substr('Reversal of #' . $txId . ': ' . $reason, 0, 1000),
            'related_type' => $tx['related_type'],
            'related_id' => $tx['related_id'],
            'reversal_of_id' => $txId,
            'created_by' => $actorId,
        ], $reversed);
        $this->db->update('financial_transactions', [
            'status' => 'reversed', 'reversed_by_id' => $revId, 'updated_by' => $actorId, 'updated_at' => Database::now(),
        ], 'id = :id', ['id' => $txId]);
        return $revId;
    }

    public function balance(?int $userId, string $account, ?string $until = null, ?int $assetId = null): string
    {
        $sql = 'SELECT COALESCE(SUM(amount_usd), 0) FROM ledger_entries WHERE account = :a';
        $p = ['a' => $account];
        if ($userId === null) {
            $sql .= ' AND user_id IS NULL';
        } else {
            $sql .= ' AND user_id = :u';
            $p['u'] = $userId;
        }
        if ($until !== null) {
            $sql .= ' AND effective_at < :t';
            $p['t'] = $until;
        }
        if ($assetId !== null) {
            $sql .= ' AND asset_id = :as';
            $p['as'] = $assetId;
        }
        return D::normalize((string) $this->db->value($sql, $p));
    }

    /** All account balances of a user in one query. */
    public function balances(int $userId): array
    {
        $out = array_fill_keys(['cash', 'trading', 'investment', 'loan', 'pnl', 'external', 'salary'], '0');
        foreach ($this->db->all('SELECT account, COALESCE(SUM(amount_usd),0) s FROM ledger_entries WHERE user_id = :u GROUP BY account', ['u' => $userId]) as $r) {
            $out[$r['account']] = D::normalize($r['s']);
        }
        return $out;
    }

    /** Net realized P/L (profit positive) for a user (or all users when null) in [from, to). */
    public function realizedPnl(?int $userId, ?string $from, ?string $to, ?array $types = null): string
    {
        $sql = 'SELECT COALESCE(SUM(le.amount_usd),0) FROM ledger_entries le JOIN financial_transactions ft ON ft.id = le.transaction_id
                WHERE le.account = "pnl"';
        $p = [];
        if ($userId !== null) {
            $sql .= ' AND le.user_id = :u';
            $p['u'] = $userId;
        } else {
            $sql .= ' AND le.user_id IS NOT NULL';
        }
        if ($from !== null) {
            $sql .= ' AND le.effective_at >= :f';
            $p['f'] = $from;
        }
        if ($to !== null) {
            $sql .= ' AND le.effective_at < :t';
            $p['t'] = $to;
        }
        if ($types !== null) {
            // include reversals of these types too
            $in1 = $in2 = [];
            foreach (array_values($types) as $i => $t) {
                $in1[] = ':tya' . $i;
                $in2[] = ':tyb' . $i;
                $p['tya' . $i] = $t;
                $p['tyb' . $i] = $t;
            }
            $l1 = implode(',', $in1);
            $l2 = implode(',', $in2);
            $sql .= " AND (ft.type IN ($l1) OR (ft.type = 'reversal' AND ft.reversal_of_id IN (SELECT id FROM financial_transactions WHERE type IN ($l2))))";
        }
        return D::neg(D::normalize((string) $this->db->value($sql, $p)));
    }

    /** Lock a user row to serialize concurrent financial operations for that user. */
    public function lockUser(int $userId): array
    {
        $u = $this->db->one('SELECT id, status, email_verified_at FROM users WHERE id = :id FOR UPDATE', ['id' => $userId]);
        if (!$u) {
            throw HttpException::notFound('User not found.');
        }
        return $u;
    }

    public function transactionWithLines(int $id, ?int $userId = null): ?array
    {
        $sql = 'SELECT ft.*, a.symbol AS asset_symbol, a.name AS asset_name, cu.full_name AS created_by_name, uu.full_name AS updated_by_name
                FROM financial_transactions ft
                LEFT JOIN assets a ON a.id = ft.asset_id
                LEFT JOIN users cu ON cu.id = ft.created_by
                LEFT JOIN users uu ON uu.id = ft.updated_by
                WHERE ft.id = :id';
        $p = ['id' => $id];
        if ($userId !== null) {
            $sql .= ' AND ft.user_id = :u';
            $p['u'] = $userId;
        }
        $tx = $this->db->one($sql, $p);
        if (!$tx) {
            return null;
        }
        $tx['lines'] = $this->db->all('SELECT account, asset_id, quantity, amount_usd FROM ledger_entries WHERE transaction_id = :id ORDER BY id', ['id' => $id]);
        return $tx;
    }

    /** Paginated, filtered transaction list. $userId null = all users (admin). */
    public function search(?int $userId, array $f, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $p = [];
        if ($userId !== null) {
            $where[] = 'ft.user_id = :u';
            $p['u'] = $userId;
        } elseif (!empty($f['user_id'])) {
            $where[] = 'ft.user_id = :u';
            $p['u'] = (int) $f['user_id'];
        }
        if (!empty($f['type']) && in_array($f['type'], self::TYPES, true)) {
            $where[] = 'ft.type = :ty';
            $p['ty'] = $f['type'];
        }
        if (!empty($f['status']) && in_array($f['status'], ['completed', 'reversed', 'reversal'], true)) {
            $where[] = 'ft.status = :st';
            $p['st'] = $f['status'];
        }
        if (!empty($f['asset'])) {
            $where[] = 'a.symbol = :sym';
            $p['sym'] = strtoupper((string) $f['asset']);
        }
        if (!empty($f['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $f['from'])) {
            $where[] = 'ft.effective_at >= :from';
            $p['from'] = $f['from'] . ' 00:00:00';
        }
        if (!empty($f['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $f['to'])) {
            $where[] = 'ft.effective_at <= :to';
            $p['to'] = $f['to'] . ' 23:59:59';
        }
        if (!empty($f['q'])) {
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], (string) $f['q']) . '%';
            // native prepared statements cannot reuse a placeholder, so each gets its own name
            $where[] = '(ft.reference LIKE :q1 OR ft.notes LIKE :q2 OR ft.uuid LIKE :q3' . ($userId === null ? ' OR u.email LIKE :q4 OR u.full_name LIKE :q5' : '') . ')';
            $p += ['q1' => $like, 'q2' => $like, 'q3' => $like];
            if ($userId === null) {
                $p += ['q4' => $like, 'q5' => $like];
            }
        }
        $w = implode(' AND ', $where);
        $total = (int) $this->db->value("SELECT COUNT(*) FROM financial_transactions ft LEFT JOIN assets a ON a.id = ft.asset_id LEFT JOIN users u ON u.id = ft.user_id WHERE $w", $p);
        $rows = $this->db->all(
            "SELECT ft.id, ft.uuid, ft.user_id, u.full_name AS user_name, u.email AS user_email, ft.type, ft.status, a.symbol AS asset_symbol,
                    ft.quantity, ft.unit_price, ft.amount_usd, ft.fee_usd, ft.realized_pnl_usd, ft.effective_at, ft.reference, ft.notes,
                    ft.reversal_of_id, ft.reversed_by_id, ft.created_at, cu.full_name AS created_by_name
             FROM financial_transactions ft
             LEFT JOIN assets a ON a.id = ft.asset_id
             LEFT JOIN users u ON u.id = ft.user_id
             LEFT JOIN users cu ON cu.id = ft.created_by
             WHERE $w ORDER BY ft.effective_at DESC, ft.id DESC LIMIT :lim OFFSET :off",
            $p + ['lim' => $perPage, 'off' => ($page - 1) * $perPage]
        );
        if ($userId !== null) {
            foreach ($rows as &$r) {
                unset($r['user_email'], $r['created_by_name']);
            }
        }
        return [$rows, $total];
    }

    /**
     * Records a cash movement (deposit/withdrawal/transfer/adjustment) for a user.
     * @param array{type:string, amount:string, from?:string, to?:string, effective_at?:string, reference?:string, notes?:string, idempotency_key?:string} $in
     */
    public function recordCashMovement(int $userId, array $in, ?int $actorId): array
    {
        $amount = D::normalize($in['amount']);
        if (D::cmp($amount, '0') <= 0) {
            throw HttpException::validation(['amount' => 'Amount must be greater than 0.']);
        }
        $idem = self::validateIdempotencyKey($in['idempotency_key'] ?? null);
        return $this->db->transaction(function () use ($userId, $in, $amount, $idem, $actorId) {
            if ($existing = $this->findByIdempotencyKey($idem)) {
                return ['transaction_id' => (int) $existing['id'], 'duplicate' => true];
            }
            $this->lockUser($userId);
            $type = $in['type'];
            $lines = match ($type) {
                'deposit' => [['account' => $in['to'] ?? 'cash', 'amount' => $amount], ['account' => 'external', 'amount' => D::neg($amount)]],
                'withdrawal' => [['account' => $in['from'] ?? 'cash', 'amount' => D::neg($amount)], ['account' => 'external', 'amount' => $amount]],
                'transfer' => [['account' => $in['from'], 'amount' => D::neg($amount)], ['account' => $in['to'], 'amount' => $amount]],
                'adjustment' => [
                    ['account' => $in['to'] ?? 'cash', 'amount' => ($in['direction'] ?? 'credit') === 'debit' ? D::neg($amount) : $amount],
                    ['account' => 'external', 'amount' => ($in['direction'] ?? 'credit') === 'debit' ? $amount : D::neg($amount)],
                ],
                default => throw HttpException::validation(['type' => 'Unsupported movement type.']),
            };
            foreach ($lines as $l) {
                if (!in_array($l['account'], ['cash', 'trading', 'external'], true)) {
                    throw HttpException::validation(['account' => 'Movements can only use the cash and trading balances.']);
                }
            }
            if ($type === 'transfer' && ($in['from'] ?? '') === ($in['to'] ?? '')) {
                throw HttpException::validation(['to' => 'Choose two different balances.']);
            }
            // prevent negative balances on outflows
            foreach ($lines as $l) {
                if ($l['account'] !== 'external' && D::isNegative($l['amount'])) {
                    $bal = $this->balance($userId, $l['account']);
                    if (D::cmp(D::add($bal, $l['amount']), '0') < 0) {
                        throw HttpException::validation(['amount' => "Insufficient {$l['account']} balance (available " . D::fixed($bal, 2) . ' USD).']);
                    }
                }
            }
            $txId = $this->post([
                'type' => $type,
                'user_id' => $userId,
                'amount_usd' => $amount,
                'effective_at' => $in['effective_at'] ?? Database::now(),
                'reference' => $in['reference'] ?? null,
                'notes' => $in['notes'] ?? null,
                'idempotency_key' => $idem,
                'created_by' => $actorId,
            ], $lines);
            return ['transaction_id' => $txId, 'duplicate' => false];
        });
    }

    /** Reverses a simple cash movement (deposit/withdrawal/transfer/adjustment). */
    public function reverseCashMovement(int $txId, ?int $actorId, string $reason): int
    {
        return $this->db->transaction(function () use ($txId, $actorId, $reason) {
            $tx = $this->db->one('SELECT * FROM financial_transactions WHERE id = :id', ['id' => $txId]);
            if (!$tx) {
                throw HttpException::notFound('Transaction not found.');
            }
            if (!in_array($tx['type'], ['deposit', 'withdrawal', 'transfer', 'adjustment'], true)) {
                throw HttpException::conflict('Reverse this record from its own module (investment, trade, loan, salary or allocation).', 'use_module');
            }
            $this->lockUser((int) $tx['user_id']);
            // a reversal must not leave a balance negative
            foreach ($this->db->all('SELECT account, amount_usd FROM ledger_entries WHERE transaction_id = :id', ['id' => $txId]) as $l) {
                if (in_array($l['account'], ['cash', 'trading'], true) && D::cmp($l['amount_usd'], '0') > 0) {
                    $bal = $this->balance((int) $tx['user_id'], $l['account']);
                    if (D::cmp(D::sub($bal, $l['amount_usd']), '0') < 0) {
                        throw HttpException::conflict('Reversing this would make the ' . $l['account'] . ' balance negative.', 'insufficient_balance');
                    }
                }
            }
            return $this->reverse($txId, $actorId, $reason);
        });
    }
}
