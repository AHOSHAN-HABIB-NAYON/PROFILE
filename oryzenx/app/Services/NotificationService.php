<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\I18n;
use OryzenX\Core\Logger;

/**
 * Fans account events out to in-app notifications, email and push, honouring user preferences.
 * Every event carries an event key so the same event is never delivered twice per channel.
 */
final class NotificationService
{
    /** event type => [email preference column|null(always), push preference column|null(always)|false(never)] */
    private const CHANNELS = [
        'realized_profit' => ['email_pnl', 'push_trades'],
        'realized_loss' => ['email_pnl', 'push_trades'],
        'trade_recorded' => ['email_trades', 'push_trades'],
        'portfolio_threshold' => ['email_portfolio_threshold', 'push_trades'],
        'salary_status' => ['email_salary', 'push_salary'],
        'loan_status' => ['email_loans', 'push_salary'],
        'verification_decision' => [null, null],
        'security' => [null, 'push_security'],
        'reminder' => ['email_reminders', false],
    ];

    public function __construct(
        private Database $db,
        private MailService $mail,
        private PushService $push
    ) {
    }

    /** Queue an email and try to send it immediately (verification, password reset). */
    public function emailNow(int $userId, string $template, array $vars, string $eventKey): void
    {
        $user = $this->db->one('SELECT email, full_name, locale FROM users WHERE id = :id', ['id' => $userId]);
        if (!$user) {
            return;
        }
        $id = $this->mail->queue($user['email'], $user['full_name'], $template, $vars, $eventKey, $userId, $user['locale'] ?: 'en', 1);
        if ($id !== null) {
            try {
                $this->mail->deliver($id);
            } catch (\Throwable $e) {
                Logger::warning('Immediate email delivery failed; left in queue', ['id' => $id, 'error' => $e->getMessage()]);
            }
        }
    }

    /**
     * @param string $type one of self::CHANNELS keys
     * @param array  $vars template variables (amounts already formatted as strings)
     */
    public function dispatch(int $userId, string $type, array $vars, string $eventKey): void
    {
        if (!isset(self::CHANNELS[$type])) {
            throw new \InvalidArgumentException("Unknown notification type {$type}");
        }
        $user = $this->db->one('SELECT id, email, full_name, locale, status, email_verified_at FROM users WHERE id = :id', ['id' => $userId]);
        if (!$user || $user['status'] === 'closed') {
            return;
        }
        $prefs = $this->preferences($userId);
        $locale = $user['locale'] ?: 'en';
        $prev = I18n::locale();
        I18n::setLocale($locale);
        try {
            $title = I18n::t('notify.' . $type . '_title', $vars);
            $body = I18n::t('notify.' . $type . '_body', $vars);
        } finally {
            I18n::setLocale($prev);
        }

        // 1) in-app (always, deduplicated)
        $this->db->run(
            'INSERT IGNORE INTO notifications (user_id, type, title, body, data, event_key, created_at) VALUES (:u, :t, :ti, :b, :d, :e, :c)',
            ['u' => $userId, 't' => $type, 'ti' => mb_substr($title, 0, 150), 'b' => mb_substr($body, 0, 1000),
             'd' => json_encode(array_intersect_key($vars, array_flip(['trade_id', 'loan_id', 'salary_id', 'transaction_id', 'asset']))), 'e' => $eventKey, 'c' => Database::now()]
        );

        [$emailPref, $pushPref] = self::CHANNELS[$type];

        // 2) email — only to verified addresses, except security notices which go to the account email regardless
        $emailAllowed = $emailPref === null || (bool) ($prefs[$emailPref] ?? false);
        if ($emailAllowed && ($user['email_verified_at'] !== null || $type === 'security')) {
            $template = match ($type) {
                'realized_profit', 'realized_loss' => 'pnl_event',
                'security' => 'security_event',
                default => $type,
            };
            $this->mail->queue($user['email'], $user['full_name'], $template, $vars + ['name' => $user['full_name'], 'event_type' => $type], 'email:' . $eventKey, $userId, $locale);
        }

        // 3) push — generic lock-screen text, no amounts
        if ($pushPref !== false && (bool) ($prefs['push_enabled'] ?? true) && ($pushPref === null || (bool) ($prefs[$pushPref] ?? true))) {
            I18n::setLocale($locale);
            try {
                $pTitle = I18n::t('notify.push_title');
                $pBody = I18n::t('notify.push_body_' . $type);
            } finally {
                I18n::setLocale($prev);
            }
            try {
                $this->push->sendToUser($userId, $pTitle, $pBody, ['type' => $type], 'push:' . $eventKey);
            } catch (\Throwable $e) {
                Logger::warning('Push dispatch failed', ['error' => $e->getMessage()]);
            }
        }
    }

    public function securityEvent(int $userId, string $kind, array $vars): void
    {
        $vars['kind'] = $kind;
        $vars['kind_label'] = I18n::t('notify.security_' . $kind);
        $vars['time'] = gmdate('Y-m-d H:i') . ' UTC';
        $this->dispatch($userId, 'security', $vars, 'security:' . $kind . ':' . $userId . ':' . microtime(true));
    }

    public function preferences(int $userId): array
    {
        $p = $this->db->one('SELECT * FROM notification_preferences WHERE user_id = :u', ['u' => $userId]);
        if (!$p) {
            $this->db->run('INSERT IGNORE INTO notification_preferences (user_id, updated_at) VALUES (:u, :n)', ['u' => $userId, 'n' => Database::now()]);
            $p = $this->db->one('SELECT * FROM notification_preferences WHERE user_id = :u', ['u' => $userId]);
        }
        return $p ?? [];
    }

    public function updatePreferences(int $userId, array $input): array
    {
        $this->preferences($userId);
        $bools = ['email_pnl', 'email_trades', 'email_salary', 'email_loans', 'email_portfolio_threshold', 'email_reminders', 'push_enabled', 'push_trades', 'push_salary', 'push_security'];
        $upd = [];
        foreach ($bools as $b) {
            if (array_key_exists($b, $input)) {
                $upd[$b] = in_array($input[$b], [true, 1, '1', 'true', 'on'], true) ? 1 : 0;
            }
        }
        if (isset($input['threshold_pct']) && is_numeric($input['threshold_pct'])) {
            $upd['threshold_pct'] = max(1, min(50, round((float) $input['threshold_pct'], 2)));
        }
        if ($upd) {
            $upd['updated_at'] = Database::now();
            $this->db->update('notification_preferences', $upd, 'user_id = :u', ['u' => $userId]);
        }
        return $this->preferences($userId);
    }

    public function list(int $userId, int $page, int $perPage): array
    {
        $total = (int) $this->db->value('SELECT COUNT(*) FROM notifications WHERE user_id = :u', ['u' => $userId]);
        $rows = $this->db->all(
            'SELECT id, type, title, body, data, read_at, created_at FROM notifications WHERE user_id = :u ORDER BY id DESC LIMIT :l OFFSET :o',
            ['u' => $userId, 'l' => $perPage, 'o' => ($page - 1) * $perPage]
        );
        foreach ($rows as &$r) {
            $r['data'] = $r['data'] ? json_decode($r['data'], true) : null;
            $r['id'] = (int) $r['id'];
        }
        $unread = (int) $this->db->value('SELECT COUNT(*) FROM notifications WHERE user_id = :u AND read_at IS NULL', ['u' => $userId]);
        return [$rows, $total, $unread];
    }

    public function markRead(int $userId, ?int $id): void
    {
        if ($id === null) {
            $this->db->run('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = :u AND read_at IS NULL', ['u' => $userId]);
        } else {
            $this->db->run('UPDATE notifications SET read_at = UTC_TIMESTAMP() WHERE user_id = :u AND id = :id', ['u' => $userId, 'id' => $id]);
        }
    }
}
