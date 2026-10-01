<?php
/** /api/notifications/* — read, read-all, delete, unread count. */
declare(strict_types=1);

require_post();
$u = api_user();
$uid = (int) $u['id'];

switch ($action) {
    case 'read':
        db()->q('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?', [input_int('id'), $uid]);
        ok(['unread' => Notify::unreadCount($uid)]);
        break;
    case 'read-all':
        db()->q('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0', [$uid]);
        ok(['unread' => 0], 'সব নোটিফিকেশন পঠিত হিসেবে চিহ্নিত হয়েছে');
        break;
    case 'delete':
        db()->q('DELETE FROM notifications WHERE id = ? AND user_id = ?', [input_int('id'), $uid]);
        ok(['unread' => Notify::unreadCount($uid)], 'মুছে ফেলা হয়েছে');
        break;
    case 'count':
        ok(['unread' => Notify::unreadCount($uid)]);
        break;
}
