<?php
/** Stores in-app notifications and fans them out to Web Push and email. */
final class Notifier
{
    /**
     * @param int[]|null $userIds null = broadcast to every user
     * @param array $o icon, link, priority, sound, email(bool), push(bool), audience
     */
    public static function send(?array $userIds, string $title, string $message, array $o = []): int
    {
        $row = [
            'title' => mb_substr($title, 0, 160), 'message' => mb_substr($message, 0, 1000),
            'icon' => $o['icon'] ?? 'fa-solid fa-bell', 'link' => $o['link'] ?? null,
            'priority' => in_array($o['priority'] ?? '', ['low', 'normal', 'high'], true) ? $o['priority'] : 'normal',
            'sound' => !empty($o['sound']) || !isset($o['sound']) ? 1 : 0, 'audience' => $o['audience'] ?? ($userIds === null ? 'all' : 'user'),
            'created_by' => $o['created_by'] ?? null,
        ];
        $count = 0;
        if ($userIds === null) {
            DB::insert('notifications', $row + ['user_id' => null]);
            $count = (int)DB::val('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL');
        } else {
            foreach (array_unique(array_map('intval', $userIds)) as $uid) { DB::insert('notifications', $row + ['user_id' => $uid]); $count++; }
        }

        if (($o['push'] ?? true) && setting('push_enabled') === '1') self::push($userIds, $row);
        if (($o['email'] ?? $userIds !== null) && Mailer::configured()) self::email($userIds, $row);
        return $count;
    }

    private static function push(?array $userIds, array $n): void
    {
        if (setting('vapid_public') === '') return;
        $subs = $userIds === null
            ? DB::all('SELECT * FROM push_subscriptions ORDER BY id DESC LIMIT 2000')
            : ($userIds ? DB::all('SELECT * FROM push_subscriptions WHERE user_id IN (' . implode(',', array_map('intval', $userIds)) . ')') : []);
        $payload = ['title' => $n['title'], 'body' => $n['message'], 'url' => $n['link'] ? abs_url(url($n['link'])) : abs_url(url('/notifications')),
            'icon' => abs_url(url('/icon-192.png')), 'priority' => $n['priority']];
        $deadline = microtime(true) + 20;
        foreach ($subs as $s) {
            if (microtime(true) > $deadline) break;
            try {
                $status = WebPush::send($s, $payload);
                if (in_array($status, [404, 410], true)) DB::q('DELETE FROM push_subscriptions WHERE id = ?', [$s['id']]);
            } catch (Throwable $e) {
                ErrorHandler::log('push', $e->getMessage());
            }
        }
    }

    private static function email(?array $userIds, array $n): void
    {
        $users = $userIds === null
            ? DB::all('SELECT email FROM users WHERE deleted_at IS NULL AND email_verified_at IS NOT NULL LIMIT 500')
            : ($userIds ? DB::all('SELECT email FROM users WHERE id IN (' . implode(',', array_map('intval', $userIds)) . ')') : []);
        $body = '<p>' . nl2br(e($n['message'])) . '</p>' . ($n['link'] ? Mailer::button(abs_url(url($n['link'])), t('common.open')) : '');
        foreach ($users as $u) Mailer::queue($u['email'], $n['title'], $body);
    }

    public static function unreadCount(array $user): int
    {
        return (int)DB::val('SELECT COUNT(*) FROM notifications n LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
            WHERE (n.user_id = ? OR (n.user_id IS NULL AND n.created_at >= ?)) AND r.notification_id IS NULL', [$user['id'], $user['id'], $user['created_at']]);
    }

    public static function forUser(array $user, int $limit = 30): array
    {
        return DB::all('SELECT n.*, (r.notification_id IS NOT NULL) AS is_read FROM notifications n
            LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
            WHERE (n.user_id = ? OR (n.user_id IS NULL AND n.created_at >= ?)) ORDER BY n.id DESC LIMIT ' . (int)$limit,
            [$user['id'], $user['id'], $user['created_at']]);
    }

    public static function markAllRead(array $user): void
    {
        DB::q('INSERT IGNORE INTO notification_reads (notification_id, user_id)
            SELECT n.id, ? FROM notifications n WHERE (n.user_id = ? OR (n.user_id IS NULL AND n.created_at >= ?))', [$user['id'], $user['id'], $user['created_at']]);
    }
}
