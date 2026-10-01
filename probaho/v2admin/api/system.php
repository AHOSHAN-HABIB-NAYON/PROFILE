<?php
/** /v2admin/api/system/* — test email, VAPID keys, chat logs, admin accounts. */
declare(strict_types=1);

require_once ROOT . '/v2admin/lib.php';

switch ($action) {
    case 'test-email':
        admin_api('settings');
        $to = input_str('to', 190);
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            fail('সঠিক ইমেইল দিন।');
        }
        if (!Mailer::enabled()) {
            fail('আগে SMTP চালু করে সংরক্ষণ করুন।');
        }
        $sent = Mailer::sendTemplate($to, 'admin_message', ['name' => 'Admin', 'title' => 'SMTP টেস্ট সফল ✓', 'body' => 'অভিনন্দন! আপনার SMTP সেটিংস সঠিকভাবে কাজ করছে।']);
        $sent ? ok([], 'টেস্ট ইমেইল পাঠানো হয়েছে ✓') : fail('ইমেইল পাঠানো যায়নি — লগ → ইমেইল লগে ত্রুটি দেখুন।');
        break;

    case 'vapid':
        admin_api('settings');
        WebPush::generateKeys();
        db()->q('DELETE FROM push_subscriptions');
        AdminAuth::log('push.vapid.regenerate');
        ok(['reload' => true], 'নতুন VAPID কী তৈরি হয়েছে');
        break;

    case 'clear-chats':
        admin_api('support');
        db()->q('DELETE FROM ai_chat_logs');
        AdminAuth::log('ai.logs.clear');
        ok(['reload' => true], 'সব চ্যাট লগ মুছে ফেলা হয়েছে');
        break;

    case 'admin-create':
        $a = admin_api();
        if ($a['role'] !== 'super') {
            fail('শুধুমাত্র Super Admin এটি করতে পারে।', 403);
        }
        $email = mb_strtolower(input_str('email', 190));
        $pass = (string) input('password', '');
        $role = in_array(input('role'), ['super', 'admin', 'editor'], true) ? (string) input('role') : 'editor';
        if (input_str('name', 120) === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($pass) < 10) {
            fail('নাম, সঠিক ইমেইল ও ১০+ অক্ষরের পাসওয়ার্ড দিন।');
        }
        if (db()->val('SELECT 1 FROM admin_users WHERE email = ?', [$email])) {
            fail('এই ইমেইলে অ্যাডমিন আছে।');
        }
        db()->insert('admin_users', ['name' => input_str('name', 120), 'email' => $email, 'password_hash' => password_hash($pass, PASSWORD_DEFAULT), 'role' => $role]);
        AdminAuth::log('admin.create', $email, ['role' => $role]);
        ok(['reload' => true], 'অ্যাডমিন তৈরি হয়েছে');
        break;

    case 'admin-status':
    case 'admin-reset-2fa':
        $a = admin_api();
        if ($a['role'] !== 'super' || input_int('id') === (int) $a['id']) {
            fail('অনুমতি নেই।', 403);
        }
        if ($action === 'admin-status') {
            db()->q("UPDATE admin_users SET status = IF(status = 'active', 'disabled', 'active') WHERE id = ?", [input_int('id')]);
        } else {
            db()->q('UPDATE admin_users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?', [input_int('id')]);
        }
        AdminAuth::log('admin.' . $action, (string) input_int('id'));
        ok(['reload' => true], 'আপডেট হয়েছে');
        break;
}
