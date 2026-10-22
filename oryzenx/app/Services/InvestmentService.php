<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Decimal as D;
use OryzenX\Core\HttpException;

/**
 * Investment holdings using the AVERAGE-COST method.
 *  - cost basis of a lot = quantity × acquisition price + fee  (the acquisition price is never changed later)
 *  - selling q units removes cost = position cost × q / position quantity
 *  - realized P/L of a sale = q × sale price − sale fee − removed cost
 * Corrections are reversals: only the most recent event of a user's asset can be reversed, newest first,
 * so average cost history stays exact.
 */
final class InvestmentService
{
    public function __construct(
        private Database $db,
        private LedgerService $ledger,
        private AuditService $audit,
        private NotificationService $notify
    ) {
    }

    /**
     * @param array{asset_id:int, quantity:string, unit_price:string, fee_usd?:string, acquired_at?:string, funding?:string,
     *              notes?:string, idempotency_key?:string, loan_id?:int} $in
     */
    public function addEntry(int $userId, array $in, ?int $actorId): array
    {
        $qty = D::normalize($in['quantity']);
        $price = D::normalize($in['unit_price']);
        $fee = D::normalize($in['fee_usd'] ?? '0');
        if (D::cmp($qty, '0') <= 0 || D::cmp($price, '0') <= 0 || D::isNegative($fee)) {
            throw HttpException::validation(['quantity' => 'Quantity and price must be greater than 0; fee cannot be negative.']);
        }
        $funding = $in['funding'] ?? 'external';
        if (!in_array($funding, ['cash', 'external', 'loan'], true)) {
            throw HttpException::validation(['funding' => 'Select a valid funding source.']);
        }
        $idem = LedgerService::validateIdempotencyKey($in['idempotency_key'] ?? null);
        $cost = D::round(D::add(D::mul($qty, $price), $fee), 8);
        $acquiredAt = $in['acquired_at'] ?? Database::now();

        return $this->db->transaction(function () use ($userId, $in, $qty, $price, $fee, $cost, $funding, $idem, $acquiredAt, $actorId) {
            if ($dup = $this->ledger->findByIdempotencyKey($idem)) {
                $entry = $this->db->one('SELECT id FROM investment_entries WHERE transaction_id = :t', ['t' => $dup['id']]);
                return ['entry_id' => (int) ($entry['id'] ?? 0), 'transaction_id' => (int) $dup['id'], 'duplicate' => true];
            }
            $this->ledger->lockUser($userId);
            $asset = $this->db->one('SELECT id, symbol FROM assets WHERE id = :id', ['id' => (int) $in['asset_id']]);
            if (!$asset) {
                throw HttpException::validation(['asset_id' => 'Select a valid asset.']);
            }
            if ($funding === 'cash') {
                $cash = $this->ledger->balance($userId, 'cash');
                if (D::cmp($cash, $cost) < 0) {
                    throw HttpException::validation(['funding' => 'Insufficient cash balance (available ' . D::fixed($cash, 2) . ' USD).']);
                }
            }
            $contra = ['cash' => 'cash', 'external' => 'external', 'loan' => 'loan'][$funding];
            $txId = $this->ledger->post([
                'type' => 'investment_buy',
                'user_id' => $userId,
                'asset_id' => (int) $asset['id'],
                'quantity' => $qty,
                'unit_price' => $price,
                'amount_usd' => $cost,
                'fee_usd' => $fee,
                'effective_at' => $acquiredAt,
                'notes' => $in['notes'] ?? null,
                'idempotency_key' => $idem,
                'related_type' => 'investment',
                'created_by' => $actorId,
            ], [
                ['account' => 'investment', 'amount' => $cost, 'asset_id' => (int) $asset['id'], 'quantity' => $qty],
                ['account' => $contra, 'amount' => D::neg($cost)],
            ]);
            $now = Database::now();
            $entryId = $this->db->insert('investment_entries', [
                'user_id' => $userId,
                'asset_id' => (int) $asset['id'],
                'quantity' => $qty,
                'unit_price' => $price,
                'fee_usd' => $fee,
                'cost_basis_usd' => $cost,
                'acquired_at' => $acquiredAt,
                'funding' => $funding,
                'loan_id' => $in['loan_id'] ?? null,
                'transaction_id' => $txId,
                'notes' => $in['notes'] ?? null,
                'created_by' => $actorId,
                'updated_by' => $actorId,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $this->db->update('financial_transactions', ['related_id' => $entryId], 'id = :id', ['id' => $txId]);
            $this->adjustPosition($userId, (int) $asset['id'], $qty, $cost, '0');
            $this->audit->log($actorId, 'investment.entry_added', 'investment_entry', $entryId, ['user_id' => $userId, 'asset' => $asset['symbol'], 'quantity' => $qty, 'unit_price' => $price, 'fee' => $fee]);
            return ['entry_id' => $entryId, 'transaction_id' => $txId, 'duplicate' => false];
        });
    }

    /** @param array{asset_id:int, quantity:string, unit_price:string, fee_usd?:string, sold_at?:string, notes?:string, idempotency_key?:string} $in */
    public function sell(int $userId, array $in, ?int $actorId): array
    {
        $qty = D::normalize($in['quantity']);
        $price = D::normalize($in['unit_price']);
        $fee = D::normalize($in['fee_usd'] ?? '0');
        if (D::cmp($qty, '0') <= 0 || D::cmp($price, '0') <= 0 || D::isNegative($fee)) {
            throw HttpException::validation(['quantity' => 'Quantity and price must be greater than 0; fee cannot be negative.']);
        }
        $idem = LedgerService::validateIdempotencyKey($in['idempotency_key'] ?? null);
        $assetId = (int) $in['asset_id'];
        $result = $this->db->transaction(function () use ($userId, $assetId, $qty, $price, $fee, $in, $idem, $actorId) {
            if ($dup = $this->ledger->findByIdempotencyKey($idem)) {
                $sale = $this->db->one('SELECT id FROM investment_sales WHERE transaction_id = :t', ['t' => $dup['id']]);
                return ['sale_id' => (int) ($sale['id'] ?? 0), 'transaction_id' => (int) $dup['id'], 'duplicate' => true, 'realized_pnl_usd' => $dup['realized_pnl_usd']];
            }
            $this->ledger->lockUser($userId);
            $pos = $this->db->one('SELECT * FROM investment_positions WHERE user_id = :u AND asset_id = :a FOR UPDATE', ['u' => $userId, 'a' => $assetId]);
            if (!$pos || D::cmp($pos['quantity'], $qty) < 0) {
                throw HttpException::validation(['quantity' => 'Quantity exceeds the current holding (' . D::normalize($pos['quantity'] ?? '0') . ').']);
            }
            $removed = D::cmp($pos['quantity'], $qty) === 0
                ? D::normalize($pos['cost_basis_usd'])
                : D::round(D::div(D::mul($pos['cost_basis_usd'], $qty), $pos['quantity']), 8);
            $proceeds = D::round(D::mul($qty, $price), 8);
            $net = D::sub($proceeds, $fee);
            $realized = D::sub($net, $removed);
            $soldAt = $in['sold_at'] ?? Database::now();
            $txId = $this->ledger->post([
                'type' => 'investment_sale',
                'user_id' => $userId,
                'asset_id' => $assetId,
                'quantity' => $qty,
                'unit_price' => $price,
                'amount_usd' => $proceeds,
                'fee_usd' => $fee,
                'realized_pnl_usd' => $realized,
                'effective_at' => $soldAt,
                'notes' => $in['notes'] ?? null,
                'idempotency_key' => $idem,
                'related_type' => 'investment_sale',
                'created_by' => $actorId,
            ], [
                ['account' => 'cash', 'amount' => $net],
                ['account' => 'investment', 'amount' => D::neg($removed), 'asset_id' => $assetId, 'quantity' => D::neg($qty)],
                ['account' => 'pnl', 'amount' => D::neg($realized)],
            ]);
            $saleId = $this->db->insert('investment_sales', [
                'user_id' => $userId, 'asset_id' => $assetId, 'quantity' => $qty, 'unit_price' => $price, 'fee_usd' => $fee,
                'proceeds_usd' => $proceeds, 'cost_basis_removed_usd' => $removed, 'realized_pnl_usd' => $realized,
                'sold_at' => $soldAt, 'transaction_id' => $txId, 'notes' => $in['notes'] ?? null, 'created_by' => $actorId, 'created_at' => Database::now(),
            ]);
            $this->db->update('financial_transactions', ['related_id' => $saleId], 'id = :id', ['id' => $txId]);
            $this->adjustPosition($userId, $assetId, D::neg($qty), D::neg($removed), $realized);
            $this->audit->log($actorId, 'investment.sale_recorded', 'investment_sale', $saleId, ['user_id' => $userId, 'asset_id' => $assetId, 'quantity' => $qty, 'unit_price' => $price, 'realized' => $realized]);
            return ['sale_id' => $saleId, 'transaction_id' => $txId, 'duplicate' => false, 'realized_pnl_usd' => $realized];
        });
        if (!$result['duplicate']) {
            $symbol = (string) $this->db->value('SELECT symbol FROM assets WHERE id = :id', ['id' => $assetId]);
            $type = D::isNegative($result['realized_pnl_usd']) ? 'realized_loss' : 'realized_profit';
            $this->notify->dispatch($userId, $type, [
                'amount' => D::fixed(D::abs($result['realized_pnl_usd']), 2),
                'asset' => $symbol,
                'source' => 'sale',
                'quantity' => $qty,
                'price' => $price,
            ], 'sale:' . $result['sale_id']);
        }
        return $result;
    }

    private function adjustPosition(int $userId, int $assetId, string $dQty, string $dCost, string $dRealized): void
    {
        $this->db->run(
            'INSERT INTO investment_positions (user_id, asset_id, quantity, cost_basis_usd, realized_pnl_usd, updated_at)
             VALUES (:u, :a, 0, 0, 0, :n) ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)',
            ['u' => $userId, 'a' => $assetId, 'n' => Database::now()]
        );
        $pos = $this->db->one('SELECT * FROM investment_positions WHERE user_id = :u AND asset_id = :a FOR UPDATE', ['u' => $userId, 'a' => $assetId]);
        $q = D::add($pos['quantity'], $dQty);
        $c = D::round(D::add($pos['cost_basis_usd'], $dCost), 8);
        if (D::isNegative($q) || D::isNegative($c)) {
            throw HttpException::conflict('This change would make the holding negative.', 'negative_position');
        }
        if (D::isZero($q)) {
            $c = '0'; // fully closed position carries no cost basis
        }
        $this->db->update('investment_positions', [
            'quantity' => $q,
            'cost_basis_usd' => $c,
            'realized_pnl_usd' => D::round(D::add($pos['realized_pnl_usd'], $dRealized), 8),
            'updated_at' => Database::now(),
        ], 'user_id = :u AND asset_id = :a', ['u' => $userId, 'a' => $assetId]);
    }

    /** Most recent completed event for a user/asset: ['kind'=>'entry'|'sale', 'id'=>int] */
    private function latestEvent(int $userId, int $assetId): ?array
    {
        $row = $this->db->one(
            "SELECT kind, id, tx FROM (
                SELECT 'entry' kind, id, transaction_id tx FROM investment_entries WHERE user_id = :u1 AND asset_id = :a1 AND status <> 'reversed'
                UNION ALL
                SELECT 'sale' kind, id, transaction_id tx FROM investment_sales WHERE user_id = :u2 AND asset_id = :a2 AND status = 'completed'
             ) e ORDER BY tx DESC LIMIT 1",
            ['u1' => $userId, 'a1' => $assetId, 'u2' => $userId, 'a2' => $assetId]
        );
        return $row ? ['kind' => $row['kind'], 'id' => (int) $row['id']] : null;
    }

    public function reverseEntry(int $entryId, ?int $actorId, string $reason): int
    {
        return $this->db->transaction(function () use ($entryId, $actorId, $reason) {
            $e = $this->db->one('SELECT * FROM investment_entries WHERE id = :id', ['id' => $entryId]);
            if (!$e) {
                throw HttpException::notFound('Investment entry not found.');
            }
            $this->ledger->lockUser((int) $e['user_id']);
            if ($e['status'] === 'reversed') {
                throw HttpException::conflict('This entry is already reversed.', 'already_reversed');
            }
            $latest = $this->latestEvent((int) $e['user_id'], (int) $e['asset_id']);
            if (!$latest || $latest['kind'] !== 'entry' || $latest['id'] !== $entryId) {
                throw HttpException::conflict('Only the most recent event for this asset can be reversed. Reverse newer sales or entries first.', 'not_latest');
            }
            if ($e['funding'] === 'loan' && $e['loan_id'] && $this->db->value('SELECT status FROM loans WHERE id = :id', ['id' => $e['loan_id']]) !== 'reversed') {
                throw HttpException::conflict('This entry was created by a coin loan. Reverse the loan instead.', 'use_loan');
            }
            $revId = $this->ledger->reverse((int) $e['transaction_id'], $actorId, $reason);
            $this->db->update('investment_entries', ['status' => 'reversed', 'updated_by' => $actorId, 'updated_at' => Database::now()], 'id = :id', ['id' => $entryId]);
            $this->adjustPosition((int) $e['user_id'], (int) $e['asset_id'], D::neg($e['quantity']), D::neg($e['cost_basis_usd']), '0');
            $this->audit->log($actorId, 'investment.entry_reversed', 'investment_entry', $entryId, ['reason' => $reason, 'reversal_tx' => $revId]);
            return $revId;
        });
    }

    /** Used by LoanService when reversing a coin loan credited to holdings. */
    public function reverseEntryForLoan(int $entryId, ?int $actorId, string $reason): void
    {
        $e = $this->db->one('SELECT * FROM investment_entries WHERE id = :id', ['id' => $entryId]);
        $latest = $this->latestEvent((int) $e['user_id'], (int) $e['asset_id']);
        if (!$latest || $latest['kind'] !== 'entry' || $latest['id'] !== $entryId) {
            throw HttpException::conflict('The borrowed coins have later activity (sales or new entries). Reverse those first.', 'not_latest');
        }
        $this->ledger->reverse((int) $e['transaction_id'], $actorId, $reason);
        $this->db->update('investment_entries', ['status' => 'reversed', 'updated_by' => $actorId, 'updated_at' => Database::now()], 'id = :id', ['id' => $entryId]);
        $this->adjustPosition((int) $e['user_id'], (int) $e['asset_id'], D::neg($e['quantity']), D::neg($e['cost_basis_usd']), '0');
    }

    public function reverseSale(int $saleId, ?int $actorId, string $reason): int
    {
        return $this->db->transaction(function () use ($saleId, $actorId, $reason) {
            $s = $this->db->one('SELECT * FROM investment_sales WHERE id = :id', ['id' => $saleId]);
            if (!$s) {
                throw HttpException::notFound('Sale not found.');
            }
            $this->ledger->lockUser((int) $s['user_id']);
            if ($s['status'] === 'reversed') {
                throw HttpException::conflict('This sale is already reversed.', 'already_reversed');
            }
            $latest = $this->latestEvent((int) $s['user_id'], (int) $s['asset_id']);
            if (!$latest || $latest['kind'] !== 'sale' || $latest['id'] !== $saleId) {
                throw HttpException::conflict('Only the most recent event for this asset can be reversed. Reverse newer sales or entries first.', 'not_latest');
            }
            $cash = $this->ledger->balance((int) $s['user_id'], 'cash');
            $net = D::sub($s['proceeds_usd'], $s['fee_usd']);
            if (D::cmp($cash, $net) < 0) {
                throw HttpException::conflict('Reversing this sale would make the cash balance negative.', 'insufficient_balance');
            }
            $revId = $this->ledger->reverse((int) $s['transaction_id'], $actorId, $reason);
            $this->db->update('investment_sales', ['status' => 'reversed'], 'id = :id', ['id' => $saleId]);
            $this->adjustPosition((int) $s['user_id'], (int) $s['asset_id'], $s['quantity'], $s['cost_basis_removed_usd'], D::neg($s['realized_pnl_usd']));
            $this->audit->log($actorId, 'investment.sale_reversed', 'investment_sale', $saleId, ['reason' => $reason, 'reversal_tx' => $revId]);
            return $revId;
        });
    }

    /** Only notes may be edited after recording; financial fields require a reversal. */
    public function updateNotes(int $entryId, ?string $notes, ?int $actorId): void
    {
        $e = $this->db->one('SELECT notes FROM investment_entries WHERE id = :id', ['id' => $entryId]);
        if (!$e) {
            throw HttpException::notFound('Investment entry not found.');
        }
        $notes = $notes !== null ? mb_substr(strip_tags($notes), 0, 1000) : null;
        $this->db->update('investment_entries', ['notes' => $notes, 'updated_by' => $actorId, 'updated_at' => Database::now()], 'id = :id', ['id' => $entryId]);
        $this->audit->log($actorId, 'investment.entry_notes_updated', 'investment_entry', $entryId, ['before' => $e['notes'], 'after' => $notes]);
    }

    /** Archive is allowed only once the holding for that asset is fully closed. */
    public function archive(int $entryId, ?int $actorId): void
    {
        $e = $this->db->one('SELECT * FROM investment_entries WHERE id = :id', ['id' => $entryId]);
        if (!$e) {
            throw HttpException::notFound('Investment entry not found.');
        }
        if ($e['status'] !== 'open') {
            throw HttpException::conflict('Only open entries can be archived.');
        }
        $qty = $this->db->value('SELECT quantity FROM investment_positions WHERE user_id = :u AND asset_id = :a', ['u' => $e['user_id'], 'a' => $e['asset_id']]);
        if ($qty !== null && !D::isZero($qty)) {
            throw HttpException::conflict('Entries can be archived only after the whole holding of this asset has been sold.', 'position_open');
        }
        $this->db->update('investment_entries', ['status' => 'archived', 'updated_by' => $actorId, 'updated_at' => Database::now()], 'id = :id', ['id' => $entryId]);
        $this->audit->log($actorId, 'investment.entry_archived', 'investment_entry', $entryId);
    }

    public function positions(int $userId): array
    {
        return $this->db->all(
            'SELECT p.asset_id, a.symbol, a.name, p.quantity, p.cost_basis_usd, p.realized_pnl_usd, p.updated_at
             FROM investment_positions p JOIN assets a ON a.id = p.asset_id
             WHERE p.user_id = :u AND (p.quantity > 0 OR p.realized_pnl_usd <> 0) ORDER BY a.sort_order',
            ['u' => $userId]
        );
    }

    public function entries(?int $userId, array $f, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $p = [];
        if ($userId !== null) {
            $where[] = 'e.user_id = :u';
            $p['u'] = $userId;
        } elseif (!empty($f['user_id'])) {
            $where[] = 'e.user_id = :u';
            $p['u'] = (int) $f['user_id'];
        }
        if (!empty($f['asset_id'])) {
            $where[] = 'e.asset_id = :a';
            $p['a'] = (int) $f['asset_id'];
        }
        if (!empty($f['status']) && in_array($f['status'], ['open', 'reversed', 'archived'], true)) {
            $where[] = 'e.status = :s';
            $p['s'] = $f['status'];
        }
        $w = implode(' AND ', $where);
        $total = (int) $this->db->value("SELECT COUNT(*) FROM investment_entries e WHERE $w", $p);
        $rows = $this->db->all(
            "SELECT e.*, a.symbol, a.name AS asset_name, u.full_name AS user_name, u.email AS user_email, cb.full_name AS created_by_name
             FROM investment_entries e JOIN assets a ON a.id = e.asset_id JOIN users u ON u.id = e.user_id LEFT JOIN users cb ON cb.id = e.created_by
             WHERE $w ORDER BY e.acquired_at DESC, e.id DESC LIMIT :l OFFSET :o",
            $p + ['l' => $perPage, 'o' => ($page - 1) * $perPage]
        );
        return [$rows, $total];
    }

    public function sales(?int $userId, array $f, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $p = [];
        if ($userId !== null) {
            $where[] = 's.user_id = :u';
            $p['u'] = $userId;
        } elseif (!empty($f['user_id'])) {
            $where[] = 's.user_id = :u';
            $p['u'] = (int) $f['user_id'];
        }
        if (!empty($f['asset_id'])) {
            $where[] = 's.asset_id = :a';
            $p['a'] = (int) $f['asset_id'];
        }
        $w = implode(' AND ', $where);
        $total = (int) $this->db->value("SELECT COUNT(*) FROM investment_sales s WHERE $w", $p);
        $rows = $this->db->all(
            "SELECT s.*, a.symbol, u.full_name AS user_name FROM investment_sales s JOIN assets a ON a.id = s.asset_id JOIN users u ON u.id = s.user_id
             WHERE $w ORDER BY s.sold_at DESC, s.id DESC LIMIT :l OFFSET :o",
            $p + ['l' => $perPage, 'o' => ($page - 1) * $perPage]
        );
        return [$rows, $total];
    }
}
