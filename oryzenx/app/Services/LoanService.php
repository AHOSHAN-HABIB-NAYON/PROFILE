<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Decimal as D;
use OryzenX\Core\HttpException;

/**
 * Loan liabilities in USD or a coin.
 *  - USD loan: liability = outstanding USD.
 *  - Coin loan: the borrowed QUANTITY is preserved; liability value = outstanding quantity × current market price.
 *    book_value_usd keeps the historical (origination) valuation used by the ledger.
 *  - Coin loans credited to holdings add the coins to the portfolio AND the liability, so a price move changes
 *    both sides and the net position is unaffected — borrowed coins are never counted as owned equity.
 *  - Repaying a coin loan at a price different from the origination price realizes the difference as P/L.
 *  - Fees/interest are only charged when an administrator explicitly records a charge.
 */
final class LoanService
{
    public function __construct(
        private Database $db,
        private LedgerService $ledger,
        private InvestmentService $investments,
        private MarketService $market,
        private AuditService $audit,
        private NotificationService $notify
    ) {
    }

    /**
     * @param array{denomination:string, asset_id?:int, quantity?:string, principal_usd?:string, origination_price?:string,
     *              credited_to?:string, loan_date?:string, due_date?:?string, interest_rate_pct?:?string, reference?:?string,
     *              notes?:?string, idempotency_key?:?string} $in
     */
    public function create(int $userId, array $in, ?int $actorId): array
    {
        $denom = $in['denomination'] ?? 'USD';
        $credited = $in['credited_to'] ?? 'external';
        if (!in_array($denom, ['USD', 'COIN'], true) || !in_array($credited, ['cash', 'holdings', 'external'], true)) {
            throw HttpException::validation(['denomination' => 'Select a valid loan type and destination.']);
        }
        if ($denom === 'USD' && $credited === 'holdings') {
            throw HttpException::validation(['credited_to' => 'USD loans can be credited to cash or recorded as external.']);
        }
        if ($denom === 'COIN' && $credited === 'cash') {
            throw HttpException::validation(['credited_to' => 'Coin loans can be credited to holdings or recorded as external.']);
        }
        $idem = LedgerService::validateIdempotencyKey($in['idempotency_key'] ?? null);
        $loanDate = $in['loan_date'] ?? Database::now();

        $r = $this->db->transaction(function () use ($userId, $in, $denom, $credited, $idem, $loanDate, $actorId) {
            if ($dup = $this->ledger->findByIdempotencyKey($idem)) {
                return ['loan_id' => (int) $dup['related_id'], 'duplicate' => true];
            }
            $this->ledger->lockUser($userId);
            $assetId = null;
            $qty = null;
            $origPrice = null;
            if ($denom === 'USD') {
                $principal = D::round(D::normalize($in['principal_usd'] ?? '0'), 8);
                if (D::cmp($principal, '0') <= 0) {
                    throw HttpException::validation(['principal_usd' => 'Principal must be greater than 0.']);
                }
                $book = $principal;
            } else {
                $assetId = (int) ($in['asset_id'] ?? 0);
                if (!$this->db->value('SELECT id FROM assets WHERE id = :id', ['id' => $assetId])) {
                    throw HttpException::validation(['asset_id' => 'Select a valid asset.']);
                }
                $qty = D::normalize($in['quantity'] ?? '0');
                if (D::cmp($qty, '0') <= 0) {
                    throw HttpException::validation(['quantity' => 'Quantity must be greater than 0.']);
                }
                $origPrice = isset($in['origination_price']) && $in['origination_price'] !== '' ? D::normalize($in['origination_price']) : null;
                if ($origPrice === null) {
                    $live = $this->market->priceFor($assetId);
                    if (!$live || $live['price'] === null || $live['stale']) {
                        throw HttpException::validation(['origination_price' => 'No fresh market price is available. Enter the valuation price manually.']);
                    }
                    $origPrice = $live['price'];
                }
                if (D::cmp($origPrice, '0') <= 0) {
                    throw HttpException::validation(['origination_price' => 'Price must be greater than 0.']);
                }
                $book = D::round(D::mul($qty, $origPrice), 8);
                $principal = $book;
            }
            $now = Database::now();
            // create the loan row first with a placeholder tx id, then post
            $loanId = $this->db->insert('loans', [
                'user_id' => $userId,
                'denomination' => $denom,
                'asset_id' => $assetId,
                'principal_quantity' => $qty,
                'origination_price' => $origPrice,
                'principal_usd' => $principal,
                'outstanding_quantity' => $qty,
                'outstanding_usd' => $denom === 'USD' ? $principal : null,
                'book_value_usd' => $book,
                'interest_rate_pct' => isset($in['interest_rate_pct']) && $in['interest_rate_pct'] !== '' ? D::normalize($in['interest_rate_pct']) : null,
                'credited_to' => $credited,
                'loan_date' => $loanDate,
                'due_date' => $in['due_date'] ?? null,
                'status' => 'active',
                'reference' => isset($in['reference']) ? mb_substr((string) $in['reference'], 0, 100) : null,
                'notes' => isset($in['notes']) ? mb_substr(strip_tags((string) $in['notes']), 0, 1000) : null,
                'transaction_id' => null,
                'created_by' => $actorId,
                'updated_by' => $actorId,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            if ($credited === 'holdings') {
                // borrowed coins enter holdings at the origination value; ledger: investment +book / loan −book
                $res = $this->investments->addEntry($userId, [
                    'asset_id' => $assetId, 'quantity' => $qty, 'unit_price' => $origPrice, 'fee_usd' => '0',
                    'acquired_at' => $loanDate, 'funding' => 'loan', 'loan_id' => $loanId,
                    'notes' => 'Borrowed under loan #' . $loanId, 'idempotency_key' => $idem,
                ], $actorId);
                $txId = $res['transaction_id'];
                $this->db->update('financial_transactions', ['type' => 'loan_disbursement', 'related_type' => 'loan', 'related_id' => $loanId], 'id = :id', ['id' => $txId]);
                $this->db->update('investment_entries', ['loan_id' => $loanId], 'id = :id', ['id' => $res['entry_id']]);
            } else {
                $txId = $this->ledger->post([
                    'type' => 'loan_disbursement',
                    'user_id' => $userId,
                    'asset_id' => $assetId,
                    'quantity' => $qty,
                    'unit_price' => $origPrice,
                    'amount_usd' => $book,
                    'effective_at' => $loanDate,
                    'reference' => $in['reference'] ?? null,
                    'idempotency_key' => $idem,
                    'related_type' => 'loan',
                    'related_id' => $loanId,
                    'created_by' => $actorId,
                ], [
                    ['account' => $credited === 'cash' ? 'cash' : 'external', 'amount' => $book],
                    ['account' => 'loan', 'amount' => D::neg($book), 'asset_id' => $assetId, 'quantity' => $qty !== null ? D::neg($qty) : null],
                ]);
            }
            $this->db->update('loans', ['transaction_id' => $txId], 'id = :id', ['id' => $loanId]);
            $this->audit->log($actorId, 'loan.created', 'loan', $loanId, ['user_id' => $userId, 'denomination' => $denom, 'quantity' => $qty, 'principal_usd' => $principal, 'credited_to' => $credited]);
            return ['loan_id' => $loanId, 'duplicate' => false];
        });
        if (!$r['duplicate']) {
            $this->notifyLoan($r['loan_id'], 'created');
        }
        return $r;
    }

    /**
     * USD loans: amount_usd required. Coin loans: quantity required, price defaults to the current market price.
     * @param array{amount_usd?:string, quantity?:string, price?:string, paid_from?:string, paid_at?:string, notes?:string, idempotency_key?:string} $in
     */
    public function repay(int $loanId, array $in, ?int $actorId): array
    {
        $idem = LedgerService::validateIdempotencyKey($in['idempotency_key'] ?? null);
        $r = $this->db->transaction(function () use ($loanId, $in, $idem, $actorId) {
            if ($dup = $this->ledger->findByIdempotencyKey($idem)) {
                return ['repayment_id' => 0, 'transaction_id' => (int) $dup['id'], 'duplicate' => true];
            }
            $loan = $this->db->one('SELECT user_id FROM loans WHERE id = :id', ['id' => $loanId]);
            if (!$loan) {
                throw HttpException::notFound('Loan not found.');
            }
            $this->ledger->lockUser((int) $loan['user_id']);
            $loan = $this->db->one('SELECT * FROM loans WHERE id = :id FOR UPDATE', ['id' => $loanId]);
            if ($loan['status'] !== 'active') {
                throw HttpException::conflict('Only active loans can be repaid.', 'not_active');
            }
            $from = ($in['paid_from'] ?? 'external') === 'cash' ? 'cash' : 'external';
            $paidAt = $in['paid_at'] ?? Database::now();
            $userId = (int) $loan['user_id'];
            if ($loan['denomination'] === 'USD') {
                $amount = D::round(D::normalize($in['amount_usd'] ?? '0'), 8);
                if (D::cmp($amount, '0') <= 0 || D::cmp($amount, $loan['outstanding_usd']) > 0) {
                    throw HttpException::validation(['amount_usd' => 'Amount must be greater than 0 and not exceed the outstanding ' . D::fixed($loan['outstanding_usd'], 2) . ' USD.']);
                }
                $bookReduction = $amount;
                $pnl = '0';
                $qty = null;
                $price = null;
            } else {
                $qty = D::normalize($in['quantity'] ?? '0');
                if (D::cmp($qty, '0') <= 0 || D::cmp($qty, $loan['outstanding_quantity']) > 0) {
                    throw HttpException::validation(['quantity' => 'Quantity must be greater than 0 and not exceed the outstanding ' . D::normalize($loan['outstanding_quantity']) . '.']);
                }
                $price = isset($in['price']) && $in['price'] !== '' ? D::normalize($in['price']) : null;
                if ($price === null) {
                    $live = $this->market->priceFor((int) $loan['asset_id']);
                    if (!$live || $live['price'] === null || $live['stale']) {
                        throw HttpException::validation(['price' => 'No fresh market price is available. Enter the settlement price manually.']);
                    }
                    $price = $live['price'];
                }
                $amount = D::round(D::mul($qty, $price), 8);
                $bookReduction = D::cmp($qty, $loan['outstanding_quantity']) === 0
                    ? D::normalize($loan['book_value_usd'])
                    : D::round(D::div(D::mul($loan['book_value_usd'], $qty), $loan['outstanding_quantity']), 8);
                $pnl = D::sub($bookReduction, $amount); // positive = gain (repaid for less than book value)
            }
            if ($from === 'cash') {
                $cash = $this->ledger->balance($userId, 'cash');
                if (D::cmp($cash, $amount) < 0) {
                    throw HttpException::validation(['paid_from' => 'Insufficient cash balance (available ' . D::fixed($cash, 2) . ' USD).']);
                }
            }
            $lines = [
                ['account' => 'loan', 'amount' => $bookReduction, 'asset_id' => $loan['asset_id'] !== null ? (int) $loan['asset_id'] : null, 'quantity' => $qty],
                ['account' => $from, 'amount' => D::neg($amount)],
            ];
            if (!D::isZero($pnl)) {
                $lines[] = ['account' => 'pnl', 'amount' => D::neg($pnl)];
            }
            $txId = $this->ledger->post([
                'type' => 'loan_repayment',
                'user_id' => $userId,
                'asset_id' => $loan['asset_id'] !== null ? (int) $loan['asset_id'] : null,
                'quantity' => $qty,
                'unit_price' => $price,
                'amount_usd' => $amount,
                'realized_pnl_usd' => D::isZero($pnl) ? null : $pnl,
                'effective_at' => $paidAt,
                'notes' => $in['notes'] ?? null,
                'idempotency_key' => $idem,
                'related_type' => 'loan',
                'related_id' => $loanId,
                'created_by' => $actorId,
            ], $lines);
            $repId = $this->db->insert('loan_repayments', [
                'loan_id' => $loanId, 'kind' => 'repayment', 'quantity' => $qty, 'amount_usd' => $amount, 'price_used' => $price,
                'book_reduction_usd' => $bookReduction, 'realized_pnl_usd' => $pnl, 'paid_from' => $from, 'paid_at' => $paidAt,
                'transaction_id' => $txId, 'notes' => isset($in['notes']) ? mb_substr(strip_tags((string) $in['notes']), 0, 1000) : null,
                'created_by' => $actorId, 'created_at' => Database::now(),
            ]);
            $this->applyBalances($loanId);
            $this->audit->log($actorId, 'loan.repayment', 'loan', $loanId, ['repayment_id' => $repId, 'amount_usd' => $amount, 'quantity' => $qty, 'price' => $price]);
            return ['repayment_id' => $repId, 'transaction_id' => $txId, 'duplicate' => false];
        });
        if (!$r['duplicate']) {
            $this->notifyLoan($loanId, 'repayment');
        }
        return $r;
    }

    /** Records an explicitly configured fee or interest charge (increases the liability, recorded as a realized expense). */
    public function charge(int $loanId, array $in, ?int $actorId): array
    {
        $type = in_array($in['charge_type'] ?? 'fee', ['fee', 'interest'], true) ? $in['charge_type'] : 'fee';
        $idem = LedgerService::validateIdempotencyKey($in['idempotency_key'] ?? null);
        return $this->db->transaction(function () use ($loanId, $in, $type, $idem, $actorId) {
            if ($dup = $this->ledger->findByIdempotencyKey($idem)) {
                return ['repayment_id' => 0, 'transaction_id' => (int) $dup['id'], 'duplicate' => true];
            }
            $loan = $this->db->one('SELECT user_id FROM loans WHERE id = :id', ['id' => $loanId]);
            if (!$loan) {
                throw HttpException::notFound('Loan not found.');
            }
            $this->ledger->lockUser((int) $loan['user_id']);
            $loan = $this->db->one('SELECT * FROM loans WHERE id = :id FOR UPDATE', ['id' => $loanId]);
            if ($loan['status'] !== 'active') {
                throw HttpException::conflict('Charges can only be recorded on active loans.', 'not_active');
            }
            if ($loan['denomination'] === 'USD') {
                $amount = D::round(D::normalize($in['amount_usd'] ?? '0'), 8);
                $qty = null;
                $price = null;
            } else {
                $qty = D::normalize($in['quantity'] ?? '0');
                $price = isset($in['price']) && $in['price'] !== '' ? D::normalize($in['price']) : D::normalize($loan['origination_price']);
                $amount = D::round(D::mul($qty, $price), 8);
            }
            if (D::cmp($amount, '0') <= 0) {
                throw HttpException::validation(['amount_usd' => 'Charge must be greater than 0.']);
            }
            $at = $in['charged_at'] ?? Database::now();
            $txId = $this->ledger->post([
                'type' => 'loan_charge', 'user_id' => (int) $loan['user_id'], 'asset_id' => $loan['asset_id'], 'quantity' => $qty,
                'unit_price' => $price, 'amount_usd' => $amount, 'realized_pnl_usd' => D::neg($amount), 'effective_at' => $at,
                'notes' => ucfirst($type) . (isset($in['notes']) ? ': ' . $in['notes'] : ''), 'idempotency_key' => $idem,
                'related_type' => 'loan', 'related_id' => $loanId, 'created_by' => $actorId,
            ], [
                ['account' => 'pnl', 'amount' => $amount],
                ['account' => 'loan', 'amount' => D::neg($amount), 'asset_id' => $loan['asset_id'] !== null ? (int) $loan['asset_id'] : null, 'quantity' => $qty !== null ? D::neg($qty) : null],
            ]);
            $id = $this->db->insert('loan_repayments', [
                'loan_id' => $loanId, 'kind' => 'charge', 'charge_type' => $type, 'quantity' => $qty, 'amount_usd' => $amount, 'price_used' => $price,
                'book_reduction_usd' => D::neg($amount), 'realized_pnl_usd' => D::neg($amount), 'paid_from' => 'external', 'paid_at' => $at,
                'transaction_id' => $txId, 'notes' => isset($in['notes']) ? mb_substr(strip_tags((string) $in['notes']), 0, 1000) : null,
                'created_by' => $actorId, 'created_at' => Database::now(),
            ]);
            $this->applyBalances($loanId);
            $this->audit->log($actorId, 'loan.charge', 'loan', $loanId, ['type' => $type, 'amount_usd' => $amount, 'quantity' => $qty]);
            return ['repayment_id' => $id, 'transaction_id' => $txId, 'duplicate' => false];
        });
    }

    /** Recomputes outstanding values from the loan's completed events (single source of truth). */
    private function applyBalances(int $loanId): void
    {
        $loan = $this->db->one('SELECT * FROM loans WHERE id = :id', ['id' => $loanId]);
        $events = $this->db->all('SELECT * FROM loan_repayments WHERE loan_id = :id AND status = "completed"', ['id' => $loanId]);
        $book = D::normalize($loan['principal_usd']);
        $qty = $loan['principal_quantity'] !== null ? D::normalize($loan['principal_quantity']) : null;
        $usd = $loan['denomination'] === 'USD' ? D::normalize($loan['principal_usd']) : null;
        foreach ($events as $e) {
            $book = D::sub($book, $e['book_reduction_usd']);
            if ($qty !== null && $e['quantity'] !== null) {
                $qty = $e['kind'] === 'charge' ? D::add($qty, $e['quantity']) : D::sub($qty, $e['quantity']);
            }
            if ($usd !== null) {
                $usd = $e['kind'] === 'charge' ? D::add($usd, $e['amount_usd']) : D::sub($usd, $e['amount_usd']);
            }
        }
        $settled = $loan['denomination'] === 'USD' ? D::cmp($usd, '0') <= 0 : D::cmp($qty, '0') <= 0;
        $this->db->update('loans', [
            'book_value_usd' => D::round($book, 8),
            'outstanding_quantity' => $qty,
            'outstanding_usd' => $usd !== null ? D::round($usd, 8) : null,
            'status' => $settled ? 'repaid' : 'active',
            'updated_at' => Database::now(),
        ], 'id = :id', ['id' => $loanId]);
    }

    public function reverseRepayment(int $repaymentId, ?int $actorId, string $reason): void
    {
        $this->db->transaction(function () use ($repaymentId, $actorId, $reason) {
            $rep = $this->db->one('SELECT r.*, l.user_id FROM loan_repayments r JOIN loans l ON l.id = r.loan_id WHERE r.id = :id', ['id' => $repaymentId]);
            if (!$rep) {
                throw HttpException::notFound('Repayment not found.');
            }
            $this->ledger->lockUser((int) $rep['user_id']);
            if ($rep['status'] !== 'completed') {
                throw HttpException::conflict('Already reversed.', 'already_reversed');
            }
            $latest = (int) $this->db->value('SELECT MAX(id) FROM loan_repayments WHERE loan_id = :l AND status = "completed"', ['l' => $rep['loan_id']]);
            if ($latest !== $repaymentId) {
                throw HttpException::conflict('Only the most recent repayment or charge can be reversed. Reverse newer events first.', 'not_latest');
            }
            $this->ledger->reverse((int) $rep['transaction_id'], $actorId, $reason);
            $this->db->update('loan_repayments', ['status' => 'reversed'], 'id = :id', ['id' => $repaymentId]);
            // re-open the loan if it had been settled
            $this->db->update('loans', ['status' => 'active'], 'id = :id AND status = "repaid"', ['id' => $rep['loan_id']]);
            $this->applyBalances((int) $rep['loan_id']);
            $this->audit->log($actorId, 'loan.repayment_reversed', 'loan', $rep['loan_id'], ['repayment_id' => $repaymentId, 'reason' => $reason]);
        });
    }

    public function reverse(int $loanId, ?int $actorId, string $reason): void
    {
        $this->db->transaction(function () use ($loanId, $actorId, $reason) {
            $loan = $this->db->one('SELECT * FROM loans WHERE id = :id', ['id' => $loanId]);
            if (!$loan) {
                throw HttpException::notFound('Loan not found.');
            }
            $this->ledger->lockUser((int) $loan['user_id']);
            if ($loan['status'] === 'reversed') {
                throw HttpException::conflict('This loan is already reversed.', 'already_reversed');
            }
            if ($this->db->value('SELECT COUNT(*) FROM loan_repayments WHERE loan_id = :l AND status = "completed"', ['l' => $loanId]) > 0) {
                throw HttpException::conflict('Reverse the repayments and charges of this loan first.', 'has_events');
            }
            if ($loan['credited_to'] === 'holdings') {
                $entryId = (int) $this->db->value('SELECT id FROM investment_entries WHERE loan_id = :l AND status <> "reversed"', ['l' => $loanId]);
                $this->investments->reverseEntryForLoan($entryId, $actorId, 'Loan #' . $loanId . ' reversed: ' . $reason);
            } else {
                if ($loan['credited_to'] === 'cash') {
                    $cash = $this->ledger->balance((int) $loan['user_id'], 'cash');
                    if (D::cmp($cash, $loan['principal_usd']) < 0) {
                        throw HttpException::conflict('Reversing this loan would make the cash balance negative.', 'insufficient_balance');
                    }
                }
                $this->ledger->reverse((int) $loan['transaction_id'], $actorId, $reason);
            }
            $this->db->update('loans', ['status' => 'reversed', 'updated_by' => $actorId, 'updated_at' => Database::now()], 'id = :id', ['id' => $loanId]);
            $this->audit->log($actorId, 'loan.reversed', 'loan', $loanId, ['reason' => $reason]);
        });
    }

    /** Loans with live valuation. */
    public function list(?int $userId, array $f, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $p = [];
        if ($userId !== null) {
            $where[] = 'l.user_id = :u';
            $p['u'] = $userId;
        } elseif (!empty($f['user_id'])) {
            $where[] = 'l.user_id = :u';
            $p['u'] = (int) $f['user_id'];
        }
        if (!empty($f['status']) && in_array($f['status'], ['active', 'repaid', 'reversed'], true)) {
            $where[] = 'l.status = :s';
            $p['s'] = $f['status'];
        }
        $w = implode(' AND ', $where);
        $total = (int) $this->db->value("SELECT COUNT(*) FROM loans l WHERE $w", $p);
        $rows = $this->db->all(
            "SELECT l.*, a.symbol, a.name AS asset_name, u.full_name AS user_name FROM loans l LEFT JOIN assets a ON a.id = l.asset_id JOIN users u ON u.id = l.user_id
             WHERE $w ORDER BY l.status = 'active' DESC, l.loan_date DESC, l.id DESC LIMIT :lim OFFSET :off",
            $p + ['lim' => $perPage, 'off' => ($page - 1) * $perPage]
        );
        $prices = $this->market->latest();
        foreach ($rows as &$r) {
            $r = $this->valuate($r, $prices);
        }
        return [$rows, $total];
    }

    public function valuate(array $loan, array $prices): array
    {
        $repaid = (string) $this->db->value('SELECT COALESCE(SUM(amount_usd),0) FROM loan_repayments WHERE loan_id = :l AND kind = "repayment" AND status = "completed"', ['l' => $loan['id']]);
        $charges = (string) $this->db->value('SELECT COALESCE(SUM(amount_usd),0) FROM loan_repayments WHERE loan_id = :l AND kind = "charge" AND status = "completed"', ['l' => $loan['id']]);
        $loan['repaid_usd'] = D::normalize($repaid);
        $loan['charges_usd'] = D::normalize($charges);
        $loan['current_price'] = null;
        $loan['price_stale'] = false;
        $loan['price_updated_at'] = null;
        if ($loan['status'] !== 'active') {
            $loan['current_liability_usd'] = '0';
        } elseif ($loan['denomination'] === 'USD') {
            $loan['current_liability_usd'] = D::normalize($loan['outstanding_usd']);
        } else {
            $pr = $prices[(int) $loan['asset_id']] ?? null;
            if ($pr && $pr['price'] !== null) {
                $loan['current_price'] = $pr['price'];
                $loan['price_stale'] = $pr['stale'];
                $loan['price_updated_at'] = $pr['updated_at'];
                $loan['current_liability_usd'] = D::round(D::mul($loan['outstanding_quantity'], $pr['price']), 8);
            } else {
                // no price ever recorded: fall back to book value and say so
                $loan['current_liability_usd'] = D::normalize($loan['book_value_usd']);
                $loan['price_stale'] = true;
            }
        }
        return $loan;
    }

    public function detail(int $loanId, ?int $userId = null): array
    {
        $sql = 'SELECT l.*, a.symbol, a.name AS asset_name, u.full_name AS user_name FROM loans l LEFT JOIN assets a ON a.id = l.asset_id JOIN users u ON u.id = l.user_id WHERE l.id = :id';
        $p = ['id' => $loanId];
        if ($userId !== null) {
            $sql .= ' AND l.user_id = :u';
            $p['u'] = $userId;
        }
        $loan = $this->db->one($sql, $p);
        if (!$loan) {
            throw HttpException::notFound('Loan not found.');
        }
        $loan = $this->valuate($loan, $this->market->latest());
        $loan['events'] = $this->db->all('SELECT * FROM loan_repayments WHERE loan_id = :l ORDER BY paid_at DESC, id DESC', ['l' => $loanId]);
        return $loan;
    }

    private function notifyLoan(int $loanId, string $event): void
    {
        $l = $this->db->one('SELECT l.*, a.symbol FROM loans l LEFT JOIN assets a ON a.id = l.asset_id WHERE l.id = :id', ['id' => $loanId]);
        if (!$l) {
            return;
        }
        $this->notify->dispatch((int) $l['user_id'], 'loan_status', [
            'loan_id' => $loanId,
            'event' => $event,
            'status' => $l['status'],
            'asset' => $l['symbol'] ?? 'USD',
            'outstanding' => $l['denomination'] === 'USD' ? D::fixed($l['outstanding_usd'], 2) . ' USD' : D::normalize($l['outstanding_quantity']) . ' ' . $l['symbol'],
        ], 'loan:' . $loanId . ':' . $event . ':' . $this->db->value('SELECT COUNT(*) FROM loan_repayments WHERE loan_id = :l', ['l' => $loanId]));
    }
}
