<?php
/**
 * Unified notification dispatch: in-app (always), Web Push and SMTP email.
 */
declare(strict_types=1);

final class Notify
{
    public const CATEGORIES = ['payment' => 'পেমেন্ট', 'security' => 'নিরাপত্তা', 'product' => 'প্রোডাক্ট', 'system' => 'সিস্টেম', 'admin' => 'অ্যাডমিন'];

    /**
     * @param array $opts ['push' => bool, 'email' => false|[template, vars]]
     */
    public static function user(int $userId, string $category, string $title, string $body = '', ?string $url = null, array $opts = []): void
    {
        try {
            db()->insert('notifications', [
                'user_id'  => $userId,
                'category' => array_key_exists($category, self::CATEGORIES) ? $category : 'system',
                'title'    => mb_substr($title, 0, 190),
                'body'     => $body,
                'url'      => $url,
            ]);
            if ($opts['push'] ?? true) {
                WebPush::sendToUser($userId, $title, $body, $url ?: '/notifications', $category);
            }
            if (!empty($opts['email'])) {
                $user = db()->row('SELECT name, email, email_alerts FROM users WHERE id = ?', [$userId]);
                $critical = in_array($opts['email'][0], ['verify_email', 'reset_password', 'passkey_added', 'security_alert'], true);
                if ($user && ($critical || (int) $user['email_alerts'] === 1)) {
                    Mailer::sendTemplate($user['email'], $opts['email'][0], ['name' => $user['name']] + ($opts['email'][1] ?? []));
                }
            }
        } catch (Throwable $e) {
            Logger::error($e);
        }
    }

    /**
     * Send to a single user, a user group or everyone.
     * @param array $channels subset of ['inapp','push','email']
     */
    public static function campaign(string $target, string $value, string $category, string $title, string $body, ?string $url, array $channels, ?string $emailTemplate = null, array $emailVars = []): array
    {
        @set_time_limit(0);
        if ($target === 'user') {
            $users = db()->all("SELECT id, name, email, email_alerts FROM users WHERE status = 'active' AND (id = ? OR uid = ? OR email = ?)", [(int) $value, $value, $value]);
        } elseif ($target === 'group') {
            $users = db()->all("SELECT id, name, email, email_alerts FROM users WHERE status = 'active' AND user_group = ?", [$value]);
        } else {
            $users = db()->all("SELECT id, name, email, email_alerts FROM users WHERE status = 'active'");
        }
        $stats = ['recipients' => count($users), 'push_sent' => 0, 'push_failed' => 0, 'emails' => 0];
        $category = array_key_exists($category, self::CATEGORIES) ? $category : 'admin';
        foreach ($users as $u) {
            if (in_array('inapp', $channels, true)) {
                db()->insert('notifications', ['user_id' => $u['id'], 'category' => $category, 'title' => mb_substr($title, 0, 190), 'body' => $body, 'url' => $url]);
            }
            if (in_array('push', $channels, true)) {
                $r = WebPush::sendToUser((int) $u['id'], $title, $body, $url ?: '/notifications', $category);
                $stats['push_sent'] += $r['sent'];
                $stats['push_failed'] += $r['failed'];
            }
            if (in_array('email', $channels, true) && (int) $u['email_alerts'] === 1) {
                $vars = ['name' => $u['name'], 'title' => $title, 'body' => $body, 'url' => $url] + $emailVars;
                if (Mailer::sendTemplate($u['email'], $emailTemplate ?: 'admin_message', $vars)) {
                    $stats['emails']++;
                }
            }
        }
        db()->insert('push_campaigns', [
            'admin_id'     => $_SESSION['admin_id'] ?? null,
            'target'       => in_array($target, ['user', 'group', 'all'], true) ? $target : 'all',
            'target_value' => $value ?: null,
            'channels'     => implode(',', $channels),
            'title'        => mb_substr($title, 0, 190),
            'body'         => $body,
            'url'          => $url,
            'recipients'   => $stats['recipients'],
            'push_sent'    => $stats['push_sent'],
            'push_failed'  => $stats['push_failed'],
        ]);
        return $stats;
    }

    public static function unreadCount(int $userId): int
    {
        return (int) db()->val('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0', [$userId]);
    }
}
