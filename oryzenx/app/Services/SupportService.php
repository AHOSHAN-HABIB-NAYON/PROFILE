<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\HttpException;
use OryzenX\Core\RateLimiter;
use OryzenX\Core\Security;
use OryzenX\Core\Validator;

/** Contact/support inquiries with validation, rate limiting and spam protection (honeypot + signed time trap). */
final class SupportService
{
    public function __construct(
        private Database $db,
        private RateLimiter $limiter,
        private MailService $mail,
        private SettingsService $settings,
        private AuditService $audit
    ) {
    }

    /** Token embedded in the form; submissions faster than 3 s or older than 2 h are rejected as automated. */
    public static function formToken(): string
    {
        $t = (string) time();
        return $t . '.' . substr(hash_hmac('sha256', 'support|' . $t, Security::appKey()), 0, 24);
    }

    private static function checkFormToken(string $token): bool
    {
        [$t, $sig] = array_pad(explode('.', $token, 2), 2, '');
        if (!ctype_digit($t) || !hash_equals(substr(hash_hmac('sha256', 'support|' . $t, Security::appKey()), 0, 24), $sig)) {
            return false;
        }
        $age = time() - (int) $t;
        return $age >= 3 && $age <= 7200;
    }

    public function submit(array $input, string $ip, ?int $userId, string $locale, string $source = 'website'): int
    {
        $this->limiter->hit('support', $ip, 5, 3600);
        // honeypot: real users never fill the hidden "website" field
        if (!empty($input['website'])) {
            throw HttpException::validation(['message' => 'Your message could not be sent.']);
        }
        if ($source === 'website' && !self::checkFormToken((string) ($input['form_token'] ?? ''))) {
            throw HttpException::validation(['message' => 'Please wait a moment and try again, or reload the page.']);
        }
        $data = Validator::make($input, [
            'name' => 'required|string|min:2|max:120',
            'email' => 'required|email',
            'subject' => 'required|string|min:3|max:150',
            'message' => 'required|string|min:10|max:5000',
        ])->validated();
        if (preg_match_all('#https?://#i', $data['message']) > 3) {
            throw HttpException::validation(['message' => 'Please include fewer links in your message.']);
        }
        $now = Database::now();
        $id = $this->db->insert('support_requests', [
            'user_id' => $userId,
            'name' => strip_tags($data['name']),
            'email' => $data['email'],
            'subject' => strip_tags($data['subject']),
            'message' => strip_tags($data['message']),
            'locale' => in_array($locale, ['en', 'bn'], true) ? $locale : 'en',
            'source' => $source === 'app' ? 'app' : 'website',
            'status' => 'new',
            'ip_hash' => hash('sha256', $ip . '|' . Security::appKey()),
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $inbox = (string) $this->settings->get('support_email', '');
        if ($inbox !== '') {
            $this->mail->queue($inbox, 'Support', 'support_received', [
                'ticket' => $id, 'from_name' => $data['name'], 'from_email' => $data['email'],
                'subject_line' => $data['subject'], 'message' => $data['message'],
            ], 'support:' . $id, null, 'en', 3);
        }
        return $id;
    }

    public function list(array $f, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $p = [];
        if (!empty($f['status']) && in_array($f['status'], ['new', 'open', 'resolved', 'spam'], true)) {
            $where[] = 'status = :s';
            $p['s'] = $f['status'];
        }
        if (!empty($f['q'])) {
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], (string) $f['q']) . '%';
            $where[] = '(email LIKE :q1 OR name LIKE :q2 OR subject LIKE :q3)';
            $p += ['q1' => $like, 'q2' => $like, 'q3' => $like];
        }
        $w = implode(' AND ', $where);
        $total = (int) $this->db->value("SELECT COUNT(*) FROM support_requests WHERE $w", $p);
        $rows = $this->db->all("SELECT id, user_id, name, email, subject, message, locale, source, status, admin_note, created_at, updated_at FROM support_requests WHERE $w ORDER BY status = 'new' DESC, id DESC LIMIT :l OFFSET :o", $p + ['l' => $perPage, 'o' => ($page - 1) * $perPage]);
        return [$rows, $total];
    }

    public function update(int $id, string $status, ?string $note, int $actorId): void
    {
        if (!in_array($status, ['new', 'open', 'resolved', 'spam'], true)) {
            throw HttpException::validation(['status' => 'Select a valid status.']);
        }
        $n = $this->db->update('support_requests', [
            'status' => $status, 'admin_note' => $note !== null ? mb_substr(strip_tags($note), 0, 1000) : null,
            'handled_by' => $actorId, 'updated_at' => Database::now(),
        ], 'id = :id', ['id' => $id]);
        if ($n === 0 && !$this->db->value('SELECT id FROM support_requests WHERE id = :id', ['id' => $id])) {
            throw HttpException::notFound();
        }
        $this->audit->log($actorId, 'support.updated', 'support_request', $id, ['status' => $status]);
    }
}
