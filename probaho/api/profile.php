<?php
/** /api/profile/* — profile, theme, password, 2FA, sessions. */
declare(strict_types=1);

require_post();
$u = api_user();
$uid = (int) $u['id'];

switch ($action) {
    case 'theme':
        $t = (string) input('theme', '');
        if (in_array($t, ['light', 'dark', 'system'], true)) {
            db()->q('UPDATE users SET theme = ? WHERE id = ?', [$t, $uid]);
        }
        ok();
        break;

    case 'update':
        $name = input_str('name', 120);
        if (mb_strlen($name) < 2) {
            fail('আপনার নাম লিখুন।');
        }
        $phone = input_str('phone', 30);
        if ($phone !== '') {
            $phone = normalize_phone($phone);
            if (!preg_match('/^\+?\d{8,15}$/', $phone)) {
                fail('সঠিক মোবাইল নম্বর দিন।');
            }
            if (db()->val('SELECT 1 FROM users WHERE phone = ? AND id <> ?', [$phone, $uid])) {
                fail('এই মোবাইল নম্বর অন্য অ্যাকাউন্টে ব্যবহৃত হচ্ছে।');
            }
        }
        $data = ['name' => $name, 'phone' => $phone !== '' ? $phone : null];
        $files = Upload::files('avatar');
        if ($files) {
            try {
                $img = Upload::image($files[0], 'avatars', 3 * 1048576, 512);
            } catch (DomainException $e) {
                fail($e->getMessage());
            }
            if ($u['avatar'] && str_starts_with((string) $u['avatar'], 'uploads/')) {
                Upload::delete($u['avatar']);
            }
            $data['avatar'] = $img['path'];
        }
        db()->update('users', $data, 'id = ?', [$uid]);
        ok(['reload' => true], 'প্রোফাইল আপডেট হয়েছে');
        break;

    case 'email-alerts':
        db()->q('UPDATE users SET email_alerts = ? WHERE id = ?', [input_bool('enabled') ? 1 : 0, $uid]);
        ok([], input_bool('enabled') ? 'ইমেইল নোটিফিকেশন চালু হয়েছে' : 'ইমেইল নোটিফিকেশন বন্ধ হয়েছে');
        break;

    case 'password':
        $new = (string) input('password', '');
        if ($u['password_hash'] && !password_verify((string) input('current', ''), $u['password_hash'])) {
            fail('বর্তমান পাসওয়ার্ড সঠিক নয়।');
        }
        if ($err = password_policy_error($new)) {
            fail($err);
        }
        if ($new !== (string) input('password_confirm', '')) {
            fail('দুটি পাসওয়ার্ড মিলছে না।');
        }
        db()->q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $uid]);
        db()->q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND id <> ? AND revoked_at IS NULL', [$uid, (int) ($_SESSION['sid'] ?? 0)]);
        Notify::user($uid, 'security', 'পাসওয়ার্ড পরিবর্তন হয়েছে', 'আপনার পাসওয়ার্ড পরিবর্তন করা হয়েছে এবং অন্যান্য ডিভাইস থেকে লগআউট করা হয়েছে।', '/settings', [
            'email' => ['security_alert', ['message' => 'আপনার অ্যাকাউন্টের পাসওয়ার্ড পরিবর্তন করা হয়েছে। এটি আপনি না করলে এখনই সাপোর্টে যোগাযোগ করুন।']],
        ]);
        ok(['reload' => true], 'পাসওয়ার্ড সংরক্ষণ হয়েছে');
        break;

    case 'resend-verification':
        if ($u['email_verified_at']) {
            ok([], 'আপনার ইমেইল আগেই ভেরিফাই করা আছে।');
        }
        if (!RateLimit::hit('verify-mail:' . $uid, 3, 3600)) {
            fail('কিছুক্ষণ পর আবার চেষ্টা করুন।', 429);
        }
        if (!Mailer::enabled()) {
            fail('ইমেইল সার্ভিস এই মুহূর্তে চালু নেই। সাপোর্টে যোগাযোগ করুন।');
        }
        send_verification_email($u);
        ok([], 'ভেরিফিকেশন লিংক ' . mask_email($u['email']) . '-এ পাঠানো হয়েছে।');
        break;

    case '2fa-setup':
        if (!setting_on('auth_2fa')) {
            fail('2FA বর্তমানে বন্ধ আছে।');
        }
        $_SESSION['totp_setup'] = Totp::secret();
        ok(['reload' => true]);
        break;

    case '2fa-enable':
        $secret = (string) ($_SESSION['totp_setup'] ?? '');
        if ($secret === '' || !Totp::verify($secret, input_str('code', 10))) {
            fail('কোডটি সঠিক নয়। অ্যাপে দেখানো সর্বশেষ কোড দিন।');
        }
        db()->q('UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?', [Crypto::encrypt($secret), $uid]);
        unset($_SESSION['totp_setup']);
        Notify::user($uid, 'security', '2FA চালু হয়েছে', 'আপনার অ্যাকাউন্টে দ্বি-স্তর যাচাই চালু হয়েছে।', '/settings', ['push' => false]);
        ok(['reload' => true], '2FA সফলভাবে চালু হয়েছে ✓');
        break;

    case '2fa-disable':
        if (!$u['totp_enabled'] || !Totp::verify(Crypto::decrypt($u['totp_secret']), input_str('code', 10))) {
            fail('কোডটি সঠিক নয়।');
        }
        db()->q('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?', [$uid]);
        Notify::user($uid, 'security', '2FA বন্ধ করা হয়েছে', 'আপনার অ্যাকাউন্টে দ্বি-স্তর যাচাই বন্ধ করা হয়েছে।', '/settings', [
            'email' => ['security_alert', ['message' => 'আপনার অ্যাকাউন্টে 2FA বন্ধ করা হয়েছে। এটি আপনি না করলে এখনই পাসওয়ার্ড পরিবর্তন করুন।']],
        ]);
        ok(['reload' => true], '2FA বন্ধ হয়েছে');
        break;

    case 'revoke-session':
        db()->q('UPDATE user_sessions SET revoked_at = NOW() WHERE id = ? AND user_id = ? AND id <> ?', [input_int('id'), $uid, (int) ($_SESSION['sid'] ?? 0)]);
        ok([], 'ডিভাইসটি লগআউট করা হয়েছে');
        break;

    case 'revoke-others':
        db()->q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND id <> ? AND revoked_at IS NULL', [$uid, (int) ($_SESSION['sid'] ?? 0)]);
        ok([], 'অন্যান্য সব ডিভাইস থেকে লগআউট করা হয়েছে');
        break;
}
