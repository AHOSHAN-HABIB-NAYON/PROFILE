<?php
/**
 * Authentication & account API.
 * POST /api/auth?action=…  (CSRF-checked by the front controller)
 */
defined('APP') || exit;
require_once ROOT . '/core/totp.php';

$action = input('action');
if (!is_post()) fail(t('err.bad_request'), 405);
$ip = client_ip();

/** Common password + confirmation validation. */
function check_new_password(): string
{
    $pw = (string)($_POST['password'] ?? '');
    if ($pw !== (string)($_POST['password_confirm'] ?? '')) fail(t('err.password_mismatch'), 422, ['password_confirm' => t('err.password_mismatch')]);
    if ($p = password_problem($pw)) fail($p, 422, ['password' => $p]);
    return $pw;
}

function revoke_other_sessions(int $uid): int
{
    return q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL AND session_hash <> ?', [$uid, hash('sha256', session_id())])->rowCount();
}

function security_event(array $u, string $en, string $bn, string $mailEvent): void
{
    notify_users([(int)$u['id']], ['type' => 'security', 'icon' => 'fa-shield-halved', 'link' => '/profile/security', 'title_en' => $en, 'title_bn' => $bn,
        'body_en' => device_label() . ' · ' . client_ip(), 'body_bn' => device_label() . ' · ' . client_ip()], ['push' => false]);
    send_mail($u['email'], 'security_alert', ['name' => $u['name'], 'event' => $mailEvent, 'detail' => device_label() . ' · IP ' . client_ip() . ' · ' . date('Y-m-d H:i')], $u['lang'] ?: null);
}

switch ($action) {

// ---------------------------------------------------------------------
case 'lang':
    $l = input('lang');
    if (!isset(LANGS[$l])) fail(t('err.bad_request'));
    set_lang($l);
    if ($u = user()) q('UPDATE users SET lang = ? WHERE id = ?', [$l, $u['id']]);
    ok();

// ---------------------------------------------------------------------
case 'login':
    rate_limit('login-ip:' . $ip, 30, 600);
    $email = mb_strtolower(input('email'));
    $pw = (string)($_POST['password'] ?? '');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $pw === '') fail(t('auth.invalid'), 422, ['email' => ' ', 'password' => ' ']);
    recaptcha_check('login');
    if (login_locked($email)) {
        record_login(null, $email, false, 'locked');
        fail(t('auth.locked', ['n' => num((int)setting('security.lock_minutes', 15))]), 429);
    }
    $u = user_by_email($email);
    // constant-ish time: always run a bcrypt verification
    $hash = $u['password_hash'] ?? '$2y$12$' . str_repeat('a', 53);
    if (!$u || !$u['password_hash'] || !password_verify($pw, $hash) || $u['status'] === 'deleted') {
        record_login($u['id'] ?? null, $email, false, 'bad_password');
        fail(t('auth.invalid'), 422, ['password' => t('auth.invalid')]);
    }
    if (password_needs_rehash($u['password_hash'], PASSWORD_BCRYPT, ['cost' => 12])) q('UPDATE users SET password_hash = ? WHERE id = ?', [hash_password($pw), $u['id']]);
    if (!account_usable($u)) { record_login((int)$u['id'], $email, false, 'blocked'); fail(account_block_reason($u), 403); }
    if (!$u['email_verified_at'] && setting_bool('security.require_email_verification') && $u['role'] === 'user') {
        record_login((int)$u['id'], $email, false, 'unverified');
        send_verification_email($u);
        fail(t('auth.verify_first'), 403);
    }
    ok('', login_continue($u, 'password', input('next', '/')));

// ---------------------------------------------------------------------
case 'verify_2fa':
    $p = pending_login();
    if (!$p || ($p['step'] ?? '') !== '2fa') fail(t('auth.session_expired'), 419, [], ['redirect' => url('/login')]);
    rate_limit('2fa:' . $p['uid'], 8, 600);
    $u = row('SELECT * FROM users WHERE id = ?', [$p['uid']]);
    if (!$u || !twofa_check((int)$u['id'], input('code'))) {
        record_login($p['uid'], $u['email'] ?? '', false, 'bad_2fa', $p['method']);
        fail(t('auth.bad_code'), 422, ['code' => t('auth.bad_code')]);
    }
    ok('', finish_login($u, $p['method']));

case 'verify_email_code':
    $p = pending_login();
    if (!$p || ($p['step'] ?? '') !== 'email') fail(t('auth.session_expired'), 419, [], ['redirect' => url('/login')]);
    rate_limit('ecode:' . $p['uid'], 10, 600);
    $u = row('SELECT * FROM users WHERE id = ?', [$p['uid']]);
    if (!$u || !check_login_code((int)$u['id'], input('code'))) {
        record_login($p['uid'], $u['email'] ?? '', false, 'bad_email_code', $p['method']);
        fail(t('auth.bad_code'), 422, ['code' => t('auth.bad_code')]);
    }
    ok('', finish_login($u, $p['method']));

case 'resend_login_code':
    $p = pending_login();
    if (!$p || ($p['step'] ?? '') !== 'email') fail(t('auth.session_expired'), 419);
    rate_limit('ecode-send:' . $p['uid'], 3, 600);
    send_login_code(row('SELECT * FROM users WHERE id = ?', [$p['uid']]));
    ok(t('auth.email_code_sent'));

case '2fa_recovery_request':
    $p = pending_login();
    if (!$p || ($p['step'] ?? '') !== '2fa') fail(t('auth.session_expired'), 419);
    rate_limit('2fa-rec:' . $p['uid'], 3, 3600);
    $u = row('SELECT * FROM users WHERE id = ?', [$p['uid']]);
    $token = create_email_token((int)$u['id'], '2fa_recovery', 60);
    send_mail($u['email'], '2fa_recovery', ['name' => $u['name'], 'link' => abs_url('/recover-2fa?token=' . $token)], $u['lang'] ?: null, true);
    ok(t('auth.recovery_sent'));

case 'recover_2fa':
    rate_limit('2fa-rec-use:' . $ip, 10, 3600);
    $uid = check_email_token(input('token'), '2fa_recovery');
    if (!$uid) fail(t('auth.link_invalid'));
    twofa_disable($uid);
    $u = row('SELECT * FROM users WHERE id = ?', [$uid]);
    audit('2fa_recovered', 'user', $uid, '2FA disabled via email recovery link', $uid);
    security_event($u, 'Two-factor authentication was disabled', 'টু-ফ্যাক্টর অথেন্টিকেশন বন্ধ করা হয়েছে', t('mail.2fa_disabled', [], $u['lang'] ?: null));
    ok(t('auth.2fa_recovered_text'), ['redirect' => url('/login'), 'full' => true]);

// ---------------------------------------------------------------------
case 'register':
    if (!setting_bool('security.allow_registration')) fail(t('auth.registration_closed'), 403);
    rate_limit('register:' . $ip, 6, 3600);
    $name = input('name');
    $email = mb_strtolower(input('email'));
    $errors = [];
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) $errors['name'] = t('err.name');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 191) $errors['email'] = t('err.email');
    if (!input_bool('agree')) $errors['agree'] = t('err.agree');
    if ($errors) fail(t('err.check_form'), 422, $errors);
    $pw = check_new_password();
    recaptcha_check('register');
    if (user_by_email($email)) fail(t('auth.email_taken'), 422, ['email' => t('auth.email_taken')]);
    $uid = create_user($name, $email, $pw);
    $u = row('SELECT * FROM users WHERE id = ?', [$uid]);
    welcome_new_user($u);
    audit('user_registered', 'user', $uid, $email, $uid);
    if (setting_bool('security.require_email_verification')) {
        send_verification_email($u);
        ok(t('auth.registered_verify'), ['redirect' => url('/login')]);
    }
    maybe_promote_first_admin($uid, false);
    $u = row('SELECT * FROM users WHERE id = ?', [$uid]);
    ok(t('auth.registered'), login_continue($u, 'password', input('next', '/')));

case 'resend_verification':
    $u = require_login();
    if ($u['email_verified_at']) ok(t('auth.already_verified'));
    rate_limit('verify-send:' . $u['id'], 3, 3600);
    send_verification_email($u);
    ok(t('auth.verification_sent'));

case 'logout':
    if ($u = user()) audit('logout', 'user', (int)$u['id'], '', (int)$u['id']);
    logout_user();
    ok('', ['redirect' => url('/'), 'full' => true]);

// ---------------------------------------------------------------------
case 'forgot':
    rate_limit('forgot:' . $ip, 5, 3600);
    $email = mb_strtolower(input('email'));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(t('err.email'), 422, ['email' => t('err.email')]);
    recaptcha_check('forgot');
    $u = user_by_email($email);
    if ($u && $u['status'] !== 'deleted' && rate_hit('forgot-user:' . $u['id'], 3, 3600)) {
        $token = create_email_token((int)$u['id'], 'reset', 60);
        send_mail($u['email'], 'reset', ['name' => $u['name'], 'link' => abs_url('/reset-password?token=' . $token)], $u['lang'] ?: null, true);
    }
    // same answer whether or not the account exists (no user enumeration)
    ok(t('auth.reset_sent'));

case 'reset':
    rate_limit('reset:' . $ip, 10, 3600);
    $uid = check_email_token(input('token'), 'reset', false);
    if (!$uid) fail(t('auth.link_invalid'));
    $pw = check_new_password();
    check_email_token(input('token'), 'reset');
    q('UPDATE users SET password_hash = ? WHERE id = ?', [hash_password($pw), $uid]);
    q('UPDATE user_security SET password_changed_at = NOW() WHERE user_id = ?', [$uid]);
    q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$uid]);
    $u = row('SELECT * FROM users WHERE id = ?', [$uid]);
    if (!$u['email_verified_at']) q('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [$uid]); // they proved inbox access
    security_event($u, 'Your password was reset', 'আপনার পাসওয়ার্ড রিসেট করা হয়েছে', t('mail.password_reset', [], $u['lang'] ?: null));
    ok(t('auth.reset_done'), ['redirect' => url('/login')]);

// ---------------------------------------------------------------------
case 'profile':
    $u = require_login();
    $name = input('name');
    $email = mb_strtolower(input('email'));
    $errors = [];
    if (mb_strlen($name) < 2 || mb_strlen($name) > 120) $errors['name'] = t('err.name');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) $errors['email'] = t('err.email');
    $lang = isset(LANGS[input('lang')]) ? input('lang') : null;
    if ($errors) fail(t('err.check_form'), 422, $errors);
    $data = ['name' => $name, 'phone' => mb_substr(input('phone'), 0, 40) ?: null, 'bio' => mb_substr(input('bio'), 0, 500) ?: null, 'lang' => $lang];
    $emailChanged = $email !== $u['email'];
    if ($emailChanged) {
        if ($u['password_hash'] && !password_verify((string)($_POST['current_password'] ?? ''), $u['password_hash'])) fail(t('auth.wrong_password'), 422, ['current_password' => t('auth.wrong_password')]);
        if (user_by_email($email)) fail(t('auth.email_taken'), 422, ['email' => t('auth.email_taken')]);
        $data['email'] = $email;
        $data['email_verified_at'] = null;
    }
    if (!empty($_FILES['avatar']['name'])) {
        require_once ROOT . '/core/upload.php';
        rate_limit('avatar:' . $u['id'], 10, 3600);
        try {
            $f = store_upload($_FILES['avatar'], 'image', ['max_dim' => 512, 'thumb' => false, 'max_mb' => 5]);
        } catch (RuntimeException $e) {
            fail($e->getMessage(), 422, ['avatar' => $e->getMessage()]);
        }
        delete_public_file($u['avatar']);
        $data['avatar'] = $f['path'];
    }
    update('users', $data, 'id = ?', [$u['id']]);
    if ($lang) set_lang($lang);
    if ($emailChanged) {
        $nu = row('SELECT * FROM users WHERE id = ?', [$u['id']]);
        send_verification_email($nu);
        send_mail($u['email'], 'security_alert', ['name' => $u['name'], 'event' => t('mail.email_changed', [], $u['lang'] ?: null), 'detail' => $u['email'] . ' → ' . $email], $u['lang'] ?: null);
    }
    ok($emailChanged ? t('profile.saved_verify') : t('common.saved'), ['redirect' => url('/profile/edit'), 'full' => $lang !== null && $lang !== lang() || isset($data['avatar'])]);

case 'password':
    $u = require_login();
    rate_limit('pw-change:' . $u['id'], 10, 3600);
    if ($u['password_hash'] && !password_verify((string)($_POST['current_password'] ?? ''), $u['password_hash'])) fail(t('auth.wrong_password'), 422, ['current_password' => t('auth.wrong_password')]);
    $pw = check_new_password();
    q('UPDATE users SET password_hash = ? WHERE id = ?', [hash_password($pw), $u['id']]);
    q('UPDATE user_security SET password_changed_at = NOW() WHERE user_id = ?', [$u['id']]);
    if (input_bool('logout_others')) revoke_other_sessions((int)$u['id']);
    security_event($u, 'Your password was changed', 'আপনার পাসওয়ার্ড পরিবর্তন করা হয়েছে', t('mail.password_changed', [], $u['lang'] ?: null));
    ok(t('sec.password_updated'), ['reload' => true]);

case '2fa_enable':
    $u = require_login();
    rate_limit('2fa-enable:' . $u['id'], 10, 600);
    $codes = twofa_enable((int)$u['id'], input('code'));
    if (!$codes) fail(t('auth.bad_code'), 422, ['code' => t('auth.bad_code')]);
    security_event($u, 'Two-factor authentication enabled', 'টু-ফ্যাক্টর অথেন্টিকেশন চালু হয়েছে', t('mail.2fa_enabled', [], $u['lang'] ?: null));
    ok(t('sec.twofa_enabled'), ['codes' => $codes]);

case '2fa_disable':
    $u = require_login();
    rate_limit('2fa-disable:' . $u['id'], 8, 600);
    if ($u['password_hash'] && !password_verify((string)($_POST['password'] ?? ''), $u['password_hash'])) fail(t('auth.wrong_password'), 422, ['password' => t('auth.wrong_password')]);
    if (!twofa_check((int)$u['id'], input('code'))) fail(t('auth.bad_code'), 422, ['code' => t('auth.bad_code')]);
    if (setting_bool('security.require_2fa_admin') && is_staff($u)) fail(t('sec.twofa_required_staff'), 403);
    twofa_disable((int)$u['id']);
    security_event($u, 'Two-factor authentication disabled', 'টু-ফ্যাক্টর অথেন্টিকেশন বন্ধ করা হয়েছে', t('mail.2fa_disabled', [], $u['lang'] ?: null));
    ok(t('sec.twofa_disabled'), ['reload' => true]);

case 'security_prefs':
    $u = require_login();
    q('UPDATE user_security SET login_notify = ?, email_login_verify = ?, notify_email = ? WHERE user_id = ?',
        [input_bool('login_notify') ? 1 : 0, input_bool('email_login_verify') ? 1 : 0, input_bool('notify_email') ? 1 : 0, $u['id']]);
    ok(t('common.saved'));

case 'revoke_session':
    $u = require_login();
    q('UPDATE user_sessions SET revoked_at = NOW() WHERE id = ? AND user_id = ? AND session_hash <> ?', [input_int('id'), $u['id'], hash('sha256', session_id())]);
    ok(t('sec.session_revoked'), ['reload' => true]);

case 'logout_others':
    $u = require_login();
    $n = revoke_other_sessions((int)$u['id']);
    ok(t('sec.others_logged_out', ['n' => num($n)]), ['reload' => true]);

case 'google_unlink':
    $u = require_login();
    if (!$u['password_hash'] && !val('SELECT 1 FROM user_passkeys WHERE user_id = ?', [$u['id']])) fail(t('sec.set_password_first'));
    q('UPDATE users SET google_id = NULL WHERE id = ?', [$u['id']]);
    ok(t('common.saved'), ['reload' => true]);

// ---------------------------------------------------------------------
// Passkeys
// ---------------------------------------------------------------------
case 'passkey_options':
    if (!setting_bool('security.passkeys_enabled')) fail(t('err.forbidden'), 403);
    rate_limit('pk-opt:' . $ip, 30, 600);
    require_once ROOT . '/core/webauthn.php';
    ok('', ['options' => wa_login_options()]);

case 'passkey_login':
    if (!setting_bool('security.passkeys_enabled')) fail(t('err.forbidden'), 403);
    rate_limit('pk-login:' . $ip, 20, 600);
    require_once ROOT . '/core/webauthn.php';
    try {
        $u = wa_login_verify(json_decode((string)($_POST['credential'] ?? ''), true) ?: []);
    } catch (Throwable $e) {
        record_login(null, '', false, 'passkey:' . mb_substr($e->getMessage(), 0, 40), 'passkey');
        fail(t('auth.passkey_failed'));
    }
    if (!account_usable($u)) { record_login((int)$u['id'], $u['email'], false, 'blocked', 'passkey'); fail(account_block_reason($u), 403); }
    ok('', login_continue($u, 'passkey', input('next', '/')));

case 'passkey_register_options':
    $u = require_login();
    if (!setting_bool('security.passkeys_enabled')) fail(t('err.forbidden'), 403);
    require_once ROOT . '/core/webauthn.php';
    ok('', ['options' => wa_register_options($u)]);

case 'passkey_register':
    $u = require_login();
    require_once ROOT . '/core/webauthn.php';
    try {
        wa_register_verify($u, json_decode((string)($_POST['credential'] ?? ''), true) ?: [], device_label());
    } catch (Throwable $e) {
        log_error('Passkey register: ' . $e->getMessage());
        fail(t('auth.passkey_failed'));
    }
    security_event($u, 'A passkey was added', 'একটি পাসকি যোগ করা হয়েছে', t('mail.passkey_added', [], $u['lang'] ?: null));
    ok(t('sec.passkey_added'), ['reload' => true]);

case 'passkey_delete':
    $u = require_login();
    q('DELETE FROM user_passkeys WHERE id = ? AND user_id = ?', [input_int('id'), $u['id']]);
    ok(t('sec.passkey_removed'), ['reload' => true]);

default:
    fail(t('err.bad_request'), 400);
}
