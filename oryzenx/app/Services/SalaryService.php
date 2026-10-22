<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Decimal as D;
use OryzenX\Core\HttpException;
use OryzenX\Core\Security;

/**
 * Salary schedules, monthly salary records and user payment details.
 * Salary is its own accounting category: a paid salary posts salary(+)/external(−) in the ledger and never
 * touches portfolio, trading or realized P/L figures.
 */
final class SalaryService
{
    public const CURRENCIES = ['USD', 'BDT', 'USDT'];

    public function __construct(
        private Database $db,
        private LedgerService $ledger,
        private AuditService $audit,
        private NotificationService $notify
    ) {
    }

    public function upsertSchedule(int $userId, array $in, ?int $actorId): array
    {
        $amount = D::round(D::normalize($in['amount']), 8);
        if (D::cmp($amount, '0') <= 0) {
            throw HttpException::validation(['amount' => 'Salary amount must be greater than 0.']);
        }
        $currency = strtoupper((string) ($in['currency'] ?? 'USD'));
        if (!in_array($currency, self::CURRENCIES, true)) {
            throw HttpException::validation(['currency' => 'Select a supported currency.']);
        }
        $payDay = (int) ($in['pay_day'] ?? 1);
        if ($payDay < 1 || $payDay > 28) {
            throw HttpException::validation(['pay_day' => 'Payment day must be between 1 and 28.']);
        }
        if (!$this->db->value('SELECT id FROM users WHERE id = :id', ['id' => $userId])) {
            throw HttpException::notFound('User not found.');
        }
        $existing = $this->db->one('SELECT * FROM salary_schedules WHERE user_id = :u', ['u' => $userId]);
        $now = Database::now();
        $row = [
            'amount' => $amount,
            'currency' => $currency,
            'pay_day' => $payDay,
            'payment_method_id' => !empty($in['payment_method_id']) ? (int) $in['payment_method_id'] : null,
            'start_date' => $in['start_date'] ?? gmdate('Y-m-d'),
            'end_date' => $in['end_date'] ?? null,
            'is_active' => !empty($in['is_active']) ? 1 : 0,
            'notes' => isset($in['notes']) ? mb_substr(strip_tags((string) $in['notes']), 0, 500) : null,
            'updated_by' => $actorId,
            'updated_at' => $now,
        ];
        if ($existing) {
            $this->db->update('salary_schedules', $row, 'id = :id', ['id' => $existing['id']]);
            $id = (int) $existing['id'];
        } else {
            $id = $this->db->insert('salary_schedules', $row + ['user_id' => $userId, 'created_by' => $actorId, 'created_at' => $now]);
        }
        $this->audit->log($actorId, 'salary.schedule_saved', 'salary_schedule', $id, ['user_id' => $userId, 'before' => $existing, 'after' => $row]);
        return $this->db->one('SELECT * FROM salary_schedules WHERE id = :id', ['id' => $id]);
    }

    /** Creates pending records for every active schedule for a period (YYYY-MM). Idempotent per user/period. */
    public function generateForPeriod(string $period, ?int $actorId): int
    {
        if (!preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $period)) {
            throw HttpException::validation(['period' => 'Use the format YYYY-MM.']);
        }
        $first = $period . '-01';
        $last = date('Y-m-t', strtotime($first));
        $schedules = $this->db->all(
            'SELECT s.* FROM salary_schedules s JOIN users u ON u.id = s.user_id
             WHERE s.is_active = 1 AND u.status = "active" AND s.start_date <= :last AND (s.end_date IS NULL OR s.end_date >= :first)',
            ['last' => $last, 'first' => $first]
        );
        $created = 0;
        $now = Database::now();
        foreach ($schedules as $s) {
            $stmt = $this->db->run(
                'INSERT IGNORE INTO salary_records (user_id, schedule_id, period, expected_amount, currency, status, due_date, payment_method_id, created_by, updated_by, created_at, updated_at)
                 VALUES (:u, :s, :p, :a, :c, "pending", :d, :m, :cb, :cb2, :n, :n2)',
                ['u' => $s['user_id'], 's' => $s['id'], 'p' => $period, 'a' => $s['amount'], 'c' => $s['currency'],
                 'd' => sprintf('%s-%02d', $period, (int) $s['pay_day']), 'm' => $s['payment_method_id'], 'cb' => $actorId, 'cb2' => $actorId, 'n' => $now, 'n2' => $now]
            );
            $created += $stmt->rowCount();
        }
        if ($created > 0) {
            $this->audit->log($actorId, 'salary.records_generated', 'salary_period', $period, ['created' => $created]);
        }
        return $created;
    }

    /**
     * Updates a salary record status. Marking "paid" posts the payment to the ledger (salary account),
     * converting to USD with the recorded usd_rate when the salary currency is not USD.
     */
    public function updateRecord(int $recordId, array $in, ?int $actorId): array
    {
        $status = (string) ($in['status'] ?? '');
        if (!in_array($status, ['pending', 'processed', 'paid', 'rejected'], true)) {
            throw HttpException::validation(['status' => 'Select a valid status.']);
        }
        $r = $this->db->transaction(function () use ($recordId, $in, $status, $actorId) {
            $rec = $this->db->one('SELECT user_id FROM salary_records WHERE id = :id', ['id' => $recordId]);
            if (!$rec) {
                throw HttpException::notFound('Salary record not found.');
            }
            $this->ledger->lockUser((int) $rec['user_id']);
            $rec = $this->db->one('SELECT * FROM salary_records WHERE id = :id FOR UPDATE', ['id' => $recordId]);
            if ($rec['status'] === 'paid' && $status !== 'paid') {
                // undo the ledger posting through a reversal (never a silent delete)
                if ($rec['transaction_id']) {
                    $this->ledger->reverse((int) $rec['transaction_id'], $actorId, 'Salary record status changed from paid to ' . $status);
                }
            }
            $upd = [
                'status' => $status,
                'reference' => isset($in['reference']) ? mb_substr(strip_tags((string) $in['reference']), 0, 100) : $rec['reference'],
                'notes' => isset($in['notes']) ? mb_substr(strip_tags((string) $in['notes']), 0, 500) : $rec['notes'],
                'payment_method_id' => !empty($in['payment_method_id']) ? (int) $in['payment_method_id'] : $rec['payment_method_id'],
                'updated_by' => $actorId,
                'updated_at' => Database::now(),
            ];
            if ($rec['status'] === 'paid' && $status !== 'paid') {
                $upd['transaction_id'] = null;
                $upd['payment_date'] = null;
                $upd['actual_amount'] = null;
            }
            if ($status === 'paid' && $rec['status'] !== 'paid') {
                $actual = D::round(D::normalize((string) ($in['actual_amount'] ?? $rec['expected_amount'])), 8);
                if (D::cmp($actual, '0') <= 0) {
                    throw HttpException::validation(['actual_amount' => 'Paid amount must be greater than 0.']);
                }
                $payDate = $in['payment_date'] ?? gmdate('Y-m-d');
                $rate = $rec['currency'] === 'USD' ? '1' : (isset($in['usd_rate']) && $in['usd_rate'] !== '' ? D::normalize((string) $in['usd_rate']) : null);
                if ($rate === null || D::cmp($rate, '0') <= 0) {
                    throw HttpException::validation(['usd_rate' => 'Enter the USD conversion rate used for this ' . $rec['currency'] . ' payment (USD per 1 ' . $rec['currency'] . ').']);
                }
                $usd = D::round(D::mul($actual, $rate), 8);
                $txId = $this->ledger->post([
                    'type' => 'salary_payment',
                    'user_id' => (int) $rec['user_id'],
                    'amount_usd' => $usd,
                    'effective_at' => $payDate . ' 12:00:00',
                    'reference' => $upd['reference'],
                    'notes' => 'Salary ' . $rec['period'] . ' — ' . D::normalize($actual) . ' ' . $rec['currency'] . ($rec['currency'] !== 'USD' ? ' @ ' . $rate . ' USD' : ''),
                    'idempotency_key' => 'salary-' . $recordId . '-' . ((int) $this->db->value('SELECT COUNT(*) FROM financial_transactions WHERE related_type = "salary" AND related_id = :id', ['id' => $recordId]) + 1),
                    'related_type' => 'salary',
                    'related_id' => $recordId,
                    'created_by' => $actorId,
                ], [
                    ['account' => 'salary', 'amount' => $usd],
                    ['account' => 'external', 'amount' => D::neg($usd)],
                ]);
                $upd += ['actual_amount' => $actual, 'payment_date' => $payDate, 'usd_rate' => $rate, 'transaction_id' => $txId];
            }
            $this->db->update('salary_records', $upd, 'id = :id', ['id' => $recordId]);
            $this->audit->log($actorId, 'salary.record_updated', 'salary_record', $recordId, ['from' => $rec['status'], 'to' => $status]);
            return ['changed' => $rec['status'] !== $status, 'user_id' => (int) $rec['user_id'], 'period' => $rec['period']];
        });
        if ($r['changed']) {
            $this->notify->dispatch($r['user_id'], 'salary_status', [
                'salary_id' => $recordId, 'period' => $r['period'], 'status' => $status,
            ], 'salary:' . $recordId . ':' . $status . ':' . time());
        }
        return $this->db->one('SELECT * FROM salary_records WHERE id = :id', ['id' => $recordId]);
    }

    public function records(?int $userId, array $f, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $p = [];
        if ($userId !== null) {
            $where[] = 'r.user_id = :u';
            $p['u'] = $userId;
        } elseif (!empty($f['user_id'])) {
            $where[] = 'r.user_id = :u';
            $p['u'] = (int) $f['user_id'];
        }
        if (!empty($f['status']) && in_array($f['status'], ['pending', 'processed', 'paid', 'rejected'], true)) {
            $where[] = 'r.status = :s';
            $p['s'] = $f['status'];
        }
        if (!empty($f['period']) && preg_match('/^\d{4}-\d{2}$/', (string) $f['period'])) {
            $where[] = 'r.period = :per';
            $p['per'] = $f['period'];
        }
        if (!empty($f['from']) && preg_match('/^\d{4}-\d{2}$/', (string) $f['from'])) {
            $where[] = 'r.period >= :from';
            $p['from'] = $f['from'];
        }
        if (!empty($f['to']) && preg_match('/^\d{4}-\d{2}$/', (string) $f['to'])) {
            $where[] = 'r.period <= :to';
            $p['to'] = $f['to'];
        }
        $w = implode(' AND ', $where);
        $total = (int) $this->db->value("SELECT COUNT(*) FROM salary_records r WHERE $w", $p);
        $rows = $this->db->all(
            "SELECT r.*, pm.name AS payment_method_name, pm.code AS payment_method_code, u.full_name AS user_name, u.email AS user_email
             FROM salary_records r LEFT JOIN payment_methods pm ON pm.id = r.payment_method_id JOIN users u ON u.id = r.user_id
             WHERE $w ORDER BY r.period DESC, r.id DESC LIMIT :l OFFSET :o",
            $p + ['l' => $perPage, 'o' => ($page - 1) * $perPage]
        );
        if ($userId !== null) {
            foreach ($rows as &$r) {
                unset($r['notes'], $r['created_by'], $r['updated_by'], $r['user_email']);
            }
        }
        return [$rows, $total];
    }

    public function schedule(int $userId): ?array
    {
        return $this->db->one(
            'SELECT s.id, s.amount, s.currency, s.period, s.pay_day, s.start_date, s.end_date, s.is_active, pm.name AS payment_method_name
             FROM salary_schedules s LEFT JOIN payment_methods pm ON pm.id = s.payment_method_id WHERE s.user_id = :u',
            ['u' => $userId]
        );
    }

    // ---------------------------------------------------------------- payment methods & user payment details

    public function paymentMethods(bool $enabledOnly = true): array
    {
        $rows = $this->db->all('SELECT * FROM payment_methods' . ($enabledOnly ? ' WHERE is_enabled = 1' : '') . ' ORDER BY sort_order, name');
        foreach ($rows as &$r) {
            $r['fields'] = json_decode($r['fields'], true) ?: [];
            $r['logo_url'] = $r['logo_path'] ? \OryzenX\Core\View::url($r['logo_path']) : null;
        }
        return $rows;
    }

    public function savePaymentDetails(int $userId, int $methodId, array $values, ?int $actorId = null): array
    {
        $method = $this->db->one('SELECT * FROM payment_methods WHERE id = :id AND is_enabled = 1', ['id' => $methodId]);
        if (!$method) {
            throw HttpException::validation(['payment_method_id' => 'This payment method is not available.']);
        }
        $fields = json_decode($method['fields'], true) ?: [];
        $clean = [];
        $masked = [];
        $errors = [];
        foreach ($fields as $f) {
            $v = isset($values[$f['key']]) && is_scalar($values[$f['key']]) ? trim((string) $values[$f['key']]) : '';
            if ($v === '') {
                if (!empty($f['required'])) {
                    $errors[$f['key']] = $f['label'] . ' is required.';
                }
                continue;
            }
            if (mb_strlen($v) > 120) {
                $errors[$f['key']] = $f['label'] . ' is too long.';
                continue;
            }
            if (($f['type'] ?? 'text') === 'select' && !in_array($v, $f['options'] ?? [], true)) {
                $errors[$f['key']] = 'Select a valid ' . mb_strtolower($f['label']) . '.';
                continue;
            }
            if (!empty($f['pattern']) && !preg_match('/' . str_replace('/', '\/', $f['pattern']) . '/', $v)) {
                $errors[$f['key']] = 'Enter a valid ' . mb_strtolower($f['label']) . '.';
                continue;
            }
            $clean[$f['key']] = strip_tags($v);
            $masked[$f['key']] = !empty($f['sensitive']) ? Security::mask($v, 3) : strip_tags($v);
        }
        if ($errors) {
            throw HttpException::validation($errors);
        }
        $now = Database::now();
        $this->db->run(
            'INSERT INTO user_payment_details (user_id, payment_method_id, details_encrypted, details_masked, is_primary, created_at, updated_at)
             VALUES (:u, :m, :e, :mk, 0, :n, :n2)
             ON DUPLICATE KEY UPDATE details_encrypted = VALUES(details_encrypted), details_masked = VALUES(details_masked), updated_at = VALUES(updated_at)',
            ['u' => $userId, 'm' => $methodId, 'e' => Security::encrypt((string) json_encode($clean)), 'mk' => json_encode($masked, JSON_UNESCAPED_UNICODE), 'n' => $now, 'n2' => $now]
        );
        if (!$this->db->value('SELECT id FROM user_payment_details WHERE user_id = :u AND is_primary = 1', ['u' => $userId])) {
            $this->db->run('UPDATE user_payment_details SET is_primary = 1 WHERE user_id = :u AND payment_method_id = :m', ['u' => $userId, 'm' => $methodId]);
        }
        $this->audit->log($actorId ?? $userId, 'payment_details.saved', 'user', $userId, ['method' => $method['code']]);
        $this->notify->securityEvent($userId, 'payment_details_changed', ['method' => $method['name']]);
        return $this->userPaymentDetails($userId);
    }

    public function setPrimary(int $userId, int $methodId): void
    {
        $this->db->transaction(function () use ($userId, $methodId) {
            if (!$this->db->value('SELECT id FROM user_payment_details WHERE user_id = :u AND payment_method_id = :m', ['u' => $userId, 'm' => $methodId])) {
                throw HttpException::notFound('Payment details not found.');
            }
            $this->db->run('UPDATE user_payment_details SET is_primary = (payment_method_id = :m) WHERE user_id = :u', ['u' => $userId, 'm' => $methodId]);
        });
    }

    public function deletePaymentDetails(int $userId, int $methodId): void
    {
        $this->db->run('DELETE FROM user_payment_details WHERE user_id = :u AND payment_method_id = :m', ['u' => $userId, 'm' => $methodId]);
        $this->audit->log($userId, 'payment_details.deleted', 'user', $userId, ['method_id' => $methodId]);
    }

    /** Masked details only (the encrypted original is used only by authorised admin export, never shown in full in the app). */
    public function userPaymentDetails(int $userId): array
    {
        $rows = $this->db->all(
            'SELECT d.payment_method_id, d.details_masked, d.is_primary, d.updated_at, pm.name, pm.code, pm.logo_path
             FROM user_payment_details d JOIN payment_methods pm ON pm.id = d.payment_method_id WHERE d.user_id = :u ORDER BY d.is_primary DESC, pm.sort_order',
            ['u' => $userId]
        );
        foreach ($rows as &$r) {
            $r['details_masked'] = json_decode($r['details_masked'], true);
            $r['logo_url'] = $r['logo_path'] ? \OryzenX\Core\View::url($r['logo_path']) : null;
            unset($r['logo_path']);
        }
        return $rows;
    }

    /** Full details for an authorised admin (salary.manage) — audited. */
    public function revealPaymentDetails(int $userId, int $methodId, int $actorId): array
    {
        $row = $this->db->one('SELECT details_encrypted FROM user_payment_details WHERE user_id = :u AND payment_method_id = :m', ['u' => $userId, 'm' => $methodId]);
        if (!$row) {
            throw HttpException::notFound('Payment details not found.');
        }
        $this->audit->log($actorId, 'payment_details.revealed', 'user', $userId, ['method_id' => $methodId]);
        return json_decode((string) Security::decrypt($row['details_encrypted']), true) ?: [];
    }

    public function updatePaymentMethod(int $id, array $in, ?int $actorId): void
    {
        $pm = $this->db->one('SELECT * FROM payment_methods WHERE id = :id', ['id' => $id]);
        if (!$pm) {
            throw HttpException::notFound('Payment method not found.');
        }
        $upd = ['updated_at' => Database::now()];
        if (isset($in['name'])) {
            $upd['name'] = mb_substr(strip_tags((string) $in['name']), 0, 80);
        }
        if (array_key_exists('is_enabled', $in)) {
            $upd['is_enabled'] = $in['is_enabled'] ? 1 : 0;
        }
        if (isset($in['instructions'])) {
            $upd['instructions'] = mb_substr(strip_tags((string) $in['instructions']), 0, 500);
        }
        if (isset($in['sort_order'])) {
            $upd['sort_order'] = (int) $in['sort_order'];
        }
        if (isset($in['logo_path'])) {
            $upd['logo_path'] = $in['logo_path'];
        }
        $this->db->update('payment_methods', $upd, 'id = :id', ['id' => $id]);
        $this->audit->log($actorId, 'payment_method.updated', 'payment_method', $id, array_diff_key($upd, ['updated_at' => 1]));
    }
}
