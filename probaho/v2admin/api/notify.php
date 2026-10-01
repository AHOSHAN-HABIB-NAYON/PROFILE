<?php
/** /v2admin/api/notify/send — in-app / push / email to user, group or all. */
declare(strict_types=1);

require_once ROOT . '/v2admin/lib.php';
admin_api('support');
if ($action !== 'send') {
    fail('অনুরোধটি সঠিক নয়।', 404);
}
$target = (string) input('target', 'all');
$value = input_str('target_value', 190);
$title = input_str('title', 190);
$body = input_str('body', 2000);
$url = input_str('url', 255);
$channels = array_values(array_intersect((array) input('channels', []), ['inapp', 'push', 'email']));
if ($title === '') {
    fail('শিরোনাম লিখুন।');
}
if (!$channels) {
    fail('অন্তত একটি চ্যানেল নির্বাচন করুন।');
}
if ($url !== '' && !str_starts_with($url, '/') && !preg_match('~^https://~', $url)) {
    fail('লিংক / দিয়ে অথবা https:// দিয়ে শুরু হতে হবে।');
}
if (!in_array($target, ['user', 'group', 'all'], true) || ($target !== 'all' && $value === '')) {
    fail('প্রাপক নির্বাচন করুন।');
}
$stats = Notify::campaign($target, $value, (string) input('category', 'admin'), $title, $body, $url ?: null, $channels);
AdminAuth::log('notify.send', $target . ($value ? ':' . $value : ''), $stats);
if (!$stats['recipients']) {
    fail('কোনো প্রাপক পাওয়া যায়নি।');
}
ok(['reload' => true], 'পাঠানো হয়েছে — ' . $stats['recipients'] . ' জন' . (in_array('push', $channels, true) ? ' · পুশ ' . $stats['push_sent'] . '✓ ' . $stats['push_failed'] . '✗' : '') . (in_array('email', $channels, true) ? ' · ইমেইল ' . $stats['emails'] : ''));
