<?php
/**
 * GET /auth/google            → redirect to Google consent screen
 * GET /auth/google/callback   → verify, link/create account, log in
 */
declare(strict_types=1);

if (!Google::enabled()) {
    $_SESSION['flash_error'] = 'Google লগইন বর্তমানে বন্ধ আছে।';
    header('Location: ' . url('/login'));
    exit;
}

if (!str_ends_with($path, '/callback')) {
    $_SESSION['google_next'] = safe_next((string) ($_GET['next'] ?? ''), '');
    header('Location: ' . Google::authUrl());
    exit;
}

$back = static function (string $msg): void {
    $_SESSION['flash_error'] = $msg;
    header('Location: ' . url('/login'));
    exit;
};

if (!empty($_GET['error'])) {
    $back('Google লগইন বাতিল করা হয়েছে।');
}
try {
    $profile = Google::profile((string) ($_GET['code'] ?? ''), (string) ($_GET['state'] ?? ''));
} catch (Throwable $e) {
    Logger::error($e);
    $back('Google দিয়ে লগইন করা যায়নি। আবার চেষ্টা করুন।');
}

$user = db()->row('SELECT * FROM users WHERE google_id = ?', [$profile['sub']]);
if (!$user) {
    $user = db()->row('SELECT * FROM users WHERE email = ?', [$profile['email']]);
    if ($user) {
        db()->q('UPDATE users SET google_id = ?, email_verified_at = COALESCE(email_verified_at, NOW()), avatar = COALESCE(avatar, ?) WHERE id = ?', [$profile['sub'], $profile['picture'] ?: null, $user['id']]);
        $user = db()->row('SELECT * FROM users WHERE id = ?', [$user['id']]);
    } else {
        if (!setting_on('auth_registration')) {
            $back('নতুন রেজিস্ট্রেশন বর্তমানে বন্ধ আছে।');
        }
        $user = Auth::createUser([
            'name' => mb_substr($profile['name'], 0, 120), 'email' => $profile['email'], 'phone' => '',
            'google_id' => $profile['sub'], 'avatar' => $profile['picture'] ?: null, 'email_verified_at' => now(),
        ]);
        Notify::user((int) $user['id'], 'system', 'স্বাগতম, ' . $user['name'] . '! 🎉', 'Google দিয়ে আপনার অ্যাকাউন্ট তৈরি হয়েছে। নিরাপত্তার জন্য একটি Passkey যোগ করুন।', '/settings#passkeys', ['push' => false, 'email' => ['welcome', []]]);
    }
}
if ($user['status'] !== 'active') {
    $back('আপনার অ্যাকাউন্ট স্থগিত করা হয়েছে। সাপোর্টে যোগাযোগ করুন।');
}
$next = (string) ($_SESSION['google_next'] ?? '');
unset($_SESSION['google_next']);
if (setting_on('auth_2fa') && (int) $user['totp_enabled'] === 1) {
    $_SESSION['pending_2fa'] = ['user_id' => (int) $user['id'], 'remember' => true, 'method' => 'google', 'next' => $next, 'time' => time(), 'tries' => 0];
    header('Location: ' . url('/two-factor'));
    exit;
}
Auth::login($user, true, 'google');
header('Location: ' . url(safe_next($next)));
exit;
