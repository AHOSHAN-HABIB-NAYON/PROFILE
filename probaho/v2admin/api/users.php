<?php
/** /v2admin/api/users/* */
declare(strict_types=1);

require_once ROOT . '/v2admin/lib.php';
admin_api('users');
$id = input_int('id');
$u = db()->row('SELECT * FROM users WHERE id = ?', [$id]);
if (!$u) {
    fail('ইউজার পাওয়া যায়নি।', 404);
}

switch ($action) {
    case 'status':
        $new = $u['status'] === 'active' ? 'suspended' : 'active';
        db()->q('UPDATE users SET status = ? WHERE id = ?', [$new, $id]);
        if ($new === 'suspended') {
            db()->q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$id]);
        }
        AdminAuth::log('user.' . $new, (string) $id);
        ok(['reload' => true], $new === 'active' ? 'ইউজার সক্রিয় করা হয়েছে' : 'ইউজার স্থগিত করা হয়েছে');
        break;
    case 'verify':
        db()->q('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [$id]);
        AdminAuth::log('user.verify', (string) $id);
        ok(['reload' => true], 'ইমেইল ভেরিফাই করা হয়েছে');
        break;
    case 'reset-2fa':
        db()->q('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?', [$id]);
        Notify::user($id, 'security', '2FA রিসেট করা হয়েছে', 'সাপোর্ট টিম আপনার অ্যাকাউন্টের 2FA রিসেট করেছে। প্রয়োজনে আবার চালু করুন।', '/settings');
        AdminAuth::log('user.reset2fa', (string) $id);
        ok(['reload' => true], '2FA রিসেট হয়েছে');
        break;
    case 'logout-all':
        db()->q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$id]);
        AdminAuth::log('user.logoutAll', (string) $id);
        ok(['reload' => true], 'সব সেশন বন্ধ করা হয়েছে');
        break;
    case 'group':
        $g = preg_replace('/[^a-z0-9_-]/', '', strtolower(input_str('group', 40))) ?: 'default';
        db()->q('UPDATE users SET user_group = ? WHERE id = ?', [$g, $id]);
        AdminAuth::log('user.group', (string) $id, ['group' => $g]);
        ok(['reload' => true], 'গ্রুপ সংরক্ষণ হয়েছে');
        break;
}
