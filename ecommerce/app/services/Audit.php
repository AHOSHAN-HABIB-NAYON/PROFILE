<?php
/**
 * Audit trail of admin actions (who, what, old → new, when, IP).
 */
final class Audit
{
    public static function log(string $action, ?string $entityType = null, ?int $entityId = null, ?array $old = null, ?array $new = null): void
    {
        try {
            $r = Request::current();
            DB::insert('logs', [
                'admin_id'    => AdminAuth::id(),
                'action'      => $action,
                'entity_type' => $entityType,
                'entity_id'   => $entityId,
                'old_values'  => $old ? json_encode(self::strip($old), JSON_UNESCAPED_UNICODE) : null,
                'new_values'  => $new ? json_encode(self::strip($new), JSON_UNESCAPED_UNICODE) : null,
                'ip'          => $r->ip(),
                'user_agent'  => mb_substr($r->userAgent(), 0, 255),
            ]);
        } catch (Throwable $e) {
            Logger::error('Audit log failed: ' . $e->getMessage());
        }
    }

    /** Only record changed keys between two arrays. */
    public static function diff(array $old, array $new): array
    {
        $o = [];
        $n = [];
        foreach ($new as $k => $v) {
            $before = $old[$k] ?? null;
            if ((string)(is_array($before) ? json_encode($before) : $before) !== (string)(is_array($v) ? json_encode($v) : $v)) {
                $o[$k] = $before;
                $n[$k] = $v;
            }
        }
        return [$o, $n];
    }

    private static function strip(array $data): array
    {
        foreach ($data as $k => $v) {
            if (preg_match('/pass|secret|token|credential/i', (string)$k)) {
                $data[$k] = '***';
            } elseif (is_string($v) && mb_strlen($v) > 500) {
                $data[$k] = mb_substr($v, 0, 500) . '…';
            }
        }
        return $data;
    }
}
