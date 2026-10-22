<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Config;
use OryzenX\Core\Database;
use OryzenX\Core\I18n;
use OryzenX\Core\Logger;
use OryzenX\Core\Security;
use OryzenX\Core\View;
use PHPMailer\PHPMailer\PHPMailer;

/**
 * Email queue + SMTP delivery.
 * Status meanings: queued -> sending -> sent (accepted by the SMTP server) | failed (permanent or retries exhausted).
 * "sent" means the SMTP server accepted the message; it does not prove inbox delivery.
 */
final class MailService
{
    public function __construct(private Database $db, private SettingsService $settings)
    {
    }

    /** Renders and queues a templated email. Returns queue id, or null if a message with this event key already exists. */
    public function queue(string $toEmail, ?string $toName, string $template, array $vars, ?string $eventKey = null, ?int $userId = null, string $locale = 'en', int $priority = 5): ?int
    {
        [$subject, $html, $text] = $this->render($template, $vars, $locale);
        $now = Database::now();
        $stmt = $this->db->run(
            'INSERT IGNORE INTO email_queue (uuid, user_id, to_email, to_name, subject, body_html, body_text, template, event_key, priority, status,
                attempts, max_attempts, next_attempt_at, created_at, updated_at)
             VALUES (:uuid, :uid, :to, :name, :sub, :html, :text, :tpl, :ek, :pr, "queued", 0, 5, :now, :now, :now)',
            ['uuid' => Security::uuid(), 'uid' => $userId, 'to' => $toEmail, 'name' => $toName, 'sub' => $subject, 'html' => $html,
             'text' => $text, 'tpl' => $template, 'ek' => $eventKey, 'pr' => $priority, 'now' => $now]
        );
        if ($stmt->rowCount() === 0) {
            return null; // duplicate event key: already queued/sent
        }
        return (int) $this->db->pdo()->lastInsertId();
    }

    /** @return array{0:string,1:string,2:string} subject, html, text */
    public function render(string $template, array $vars, string $locale = 'en'): array
    {
        if (!preg_match('/^[a-z_]+$/', $template)) {
            throw new \InvalidArgumentException('Invalid template');
        }
        $prev = I18n::locale();
        I18n::setLocale($locale);
        try {
            $siteName = $this->settings->get('site_name', 'OryzenX') ?: 'OryzenX';
            $vars += ['site_name' => $siteName, 'app_url' => Config::appUrl(''), 'support_email' => (string) $this->settings->get('support_email', '')];
            $content = View::render('emails/' . $template, $vars + ['part' => 'html']);
            $subject = trim(View::render('emails/' . $template, $vars + ['part' => 'subject']));
            $text = trim(View::render('emails/' . $template, $vars + ['part' => 'text']));
            $html = View::render('emails/layout', ['content' => $content, 'subject' => $subject, 'locale' => $locale] + $vars);
            return [$subject, $html, $text];
        } finally {
            I18n::setLocale($prev);
        }
    }

    public function smtpConfigured(): bool
    {
        return $this->settings->bool('smtp_enabled') && $this->settings->has('smtp_host') && $this->settings->has('smtp_from_email');
    }

    /** Processes due messages. @return array{sent:int, failed:int, retried:int, skipped:int} */
    public function processQueue(int $limit = 20): array
    {
        $stats = ['sent' => 0, 'failed' => 0, 'retried' => 0, 'skipped' => 0];
        $driver = (string) Config::get('mail.driver', 'smtp');
        if ($driver === 'smtp' && !$this->smtpConfigured()) {
            $stats['skipped'] = (int) $this->db->value('SELECT COUNT(*) FROM email_queue WHERE status = "queued"');
            return $stats;
        }
        $ids = array_column($this->db->all(
            'SELECT id FROM email_queue WHERE status = "queued" AND next_attempt_at <= UTC_TIMESTAMP() ORDER BY priority ASC, id ASC LIMIT :l',
            ['l' => $limit]
        ), 'id');
        foreach ($ids as $id) {
            $r = $this->deliver((int) $id);
            if ($r === 'sent') {
                $stats['sent']++;
            } elseif ($r === 'retry') {
                $stats['retried']++;
            } elseif ($r === 'failed') {
                $stats['failed']++;
            }
        }
        // recover messages stuck in "sending" (worker crashed)
        $this->db->run('UPDATE email_queue SET status = "queued" WHERE status = "sending" AND locked_until < UTC_TIMESTAMP()');
        return $stats;
    }

    /** Attempts one message. Returns sent|retry|failed|locked|skipped. */
    public function deliver(int $id): string
    {
        $driver = (string) Config::get('mail.driver', 'smtp');
        if ($driver === 'smtp' && !$this->smtpConfigured()) {
            $this->db->update('email_queue', ['last_error' => 'SMTP is not configured', 'updated_at' => Database::now()], 'id = :id AND status = "queued"', ['id' => $id]);
            return 'skipped';
        }
        // claim the row atomically so two workers never send the same message
        $claimed = $this->db->run(
            'UPDATE email_queue SET status = "sending", locked_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE), attempts = attempts + 1, updated_at = UTC_TIMESTAMP()
             WHERE id = :id AND status = "queued"',
            ['id' => $id]
        )->rowCount();
        if ($claimed === 0) {
            return 'locked';
        }
        $msg = $this->db->one('SELECT * FROM email_queue WHERE id = :id', ['id' => $id]);
        $this->log($id, $msg['to_email'], 'attempted', 'Attempt ' . $msg['attempts']);
        try {
            $messageId = $driver === 'log' ? $this->writeToLog($msg) : $this->sendSmtp($msg);
            $this->db->update('email_queue', [
                'status' => 'sent', 'sent_at' => Database::now(), 'smtp_message_id' => mb_substr($messageId, 0, 190),
                'last_error' => null, 'locked_until' => null, 'updated_at' => Database::now(),
            ], 'id = :id', ['id' => $id]);
            $this->log($id, $msg['to_email'], 'accepted', $driver === 'log' ? 'Written to local mail log (development driver)' : 'Accepted by SMTP server');
            return 'sent';
        } catch (\Throwable $e) {
            $error = mb_substr($this->cleanError($e->getMessage()), 0, 500);
            $permanent = $this->isPermanent($error);
            $exhausted = (int) $msg['attempts'] >= (int) $msg['max_attempts'];
            if ($permanent || $exhausted) {
                $this->db->update('email_queue', ['status' => 'failed', 'last_error' => $error, 'locked_until' => null, 'updated_at' => Database::now()], 'id = :id', ['id' => $id]);
                $this->log($id, $msg['to_email'], 'failed_permanent', $error);
                return 'failed';
            }
            $delay = min(3600 * 6, 60 * (2 ** ((int) $msg['attempts'] + 1)));
            $this->db->update('email_queue', [
                'status' => 'queued', 'last_error' => $error, 'locked_until' => null,
                'next_attempt_at' => gmdate('Y-m-d H:i:s', time() + $delay), 'updated_at' => Database::now(),
            ], 'id = :id', ['id' => $id]);
            $this->log($id, $msg['to_email'], 'failed_temporary', $error);
            return 'retry';
        }
    }

    private function isPermanent(string $error): bool
    {
        // 5xx SMTP replies (except 421-style temporary) and invalid addresses are permanent.
        if (preg_match('/\b5\d\d\b/', $error) && !preg_match('/\b4\d\d\b/', $error)) {
            return true;
        }
        return (bool) preg_match('/invalid address|Invalid address|Could not authenticate|authenticat/i', $error);
    }

    private function cleanError(string $e): string
    {
        // never log credentials echoed by servers
        return preg_replace('/(password|pass|auth)[^\s]*\s*[:=]\s*\S+/i', '$1=[redacted]', $e) ?? $e;
    }

    private function mailer(): PHPMailer
    {
        if (!class_exists(PHPMailer::class)) {
            throw new \RuntimeException('PHPMailer is not installed. Run composer install --no-dev.');
        }
        $m = new PHPMailer(true);
        $m->isSMTP();
        $m->Host = (string) $this->settings->get('smtp_host');
        $m->Port = $this->settings->int('smtp_port', 587);
        $enc = (string) $this->settings->get('smtp_encryption', 'tls');
        if ($enc === 'ssl') {
            $m->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($enc === 'tls') {
            $m->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        } else {
            $m->SMTPSecure = '';
            $m->SMTPAutoTLS = false;
        }
        $user = (string) $this->settings->get('smtp_username', '');
        if ($user !== '') {
            $m->SMTPAuth = true;
            $m->Username = $user;
            $m->Password = (string) $this->settings->get('smtp_password', '');
        }
        $m->Timeout = max(5, $this->settings->int('smtp_timeout', 15));
        $m->CharSet = PHPMailer::CHARSET_UTF8;
        $m->setFrom((string) $this->settings->get('smtp_from_email'), (string) $this->settings->get('smtp_from_name', 'OryzenX'));
        $reply = (string) $this->settings->get('smtp_reply_to', '');
        if ($reply !== '') {
            $m->addReplyTo($reply);
        }
        return $m;
    }

    private function sendSmtp(array $msg): string
    {
        $m = $this->mailer();
        $m->addAddress($msg['to_email'], (string) $msg['to_name']);
        $m->Subject = $msg['subject'];
        $m->isHTML(true);
        $m->Body = $msg['body_html'];
        $m->AltBody = $msg['body_text'];
        $m->MessageID = '<' . $msg['uuid'] . '@' . (parse_url(Config::appUrl(''), PHP_URL_HOST) ?: 'oryzenx.local') . '>';
        $m->send();
        return $m->getLastMessageID();
    }

    /** Development driver: writes the message to storage/mail instead of sending. */
    private function writeToLog(array $msg): string
    {
        $dir = Config::storagePath('mail');
        if (!is_dir($dir)) {
            mkdir($dir, 0750, true);
        }
        file_put_contents($dir . '/' . $msg['uuid'] . '.json', json_encode([
            'to' => $msg['to_email'], 'subject' => $msg['subject'], 'text' => $msg['body_text'], 'html' => $msg['body_html'],
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        return 'log-' . $msg['uuid'];
    }

    /** Sends a test email synchronously and returns a diagnostic result (no secrets). */
    public function sendTest(string $to): array
    {
        if (!$this->smtpConfigured()) {
            $missing = [];
            foreach (['smtp_host' => 'SMTP host', 'smtp_from_email' => 'sender email'] as $k => $label) {
                if (!$this->settings->has($k)) {
                    $missing[] = $label;
                }
            }
            if (!$this->settings->bool('smtp_enabled')) {
                $missing[] = 'SMTP is disabled';
            }
            return ['ok' => false, 'stage' => 'configuration', 'message' => 'SMTP is not ready: ' . implode(', ', $missing) . '.'];
        }
        $id = $this->queue($to, null, 'test_email', ['time' => gmdate('Y-m-d H:i:s') . ' UTC'], null, null, 'en', 1);
        if ($id === null) {
            return ['ok' => false, 'stage' => 'queue', 'message' => 'Could not queue the test email.'];
        }
        $result = $this->deliver($id);
        $row = $this->db->one('SELECT status, last_error FROM email_queue WHERE id = :id', ['id' => $id]);
        $this->settings->set('smtp_last_test_at', Database::now());
        $this->settings->set('smtp_last_test_status', $result === 'sent' ? 'accepted' : 'failed');
        if ($result === 'sent') {
            return ['ok' => true, 'stage' => 'accepted', 'message' => 'The SMTP server accepted the test message. Check the recipient inbox (and spam folder) to confirm delivery.'];
        }
        return ['ok' => false, 'stage' => 'smtp', 'message' => 'SMTP rejected or could not be reached: ' . ($row['last_error'] ?? 'unknown error')];
    }

    private function log(?int $queueId, string $to, string $status, ?string $detail): void
    {
        $this->db->insert('email_logs', [
            'email_queue_id' => $queueId, 'to_email' => $to, 'status' => $status,
            'detail' => $detail ? mb_substr($detail, 0, 500) : null, 'created_at' => Database::now(),
        ]);
    }

    public function stats(): array
    {
        $rows = $this->db->all('SELECT status, COUNT(*) c FROM email_queue GROUP BY status');
        $out = ['queued' => 0, 'sending' => 0, 'sent' => 0, 'failed' => 0, 'cancelled' => 0];
        foreach ($rows as $r) {
            $out[$r['status']] = (int) $r['c'];
        }
        $out['last_sent_at'] = $this->db->value('SELECT MAX(sent_at) FROM email_queue');
        $out['last_error'] = $this->db->value('SELECT last_error FROM email_queue WHERE last_error IS NOT NULL ORDER BY updated_at DESC LIMIT 1');
        return $out;
    }

    public function cancel(int $id): bool
    {
        return $this->db->run('UPDATE email_queue SET status = "cancelled", updated_at = UTC_TIMESTAMP() WHERE id = :id AND status = "queued"', ['id' => $id])->rowCount() > 0;
    }

    public function retry(int $id): bool
    {
        return $this->db->run(
            'UPDATE email_queue SET status = "queued", next_attempt_at = UTC_TIMESTAMP(), max_attempts = GREATEST(max_attempts, attempts + 1), updated_at = UTC_TIMESTAMP()
             WHERE id = :id AND status = "failed"',
            ['id' => $id]
        )->rowCount() > 0;
    }

    public static function logWarning(string $m, array $c = []): void
    {
        Logger::warning($m, $c);
    }
}
