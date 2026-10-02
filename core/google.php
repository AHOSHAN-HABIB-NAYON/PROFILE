<?php
/**
 * Google OAuth 2.0 / OpenID Connect sign-in (authorization-code flow).
 * Redirect URI: https://YOUR-DOMAIN.com/auth/google/callback
 */
defined('APP') || exit;

function google_enabled(): bool
{
    return setting_bool('google.enabled') && setting('google.client_id') && setting('google.client_secret');
}

function google_start(): void
{
    if (!google_enabled()) render_error(404);
    $state = b64url_encode(random_bytes(24));
    $_SESSION['g_state'] = $state;
    $_SESSION['g_next'] = safe_next(input('next'));
    $_SESSION['g_link'] = input('link') === '1' && user() ? (int)user()['id'] : 0;
    redirect('https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
        'client_id' => setting('google.client_id'),
        'redirect_uri' => abs_url('/auth/google/callback'),
        'response_type' => 'code',
        'scope' => 'openid email profile',
        'state' => $state,
        'prompt' => 'select_account',
    ]));
}

function google_callback(): void
{
    $fail = function (string $msg) {
        flash('error', $msg);
        redirect('/login');
    };
    if (!google_enabled()) render_error(404);
    $state = $_SESSION['g_state'] ?? '';
    unset($_SESSION['g_state']);
    if ($state === '' || !hash_equals($state, input('state')) || input('code') === '') $fail(t('auth.google_failed'));
    if (!rate_hit('google:' . client_ip(), 20, 600)) $fail(t('err.too_many'));

    $tok = http_request('POST', 'https://oauth2.googleapis.com/token', ['form' => [
        'code' => input('code'), 'client_id' => setting('google.client_id'), 'client_secret' => setting('google.client_secret'),
        'redirect_uri' => abs_url('/auth/google/callback'), 'grant_type' => 'authorization_code',
    ]]);
    $access = $tok['json']['access_token'] ?? '';
    if (!$access) { log_error('Google token error: ' . $tok['body']); $fail(t('auth.google_failed')); }

    $info = http_request('GET', 'https://openidconnect.googleapis.com/v1/userinfo', ['headers' => ['Authorization: Bearer ' . $access]])['json'] ?? [];
    $sub = (string)($info['sub'] ?? '');
    $email = mb_strtolower((string)($info['email'] ?? ''));
    if ($sub === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || empty($info['email_verified'])) $fail(t('auth.google_failed'));

    // Linking from the profile page
    if (!empty($_SESSION['g_link'])) {
        $uid = (int)$_SESSION['g_link'];
        unset($_SESSION['g_link']);
        if (val('SELECT id FROM users WHERE google_id = ? AND id <> ?', [$sub, $uid])) { flash('error', t('auth.google_in_use')); redirect('/profile/security'); }
        q('UPDATE users SET google_id = ? WHERE id = ?', [$sub, $uid]);
        flash('success', t('auth.google_linked'));
        redirect('/profile/security');
    }

    $u = row('SELECT * FROM users WHERE google_id = ?', [$sub]) ?? user_by_email($email);
    if ($u && $u['status'] === 'deleted') $fail(t('auth.invalid'));
    if (!$u) {
        if (!setting_bool('security.allow_registration')) $fail(t('auth.registration_closed'));
        $id = create_user((string)($info['name'] ?? strtok($email, '@')), $email, null, true, $sub);
        $u = row('SELECT * FROM users WHERE id = ?', [$id]);
        maybe_promote_first_admin($id);
        welcome_new_user($u);
        $u = row('SELECT * FROM users WHERE id = ?', [$id]);
    } else {
        // Google verified this email: link the account and mark email verified
        q('UPDATE users SET google_id = ?, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?', [$sub, $u['id']]);
        if (!account_usable($u)) { record_login((int)$u['id'], $email, false, 'blocked', 'google'); $fail(account_block_reason($u)); }
    }
    $next = $_SESSION['g_next'] ?? '/';
    unset($_SESSION['g_next']);
    $res = login_continue($u, 'google', $next);
    if ($res['step'] === 'done') redirect($res['redirect']);
    // 2FA or email code still needed → login page shows that step
    redirect('/login?step=' . $res['step']);
}
