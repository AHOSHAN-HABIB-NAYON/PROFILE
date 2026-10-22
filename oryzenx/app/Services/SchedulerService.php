<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Decimal as D;
use OryzenX\Core\Logger;

/**
 * Scheduled tasks run by bin/cron.php (every minute via cron, or every few minutes on shared hosting).
 * Each task records a row in scheduled_task_logs and is guarded by a named DB lock (no overlapping runs).
 */
final class SchedulerService
{
    public function __construct(
        private Database $db,
        private SettingsService $settings,
        private MarketService $market,
        private MailService $mail,
        private PortfolioService $portfolio,
        private NotificationService $notify,
        private SalaryService $salary
    ) {
    }

    /** @return array<string, array> results per task */
    public function runDue(): array
    {
        $tasks = [
            'market_refresh' => max(30, $this->settings->int('market_poll_seconds', 60)),
            'email_queue' => 60,
            'portfolio_snapshots' => 3600,
            'portfolio_threshold' => 900,
            'reminders' => 3600,
            'salary_records' => 3600 * 6,
            'cleanup' => 86400,
        ];
        $out = [];
        foreach ($tasks as $task => $interval) {
            $last = $this->db->value('SELECT MAX(started_at) FROM scheduled_task_logs WHERE task = :t AND status IN ("success","failed")', ['t' => $task]);
            if ($last && strtotime($last . ' UTC') > time() - $interval + 5) {
                continue;
            }
            $out[$task] = $this->run($task);
        }
        return $out;
    }

    public function run(string $task): array
    {
        $lock = 'oryzenx_task_' . $task;
        if ((int) $this->db->value('SELECT GET_LOCK(:l, 0)', ['l' => $lock]) !== 1) {
            return ['status' => 'skipped', 'message' => 'Already running'];
        }
        $logId = $this->db->insert('scheduled_task_logs', ['task' => $task, 'status' => 'running', 'started_at' => Database::now()]);
        try {
            [$items, $msg] = match ($task) {
                'market_refresh' => $this->taskMarket(),
                'email_queue' => $this->taskEmail(),
                'portfolio_snapshots' => $this->taskSnapshots(),
                'portfolio_threshold' => $this->taskThreshold(),
                'reminders' => $this->taskReminders(),
                'salary_records' => $this->taskSalary(),
                'cleanup' => $this->taskCleanup(),
                default => throw new \InvalidArgumentException('Unknown task'),
            };
            $this->db->update('scheduled_task_logs', ['status' => 'success', 'items' => $items, 'message' => mb_substr($msg, 0, 1000), 'finished_at' => Database::now()], 'id = :id', ['id' => $logId]);
            return ['status' => 'success', 'items' => $items, 'message' => $msg];
        } catch (\Throwable $e) {
            Logger::error('Scheduled task failed', ['task' => $task, 'error' => $e->getMessage()]);
            $this->db->update('scheduled_task_logs', ['status' => 'failed', 'message' => mb_substr($e->getMessage(), 0, 1000), 'finished_at' => Database::now()], 'id = :id', ['id' => $logId]);
            return ['status' => 'failed', 'message' => $e->getMessage()];
        } finally {
            $this->db->value('SELECT RELEASE_LOCK(:l)', ['l' => $lock]);
        }
    }

    private function taskMarket(): array
    {
        $this->settings->set('market_last_attempt_at', Database::now());
        $r = $this->market->refresh();
        return [$r['updated'] ?? 0, $r['ok'] ? 'Updated ' . $r['updated'] . ' prices via ' . $r['provider'] : 'Provider error: ' . $r['error']];
    }

    private function taskEmail(): array
    {
        $s = $this->mail->processQueue(50);
        return [$s['sent'], sprintf('sent %d, retry %d, failed %d, waiting (SMTP not configured) %d', $s['sent'], $s['retried'], $s['failed'], $s['skipped'])];
    }

    private function activeUserIds(): array
    {
        return array_map('intval', array_column($this->db->all(
            'SELECT DISTINCT u.id FROM users u WHERE u.status = "active" AND (
                EXISTS (SELECT 1 FROM ledger_entries le WHERE le.user_id = u.id) OR EXISTS (SELECT 1 FROM loans l WHERE l.user_id = u.id))'
        ), 'id'));
    }

    private function taskSnapshots(): array
    {
        $n = 0;
        foreach ($this->activeUserIds() as $uid) {
            $this->portfolio->snapshot($uid);
            $n++;
        }
        return [$n, "Snapshots for $n accounts"];
    }

    /**
     * Notifies users who opted in when their unrealized portfolio value moves beyond their threshold since the
     * last notification. Wording makes clear this is a market valuation change, not realized profit.
     */
    private function taskThreshold(): array
    {
        $users = $this->db->all(
            'SELECT np.user_id, np.threshold_pct FROM notification_preferences np JOIN users u ON u.id = np.user_id
             WHERE np.email_portfolio_threshold = 1 AND u.status = "active" AND u.email_verified_at IS NOT NULL'
        );
        $sent = 0;
        foreach ($users as $u) {
            $uid = (int) $u['user_id'];
            $s = $this->portfolio->summary($uid);
            if (D::isZero($s['investment_balance_usd']) || $s['stale_assets'] || $s['prices_simulated']) {
                continue; // never alert on stale or simulated prices
            }
            $key = 'threshold_ref_' . $uid;
            $ref = $this->db->value('SELECT value FROM cache_items WHERE cache_key = :k', ['k' => $key]);
            $current = $s['investment_balance_usd'];
            if ($ref === null) {
                $this->db->run('REPLACE INTO cache_items (cache_key, value, expires_at) VALUES (:k, :v, "2099-01-01 00:00:00")', ['k' => $key, 'v' => $current]);
                continue;
            }
            if (D::isZero($ref)) {
                continue;
            }
            $pct = D::mul(D::div(D::sub($current, $ref), $ref, 12), '100');
            if (D::cmp(D::abs($pct), $u['threshold_pct']) >= 0) {
                $this->notify->dispatch($uid, 'portfolio_threshold', [
                    'direction' => D::isNegative($pct) ? 'down' : 'up',
                    'pct' => D::fixed(D::abs($pct), 2),
                    'value' => D::fixed($current, 2),
                    'previous' => D::fixed($ref, 2),
                ], 'threshold:' . $uid . ':' . gmdate('YmdHi'));
                $this->db->run('REPLACE INTO cache_items (cache_key, value, expires_at) VALUES (:k, :v, "2099-01-01 00:00:00")', ['k' => $key, 'v' => $current]);
                $sent++;
            }
        }
        return [$sent, "$sent threshold notifications"];
    }

    /**
     * Optional reminder every N (default 5) days. The event key includes the interval bucket, so each eligible
     * user receives at most one reminder per interval even if the task runs many times.
     */
    private function taskReminders(): array
    {
        if (!$this->settings->bool('reminder_enabled')) {
            return [0, 'Reminders disabled'];
        }
        $days = max(1, $this->settings->int('reminder_interval_days', 5));
        $bucket = intdiv(time(), $days * 86400);
        $users = $this->db->all(
            'SELECT u.id, u.locale FROM users u JOIN notification_preferences np ON np.user_id = u.id
             WHERE u.status = "active" AND u.email_verified_at IS NOT NULL AND np.email_reminders = 1 AND u.created_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY)'
        );
        $queued = 0;
        foreach ($users as $u) {
            $loc = $u['locale'] === 'bn' ? 'bn' : 'en';
            $before = (int) $this->db->value('SELECT COUNT(*) FROM email_queue WHERE event_key = :k', ['k' => 'email:reminder:' . $u['id'] . ':' . $bucket]);
            if ($before) {
                continue;
            }
            $this->notify->dispatch((int) $u['id'], 'reminder', [
                'subject_text' => (string) $this->settings->get('reminder_subject_' . $loc),
                'body_text' => (string) $this->settings->get('reminder_body_' . $loc),
            ], 'reminder:' . $u['id'] . ':' . $bucket);
            $queued++;
        }
        return [$queued, "$queued reminders queued (interval $days days)"];
    }

    private function taskSalary(): array
    {
        $tz = $this->settings->timezone();
        $period = (new \DateTimeImmutable('now', $tz))->format('Y-m');
        $n = $this->salary->generateForPeriod($period, null);
        return [$n, "$n salary records created for $period"];
    }

    private function taskCleanup(): array
    {
        $n = 0;
        $n += $this->db->run('DELETE FROM rate_limits WHERE window_start < :t', ['t' => time() - 86400])->rowCount();
        $n += $this->db->run('DELETE FROM cache_items WHERE expires_at < UTC_TIMESTAMP()')->rowCount();
        $n += $this->db->run('DELETE FROM user_sessions WHERE (revoked_at IS NOT NULL AND revoked_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) OR expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)')->rowCount();
        $n += $this->db->run('DELETE FROM verification_tokens WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)')->rowCount();
        $n += $this->db->run('DELETE FROM password_reset_tokens WHERE expires_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)')->rowCount();
        $n += $this->db->run('DELETE FROM scheduled_task_logs WHERE started_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)')->rowCount();
        $n += $this->market->prune(180);
        // email bodies are kept 90 days; delivery logs remain
        $n += $this->db->run('UPDATE email_queue SET body_html = "", body_text = "" WHERE status IN ("sent","failed","cancelled") AND updated_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY) AND body_html <> ""')->rowCount();
        return [$n, "Removed/compacted $n rows"];
    }

    public function recentLogs(int $limit = 50): array
    {
        return $this->db->all('SELECT * FROM scheduled_task_logs ORDER BY id DESC LIMIT :l', ['l' => $limit]);
    }
}
