<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Decimal as D;
use OryzenX\Core\HttpException;
use OryzenX\Core\Security;

/**
 * Trade records (monitoring only — OryzenX does not execute trades).
 *  gross P/L   = (exit − entry) × quantity        for long trades
 *              = (entry − exit) × quantity        for short trades
 *  realized P/L = gross P/L − fee (all fees of the round trip are applied when the trade is closed)
 * Open trades post nothing to the ledger; their unrealized P/L is computed from the live price and shown separately.
 * Closing a trade posts: trading +realized, pnl −realized.
 */
final class TradeService
{
    public function __construct(
        private Database $db,
        private LedgerService $ledger,
        private AuditService $audit,
        private NotificationService $notify,
        private MarketService $market
    ) {
    }

    public static function grossPnl(string $direction, string $qty, string $entry, string $exit): string
    {
        $diff = $direction === 'short' ? D::sub($entry, $exit) : D::sub($exit, $entry);
        return D::round(D::mul($diff, $qty), 8);
    }

    public static function unrealizedPnl(string $direction, string $qty, string $entry, string $current): string
    {
        return self::grossPnl($direction, $qty, $entry, $current);
    }

    /**
     * @param array{asset_id:int, direction:string, trade_type?:string, quantity:string, entry_price:string, exit_price?:?string,
     *              fee_usd?:string, opened_at:string, closed_at?:?string, reference?:?string, notes?:?string, idempotency_key?:?string} $in
     */
    public function record(int $userId, array $in, ?int $actorId): array
    {
        $qty = D::normalize($in['quantity']);
        $entry = D::normalize($in['entry_price']);
        $fee = D::normalize($in['fee_usd'] ?? '0');
        $exit = isset($in['exit_price']) && $in['exit_price'] !== null && $in['exit_price'] !== '' ? D::normalize($in['exit_price']) : null;
        $direction = $in['direction'] ?? 'long';
        if (!in_array($direction, ['long', 'short'], true)) {
            throw HttpException::validation(['direction' => 'Select long or short.']);
        }
        if (D::cmp($qty, '0') <= 0 || D::cmp($entry, '0') <= 0 || D::isNegative($fee) || ($exit !== null && D::cmp($exit, '0') <= 0)) {
            throw HttpException::validation(['quantity' => 'Quantity and prices must be greater than 0; fee cannot be negative.']);
        }
        $openedAt = $in['opened_at'] ?? Database::now();
        $closedAt = $exit !== null ? ($in['closed_at'] ?? Database::now()) : null;
        if ($closedAt !== null && strtotime($closedAt) < strtotime($openedAt)) {
            throw HttpException::validation(['closed_at' => 'Close time cannot be before the open time.']);
        }
        $idem = LedgerService::validateIdempotencyKey($in['idempotency_key'] ?? null);
        $reference = isset($in['reference']) && $in['reference'] !== '' ? mb_substr(trim((string) $in['reference']), 0, 100) : null;

        $result = $this->db->transaction(function () use ($userId, $in, $qty, $entry, $fee, $exit, $direction, $openedAt, $closedAt, $idem, $reference, $actorId) {
            if ($idem && ($dup = $this->db->one('SELECT id FROM trades WHERE uuid = :k', ['k' => $this->uuidFromKey($idem)]))) {
                return ['trade_id' => (int) $dup['id'], 'duplicate' => true];
            }
            $this->ledger->lockUser($userId);
            if ($reference !== null && $this->db->value('SELECT id FROM trades WHERE user_id = :u AND reference = :r', ['u' => $userId, 'r' => $reference])) {
                throw HttpException::conflict('A trade with this reference already exists for this account.', 'duplicate_reference');
            }
            if (!$this->db->value('SELECT id FROM assets WHERE id = :id', ['id' => (int) $in['asset_id']])) {
                throw HttpException::validation(['asset_id' => 'Select a valid asset.']);
            }
            $now = Database::now();
            $tradeId = $this->db->insert('trades', [
                'uuid' => $idem ? $this->uuidFromKey($idem) : Security::uuid(),
                'user_id' => $userId,
                'asset_id' => (int) $in['asset_id'],
                'direction' => $direction,
                'trade_type' => in_array($in['trade_type'] ?? 'spot', ['spot', 'futures', 'margin', 'other'], true) ? ($in['trade_type'] ?? 'spot') : 'spot',
                'quantity' => $qty,
                'entry_price' => $entry,
                'fee_usd' => $fee,
                'opened_at' => $openedAt,
                'status' => 'open',
                'reference' => $reference,
                'notes' => isset($in['notes']) ? mb_substr(strip_tags((string) $in['notes']), 0, 1000) : null,
                'created_by' => $actorId,
                'updated_by' => $actorId,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $this->audit->log($actorId, 'trade.recorded', 'trade', $tradeId, ['user_id' => $userId, 'qty' => $qty, 'entry' => $entry, 'exit' => $exit, 'fee' => $fee]);
            if ($exit !== null) {
                $this->closeInternal($tradeId, $exit, $closedAt, '0', $actorId, $idem ? $idem . '-close' : null);
            }
            return ['trade_id' => $tradeId, 'duplicate' => false];
        });
        if (!$result['duplicate']) {
            $this->notifyTrade($result['trade_id']);
        }
        return $result;
    }

    private function uuidFromKey(string $key): string
    {
        $h = hash('sha256', 'trade:' . $key);
        return sprintf('%s-%s-4%s-a%s-%s', substr($h, 0, 8), substr($h, 8, 4), substr($h, 13, 3), substr($h, 17, 3), substr($h, 20, 12));
    }

    public function close(int $tradeId, string $exitPrice, ?string $closedAt, string $extraFee, ?int $actorId, ?string $idem = null): array
    {
        $exitPrice = D::normalize($exitPrice);
        if (D::cmp($exitPrice, '0') <= 0 || D::isNegative($extraFee)) {
            throw HttpException::validation(['exit_price' => 'Exit price must be greater than 0.']);
        }
        $idem = LedgerService::validateIdempotencyKey($idem);
        $r = $this->db->transaction(function () use ($tradeId, $exitPrice, $closedAt, $extraFee, $actorId, $idem) {
            $t = $this->db->one('SELECT user_id FROM trades WHERE id = :id', ['id' => $tradeId]);
            if (!$t) {
                throw HttpException::notFound('Trade not found.');
            }
            $this->ledger->lockUser((int) $t['user_id']);
            return $this->closeInternal($tradeId, $exitPrice, $closedAt ?? Database::now(), $extraFee, $actorId, $idem);
        });
        if (!$r['duplicate']) {
            $this->notifyTrade($tradeId);
        }
        return $r;
    }

    private function closeInternal(int $tradeId, string $exit, string $closedAt, string $extraFee, ?int $actorId, ?string $idem): array
    {
        if ($dup = $this->ledger->findByIdempotencyKey($idem)) {
            return ['trade_id' => $tradeId, 'transaction_id' => (int) $dup['id'], 'duplicate' => true];
        }
        $t = $this->db->one('SELECT * FROM trades WHERE id = :id FOR UPDATE', ['id' => $tradeId]);
        if ($t['status'] !== 'open') {
            throw HttpException::conflict('Only open trades can be closed.', 'not_open');
        }
        if (strtotime($closedAt) < strtotime($t['opened_at'])) {
            throw HttpException::validation(['closed_at' => 'Close time cannot be before the open time.']);
        }
        $fee = D::add($t['fee_usd'], D::normalize($extraFee));
        $gross = self::grossPnl($t['direction'], $t['quantity'], $t['entry_price'], $exit);
        $realized = D::sub($gross, $fee);
        $txId = $this->ledger->post([
            'type' => 'trade_close',
            'user_id' => (int) $t['user_id'],
            'asset_id' => (int) $t['asset_id'],
            'quantity' => $t['quantity'],
            'unit_price' => $exit,
            'amount_usd' => D::round(D::mul($t['quantity'], $exit), 8),
            'fee_usd' => $fee,
            'realized_pnl_usd' => $realized,
            'effective_at' => $closedAt,
            'reference' => $t['reference'],
            'idempotency_key' => $idem,
            'related_type' => 'trade',
            'related_id' => $tradeId,
            'created_by' => $actorId,
        ], [
            ['account' => 'trading', 'amount' => $realized],
            ['account' => 'pnl', 'amount' => D::neg($realized)],
        ]);
        $this->db->update('trades', [
            'exit_price' => $exit, 'closed_at' => $closedAt, 'status' => 'closed', 'fee_usd' => $fee,
            'gross_pnl_usd' => $gross, 'realized_pnl_usd' => $realized, 'close_transaction_id' => $txId,
            'updated_by' => $actorId, 'updated_at' => Database::now(),
        ], 'id = :id', ['id' => $tradeId]);
        $this->audit->log($actorId, 'trade.closed', 'trade', $tradeId, ['exit' => $exit, 'realized' => $realized]);
        return ['trade_id' => $tradeId, 'transaction_id' => $txId, 'duplicate' => false, 'realized_pnl_usd' => $realized];
    }

    public function reverse(int $tradeId, ?int $actorId, string $reason): void
    {
        $this->db->transaction(function () use ($tradeId, $actorId, $reason) {
            $t = $this->db->one('SELECT * FROM trades WHERE id = :id', ['id' => $tradeId]);
            if (!$t) {
                throw HttpException::notFound('Trade not found.');
            }
            $this->ledger->lockUser((int) $t['user_id']);
            if ($t['status'] === 'reversed') {
                throw HttpException::conflict('This trade is already reversed.', 'already_reversed');
            }
            if ($t['status'] === 'closed' && $t['close_transaction_id']) {
                // reversing a profit removes it from the trading balance: it must not go negative
                if (D::cmp($t['realized_pnl_usd'], '0') > 0) {
                    $bal = $this->ledger->balance((int) $t['user_id'], 'trading');
                    if (D::cmp($bal, $t['realized_pnl_usd']) < 0) {
                        throw HttpException::conflict('Reversing this trade would make the trading balance negative.', 'insufficient_balance');
                    }
                }
                $this->ledger->reverse((int) $t['close_transaction_id'], $actorId, $reason);
            }
            $this->db->update('trades', ['status' => 'reversed', 'updated_by' => $actorId, 'updated_at' => Database::now()], 'id = :id', ['id' => $tradeId]);
            $this->audit->log($actorId, 'trade.reversed', 'trade', $tradeId, ['reason' => $reason, 'previous_status' => $t['status']]);
        });
    }

    public function updateNotes(int $tradeId, ?string $notes, ?int $actorId): void
    {
        $t = $this->db->one('SELECT notes FROM trades WHERE id = :id', ['id' => $tradeId]);
        if (!$t) {
            throw HttpException::notFound('Trade not found.');
        }
        $notes = $notes !== null ? mb_substr(strip_tags($notes), 0, 1000) : null;
        $this->db->update('trades', ['notes' => $notes, 'updated_by' => $actorId, 'updated_at' => Database::now()], 'id = :id', ['id' => $tradeId]);
        $this->audit->log($actorId, 'trade.notes_updated', 'trade', $tradeId, ['before' => $t['notes'], 'after' => $notes]);
    }

    private function notifyTrade(int $tradeId): void
    {
        $t = $this->db->one('SELECT t.*, a.symbol FROM trades t JOIN assets a ON a.id = t.asset_id WHERE t.id = :id', ['id' => $tradeId]);
        if (!$t) {
            return;
        }
        if ($t['status'] === 'closed') {
            $type = D::isNegative($t['realized_pnl_usd']) ? 'realized_loss' : 'realized_profit';
            $this->notify->dispatch((int) $t['user_id'], $type, [
                'amount' => D::fixed(D::abs($t['realized_pnl_usd']), 2), 'asset' => $t['symbol'], 'source' => 'trade', 'trade_id' => $tradeId,
                'quantity' => D::normalize($t['quantity']), 'price' => D::normalize($t['exit_price']),
            ], 'trade_close:' . $tradeId);
        } else {
            $this->notify->dispatch((int) $t['user_id'], 'trade_recorded', [
                'asset' => $t['symbol'], 'direction' => $t['direction'], 'quantity' => D::normalize($t['quantity']),
                'price' => D::normalize($t['entry_price']), 'trade_id' => $tradeId,
            ], 'trade_open:' . $tradeId);
        }
    }

    public function list(?int $userId, array $f, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $p = [];
        if ($userId !== null) {
            $where[] = 't.user_id = :u';
            $p['u'] = $userId;
        } elseif (!empty($f['user_id'])) {
            $where[] = 't.user_id = :u';
            $p['u'] = (int) $f['user_id'];
        }
        if (!empty($f['status']) && in_array($f['status'], ['open', 'closed', 'reversed'], true)) {
            $where[] = 't.status = :s';
            $p['s'] = $f['status'];
        }
        if (!empty($f['asset_id'])) {
            $where[] = 't.asset_id = :a';
            $p['a'] = (int) $f['asset_id'];
        }
        if (!empty($f['from']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $f['from'])) {
            $where[] = 't.opened_at >= :from';
            $p['from'] = $f['from'] . ' 00:00:00';
        }
        if (!empty($f['to']) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $f['to'])) {
            $where[] = 't.opened_at <= :to';
            $p['to'] = $f['to'] . ' 23:59:59';
        }
        if (!empty($f['q'])) {
            $where[] = '(t.reference LIKE :q1 OR t.notes LIKE :q2)';
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], (string) $f['q']) . '%';
            $p += ['q1' => $like, 'q2' => $like];
        }
        $w = implode(' AND ', $where);
        $total = (int) $this->db->value("SELECT COUNT(*) FROM trades t WHERE $w", $p);
        $rows = $this->db->all(
            "SELECT t.*, a.symbol, a.name AS asset_name, a.price_decimals, u.full_name AS user_name
             FROM trades t JOIN assets a ON a.id = t.asset_id JOIN users u ON u.id = t.user_id
             WHERE $w ORDER BY COALESCE(t.closed_at, t.opened_at) DESC, t.id DESC LIMIT :l OFFSET :o",
            $p + ['l' => $perPage, 'o' => ($page - 1) * $perPage]
        );
        $prices = $this->market->latest();
        foreach ($rows as &$r) {
            $r['unrealized_pnl_usd'] = null;
            $r['current_price'] = $prices[(int) $r['asset_id']]['price'] ?? null;
            if ($r['status'] === 'open' && $r['current_price'] !== null) {
                $r['unrealized_pnl_usd'] = self::unrealizedPnl($r['direction'], $r['quantity'], $r['entry_price'], $r['current_price']);
                $r['price_stale'] = $prices[(int) $r['asset_id']]['stale'];
            }
            if ($userId !== null) {
                unset($r['created_by'], $r['updated_by'], $r['user_name']);
            }
        }
        return [$rows, $total];
    }

    /**
     * Trading monitor statistics. Periods are calendar-based in the business timezone:
     * today = since local midnight; yesterday = previous local day; 7D/30D/1Y = rolling windows ending now.
     * Values are net realized trading P/L (closed trades, after fees), reversals included.
     */
    public function monitor(int $userId, \DateTimeZone $tz): array
    {
        $now = new \DateTimeImmutable('now', $tz);
        $todayStart = $now->setTime(0, 0);
        $utc = fn (\DateTimeImmutable $d) => $d->setTimezone(new \DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        $nowUtc = $utc($now->modify('+1 second'));
        $types = ['trade_close'];
        $periods = [
            'today' => $this->ledger->realizedPnl($userId, $utc($todayStart), $nowUtc, $types),
            'yesterday' => $this->ledger->realizedPnl($userId, $utc($todayStart->modify('-1 day')), $utc($todayStart), $types),
            'last_7_days' => $this->ledger->realizedPnl($userId, $utc($now->modify('-7 days')), $nowUtc, $types),
            'last_30_days' => $this->ledger->realizedPnl($userId, $utc($now->modify('-30 days')), $nowUtc, $types),
            'last_1_year' => $this->ledger->realizedPnl($userId, $utc($now->modify('-1 year')), $nowUtc, $types),
            'all_time' => $this->ledger->realizedPnl($userId, null, null, $types),
        ];
        $fees = (string) $this->db->value('SELECT COALESCE(SUM(fee_usd),0) FROM trades WHERE user_id = :u AND status = "closed"', ['u' => $userId]);
        $losses = (string) $this->db->value('SELECT COALESCE(SUM(realized_pnl_usd),0) FROM trades WHERE user_id = :u AND status = "closed" AND realized_pnl_usd < 0', ['u' => $userId]);
        $wins = (int) $this->db->value('SELECT COUNT(*) FROM trades WHERE user_id = :u AND status = "closed" AND realized_pnl_usd > 0', ['u' => $userId]);
        $closed = (int) $this->db->value('SELECT COUNT(*) FROM trades WHERE user_id = :u AND status = "closed"', ['u' => $userId]);
        [$open] = $this->list($userId, ['status' => 'open'], 1, 100);
        $unrealized = '0';
        $unknown = 0;
        foreach ($open as $o) {
            if ($o['unrealized_pnl_usd'] === null) {
                $unknown++;
            } else {
                $unrealized = D::add($unrealized, $o['unrealized_pnl_usd']);
            }
        }
        return [
            'timezone' => $tz->getName(),
            'periods' => $periods,
            'fees_total_usd' => D::normalize($fees),
            'realized_losses_usd' => D::abs($losses),
            'closed_trades' => $closed,
            'winning_trades' => $wins,
            'open_trades' => count($open),
            'unrealized_pnl_usd' => $unrealized,
            'unrealized_unpriced_trades' => $unknown,
            'trading_balance_usd' => $this->ledger->balance($userId, 'trading'),
            'definitions' => [
                'periods' => 'Net realized P/L of trades closed in the period (exit vs entry × quantity, minus fees). Reversed trades are excluded.',
                'unrealized' => 'Open trades valued at the latest market price. Not included in any realized figure.',
            ],
        ];
    }
}
