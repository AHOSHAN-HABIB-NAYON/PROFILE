<?php
final class NotificationController
{
    public function index(): void
    {
        $u = auth();
        $items = Notifier::forUser($u, 50);
        Notifier::markAllRead($u);
        View::page('pages/notifications', ['items' => $items], ['title' => t('nav.notifications'), 'nav' => 'notifications', 'css' => ['profile'], 'cache' => false, 'noindex' => true]);
    }

    public function readAll(): void
    {
        Notifier::markAllRead(auth());
        respond(true);
    }

    public function api(): void
    {
        $u = auth();
        if (!$u) json_out(['ok' => true, 'count' => 0, 'items' => []]);
        if (input('summary') === '1') {
            $latest = Notifier::forUser($u, 1)[0] ?? null;
            json_out(['ok' => true, 'count' => Notifier::unreadCount($u), 'latest' => $latest ? [
                'id' => (int)$latest['id'], 'title' => $latest['title'], 'is_read' => (bool)$latest['is_read'], 'sound' => (bool)$latest['sound'],
                'link' => $latest['link'] ? url($latest['link']) : null] : null]);
        }
        $items = array_map(fn($n) => [
            'id' => (int)$n['id'], 'title' => $n['title'], 'message' => str_limit($n['message'], 120), 'icon' => $n['icon'] ?: 'fa-solid fa-bell',
            'url' => url($n['link'] ?: '/notifications'), 'time' => time_ago($n['created_at']), 'is_read' => (bool)$n['is_read'],
        ], Notifier::forUser($u, 15));
        json_out(['ok' => true, 'count' => Notifier::unreadCount($u), 'items' => $items]);
    }

    public function subscribe(): void
    {
        $b = json_body();
        $endpoint = (string)($b['endpoint'] ?? '');
        $p256 = (string)($b['keys']['p256dh'] ?? ''); $auth = (string)($b['keys']['auth'] ?? '');
        if (!preg_match('#^https://#', $endpoint) || strlen($endpoint) > 500 || $p256 === '' || $auth === '') json_out(['ok' => false], 422);
        if (!RateLimit::hit('push|' . client_ip(), 20, 3600)) json_out(['ok' => false], 429);
        DB::q('INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth) VALUES (?,?,?,?,?)
               ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)',
            [Auth::id(), $endpoint, hash('sha256', $endpoint), mb_substr($p256, 0, 255), mb_substr($auth, 0, 255)]);
        json_out(['ok' => true]);
    }

    public function unsubscribe(): void
    {
        $endpoint = (string)(json_body()['endpoint'] ?? '');
        DB::q('DELETE FROM push_subscriptions WHERE endpoint_hash = ?', [hash('sha256', $endpoint)]);
        json_out(['ok' => true]);
    }
}
