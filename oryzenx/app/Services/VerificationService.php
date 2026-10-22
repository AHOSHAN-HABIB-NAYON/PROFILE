<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\HttpException;
use OryzenX\Core\Security;

/** Identity verification submissions and administrator review (email verification lives in AuthService). */
final class VerificationService
{
    public function __construct(
        private Database $db,
        private UploadService $uploads,
        private AuditService $audit,
        private NotificationService $notify
    ) {
    }

    public function status(int $userId): array
    {
        $u = $this->db->one('SELECT email_verified_at, identity_status FROM users WHERE id = :id', ['id' => $userId]);
        $latest = $this->db->one(
            'SELECT id, document_type, document_number_masked, status, user_message, created_at, reviewed_at FROM user_verifications WHERE user_id = :u ORDER BY id DESC LIMIT 1',
            ['u' => $userId]
        );
        return [
            'email_verified' => $u['email_verified_at'] !== null,
            'email_verified_at' => $u['email_verified_at'],
            'identity_status' => $u['identity_status'],
            'latest_submission' => $latest,
        ];
    }

    /** @param array $files ['front' => $_FILES entry, 'back' => optional] */
    public function submit(int $userId, string $docType, string $docNumber, array $files, bool $trusted = false): array
    {
        if (!in_array($docType, ['national_id', 'passport', 'driving_license'], true)) {
            throw HttpException::validation(['document_type' => 'Select a document type.']);
        }
        $docNumber = preg_replace('/\s+/', '', $docNumber) ?? '';
        if (!preg_match('/^[A-Za-z0-9-]{5,30}$/', $docNumber)) {
            throw HttpException::validation(['document_number' => 'Enter the document number exactly as printed (5–30 letters or digits).']);
        }
        $u = $this->db->one('SELECT email_verified_at, identity_status FROM users WHERE id = :id', ['id' => $userId]);
        if ($u['email_verified_at'] === null) {
            throw new HttpException(403, 'email_unverified', 'Verify your email address before submitting identity documents.');
        }
        if (in_array($u['identity_status'], ['pending', 'approved'], true)) {
            throw HttpException::conflict($u['identity_status'] === 'pending' ? 'Your documents are already under review.' : 'Your identity is already verified.');
        }
        if (empty($files['front'])) {
            throw HttpException::validation(['front' => 'Upload a photo of the front of your document.']);
        }
        $front = $this->uploads->store($files['front'], 'document', 'verification', $trusted);
        $back = !empty($files['back']) && ($files['back']['error'] ?? 4) !== UPLOAD_ERR_NO_FILE ? $this->uploads->store($files['back'], 'document', 'verification', $trusted) : null;
        $id = $this->db->transaction(function (Database $db) use ($userId, $docType, $docNumber, $front, $back) {
            $id = $db->insert('user_verifications', [
                'user_id' => $userId,
                'document_type' => $docType,
                'document_number_masked' => Security::mask($docNumber, 2),
                'document_number_encrypted' => Security::encrypt($docNumber),
                'front_path' => $front['path'],
                'back_path' => $back['path'] ?? null,
                'status' => 'pending',
                'created_at' => Database::now(),
            ]);
            $db->update('users', ['identity_status' => 'pending', 'updated_at' => Database::now()], 'id = :id', ['id' => $userId]);
            return $id;
        });
        $this->audit->log($userId, 'verification.submitted', 'user_verification', $id, ['document_type' => $docType]);
        return $this->status($userId);
    }

    public function review(int $verificationId, string $decision, ?string $internalNote, ?string $userMessage, int $reviewerId): array
    {
        if (!in_array($decision, ['approved', 'rejected'], true)) {
            throw HttpException::validation(['decision' => 'Choose approve or reject.']);
        }
        if ($decision === 'rejected' && trim((string) $userMessage) === '') {
            throw HttpException::validation(['user_message' => 'Tell the user why the documents were rejected and what to resubmit.']);
        }
        $v = $this->db->transaction(function (Database $db) use ($verificationId, $decision, $internalNote, $userMessage, $reviewerId) {
            $v = $db->one('SELECT * FROM user_verifications WHERE id = :id FOR UPDATE', ['id' => $verificationId]);
            if (!$v) {
                throw HttpException::notFound('Verification request not found.');
            }
            if ($v['status'] !== 'pending') {
                throw HttpException::conflict('This request has already been reviewed.', 'already_reviewed');
            }
            if ((int) $v['user_id'] === $reviewerId) {
                throw HttpException::forbidden('You cannot review your own verification.');
            }
            $db->update('user_verifications', [
                'status' => $decision,
                'review_note' => $internalNote !== null ? mb_substr(strip_tags($internalNote), 0, 1000) : null,
                'user_message' => $userMessage !== null ? mb_substr(strip_tags($userMessage), 0, 500) : null,
                'reviewed_by' => $reviewerId,
                'reviewed_at' => Database::now(),
            ], 'id = :id', ['id' => $verificationId]);
            $db->update('users', ['identity_status' => $decision, 'updated_at' => Database::now()], 'id = :id', ['id' => $v['user_id']]);
            return $v;
        });
        $this->audit->log($reviewerId, 'verification.' . $decision, 'user_verification', $verificationId, ['user_id' => (int) $v['user_id'], 'note' => $internalNote]);
        $this->notify->dispatch((int) $v['user_id'], 'verification_decision', [
            'decision' => $decision,
            'message' => (string) $userMessage,
        ], 'verification:' . $verificationId . ':' . $decision);
        return $this->db->one('SELECT * FROM user_verifications WHERE id = :id', ['id' => $verificationId]);
    }

    public function queue(array $f, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $p = [];
        if (!empty($f['status']) && in_array($f['status'], ['pending', 'approved', 'rejected'], true)) {
            $where[] = 'v.status = :s';
            $p['s'] = $f['status'];
        }
        if (!empty($f['q'])) {
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], (string) $f['q']) . '%';
            $where[] = '(u.email LIKE :q1 OR u.full_name LIKE :q2)';
            $p += ['q1' => $like, 'q2' => $like];
        }
        $w = implode(' AND ', $where);
        $total = (int) $this->db->value("SELECT COUNT(*) FROM user_verifications v JOIN users u ON u.id = v.user_id WHERE $w", $p);
        $rows = $this->db->all(
            "SELECT v.id, v.user_id, u.full_name, u.email, u.email_verified_at, v.document_type, v.document_number_masked, v.status,
                    v.user_message, v.review_note, v.created_at, v.reviewed_at, r.full_name AS reviewer_name, v.back_path IS NOT NULL AS has_back
             FROM user_verifications v JOIN users u ON u.id = v.user_id LEFT JOIN users r ON r.id = v.reviewed_by
             WHERE $w ORDER BY v.status = 'pending' DESC, v.created_at ASC LIMIT :l OFFSET :o",
            $p + ['l' => $perPage, 'o' => ($page - 1) * $perPage]
        );
        return [$rows, $total];
    }

    /** Returns [absolute path, mime] for an authorised admin; the access is audited. */
    public function documentFile(int $verificationId, string $side, int $actorId): array
    {
        $v = $this->db->one('SELECT front_path, back_path FROM user_verifications WHERE id = :id', ['id' => $verificationId]);
        $ref = $v ? ($side === 'back' ? $v['back_path'] : $v['front_path']) : null;
        $abs = $ref ? $this->uploads->privatePath($ref) : null;
        if (!$abs) {
            throw HttpException::notFound('Document not found.');
        }
        $this->audit->log($actorId, 'verification.document_viewed', 'user_verification', $verificationId, ['side' => $side]);
        return [$abs, str_ends_with($abs, '.png') ? 'image/png' : 'image/jpeg'];
    }
}
