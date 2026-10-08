<?php
/**
 * Admin notifications list (new orders, duplicates, low stock, courier, security, errors).
 */
final class AdminNotificationController extends AdminController
{
    public function index(Request $r): Response
    {
        $items = Notification::latest(100);
        return $this->page('notifications', ['items' => $items], ['title' => 'Notifications', 'nav' => 'notifications', 'page' => 'notifications']);
    }

    public function readAll(Request $r): Response
    {
        DB::exec('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
        DB::exec('DELETE FROM notifications WHERE created_at < NOW() - INTERVAL 90 DAY');
        return $this->done('All notifications marked as read.');
    }
}
