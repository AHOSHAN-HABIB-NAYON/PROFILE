<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Security;

/** Append-only audit trail of administrative and security-relevant actions. */
final class AuditService
{
    public static ?string $currentIp = null;

    public function __construct(private Database $db)
    {
    }

    public function log(?int $actorId, string $action, ?string $entityType = null, int|string|null $entityId = null, array $details = []): void
    {
        $this->db->insert('admin_audit_logs', [
            'actor_id' => $actorId,
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId === null ? null : (string) $entityId,
            'details' => $details ? json_encode(Security::redact($details), JSON_UNESCAPED_UNICODE) : null,
            'ip' => self::$currentIp,
            'created_at' => Database::now(),
        ]);
    }

    public function list(array $filters, int $page, int $perPage): array
    {
        $where = ['1=1'];
        $p = [];
        if (!empty($filters['action'])) {
            $where[] = 'a.action LIKE :action';
            $p['action'] = $filters['action'] . '%';
        }
        if (!empty($filters['actor_id'])) {
            $where[] = 'a.actor_id = :actor';
            $p['actor'] = (int) $filters['actor_id'];
        }
        if (!empty($filters['entity_type'])) {
            $where[] = 'a.entity_type = :et';
            $p['et'] = $filters['entity_type'];
        }
        if (!empty($filters['from'])) {
            $where[] = 'a.created_at >= :from';
            $p['from'] = $filters['from'] . ' 00:00:00';
        }
        if (!empty($filters['to'])) {
            $where[] = 'a.created_at <= :to';
            $p['to'] = $filters['to'] . ' 23:59:59';
        }
        $w = implode(' AND ', $where);
        $total = (int) $this->db->value("SELECT COUNT(*) FROM admin_audit_logs a WHERE $w", $p);
        $rows = $this->db->all(
            "SELECT a.*, u.full_name AS actor_name, u.email AS actor_email FROM admin_audit_logs a
             LEFT JOIN users u ON u.id = a.actor_id WHERE $w ORDER BY a.id DESC LIMIT :lim OFFSET :off",
            $p + ['lim' => $perPage, 'off' => ($page - 1) * $perPage]
        );
        foreach ($rows as &$r) {
            $r['details'] = $r['details'] ? json_decode($r['details'], true) : null;
        }
        return [$rows, $total];
    }
}
