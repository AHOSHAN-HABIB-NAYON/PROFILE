<?php
/**
 * Wallet ledger. All balance changes go through here inside DB transactions
 * with row locks, so balances can never go negative or double-spend.
 */
declare(strict_types=1);

final class Wallet
{
    public static function forUser(int $userId): array
    {
        $w = db()->row('SELECT * FROM wallets WHERE user_id = ?', [$userId]);
        if (!$w) {
            db()->insert('wallets', ['user_id' => $userId]);
            $w = db()->row('SELECT * FROM wallets WHERE user_id = ?', [$userId]);
        }
        return $w;
    }

    public static function newUid(): string
    {
        return 'TX' . date('ymd') . random_code(8, '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ');
    }

    public static function fee(float $amount, float $percent, float $fixed): float
    {
        return round($amount * $percent / 100 + $fixed, 2);
    }

    private static function lock(DB $db, int $userId): array
    {
        $w = $db->row('SELECT * FROM wallets WHERE user_id = ? FOR UPDATE', [$userId]);
        if (!$w) {
            throw new DomainException('ওয়ালেট পাওয়া যায়নি।');
        }
        if ($w['status'] !== 'active') {
            throw new DomainException('আপনার ওয়ালেট সাময়িকভাবে বন্ধ আছে। সাপোর্টে যোগাযোগ করুন।');
        }
        return $w;
    }

    /** Create a pending credit (deposit) that is settled later. */
    public static function createPendingDeposit(int $userId, float $amount, string $method, ?string $reference, string $description, array $meta = []): array
    {
        return db()->tx(static function (DB $db) use ($userId, $amount, $method, $reference, $description, $meta) {
            $w = self::forUser($userId);
            $uid = self::newUid();
            $id = $db->insert('transactions', [
                'uid' => $uid, 'user_id' => $userId, 'wallet_id' => $w['id'], 'type' => 'deposit', 'direction' => 'credit',
                'amount' => $amount, 'fee' => 0, 'net_amount' => $amount, 'method' => $method, 'status' => 'pending',
                'reference' => $reference, 'description' => $description, 'meta' => $meta ? json_encode($meta, JSON_UNESCAPED_UNICODE) : null,
            ]);
            return $db->row('SELECT * FROM transactions WHERE id = ?', [$id]);
        });
    }

    /** Settle a pending deposit as success (credits balance) — idempotent. */
    public static function completeDeposit(int $txId, ?string $note = null): bool
    {
        $done = db()->tx(static function (DB $db) use ($txId, $note) {
            $tx = $db->row('SELECT * FROM transactions WHERE id = ? FOR UPDATE', [$txId]);
            if (!$tx || $tx['type'] !== 'deposit' || $tx['status'] !== 'pending') {
                return null;
            }
            $w = $db->row('SELECT * FROM wallets WHERE id = ? FOR UPDATE', [$tx['wallet_id']]);
            $balance = round((float) $w['balance'] + (float) $tx['net_amount'], 2);
            $db->q('UPDATE wallets SET balance = ? WHERE id = ?', [$balance, $w['id']]);
            $db->q("UPDATE transactions SET status = 'success', balance_after = ?, admin_note = COALESCE(?, admin_note) WHERE id = ?", [$balance, $note, $txId]);
            return $tx;
        });
        if ($done) {
            Notify::user((int) $done['user_id'], 'payment', 'জমা সফল হয়েছে ✓', money($done['net_amount']) . ' আপনার ওয়ালেটে যোগ হয়েছে।', '/transaction/' . $done['uid'], [
                'email' => ['payment_success', ['amount' => money($done['net_amount']) . ' ' . currency(), 'method' => $done['method'], 'uid' => $done['uid']]],
            ]);
        }
        return (bool) $done;
    }

    /** Mark a pending transaction failed/expired/cancelled. Refunds held withdrawals. */
    public static function failPending(int $txId, string $status = 'failed', ?string $reason = null): bool
    {
        $status = in_array($status, ['failed', 'expired', 'cancelled'], true) ? $status : 'failed';
        $done = db()->tx(static function (DB $db) use ($txId, $status, $reason) {
            $tx = $db->row('SELECT * FROM transactions WHERE id = ? FOR UPDATE', [$txId]);
            if (!$tx || $tx['status'] !== 'pending') {
                return null;
            }
            $balance = null;
            if ($tx['type'] === 'withdraw') {
                $w = $db->row('SELECT * FROM wallets WHERE id = ? FOR UPDATE', [$tx['wallet_id']]);
                $balance = round((float) $w['balance'] + (float) $tx['amount'], 2);
                $db->q('UPDATE wallets SET balance = ?, locked_balance = GREATEST(0, locked_balance - ?) WHERE id = ?', [$balance, $tx['amount'], $w['id']]);
            }
            $db->q('UPDATE transactions SET status = ?, balance_after = COALESCE(?, balance_after), admin_note = COALESCE(?, admin_note) WHERE id = ?', [$status, $balance, $reason, $txId]);
            return $tx;
        });
        if ($done && $status !== 'expired') {
            Notify::user((int) $done['user_id'], 'payment', tx_type_label($done['type']) . ' সম্পন্ন হয়নি', ($reason ?: 'লেনদেনটি বাতিল/ব্যর্থ হয়েছে।') . ($done['type'] === 'withdraw' ? ' টাকা ওয়ালেটে ফেরত দেওয়া হয়েছে।' : ''), '/transaction/' . $done['uid'], [
                'email' => ['payment_failed', ['amount' => money($done['amount']) . ' ' . currency(), 'uid' => $done['uid'], 'reason' => $reason ?: '']],
            ]);
        }
        return (bool) $done;
    }

    /** Withdraw request: amount+fee is deducted immediately and held until admin approval. */
    public static function requestWithdraw(int $userId, float $amount, array $method, string $accountRef): array
    {
        $fee = self::fee($amount, (float) $method['fee_percent'], (float) $method['fee_fixed']);
        $tx = db()->tx(static function (DB $db) use ($userId, $amount, $fee, $method, $accountRef) {
            $w = self::lock($db, $userId);
            $total = round($amount + $fee, 2);
            if ((float) $w['balance'] < $total) {
                throw new DomainException('পর্যাপ্ত ব্যালেন্স নেই। প্রয়োজন ' . money($total) . ' (ফি সহ)।');
            }
            $balance = round((float) $w['balance'] - $total, 2);
            $db->q('UPDATE wallets SET balance = ?, locked_balance = locked_balance + ? WHERE id = ?', [$balance, $total, $w['id']]);
            $uid = self::newUid();
            $id = $db->insert('transactions', [
                'uid' => $uid, 'user_id' => $userId, 'wallet_id' => $w['id'], 'type' => 'withdraw', 'direction' => 'debit',
                'amount' => $total, 'fee' => $fee, 'net_amount' => $amount, 'balance_after' => $balance, 'method' => $method['code'],
                'status' => 'pending', 'account_ref' => $accountRef, 'description' => $method['name'] . '-এ উত্তোলন',
            ]);
            return $db->row('SELECT * FROM transactions WHERE id = ?', [$id]);
        });
        Notify::user($userId, 'payment', 'উত্তোলনের অনুরোধ গ্রহণ করা হয়েছে', money($amount) . ' উত্তোলনের অনুরোধ পর্যালোচনায় আছে।', '/transaction/' . $tx['uid'], ['push' => false]);
        return $tx;
    }

    public static function completeWithdraw(int $txId, ?string $reference, ?string $note): bool
    {
        $done = db()->tx(static function (DB $db) use ($txId, $reference, $note) {
            $tx = $db->row('SELECT * FROM transactions WHERE id = ? FOR UPDATE', [$txId]);
            if (!$tx || $tx['type'] !== 'withdraw' || $tx['status'] !== 'pending') {
                return null;
            }
            $db->q('UPDATE wallets SET locked_balance = GREATEST(0, locked_balance - ?) WHERE id = ?', [$tx['amount'], $tx['wallet_id']]);
            $db->q("UPDATE transactions SET status = 'success', reference = COALESCE(?, reference), admin_note = COALESCE(?, admin_note) WHERE id = ?", [$reference ?: null, $note, $txId]);
            return $tx;
        });
        if ($done) {
            Notify::user((int) $done['user_id'], 'payment', 'উত্তোলন সফল হয়েছে ✓', money($done['net_amount']) . ' আপনার অ্যাকাউন্টে পাঠানো হয়েছে।', '/transaction/' . $done['uid'], [
                'email' => ['payment_success', ['amount' => money($done['net_amount']) . ' ' . currency(), 'method' => $done['method'], 'uid' => $done['uid']]],
            ]);
        }
        return (bool) $done;
    }

    /** Instant P2P transfer. Locks both wallets in id order to avoid deadlocks. */
    public static function transfer(int $fromUserId, int $toUserId, float $amount, string $note, string $method = 'wallet'): array
    {
        if ($fromUserId === $toUserId) {
            throw new DomainException('নিজের অ্যাকাউন্টে ট্রান্সফার করা যাবে না।');
        }
        $fee = self::fee($amount, (float) setting('transfer_fee_percent', '0'), (float) setting('transfer_fee_fixed', '0'));
        $result = db()->tx(static function (DB $db) use ($fromUserId, $toUserId, $amount, $fee, $note, $method) {
            $ids = [$fromUserId, $toUserId];
            sort($ids);
            $locked = [];
            foreach ($ids as $id) {
                $locked[$id] = self::lock($db, $id);
            }
            $from = $locked[$fromUserId];
            $to = $locked[$toUserId];
            $total = round($amount + $fee, 2);
            if ((float) $from['balance'] < $total) {
                throw new DomainException('পর্যাপ্ত ব্যালেন্স নেই। প্রয়োজন ' . money($total) . ' (ফি সহ)।');
            }
            $fromBal = round((float) $from['balance'] - $total, 2);
            $toBal = round((float) $to['balance'] + $amount, 2);
            $db->q('UPDATE wallets SET balance = ? WHERE id = ?', [$fromBal, $from['id']]);
            $db->q('UPDATE wallets SET balance = ? WHERE id = ?', [$toBal, $to['id']]);
            $ref = 'TR' . random_code(10, '0123456789');
            $receiver = $db->row('SELECT name, uid FROM users WHERE id = ?', [$toUserId]);
            $sender = $db->row('SELECT name, uid FROM users WHERE id = ?', [$fromUserId]);
            $outUid = self::newUid();
            $db->insert('transactions', [
                'uid' => $outUid, 'user_id' => $fromUserId, 'wallet_id' => $from['id'], 'type' => 'transfer', 'direction' => 'debit',
                'amount' => $total, 'fee' => $fee, 'net_amount' => $amount, 'balance_after' => $fromBal, 'method' => $method, 'status' => 'success',
                'reference' => $ref, 'counterparty_user_id' => $toUserId, 'description' => mb_substr('পাঠানো হয়েছে: ' . $receiver['name'] . ($note !== '' ? ' — ' . $note : ''), 0, 255),
            ]);
            $inUid = self::newUid();
            $db->insert('transactions', [
                'uid' => $inUid, 'user_id' => $toUserId, 'wallet_id' => $to['id'], 'type' => 'transfer', 'direction' => 'credit',
                'amount' => $amount, 'fee' => 0, 'net_amount' => $amount, 'balance_after' => $toBal, 'method' => $method, 'status' => 'success',
                'reference' => $ref, 'counterparty_user_id' => $fromUserId, 'description' => mb_substr('গ্রহণ করা হয়েছে: ' . $sender['name'] . ($note !== '' ? ' — ' . $note : ''), 0, 255),
            ]);
            return ['out' => $outUid, 'in' => $inUid, 'receiver' => $receiver, 'sender' => $sender, 'fee' => $fee];
        });
        Notify::user($toUserId, 'payment', 'টাকা গ্রহণ করেছেন 💰', $result['sender']['name'] . ' আপনাকে ' . money($amount) . ' পাঠিয়েছেন।', '/transaction/' . $result['in']);
        Notify::user($fromUserId, 'payment', 'ট্রান্সফার সফল ✓', $result['receiver']['name'] . '-কে ' . money($amount) . ' পাঠানো হয়েছে।', '/transaction/' . $result['out'], ['push' => false]);
        return $result;
    }

    /** Pay for a service from the wallet balance. */
    public static function payService(int $userId, array $service, string $note): array
    {
        $amount = round((float) $service['price'], 2);
        $tx = db()->tx(static function (DB $db) use ($userId, $service, $amount, $note) {
            $w = self::lock($db, $userId);
            if ((float) $w['balance'] < $amount) {
                throw new DomainException('পর্যাপ্ত ব্যালেন্স নেই। প্রয়োজন ' . money($amount) . '।');
            }
            $balance = round((float) $w['balance'] - $amount, 2);
            $db->q('UPDATE wallets SET balance = ? WHERE id = ?', [$balance, $w['id']]);
            $uid = self::newUid();
            $id = $db->insert('transactions', [
                'uid' => $uid, 'user_id' => $userId, 'wallet_id' => $w['id'], 'type' => 'payment', 'direction' => 'debit',
                'amount' => $amount, 'fee' => 0, 'net_amount' => $amount, 'balance_after' => $balance, 'method' => 'wallet', 'status' => 'success',
                'reference' => 'SRV-' . $service['id'], 'description' => mb_substr($service['title'] . ' সার্ভিস পেমেন্ট', 0, 255),
                'meta' => json_encode(['service_id' => $service['id'], 'note' => $note], JSON_UNESCAPED_UNICODE),
            ]);
            return $db->row('SELECT * FROM transactions WHERE id = ?', [$id]);
        });
        Notify::user($userId, 'payment', 'পেমেন্ট সফল ✓', $service['title'] . ' — ' . money($amount) . ' পরিশোধ করা হয়েছে। আমাদের টিম শীঘ্রই যোগাযোগ করবে।', '/transaction/' . $tx['uid'], [
            'email' => ['payment_success', ['amount' => money($amount) . ' ' . currency(), 'method' => 'Wallet', 'uid' => $tx['uid']]],
        ]);
        return $tx;
    }

    /** Admin manual balance adjustment (credit or debit). */
    public static function adjust(int $userId, float $amount, string $direction, string $note): array
    {
        return db()->tx(static function (DB $db) use ($userId, $amount, $direction, $note) {
            $w = $db->row('SELECT * FROM wallets WHERE user_id = ? FOR UPDATE', [$userId]);
            $balance = $direction === 'credit' ? (float) $w['balance'] + $amount : (float) $w['balance'] - $amount;
            if ($balance < 0) {
                throw new DomainException('ব্যালেন্স ঋণাত্মক হতে পারে না।');
            }
            $balance = round($balance, 2);
            $db->q('UPDATE wallets SET balance = ? WHERE id = ?', [$balance, $w['id']]);
            $uid = self::newUid();
            $db->insert('transactions', [
                'uid' => $uid, 'user_id' => $userId, 'wallet_id' => $w['id'], 'type' => $direction === 'credit' ? 'deposit' : 'withdraw',
                'direction' => $direction, 'amount' => $amount, 'fee' => 0, 'net_amount' => $amount, 'balance_after' => $balance,
                'method' => 'admin', 'status' => 'success', 'description' => mb_substr($note ?: 'অ্যাডমিন সমন্বয়', 0, 255),
            ]);
            return ['uid' => $uid, 'balance' => $balance];
        });
    }
}
