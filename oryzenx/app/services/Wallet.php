<?php
/** User wallet (balance in USD) with a ledger of every change. */
final class Wallet
{
    public static function toUsd(float $amount, string $currency): float
    {
        if ($currency === 'USD') return $amount;
        $rate = (float)setting('usd_to_bdt');
        return $rate > 0 ? round($amount / $rate, 2) : $amount;
    }

    /** Adds a ledger row. Balance changes must be done by the caller inside the same transaction. */
    public static function log(int $userId, string $type, float $amount, array $extra = [], string $status = 'approved'): int
    {
        return DB::insert('wallet_transactions', ['user_id' => $userId, 'type' => $type, 'amount' => round($amount, 2), 'status' => $status] + $extra);
    }

    public static function balance(int $userId): float
    {
        return (float)DB::val('SELECT balance FROM users WHERE id = ?', [$userId]);
    }

    /** Atomically debits the balance if enough funds; returns false otherwise. */
    public static function debit(int $userId, float $usd): bool
    {
        return DB::q('UPDATE users SET balance = balance - ? WHERE id = ? AND balance >= ?', [round($usd, 2), $userId, round($usd, 2)])->rowCount() === 1;
    }

    public static function credit(int $userId, float $usd): void
    {
        DB::q('UPDATE users SET balance = balance + ? WHERE id = ?', [round($usd, 2), $userId]);
    }
}
