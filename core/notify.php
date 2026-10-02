<?php
/**
 * In-app notifications + targeting + fan-out to Web Push and email.
 */
defined('APP') || exit;

const NOTIFY_TYPES = ['news', 'payment', 'order', 'promotion', 'security', 'system', 'admin'];

function notify_type_icon(string $type): string
{
    return [
        'news' => 'fa-newspaper', 'payment' => 'fa-wallet', 'order' => 'fa-bag-shopping', 'promotion' => 'fa-gift',
        'security' => 'fa-shield-halved', 'system' => 'fa-circle-info', 'admin' => 'fa-bullhorn',
    ][$type] ?? 'fa-bell';
}

/** Notify specific users. */
function notify_users(array $userIds, array $n, array $opts = []): int
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $userIds))));
    if (!$ids) return 0;
    return notify_dispatch('users', $ids, $n, $opts);
}

/**
 * Resolve an admin target group into a SQL selecting user ids.
 * Groups: all, vip, new, pending_payment, staff, users (explicit ids)
 */
function notify_target_sql(string $target): ?string
{
    return match ($target) {
        'all' => "SELECT id AS uid FROM users WHERE status = 'active'",
        'vip' => "SELECT id AS uid FROM users WHERE status = 'active' AND is_vip = 1",
        'new' => "SELECT id AS uid FROM users WHERE status = 'active' AND created_at > NOW() - INTERVAL 7 DAY",
        'pending_payment' => "SELECT DISTINCT user_id AS uid FROM payments WHERE status = 'pending'",
        'unpaid_orders' => "SELECT DISTINCT user_id AS uid FROM orders WHERE status = 'pending_payment'",
        'staff' => "SELECT id AS uid FROM users WHERE status = 'active' AND role IN ('admin','editor','support')",
        'verified' => "SELECT id AS uid FROM users WHERE status = 'active' AND email_verified_at IS NOT NULL",
        default => null,
    };
}

/**
 * Core dispatcher.
 * $n: type, title_en, title_bn, body_en, body_bn, icon, link
 * $opts: push (bool), email (bool), sound (bool), created_by
 */
function notify_dispatch(string $target, array $ids, array $n, array $opts = []): int
{
    $type = in_array($n['type'] ?? '', NOTIFY_TYPES, true) ? $n['type'] : 'system';
    $push = ($opts['push'] ?? true) && setting_bool('notify.push_enabled');
    $email = ($opts['email'] ?? false);
    $nid = insert('notifications', [
        'type' => $type,
        'title_en' => mb_substr((string)($n['title_en'] ?? ''), 0, 190), 'title_bn' => mb_substr((string)($n['title_bn'] ?? ''), 0, 190),
        'body_en' => mb_substr((string)($n['body_en'] ?? ''), 0, 1000), 'body_bn' => mb_substr((string)($n['body_bn'] ?? ''), 0, 1000),
        'icon' => $n['icon'] ?? notify_type_icon($type), 'link' => $n['link'] ?? null,
        'target' => $target, 'is_broadcast' => $target === 'all' ? 1 : 0,
        'play_sound' => ($opts['sound'] ?? true) ? 1 : 0, 'send_push' => $push ? 1 : 0, 'send_email' => $email ? 1 : 0,
        'created_by' => $opts['created_by'] ?? null,
    ]);

    if ($target === 'users') {
        $st = db()->prepare('INSERT IGNORE INTO notification_targets (notification_id, user_id) VALUES (?, ?)');
        foreach ($ids as $id) $st->execute([$nid, $id]);
        $count = count($ids);
    } else {
        $sql = notify_target_sql($target);
        if (!$sql) return 0;
        $count = q("INSERT IGNORE INTO notification_targets (notification_id, user_id) SELECT ?, t.uid FROM ($sql) AS t", [$nid])->rowCount();
    }
    q('UPDATE notifications SET recipients = ? WHERE id = ?', [$count, $nid]);

    if ($push) {
        require_once ROOT . '/core/push.php';
        // guests subscribed to push get broadcasts too
        $subs = $target === 'all'
            ? rows('SELECT * FROM push_subscriptions')
            : rows('SELECT p.* FROM push_subscriptions p JOIN notification_targets t ON t.user_id = p.user_id WHERE t.notification_id = ?', [$nid]);
        if ($subs) {
            register_shutdown_function(function () use ($subs) {
                finish_response();
                try { push_send_many($subs); } catch (Throwable $e) { log_error($e); }
            });
        }
    }
    if ($email) {
        $users = rows('SELECT u.email, u.name, u.lang FROM notification_targets t JOIN users u ON u.id = t.user_id
                       LEFT JOIN user_security s ON s.user_id = u.id
                       WHERE t.notification_id = ? AND (s.notify_email IS NULL OR s.notify_email = 1)', [$nid]);
        foreach ($users as $u) {
            $l = $u['lang'] ?: setting('default_language');
            send_mail($u['email'], $type === 'admin' ? 'admin_message' : 'notification', [
                'name' => $u['name'],
                'subject' => loc($n, 'title', $l), 'heading' => loc($n, 'title', $l), 'body' => loc($n, 'body', $l),
                'link' => abs_url($n['link'] ?? '/notifications'),
            ], $l);
        }
    }
    return $count;
}

function unread_count(int $uid): int
{
    return (int)val('SELECT COUNT(*) FROM notification_targets WHERE user_id = ? AND read_at IS NULL', [$uid]);
}

function user_notifications(int $uid, int $limit = 30, int $offset = 0, string $filter = 'all'): array
{
    $where = 't.user_id = ?';
    $p = [$uid];
    if ($filter === 'unread') $where .= ' AND t.read_at IS NULL';
    elseif (in_array($filter, NOTIFY_TYPES, true)) { $where .= ' AND n.type = ?'; $p[] = $filter; }
    return rows("SELECT n.*, t.read_at, t.id AS target_id FROM notification_targets t JOIN notifications n ON n.id = t.notification_id
                 WHERE $where ORDER BY n.id DESC LIMIT " . (int)$limit . ' OFFSET ' . (int)$offset, $p);
}

/** Admin alert helper: notify all staff with a permission, plus email. */
function notify_staff(string $perm, array $n, ?string $emailTemplate = null, array $mailVars = []): void
{
    $staff = rows("SELECT id, role, email, name, lang FROM users WHERE status = 'active' AND role IN ('admin','editor','support')");
    $ids = [];
    foreach ($staff as $s) if (can($perm, $s)) $ids[] = (int)$s['id'];
    if ($ids) notify_users($ids, $n, ['push' => true]);
    $to = (string)setting('smtp.admin_email');
    if ($emailTemplate && filter_var($to, FILTER_VALIDATE_EMAIL)) send_mail($to, $emailTemplate, $mailVars);
}

/** Shared markup for notification lists (notifications page + profile tab). */
function render_notification_list(array $items): string
{
    if (!$items) {
        return '<div class="card empty"><div class="icon-box"><i class="fa-regular fa-bell-slash"></i></div>' . e(t('notif.empty')) . '</div>';
    }
    $colors = ['payment' => 'success', 'order' => 'accent', 'security' => 'danger', 'promotion' => 'warning', 'admin' => 'secondary'];
    $h = '<div class="list notif-list">';
    foreach ($items as $n) {
        $unread = $n['read_at'] === null;
        $link = $n['link'] ? url($n['link']) : '';
        $h .= '<div class="list-row notif-item' . ($unread ? ' unread' : '') . '" data-notif>'
            . '<span class="icon-box ' . ($colors[$n['type']] ?? '') . '"><i class="' . e(fa($n['icon'], 'fa-solid ' . notify_type_icon($n['type']))) . '"></i></span>'
            . '<button class="grow notif-body" data-action="mark-read" data-id="' . (int)$n['target_id'] . '"' . ($link ? ' data-link="' . e($link) . '"' : '') . '>'
            . '<strong>' . e(loc($n, 'title')) . '</strong>'
            . (loc($n, 'body') !== '' ? '<span class="nb">' . e(loc($n, 'body')) . '</span>' : '')
            . '<span class="nt">' . e(time_ago($n['created_at'])) . ' · ' . e(t('notif.type_' . $n['type'])) . '</span></button>'
            . ($unread ? '<span class="unread-dot" aria-label="' . e(t('notif.unread')) . '"></span>' : '')
            . '</div>';
    }
    return $h . '</div>';
}
