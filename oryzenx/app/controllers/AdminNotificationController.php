<?php
final class AdminNotificationController
{
    public const GROUPS = ['admins', 'verified', 'unverified', 'buyers', 'pending_payers', 'new_users'];

    public function index(): void
    {
        $p = DB::paginate('n.*, u.name AS target_name, (SELECT COUNT(*) FROM notification_reads r WHERE r.notification_id = n.id) AS reads_count',
            'FROM notifications n LEFT JOIN users u ON u.id = n.user_id WHERE n.created_by IS NOT NULL OR n.user_id IS NULL ORDER BY n.id DESC', [], input_int('page', 1), 20);
        $subs = (int)DB::val('SELECT COUNT(*) FROM push_subscriptions');
        View::page('admin/notifications', ['p' => $p, 'subs' => $subs], ['layout' => 'admin', 'title' => t('admin.notifications'), 'nav' => 'notifications', 'cache' => false]);
    }

    private function groupUsers(string $g): array
    {
        return DB::col(match ($g) {
            'admins' => "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL",
            'verified' => 'SELECT id FROM users WHERE email_verified_at IS NOT NULL AND deleted_at IS NULL',
            'unverified' => 'SELECT id FROM users WHERE email_verified_at IS NULL AND deleted_at IS NULL',
            'buyers' => "SELECT DISTINCT user_id FROM payments WHERE status = 'approved'",
            'pending_payers' => "SELECT DISTINCT user_id FROM payments WHERE status = 'pending'",
            'new_users' => 'SELECT id FROM users WHERE created_at >= NOW() - INTERVAL 7 DAY AND deleted_at IS NULL',
        });
    }

    public function send(): void
    {
        validate(['title' => 'required|max:160', 'message' => 'required|max:1000', 'audience' => 'required|in:all,users,group', 'priority' => 'in:low,normal,high']);
        $aud = (string)input('audience');
        $ids = null;
        if ($aud === 'users') {
            $raw = $_POST['user_ids'] ?? '';
            $ids = array_values(array_filter(array_map('intval', is_array($raw) ? $raw : preg_split('/[\s,]+/', (string)$raw))));
            if (!$ids) fail(t('admin.pick_users'), ['user_ids' => t('admin.pick_users')]);
            $ids = DB::col('SELECT id FROM users WHERE id IN (' . implode(',', $ids) . ')');
        } elseif ($aud === 'group') {
            $g = (string)input('group');
            if (!in_array($g, self::GROUPS, true)) fail(t('valid.in'), ['group' => t('valid.in')]);
            $ids = $this->groupUsers($g);
            if (!$ids) fail(t('admin.group_empty'));
        }
        $link = trim((string)input('link'));
        if ($link !== '' && !preg_match('#^(/|https?://)#', $link)) fail(t('valid.url'), ['link' => t('valid.url')]);
        $icon = preg_replace('/[^a-z0-9\- ]/', '', strtolower((string)input('icon'))) ?: 'fa-solid fa-bell';
        $n = Notifier::send($ids, (string)input('title'), (string)input('message'), [
            'icon' => $icon, 'link' => $link ?: null, 'priority' => input('priority') ?: 'normal', 'sound' => input('sound') === '1',
            'email' => input('email') === '1', 'push' => input('push') === '1', 'created_by' => Auth::id(), 'audience' => $aud === 'group' ? 'group:' . input('group') : $aud,
        ]);
        Auth::activity('admin_notification', "$aud ($n)");
        respond(true, t('admin.notif_sent', ['n' => num($n)]), '/admin/notifications');
    }

    public function userLookup(): void
    {
        $q = trim((string)input('q'));
        $rows = mb_strlen($q) < 2 ? [] : DB::all('SELECT id, name, email FROM users WHERE deleted_at IS NULL AND (name LIKE ? OR email LIKE ?) ORDER BY id DESC LIMIT 10', ["%$q%", "%$q%"]);
        json_out(['ok' => true, 'users' => $rows]);
    }
}
