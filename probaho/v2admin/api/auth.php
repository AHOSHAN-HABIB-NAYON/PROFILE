<?php
/** /v2admin/api/auth/* — admin login, 2FA, first-admin setup, logout, own 2FA. */
declare(strict_types=1);

require_once ROOT . '/v2admin/lib.php';
require_post();

switch ($action) {
    case 'setup':
        if ((int) db()->val('SELECT COUNT(*) FROM admin_users')) {
            fail('অ্যাডমিন আগেই তৈরি করা আছে।', 403);
        }
        $name = input_str('name', 120);
        $email = mb_strtolower(input_str('email', 190));
        $pass = (string) input('password', '');
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($pass) < 10) {
            fail('নাম, সঠিক ইমেইল ও কমপক্ষে ১০ অক্ষরের পাসওয়ার্ড দিন।');
        }
        $id = db()->insert('admin_users', ['name' => $name, 'email' => $email, 'password_hash' => password_hash($pass, PASSWORD_DEFAULT), 'role' => 'super']);
        AdminAuth::login(db()->row('SELECT * FROM admin_users WHERE id = ?', [$id]));
        if (WebPush::publicKey() === '') {
            WebPush::generateKeys();
        }
        ok(['redirect' => url('/v2admin'), 'hard' => true], 'Super Admin তৈরি হয়েছে');
        break;

    case 'login':
        $email = mb_strtolower(input_str('email', 190));
        if (RateLimit::locked('admin', $email) || RateLimit::locked('admin', client_ip())) {
            fail('অনেকবার ভুল চেষ্টা। কিছুক্ষণ পর আবার চেষ্টা করুন।', 429);
        }
        $a = db()->row('SELECT * FROM admin_users WHERE email = ?', [$email]);
        if (!$a || !password_verify((string) input('password', ''), $a['password_hash'])) {
            RateLimit::record('admin', $email, false);
            RateLimit::record('admin', client_ip(), false);
            Logger::write('SECURITY', 'Admin login failed', ['email' => $email, 'ip' => client_ip()]);
            fail('ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।');
        }
        if ($a['status'] !== 'active') {
            fail('এই অ্যাডমিন অ্যাকাউন্ট নিষ্ক্রিয়।', 403);
        }
        RateLimit::record('admin', $email, true);
        if ((int) $a['totp_enabled'] === 1) {
            $_SESSION['admin_2fa_pending'] = ['id' => (int) $a['id'], 'time' => time(), 'tries' => 0];
            ok(['reload' => true], 'Authenticator কোড দিন');
        }
        AdminAuth::login($a);
        ok(['redirect' => url('/v2admin'), 'hard' => true], 'স্বাগতম, ' . $a['name']);
        break;

    case 'two-factor':
        $p = $_SESSION['admin_2fa_pending'] ?? null;
        if (!$p || time() - $p['time'] > 600) {
            unset($_SESSION['admin_2fa_pending']);
            fail('সেশন শেষ। আবার লগইন করুন।', 422, ['redirect' => url('/v2admin/login')]);
        }
        $a = db()->row('SELECT * FROM admin_users WHERE id = ?', [$p['id']]);
        if (!$a || !Totp::verify(Crypto::decrypt($a['totp_secret']), input_str('code', 10))) {
            $_SESSION['admin_2fa_pending']['tries'] = ($p['tries'] ?? 0) + 1;
            if ($_SESSION['admin_2fa_pending']['tries'] >= 5) {
                unset($_SESSION['admin_2fa_pending']);
            }
            fail('কোডটি সঠিক নয়।');
        }
        AdminAuth::login($a);
        ok(['redirect' => url('/v2admin'), 'hard' => true], 'স্বাগতম, ' . $a['name']);
        break;

    case 'logout':
        AdminAuth::log('logout');
        AdminAuth::logout();
        ok(['redirect' => url('/v2admin/login')]);
        break;

    case '2fa-setup':
        admin_api();
        $_SESSION['admin_totp_setup'] = Totp::secret();
        ok(['reload' => true]);
        break;

    case '2fa-enable':
        $a = admin_api();
        $secret = (string) ($_SESSION['admin_totp_setup'] ?? '');
        if ($secret === '' || !Totp::verify($secret, input_str('code', 10))) {
            fail('কোডটি সঠিক নয়।');
        }
        db()->q('UPDATE admin_users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?', [Crypto::encrypt($secret), $a['id']]);
        unset($_SESSION['admin_totp_setup']);
        AdminAuth::log('2fa.enable');
        ok(['reload' => true], '2FA চালু হয়েছে ✓');
        break;

    case 'password':
        $a = admin_api();
        if (!password_verify((string) input('current', ''), $a['password_hash'])) {
            fail('বর্তমান পাসওয়ার্ড সঠিক নয়।');
        }
        $new = (string) input('password', '');
        if (strlen($new) < 10) {
            fail('নতুন পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।');
        }
        db()->q('UPDATE admin_users SET password_hash = ? WHERE id = ?', [password_hash($new, PASSWORD_DEFAULT), $a['id']]);
        AdminAuth::log('password.change');
        ok(['reload' => true], 'পাসওয়ার্ড পরিবর্তন হয়েছে');
        break;
}
