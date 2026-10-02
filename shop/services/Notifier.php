<?php
final class Notifier
{
    public static function add(string $type, string $title, string $message = '', ?string $link = null): void
    {
        try {
            DB::insert('notifications', ['type' => $type, 'title' => mb_substr($title, 0, 190), 'message' => mb_substr($message, 0, 500), 'link' => $link]);
        } catch (Throwable $e) {
            Logger::error('Notification failed: ' . $e->getMessage());
        }
    }

    public static function unreadCount(): int
    {
        return (int) DB::val('SELECT COUNT(*) FROM notifications WHERE is_read = 0');
    }
}
