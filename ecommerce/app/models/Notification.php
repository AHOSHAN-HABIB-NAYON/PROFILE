<?php
/**
 * Admin notifications (new order, duplicate attempt, low stock, courier, security, errors).
 */
final class Notification
{
    public const ICONS = [
        'order'    => 'fa-solid fa-bag-shopping',
        'duplicate'=> 'fa-solid fa-user-shield',
        'stock'    => 'fa-solid fa-box-open',
        'courier'  => 'fa-solid fa-truck-fast',
        'courier_error' => 'fa-solid fa-triangle-exclamation',
        'security' => 'fa-solid fa-shield-halved',
        'error'    => 'fa-solid fa-circle-exclamation',
        'system'   => 'fa-solid fa-bell',
    ];

    public static function create(string $type, string $title, string $message = '', string $link = ''): void
    {
        try {
            DB::insert('notifications', [
                'type' => $type, 'title' => mb_substr($title, 0, 190), 'message' => mb_substr($message, 0, 500), 'link' => $link ?: null,
            ]);
        } catch (Throwable $e) {
            Logger::error('Notification failed: ' . $e->getMessage());
        }
    }

    public static function unreadCount(): int
    {
        return (int)DB::value('SELECT COUNT(*) FROM notifications WHERE is_read = 0');
    }

    public static function latest(int $limit = 50, bool $unreadOnly = false): array
    {
        return DB::all('SELECT * FROM notifications' . ($unreadOnly ? ' WHERE is_read = 0' : '') . ' ORDER BY id DESC LIMIT ' . (int)$limit);
    }
}
