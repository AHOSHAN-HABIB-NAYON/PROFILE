<?php
declare(strict_types=1);

/**
 * Balance changes. Every change runs in one database transaction that locks
 * the affected user rows, writes a ledger entry, and records the request's
 * idempotency key so a retried request returns the first result instead of
 * moving money twice.
 *
 * This is a demo wallet: "deposit" and "withdraw" only change numbers here.
 * A real service would confirm them with a payment provider first.
 */
final class Wallet
{
    public const METHODS = ['bkash', 'nagad', 'rocket', 'card', 'bank'];

    public static function summary(int $userId): array
    {
        $row = Db::one('SELECT balance_paisa FROM users WHERE id = ?', [$userId]);
        $month = Db::one(
            "SELECT
                COALESCE(SUM(CASE WHEN type IN ('deposit', 'transfer_in') THEN amount_paisa END), 0) AS money_in,
                COALESCE(SUM(CASE WHEN type IN ('withdraw', 'transfer_out') THEN amount_paisa END), 0) AS money_out
             FROM transactions
             WHERE user_id = ? AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')",
            [$userId]
        );
        return [
            'balance' => self::taka((int) $row['balance_paisa']),
            'balance_paisa' => (int) $row['balance_paisa'],
            'month_in' => self::taka((int) $month['money_in']),
            'month_out' => self::taka((int) $month['money_out']),
            'limits' => config('limits'),
        ];
    }

    public static function deposit(int $userId, string $amount, string $method, string $idemKey): array
    {
        $paisa = self::parseAmount($amount, 'deposit_min', 'deposit_max');
        if (!in_array($method, self::METHODS, true)) {
            throw new ApiError(422, 'invalid_method', 'টাকা যোগ করার মাধ্যম বেছে নিন।');
        }
        return self::once($userId, $idemKey, function () use ($userId, $paisa, $method) {
            $balance = self::lockBalance($userId) + $paisa;
            Db::run('UPDATE users SET balance_paisa = ? WHERE id = ?', [$balance, $userId]);
            $tx = self::record($userId, 'deposit', $paisa, $balance, null, $method, null, self::reference());
            return ['transaction' => $tx, 'balance' => self::taka($balance)];
        });
    }

    public static function withdraw(int $userId, string $amount, string $method, string $idemKey): array
    {
        $paisa = self::parseAmount($amount, 'withdraw_min', null);
        if (!in_array($method, self::METHODS, true)) {
            throw new ApiError(422, 'invalid_method', 'টাকা তোলার মাধ্যম বেছে নিন।');
        }
        return self::once($userId, $idemKey, function () use ($userId, $paisa, $method) {
            $balance = self::lockBalance($userId);
            if ($balance < $paisa) {
                throw self::insufficient();
            }
            $balance -= $paisa;
            Db::run('UPDATE users SET balance_paisa = ? WHERE id = ?', [$balance, $userId]);
            $tx = self::record($userId, 'withdraw', $paisa, $balance, null, $method, null, self::reference());
            return ['transaction' => $tx, 'balance' => self::taka($balance)];
        });
    }

    public static function transfer(int $userId, string $toEmail, string $amount, string $note, string $idemKey): array
    {
        $paisa = self::parseAmount($amount, 'transfer_min', 'transfer_max');
        $recipient = Db::one('SELECT id FROM users WHERE email = ?', [Auth::normalizeEmail($toEmail)]);
        if ($recipient === null) {
            throw new ApiError(404, 'recipient_not_found', 'এই ইমেইলে কোনো অ্যাকাউন্ট নেই।');
        }
        $toId = (int) $recipient['id'];
        if ($toId === $userId) {
            throw new ApiError(422, 'self_transfer', 'নিজের অ্যাকাউন্টে টাকা পাঠানো যাবে না।');
        }
        $note = mb_substr($note, 0, 120);

        return self::once($userId, $idemKey, function () use ($userId, $toId, $paisa, $note) {
            // Lock both rows in id order so two opposite transfers cannot deadlock.
            $balances = [];
            foreach ([min($userId, $toId), max($userId, $toId)] as $id) {
                $balances[$id] = self::lockBalance($id);
            }
            if ($balances[$userId] < $paisa) {
                throw self::insufficient();
            }
            $fromBalance = $balances[$userId] - $paisa;
            $toBalance = $balances[$toId] + $paisa;
            Db::run('UPDATE users SET balance_paisa = ? WHERE id = ?', [$fromBalance, $userId]);
            Db::run('UPDATE users SET balance_paisa = ? WHERE id = ?', [$toBalance, $toId]);

            $reference = self::reference();
            $tx = self::record($userId, 'transfer_out', $paisa, $fromBalance, $toId, null, $note, $reference);
            self::record($toId, 'transfer_in', $paisa, $toBalance, $userId, null, $note, $reference);
            return ['transaction' => $tx, 'balance' => self::taka($fromBalance)];
        });
    }

    public static function transactions(int $userId, int $beforeId, int $limit = 20): array
    {
        $rows = Db::all(
            'SELECT t.*, c.name AS counterparty_name, c.email AS counterparty_email
             FROM transactions t
             LEFT JOIN users c ON c.id = t.counterparty_user_id
             WHERE t.user_id = ? AND (? = 0 OR t.id < ?)
             ORDER BY t.id DESC
             LIMIT ' . ($limit + 1),
            [$userId, $beforeId, $beforeId]
        );
        $hasMore = count($rows) > $limit;
        $rows = array_slice($rows, 0, $limit);
        return [
            'transactions' => array_map([self::class, 'present'], $rows),
            'next_before' => $hasMore ? (int) end($rows)['id'] : null,
        ];
    }

    /** Name lookup before sending money, so the sender can confirm the recipient. */
    public static function lookup(int $userId, string $email): array
    {
        $user = Db::one('SELECT id, name, email FROM users WHERE email = ?', [Auth::normalizeEmail($email)]);
        if ($user === null) {
            throw new ApiError(404, 'recipient_not_found', 'এই ইমেইলে কোনো অ্যাকাউন্ট নেই।');
        }
        if ((int) $user['id'] === $userId) {
            throw new ApiError(422, 'self_transfer', 'নিজের অ্যাকাউন্টে টাকা পাঠানো যাবে না।');
        }
        return ['name' => $user['name'], 'email' => $user['email']];
    }

    // ------------------------------------------------------------ internals

    /** Runs a money change at most once per idempotency key. */
    private static function once(int $userId, string $idemKey, callable $work): array
    {
        if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $idemKey)) {
            throw new ApiError(422, 'invalid_idempotency_key', 'অনুরোধের আইডি সঠিক নয়।');
        }
        return Db::transaction(function () use ($userId, $idemKey, $work) {
            // Locking the user row first serialises concurrent requests with the same key.
            self::lockBalance($userId);
            $previous = Db::one('SELECT response_json FROM idempotency_keys WHERE user_id = ? AND idem_key = ?',
                [$userId, $idemKey]);
            if ($previous !== null) {
                return json_decode($previous['response_json'], true) + ['replayed' => true];
            }
            $result = $work();
            Db::run('INSERT INTO idempotency_keys (user_id, idem_key, response_json) VALUES (?, ?, ?)',
                [$userId, $idemKey, json_encode($result, JSON_UNESCAPED_UNICODE)]);
            return $result;
        });
    }

    private static function lockBalance(int $userId): int
    {
        $row = Db::one('SELECT balance_paisa FROM users WHERE id = ? FOR UPDATE', [$userId]);
        if ($row === null) {
            throw new ApiError(404, 'not_found', 'অ্যাকাউন্ট পাওয়া যায়নি।');
        }
        return (int) $row['balance_paisa'];
    }

    private static function record(int $userId, string $type, int $paisa, int $balanceAfter, ?int $counterparty,
                                   ?string $method, ?string $note, string $reference): array
    {
        Db::run(
            'INSERT INTO transactions
                (user_id, type, amount_paisa, balance_after_paisa, counterparty_user_id, method, note, reference)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$userId, $type, $paisa, $balanceAfter, $counterparty, $method, $note !== '' ? $note : null, $reference]
        );
        $row = Db::one(
            'SELECT t.*, c.name AS counterparty_name, c.email AS counterparty_email
             FROM transactions t LEFT JOIN users c ON c.id = t.counterparty_user_id WHERE t.id = ?',
            [Db::pdo()->lastInsertId()]
        );
        return self::present($row);
    }

    private static function present(array $row): array
    {
        $incoming = in_array($row['type'], ['deposit', 'transfer_in'], true);
        return [
            'id' => (int) $row['id'],
            'type' => $row['type'],
            'direction' => $incoming ? 'in' : 'out',
            'amount' => self::taka((int) $row['amount_paisa']),
            'balance_after' => self::taka((int) $row['balance_after_paisa']),
            'method' => $row['method'],
            'note' => $row['note'],
            'counterparty' => $row['counterparty_name'] !== null
                ? ['name' => $row['counterparty_name'], 'email' => $row['counterparty_email']]
                : null,
            'reference' => $row['reference'],
            'created_at' => $row['created_at'],
        ];
    }

    /** Parses "1250" or "1250.50" (taka) into paisa, applying the configured limits. */
    private static function parseAmount(string $amount, string $minKey, ?string $maxKey): int
    {
        $amount = str_replace(',', '', trim($amount));
        if (!preg_match('/^\d{1,9}(\.\d{1,2})?$/', $amount)) {
            throw new ApiError(422, 'invalid_amount', 'সঠিক টাকার পরিমাণ লিখুন।');
        }
        [$whole, $fraction] = array_pad(explode('.', $amount), 2, '');
        $paisa = (int) $whole * 100 + (int) str_pad($fraction, 2, '0');

        $min = (int) round((float) config("limits.{$minKey}", 1) * 100);
        if ($paisa < $min) {
            throw new ApiError(422, 'amount_too_small', 'সর্বনিম্ন ' . self::taka($min) . ' টাকা।');
        }
        if ($maxKey !== null) {
            $max = (int) round((float) config("limits.{$maxKey}") * 100);
            if ($paisa > $max) {
                throw new ApiError(422, 'amount_too_large', 'একবারে সর্বোচ্চ ' . self::taka($max) . ' টাকা।');
            }
        }
        return $paisa;
    }

    private static function reference(): string
    {
        return 'JM' . date('ymd') . strtoupper(bin2hex(random_bytes(4)));
    }

    /** Paisa to a taka string with two decimals, e.g. 125050 → "1250.50". */
    public static function taka(int $paisa): string
    {
        return sprintf('%d.%02d', intdiv($paisa, 100), $paisa % 100);
    }

    private static function insufficient(): ApiError
    {
        return new ApiError(422, 'insufficient_funds', 'আপনার অ্যাকাউন্টে যথেষ্ট টাকা নেই।');
    }
}
