<?php
/** /api/push/* — store / remove Web Push subscriptions (one per device). */
declare(strict_types=1);

require_post();
$u = api_user();

switch ($action) {
    case 'subscribe':
        if (!WebPush::enabled()) {
            fail('পুশ নোটিফিকেশন বর্তমানে বন্ধ আছে।');
        }
        $endpoint = (string) input('endpoint', '');
        $keys = input('keys');
        if (!preg_match('~^https://~', $endpoint) || !is_array($keys) || empty($keys['p256dh']) || empty($keys['auth'])) {
            fail('সাবস্ক্রিপশন তথ্য সঠিক নয়।');
        }
        $hash = hash('sha256', $endpoint);
        db()->q(
            'INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth, device) VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), device = VALUES(device)',
            [$u['id'], $endpoint, $hash, mb_substr((string) $keys['p256dh'], 0, 255), mb_substr((string) $keys['auth'], 0, 100), device_label(user_agent())]
        );
        WebPush::sendToUser((int) $u['id'], 'পুশ নোটিফিকেশন চালু হয়েছে ✓', 'এখন থেকে গুরুত্বপূর্ণ আপডেট এই ডিভাইসে পাবেন।', '/notifications', 'system');
        ok([], 'পুশ নোটিফিকেশন চালু হয়েছে ✓');
        break;

    case 'unsubscribe':
        db()->q('DELETE FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ?', [hash('sha256', (string) input('endpoint', '')), $u['id']]);
        ok([], 'পুশ নোটিফিকেশন বন্ধ হয়েছে');
        break;
}
