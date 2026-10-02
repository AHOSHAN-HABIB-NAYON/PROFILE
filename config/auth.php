<?php
/**
 * Authentication, sessions, roles & permissions.
 */
defined('APP') || exit;

/** Thrown by pages to send the visitor elsewhere (works for full + SPA loads). */
class RedirectTo extends RuntimeException
{
    public function __construct(public string $to) { parent::__construct($to); }
}

const ROLE_PERMS = [
    'admin' => ['*'],
    'editor' => ['dashboard', 'news', 'media', 'team', 'services', 'notifications'],
    'support' => ['dashboard', 'support', 'orders', 'payments'],
    'user' => [],
];

function current_user(bool $refresh = false): ?array
{
    static $user = false;
    if ($user !== false && !$refresh) return $user;
    $user = null;
    $uid = (int)($_SESSION['uid'] ?? 0);
    if (!$uid || !INSTALLED) return null;

    $u = row('SELECT u.*, s.id AS sess_id, s.revoked_at, s.last_active
              FROM users u JOIN user_sessions s ON s.user_id = u.id AND s.session_hash = ?
              WHERE u.id = ?', [hash('sha256', session_id()), $uid]);
    if (!$u || $u['revoked_at'] !== null || !account_usable($u)) {
        // session revoked from another device, or account banned
        unset($_SESSION['uid']);
        return null;
    }
    if (strtotime($u['last_active']) < time() - 60) {
        q('UPDATE user_sessions SET last_active = NOW() WHERE id = ?', [$u['sess_id']]);
        q('UPDATE users SET last_seen_at = NOW() WHERE id = ?', [$uid]);
    }
    return $user = $u;
}

function user(): ?array
{
    return current_user();
}

function account_usable(array $u): bool
{
    if ($u['status'] === 'active') return true;
    if ($u['status'] === 'suspended' && $u['suspended_until'] && strtotime($u['suspended_until']) <= time()) {
        q("UPDATE users SET status = 'active', suspended_until = NULL WHERE id = ?", [$u['id']]);
        return true;
    }
    return false;
}

function account_block_reason(array $u): string
{
    return match ($u['status']) {
        'banned' => t('auth.banned'),
        'suspended' => $u['suspended_until'] && strtotime($u['suspended_until']) < strtotime('+50 years')
            ? t('auth.suspended_until', ['date' => fmt_date($u['suspended_until'], true)])
            : t('auth.suspended'),
        default => t('auth.invalid'),
    };
}

function is_staff(?array $u = null): bool
{
    $u ??= user();
    return $u && in_array($u['role'], ['admin', 'editor', 'support'], true);
}

function is_admin(?array $u = null): bool
{
    $u ??= user();
    return $u && $u['role'] === 'admin';
}

function can(string $perm, ?array $u = null): bool
{
    $u ??= user();
    if (!$u) return false;
    $perms = ROLE_PERMS[$u['role']] ?? [];
    return in_array('*', $perms, true) || in_array($perm, $perms, true);
}

/** Page guard: redirect guests to the login page. */
function require_login(): array
{
    $u = user();
    if (!$u) {
        if (defined('API_REQUEST')) fail(t('err.login_required'), 401, [], ['redirect' => url('/login')]);
        throw new RedirectTo('/login?next=' . rawurlencode(request_path_with_query()));
    }
    return $u;
}

function require_perm(string $perm): array
{
    $u = require_login();
    if (!can($perm, $u)) {
        if (defined('API_REQUEST')) fail(t('err.forbidden'), 403);
        abort(403);
    }
    return $u;
}

function request_path_with_query(): string
{
    $p = defined('NAV_PATH') ? NAV_PATH : request_path();
    $qs = defined('NAV_QUERY') ? NAV_QUERY : ($_SERVER['QUERY_STRING'] ?? '');
    return $p . ($qs !== '' ? '?' . $qs : '');
}

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------
function user_by_email(string $email): ?array
{
    return row('SELECT * FROM users WHERE email = ?', [mb_strtolower(trim($email))]);
}

function create_user(string $name, string $email, ?string $password, bool $verified = false, ?string $googleId = null): int
{
    $id = insert('users', [
        'name' => mb_substr(trim($name), 0, 120),
        'email' => mb_strtolower(trim($email)),
        'password_hash' => $password !== null ? hash_password($password) : null,
        'email_verified_at' => $verified ? date('Y-m-d H:i:s') : null,
        'google_id' => $googleId,
        'lang' => lang(),
    ]);
    insert('user_security', ['user_id' => $id, 'password_changed_at' => date('Y-m-d H:i:s'), 'notify_sound' => setting_bool('notify.sound_enabled') ? 1 : 0]);
    return $id;
}

/**
 * First-admin rule: only while NO administrator exists may a verified
 * account become admin. Serialised with a MySQL named lock.
 */
function maybe_promote_first_admin(int $uid, bool $requireVerified = true): bool
{
    if (!val('SELECT GET_LOCK(?, 5)', ['first_admin_' . (ENV['db_name'] ?? '')])) return false;
    try {
        $hasAdmin = (int)val("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status <> 'deleted'");
        $verified = val('SELECT email_verified_at FROM users WHERE id = ?', [$uid]);
        if ($hasAdmin === 0 && ($verified || !$requireVerified)) {
            q("UPDATE users SET role = 'admin' WHERE id = ?", [$uid]);
            audit('first_admin_assigned', 'user', $uid, 'Initial administrator assigned automatically', $uid);
            return true;
        }
        return false;
    } finally {
        q('SELECT RELEASE_LOCK(?)', ['first_admin_' . (ENV['db_name'] ?? '')]);
    }
}

/** Welcome email + notification for brand-new accounts. */
function welcome_new_user(array $u): void
{
    send_mail($u['email'], 'welcome', ['name' => $u['name']], $u['lang'] ?: null);
    if (setting_bool('notify.welcome_enabled')) {
        notify_users([(int)$u['id']], [
            'type' => 'system', 'icon' => 'fa-hand-sparkles', 'link' => '/services',
            'title_en' => setting('notify.welcome_title_en'), 'title_bn' => setting('notify.welcome_title_bn'),
            'body_en' => setting('notify.welcome_body_en'), 'body_bn' => setting('notify.welcome_body_bn'),
        ], ['push' => false]);
    }
}

// ---------------------------------------------------------------------
// Login flow
// ---------------------------------------------------------------------
function device_label(?string $ua = null): string
{
    $ua ??= user_agent();
    require_once ROOT . '/core/analytics.php';
    $p = parse_ua($ua);
    return trim($p['browser'] . ' · ' . $p['os']);
}

/** Long-lived random device cookie, used for "new device" checks. */
function device_hash(): string
{
    $d = $_COOKIE['dvc'] ?? '';
    if (!preg_match('~^[A-Za-z0-9_-]{32,64}$~', $d)) {
        $d = b64url_encode(random_bytes(32));
        setcookie('dvc', $d, ['expires' => time() + 5 * 31536000, 'path' => '/', 'secure' => IS_HTTPS, 'httponly' => true, 'samesite' => 'Lax']);
        $_COOKIE['dvc'] = $d;
    }
    return token_hash($d);
}

function record_login(?int $uid, string $email, bool $success, string $reason = '', string $method = 'password'): void
{
    insert('login_history', [
        'user_id' => $uid, 'email' => mb_substr($email, 0, 191), 'ip' => client_ip(), 'user_agent' => user_agent(),
        'device' => device_label(), 'method' => $method, 'success' => $success ? 1 : 0, 'reason' => $reason ?: null,
    ]);
}

function login_locked(string $email): bool
{
    $max = max(1, (int)setting('security.max_attempts', 5));
    $mins = max(1, (int)setting('security.lock_minutes', 15));
    $fails = (int)val('SELECT COUNT(*) FROM login_history WHERE email = ? AND success = 0 AND reason = ? AND created_at > NOW() - INTERVAL ? MINUTE',
        [mb_strtolower($email), 'bad_password', $mins]);
    return $fails >= $max;
}

/**
 * After the first factor succeeded, decide what happens next:
 * 2FA code, emailed login code, or a completed login.
 * Returns the API payload for the client.
 */
function login_continue(array $u, string $method, string $next = '/'): array
{
    require_once ROOT . '/core/totp.php';
    $_SESSION['pending_login'] = ['uid' => (int)$u['id'], 'method' => $method, 'next' => safe_next($next), 'at' => time()];

    if ($method !== 'passkey' && twofa_enabled((int)$u['id'])) {
        $_SESSION['pending_login']['step'] = '2fa';
        return ['step' => '2fa', 'message' => t('auth.enter_2fa')];
    }
    $sec = row('SELECT * FROM user_security WHERE user_id = ?', [$u['id']]) ?? [];
    $known = (bool)val('SELECT 1 FROM user_devices WHERE user_id = ? AND device_hash = ?', [$u['id'], device_hash()]);
    $needEmailCode = $method !== 'passkey' && (!empty($sec['email_login_verify']) || (setting_bool('security.new_device_verify') && !$known));
    if ($needEmailCode) {
        send_login_code($u);
        $_SESSION['pending_login']['step'] = 'email';
        return ['step' => 'email', 'message' => t('auth.email_code_sent')];
    }
    return finish_login($u, $method);
}

function send_login_code(array $u): void
{
    $code = (string)random_int(100000, 999999);
    q("UPDATE email_tokens SET used_at = NOW() WHERE user_id = ? AND type = 'login_code' AND used_at IS NULL", [$u['id']]);
    insert('email_tokens', ['user_id' => $u['id'], 'type' => 'login_code', 'token_hash' => token_hash($code), 'expires_at' => date('Y-m-d H:i:s', time() + 600)]);
    send_mail($u['email'], 'login_code', ['name' => $u['name'], 'code' => $code], $u['lang'] ?: null, true);
}

/** Pending login (password ok, waiting for 2FA/email code). */
function pending_login(): ?array
{
    $p = $_SESSION['pending_login'] ?? null;
    if (!$p || time() - $p['at'] > 900) { unset($_SESSION['pending_login']); return null; }
    return $p;
}

function finish_login(array $u, string $method): array
{
    $next = $_SESSION['pending_login']['next'] ?? '/';
    unset($_SESSION['pending_login']);
    session_regenerate_id(true);
    $_SESSION['uid'] = (int)$u['id'];
    $_SESSION['csrf'] = b64url_encode(random_bytes(32));
    insert('user_sessions', [
        'user_id' => $u['id'], 'session_hash' => hash('sha256', session_id()), 'ip' => client_ip(),
        'user_agent' => user_agent(), 'device' => device_label(),
    ]);
    $dh = device_hash();
    $isNewDevice = !val('SELECT 1 FROM user_devices WHERE user_id = ? AND device_hash = ?', [$u['id'], $dh]);
    q('INSERT INTO user_devices (user_id, device_hash, label) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE last_seen = NOW()', [$u['id'], $dh, device_label()]);
    q('UPDATE users SET last_login_at = NOW(), last_seen_at = NOW() WHERE id = ?', [$u['id']]);
    record_login((int)$u['id'], $u['email'], true, '', $method);
    current_user(true);

    $sec = row('SELECT login_notify FROM user_security WHERE user_id = ?', [$u['id']]);
    if ($isNewDevice && setting_bool('security.login_notify') && (!$sec || $sec['login_notify'])) {
        send_mail($u['email'], 'security_alert', [
            'name' => $u['name'], 'event' => t('mail.new_login', [], $u['lang'] ?: null),
            'detail' => device_label() . ' · IP ' . client_ip() . ' · ' . date('Y-m-d H:i'),
        ], $u['lang'] ?: null);
        notify_users([(int)$u['id']], [
            'type' => 'security', 'icon' => 'fa-shield-halved', 'link' => '/profile/security',
            'title_en' => 'New sign-in to your account', 'title_bn' => 'আপনার অ্যাকাউন্টে নতুন লগইন',
            'body_en' => device_label() . ' · ' . client_ip(), 'body_bn' => device_label() . ' · ' . client_ip(),
        ], ['push' => false]);
    }
    if ($u['lang'] && isset(LANGS[$u['lang']])) set_lang($u['lang']);
    if (is_staff($u) && str_starts_with($next, '/') && $next === '/') $next = '/admin';
    return ['step' => 'done', 'redirect' => url($next), 'full' => true, 'message' => t('auth.welcome_back', ['name' => $u['name']])];
}

function logout_user(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        q('UPDATE user_sessions SET revoked_at = NOW() WHERE session_hash = ?', [hash('sha256', session_id())]);
        $_SESSION = [];
        session_regenerate_id(true);
    }
}

// ---------------------------------------------------------------------
// One-time email tokens (verification, password reset, 2FA recovery)
// ---------------------------------------------------------------------
function create_email_token(int $uid, string $type, int $minutes): string
{
    q('UPDATE email_tokens SET used_at = NOW() WHERE user_id = ? AND type = ? AND used_at IS NULL', [$uid, $type]);
    $token = b64url_encode(random_bytes(32));
    insert('email_tokens', ['user_id' => $uid, 'type' => $type, 'token_hash' => token_hash($token), 'expires_at' => date('Y-m-d H:i:s', time() + $minutes * 60)]);
    return $token;
}

/** Validate (and optionally consume) a token. Returns the user id or null. */
function check_email_token(string $token, string $type, bool $consume = true): ?int
{
    if ($token === '' || strlen($token) > 100) return null;
    $r = row('SELECT * FROM email_tokens WHERE token_hash = ? AND type = ? AND used_at IS NULL AND expires_at > NOW()', [token_hash($token), $type]);
    if (!$r) return null;
    if ($consume) q('UPDATE email_tokens SET used_at = NOW() WHERE id = ?', [$r['id']]);
    return (int)$r['user_id'];
}

/** Login code check with attempt counter (6-digit codes are brute-forceable otherwise). */
function check_login_code(int $uid, string $code): bool
{
    $r = row("SELECT * FROM email_tokens WHERE user_id = ? AND type = 'login_code' AND used_at IS NULL AND expires_at > NOW() ORDER BY id DESC LIMIT 1", [$uid]);
    if (!$r) return false;
    if ($r['attempts'] >= 5) { q('UPDATE email_tokens SET used_at = NOW() WHERE id = ?', [$r['id']]); return false; }
    if (!hash_equals($r['token_hash'], token_hash(preg_replace('~\D~', '', $code)))) {
        q('UPDATE email_tokens SET attempts = attempts + 1 WHERE id = ?', [$r['id']]);
        return false;
    }
    q('UPDATE email_tokens SET used_at = NOW() WHERE id = ?', [$r['id']]);
    return true;
}

function send_verification_email(array $u): void
{
    $token = create_email_token((int)$u['id'], 'verify', 60 * 24);
    send_mail($u['email'], 'verify', ['name' => $u['name'], 'link' => abs_url('/verify-email?token=' . $token)], $u['lang'] ?: null, true);
}

// ---------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------
function audit(string $action, ?string $targetType = null, ?int $targetId = null, string $description = '', ?int $adminId = null): void
{
    try {
        insert('audit_logs', [
            'admin_id' => $adminId ?? (user()['id'] ?? null), 'action' => $action, 'target_type' => $targetType,
            'target_id' => $targetId, 'description' => mb_substr($description, 0, 500), 'ip' => client_ip(),
        ]);
    } catch (Throwable $e) {
        log_error($e);
    }
}
