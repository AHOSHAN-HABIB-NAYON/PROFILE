<?php
/**
 * /api/auth/* — manual login, registration, password reset, 2FA step, logout.
 * (Google = /auth/google, Passkey = /api/passkey/*. There is NO Binance login.)
 */
declare(strict_types=1);

require_post();

/** Finish login or hand over to the 2FA step. */
$complete = static function (array $u, bool $remember, string $method, string $next): void {
    if (setting_on('auth_2fa') && (int) $u['totp_enabled'] === 1) {
        $_SESSION['pending_2fa'] = ['user_id' => (int) $u['id'], 'remember' => $remember, 'method' => $method, 'next' => $next, 'time' => time(), 'tries' => 0];
        ok(['two_factor' => true]);
    }
    Auth::login($u, $remember, $method);
    ok(['redirect' => url(safe_next($next))], 'সফলভাবে লগইন হয়েছে');
};

switch ($action) {
    case 'login':
        if (!setting_on('auth_manual')) {
            fail('পাসওয়ার্ড দিয়ে লগইন বর্তমানে বন্ধ আছে।');
        }
        $ident = mb_strtolower(input_str('identifier', 190));
        $password = (string) input('password', '');
        if ($ident === '' || $password === '') {
            fail('ইমেইল/মোবাইল ও পাসওয়ার্ড দিন।');
        }
        $key = str_contains($ident, '@') ? $ident : normalize_phone($ident);
        if (RateLimit::locked('user', $key)) {
            fail('অনেকবার ভুল চেষ্টা হয়েছে। ' . bn_digits(setting('security_lockout_minutes', '15')) . ' মিনিট পর আবার চেষ্টা করুন।', 429);
        }
        if (!Captcha::verify('login')) {
            fail('নিরাপত্তা যাচাই সঠিক হয়নি। আবার চেষ্টা করুন।', 422, ['reload_captcha' => true]);
        }
        $u = db()->row('SELECT * FROM users WHERE email = ? OR phone = ? LIMIT 1', [$key, $key]);
        if (!$u || !$u['password_hash'] || !password_verify($password, $u['password_hash'])) {
            RateLimit::record('user', $key, false);
            fail('ইমেইল/মোবাইল অথবা পাসওয়ার্ড সঠিক নয়।', 422, ['reload_captcha' => Captcha::enabledFor('login')]);
        }
        if ($u['status'] !== 'active') {
            fail('আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে। সাপোর্টে যোগাযোগ করুন।', 403);
        }
        RateLimit::record('user', $key, true);
        if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
            db()->q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $u['id']]);
        }
        $complete($u, input_bool('remember'), 'password', (string) input('next', ''));
        break;

    case 'two-factor':
        $p = $_SESSION['pending_2fa'] ?? null;
        if (!$p || time() - $p['time'] > 600) {
            unset($_SESSION['pending_2fa']);
            fail('সেশনের মেয়াদ শেষ। আবার লগইন করুন।', 422, ['redirect' => url('/login')]);
        }
        $u = db()->row('SELECT * FROM users WHERE id = ?', [$p['user_id']]);
        if (!$u || !Totp::verify(Crypto::decrypt($u['totp_secret']), input_str('code', 10))) {
            $_SESSION['pending_2fa']['tries'] = ($p['tries'] ?? 0) + 1;
            if ($_SESSION['pending_2fa']['tries'] >= 5) {
                unset($_SESSION['pending_2fa']);
                RateLimit::record('user', $u['email'] ?? 'unknown', false);
                fail('অনেকবার ভুল কোড। আবার লগইন করুন।', 429, ['redirect' => url('/login')]);
            }
            fail('কোডটি সঠিক নয়।');
        }
        Auth::login($u, (bool) $p['remember'], $p['method']);
        ok(['redirect' => url(safe_next($p['next']))], 'সফলভাবে লগইন হয়েছে');
        break;

    case 'register':
        if (!setting_on('auth_registration') || !setting_on('auth_manual')) {
            fail('নতুন রেজিস্ট্রেশন বর্তমানে বন্ধ আছে।');
        }
        if (!RateLimit::hit('register:' . client_ip(), 5, 3600)) {
            fail('অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', 429);
        }
        $name = input_str('name', 120);
        $email = mb_strtolower(input_str('email', 190));
        $phone = input_str('phone', 30);
        $password = (string) input('password', '');
        if (mb_strlen($name) < 2) {
            fail('আপনার পূর্ণ নাম লিখুন।');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            fail('সঠিক ইমেইল ঠিকানা দিন।');
        }
        if ($phone !== '') {
            $phone = normalize_phone($phone);
            if (!preg_match('/^\+?\d{8,15}$/', $phone)) {
                fail('সঠিক মোবাইল নম্বর দিন।');
            }
        }
        if ($err = password_policy_error($password)) {
            fail($err);
        }
        if (!input_bool('agree')) {
            fail('শর্তাবলী ও গোপনীয়তা নীতিতে সম্মতি দিন।');
        }
        if (!Captcha::verify('register')) {
            fail('নিরাপত্তা যাচাই সঠিক হয়নি। আবার চেষ্টা করুন।', 422, ['reload_captcha' => true]);
        }
        if (db()->val('SELECT 1 FROM users WHERE email = ?', [$email])) {
            fail('এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে। লগইন করুন।');
        }
        if ($phone !== '' && db()->val('SELECT 1 FROM users WHERE phone = ?', [$phone])) {
            fail('এই মোবাইল নম্বর দিয়ে আগেই অ্যাকাউন্ট আছে।');
        }
        $u = Auth::createUser(['name' => $name, 'email' => $email, 'phone' => $phone, 'password' => $password]);
        Notify::user((int) $u['id'], 'system', 'স্বাগতম, ' . $name . '! 🎉', 'আপনার অ্যাকাউন্ট তৈরি হয়েছে। নিরাপত্তার জন্য একটি Passkey যোগ করুন।', '/settings#passkeys', ['push' => false, 'email' => ['welcome', []]]);
        if (setting_on('auth_email_verification')) {
            send_verification_email($u);
        }
        Auth::login($u, true, 'password');
        ok(['redirect' => url('/dashboard')], 'অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে');
        break;

    case 'forgot':
        $email = mb_strtolower(input_str('email', 190));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            fail('সঠিক ইমেইল ঠিকানা দিন।');
        }
        if (!RateLimit::hit('forgot:' . client_ip(), 5, 3600) || !RateLimit::hit('forgot:' . $email, 3, 3600)) {
            fail('অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।', 429);
        }
        if (!Captcha::verify('login')) {
            fail('নিরাপত্তা যাচাই সঠিক হয়নি।', 422, ['reload_captcha' => true]);
        }
        $u = db()->row("SELECT * FROM users WHERE email = ? AND status = 'active'", [$email]);
        if ($u) {
            $token = issue_user_token((int) $u['id'], 'reset_password', 3600);
            Mailer::sendTemplate($u['email'], 'reset_password', ['name' => $u['name'], 'url' => abs_url('/reset-password?token=' . $token)]);
        }
        ok([], 'এই ইমেইলে অ্যাকাউন্ট থাকলে রিসেট লিংক পাঠানো হয়েছে। ইনবক্স (ও স্প্যাম) দেখুন।');
        break;

    case 'reset':
        $token = (string) input('token', '');
        $row = db()->row("SELECT * FROM user_tokens WHERE token_hash = ? AND type = 'reset_password' AND used_at IS NULL AND expires_at > NOW()", [hash('sha256', $token)]);
        if (!$row) {
            fail('লিংকটি অবৈধ অথবা মেয়াদ শেষ।');
        }
        $password = (string) input('password', '');
        if ($err = password_policy_error($password)) {
            fail($err);
        }
        if ($password !== (string) input('password_confirm', '')) {
            fail('দুটি পাসওয়ার্ড মিলছে না।');
        }
        db()->tx(static function (DB $db) use ($row, $password) {
            $db->q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $row['user_id']]);
            $db->q('UPDATE user_tokens SET used_at = NOW() WHERE id = ?', [$row['id']]);
            $db->q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$row['user_id']]);
        });
        Notify::user((int) $row['user_id'], 'security', 'পাসওয়ার্ড পরিবর্তন হয়েছে', 'আপনার অ্যাকাউন্টের পাসওয়ার্ড রিসেট করা হয়েছে এবং সব ডিভাইস থেকে লগআউট করা হয়েছে।', '/settings', ['email' => ['security_alert', ['message' => 'আপনার পাসওয়ার্ড রিসেট করা হয়েছে। এটি আপনি না করলে এখনই সাপোর্টে যোগাযোগ করুন।']]]);
        ok(['redirect' => url('/login')], 'পাসওয়ার্ড পরিবর্তন হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।');
        break;

    case 'logout':
        Auth::logout();
        ok(['redirect' => url('/')], 'লগআউট হয়েছে');
        break;
}
