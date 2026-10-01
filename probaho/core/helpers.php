<?php
/**
 * Global helper functions shared by pages, API handlers and the admin panel.
 */
declare(strict_types=1);

function config(string $key, $default = null)
{
    $value = $GLOBALS['CONFIG'];
    foreach (explode('.', $key) as $part) {
        if (!is_array($value) || !array_key_exists($part, $value)) {
            return $default;
        }
        $value = $value[$part];
    }
    return $value;
}

function db(): DB
{
    return DB::instance();
}

function setting(string $key, $default = '')
{
    return Settings::get($key, $default);
}

function setting_on(string $key): bool
{
    return (string) Settings::get($key, '0') === '1';
}

function e($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Escape + keep line breaks for admin-authored plain text. */
function nl2p(?string $text): string
{
    $text = trim((string) $text);
    if ($text === '') {
        return '';
    }
    $out = '';
    foreach (preg_split("/\n{2,}/", str_replace("\r", '', $text)) as $para) {
        $out .= '<p>' . nl2br(e($para), false) . '</p>';
    }
    return linkify($out);
}

/** Turn bare https links in already-escaped HTML into anchors. */
function linkify(string $html): string
{
    return (string) preg_replace(
        '~(?<!["\'=])\bhttps?://[^\s<]+~u',
        '<a href="$0" target="_blank" rel="noopener">$0</a>',
        $html
    );
}

function is_https(): bool
{
    if (config('force_https')) {
        return true;
    }
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        return true;
    }
    return (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

/** URL path prefix when installed in a sub-folder ('' at domain root). */
function base_path(): string
{
    static $base = null;
    if ($base === null) {
        $script = str_replace('\\', '/', $_SERVER['SCRIPT_NAME'] ?? '/index.php');
        $base = rtrim(dirname($script), '/.');
    }
    return $base;
}

function origin(): string
{
    $configured = rtrim((string) config('base_url', ''), '/');
    if ($configured !== '') {
        $p = parse_url($configured);
        return ($p['scheme'] ?? 'https') . '://' . ($p['host'] ?? '') . (isset($p['port']) ? ':' . $p['port'] : '');
    }
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return (is_https() ? 'https' : 'http') . '://' . $host;
}

function rp_id(): string
{
    return (string) parse_url(origin(), PHP_URL_HOST);
}

function url(string $path = '/'): string
{
    if (preg_match('~^https?://~', $path)) {
        return $path;
    }
    return base_path() . '/' . ltrim($path, '/');
}

function abs_url(string $path = '/'): string
{
    return preg_match('~^https?://~', $path) ? $path : origin() . url($path);
}

function asset(string $path): string
{
    $file = ROOT . '/assets/' . ltrim($path, '/');
    $v = is_file($file) ? substr(md5((string) filemtime($file)), 0, 8) : '1';
    return url('assets/' . ltrim($path, '/')) . '?v=' . $v;
}

/** Public URL for an uploaded file or a configurable branding image with fallback. */
function upload_url(?string $path, string $fallback = ''): string
{
    $path = (string) $path;
    if ($path === '') {
        return $fallback;
    }
    return preg_match('~^https?://~', $path) ? $path : url($path);
}

function brand_logo(): string
{
    return upload_url(setting('logo'), url('assets/images/logo.svg'));
}

function client_ip(): string
{
    return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

function user_agent(): string
{
    return mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
}

function now(): string
{
    return date('Y-m-d H:i:s');
}

function is_spa(): bool
{
    return ($_SERVER['HTTP_X_SPA'] ?? '') === '1';
}

function is_api_request(): bool
{
    $uri = (string) ($_SERVER['REQUEST_URI'] ?? '');
    return is_spa()
        || str_contains($uri, '/api/')
        || str_contains((string) ($_SERVER['HTTP_ACCEPT'] ?? ''), 'application/json');
}

function json_out(array $data, int $status = 200): void
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ok(array $data = [], string $message = ''): void
{
    json_out(['ok' => true, 'message' => $message] + $data);
}

function fail(string $message, int $status = 422, array $extra = []): void
{
    json_out(['ok' => false, 'message' => $message] + $extra, $status);
}

function redirect(string $to, int $code = 302): void
{
    $target = url($to);
    if (is_spa()) {
        json_out(['ok' => true, 'redirect' => $target]);
    }
    header('Location: ' . $target, true, $code);
    exit;
}

/** Request input — merges JSON body, POST and GET (in that priority). */
function input(?string $key = null, $default = null)
{
    static $data = null;
    if ($data === null) {
        $data = $_GET;
        $data = array_merge($data, $_POST);
        if (str_contains((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) {
            $json = json_decode((string) file_get_contents('php://input'), true);
            if (is_array($json)) {
                $data = array_merge($data, $json);
            }
        }
    }
    if ($key === null) {
        return $data;
    }
    $v = $data[$key] ?? $default;
    return is_string($v) ? trim($v) : $v;
}

function input_str(string $key, int $max = 500): string
{
    $v = input($key, '');
    return is_scalar($v) ? mb_substr(trim((string) $v), 0, $max) : '';
}

function input_int(string $key, int $default = 0): int
{
    $v = input($key, $default);
    return is_numeric($v) ? (int) $v : $default;
}

function input_bool(string $key): bool
{
    $v = input($key, '0');
    return in_array($v, [1, '1', 'on', 'true', true], true);
}

function input_money(string $key): float
{
    $v = str_replace([',', ' '], '', (string) input($key, '0'));
    $v = bn_to_en_digits($v);
    return is_numeric($v) ? round((float) $v, 2) : 0.0;
}

function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . e(csrf_token()) . '">';
}

function csrf_verify(): bool
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? (string) input('_csrf', '');
    return is_string($token) && $token !== '' && hash_equals(csrf_token(), $token);
}

function require_post(): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        fail('অনুরোধটি সঠিক নয়।', 405);
    }
    if (!csrf_verify()) {
        fail('সেশনের মেয়াদ শেষ হয়েছে। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।', 419);
    }
}

function random_code(int $length = 10, string $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'): string
{
    $out = '';
    $max = strlen($alphabet) - 1;
    for ($i = 0; $i < $length; $i++) {
        $out .= $alphabet[random_int(0, $max)];
    }
    return $out;
}

function b64url_encode(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function b64url_decode(string $str): string
{
    $str = strtr($str, '-_', '+/');
    $pad = strlen($str) % 4;
    if ($pad) {
        $str .= str_repeat('=', 4 - $pad);
    }
    return (string) base64_decode($str, true);
}

function slugify(string $text): string
{
    $slug = strtolower(trim((string) preg_replace('~[^\pL\pN]+~u', '-', $text), '-'));
    $ascii = preg_replace('~[^a-z0-9-]~', '', (string) iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $slug));
    $ascii = trim((string) preg_replace('~-+~', '-', (string) $ascii), '-');
    return $ascii !== '' ? $ascii : 'item-' . strtolower(random_code(6));
}

// ---- Formatting ------------------------------------------------------

function bn_digits($value): string
{
    return strtr((string) $value, ['0' => '০', '1' => '১', '2' => '২', '3' => '৩', '4' => '৪', '5' => '৫', '6' => '৬', '7' => '৭', '8' => '৮', '9' => '৯']);
}

function bn_to_en_digits(string $value): string
{
    return strtr($value, ['০' => '0', '১' => '1', '২' => '2', '৩' => '3', '৪' => '4', '৫' => '5', '৬' => '6', '৭' => '7', '৮' => '8', '৯' => '9']);
}

function money($amount, bool $symbol = true): string
{
    $formatted = number_format((float) $amount, 2);
    return $symbol ? setting('currency_symbol', '$') . $formatted : $formatted;
}

function currency(): string
{
    return (string) setting('currency_code', 'USDT');
}

function bn_date(?string $datetime, bool $withTime = true): string
{
    if (!$datetime) {
        return '—';
    }
    $ts = strtotime($datetime);
    if (!$ts) {
        return '—';
    }
    $months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
    $out = bn_digits(date('j', $ts)) . ' ' . $months[(int) date('n', $ts) - 1] . ' ' . bn_digits(date('Y', $ts));
    if ($withTime) {
        $out .= ', ' . bn_digits(date('g:i', $ts)) . (date('A', $ts) === 'AM' ? ' AM' : ' PM');
    }
    return $out;
}

function time_ago(?string $datetime): string
{
    if (!$datetime) {
        return '';
    }
    $diff = time() - (int) strtotime($datetime);
    if ($diff < 60) {
        return 'এইমাত্র';
    }
    if ($diff < 3600) {
        return bn_digits((string) floor($diff / 60)) . ' মিনিট আগে';
    }
    if ($diff < 86400) {
        return bn_digits((string) floor($diff / 3600)) . ' ঘণ্টা আগে';
    }
    if ($diff < 86400 * 7) {
        return bn_digits((string) floor($diff / 86400)) . ' দিন আগে';
    }
    return bn_date($datetime, false);
}

function greeting(): string
{
    $h = (int) date('G');
    if ($h < 5) {
        return 'শুভ রাত্রি';
    }
    if ($h < 12) {
        return 'শুভ সকাল';
    }
    if ($h < 17) {
        return 'শুভ দুপুর';
    }
    if ($h < 20) {
        return 'শুভ সন্ধ্যা';
    }
    return 'শুভ রাত্রি';
}

function status_badge(string $status): string
{
    $map = [
        'pending'   => ['অপেক্ষমাণ', 'warn'],
        'success'   => ['সফল', 'ok'],
        'failed'    => ['ব্যর্থ', 'err'],
        'expired'   => ['মেয়াদোত্তীর্ণ', 'muted'],
        'cancelled' => ['বাতিল', 'muted'],
        'reviewing' => ['পর্যালোচনায়', 'info'],
        'resolved'  => ['সমাধান হয়েছে', 'ok'],
        'rejected'  => ['প্রত্যাখ্যাত', 'err'],
        'active'    => ['সক্রিয়', 'ok'],
        'suspended' => ['স্থগিত', 'err'],
        'published' => ['প্রকাশিত', 'ok'],
        'draft'     => ['খসড়া', 'muted'],
    ];
    [$label, $tone] = $map[$status] ?? [ucfirst($status), 'muted'];
    return '<span class="badge badge-' . $tone . '">' . e($label) . '</span>';
}

function tx_type_label(string $type, string $direction = ''): string
{
    $map = ['deposit' => 'জমা', 'withdraw' => 'উত্তোলন', 'payment' => 'পেমেন্ট', 'transfer' => $direction === 'credit' ? 'টাকা গ্রহণ' : 'ট্রান্সফার'];
    return $map[$type] ?? $type;
}

function tx_type_icon(string $type, string $direction = ''): string
{
    $map = ['deposit' => 'arrow-down', 'withdraw' => 'arrow-up', 'payment' => 'card', 'transfer' => $direction === 'credit' ? 'arrow-down-left' : 'send'];
    return $map[$type] ?? 'swap';
}

function icon(string $name, string $class = ''): string
{
    return Icons::svg($name, $class);
}

/** Render a service/payment icon: either a built-in icon key or an uploaded image path. */
function media_icon(?string $value, string $class = ''): string
{
    $value = (string) $value;
    if ($value !== '' && (str_contains($value, '/') || str_contains($value, '.'))) {
        return '<img src="' . e(upload_url($value)) . '" alt="" class="' . e($class) . '" loading="lazy" decoding="async">';
    }
    return icon($value !== '' ? $value : 'grid', $class);
}

function mask_email(string $email): string
{
    [$name, $domain] = array_pad(explode('@', $email, 2), 2, '');
    return mb_substr($name, 0, 2) . str_repeat('•', max(2, mb_strlen($name) - 2)) . '@' . $domain;
}

function device_label(string $ua): string
{
    $os = 'Unknown';
    foreach (['Android' => 'Android', 'iPhone' => 'iPhone', 'iPad' => 'iPad', 'Windows' => 'Windows', 'Mac OS' => 'macOS', 'CrOS' => 'ChromeOS', 'Linux' => 'Linux'] as $needle => $label) {
        if (stripos($ua, $needle) !== false) {
            $os = $label;
            break;
        }
    }
    $browser = 'Browser';
    foreach (['Edg/' => 'Edge', 'OPR/' => 'Opera', 'SamsungBrowser' => 'Samsung Internet', 'Firefox' => 'Firefox', 'CriOS' => 'Chrome', 'Chrome' => 'Chrome', 'Safari' => 'Safari'] as $needle => $label) {
        if (stripos($ua, $needle) !== false) {
            $browser = $label;
            break;
        }
    }
    return $browser . ' · ' . $os;
}

function error_page_html(string $message): string
{
    $home = e(url('/'));
    return '<!doctype html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<title>সাময়িক সমস্যা</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,"Hind Siliguri",sans-serif;background:#f6f7fb;color:#111827;padding:16px}'
        . '.c{max-width:420px;text-align:center;background:#fff;border-radius:20px;padding:32px 24px;box-shadow:0 10px 30px rgba(17,24,39,.08)}'
        . '.i{width:56px;height:56px;border-radius:16px;background:#fff1f2;color:#e11d48;display:grid;place-items:center;margin:0 auto 16px;font-size:28px}'
        . 'a{display:inline-block;margin-top:18px;background:#5b4bff;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600}'
        . '@media (prefers-color-scheme:dark){body{background:#0b0d17;color:#e5e7eb}.c{background:#151827}}</style></head>'
        . '<body><div class="c"><div class="i">!</div><h1 style="font-size:20px;margin:0 0 8px">সাময়িক সমস্যা</h1><p style="margin:0;color:#6b7280;line-height:1.7">' . e($message) . '</p>'
        . '<a href="' . $home . '">হোমে ফিরে যান</a></div></body></html>';
}

/** Validate password against admin-configured policy. Returns an error message or null. */
function password_policy_error(string $password): ?string
{
    $min = max(6, (int) setting('security_password_min', '8'));
    if (mb_strlen($password) < $min) {
        return 'পাসওয়ার্ড কমপক্ষে ' . bn_digits((string) $min) . ' অক্ষরের হতে হবে।';
    }
    if (setting_on('security_password_strong') && (!preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password))) {
        return 'পাসওয়ার্ডে অন্তত একটি অক্ষর ও একটি সংখ্যা থাকতে হবে।';
    }
    return null;
}

function normalize_phone(string $phone): string
{
    $phone = bn_to_en_digits($phone);
    $digits = preg_replace('/[^\d+]/', '', $phone);
    if (preg_match('/^01\d{9}$/', (string) $digits)) {
        return '+88' . $digits;
    }
    if (preg_match('/^8801\d{9}$/', (string) $digits)) {
        return '+' . $digits;
    }
    return (string) $digits;
}

/** Only allow site-relative paths for redirects (prevents open-redirect). */
function safe_next(?string $next, string $fallback = '/dashboard'): string
{
    $next = (string) $next;
    if ($next === '' || !str_starts_with($next, '/') || str_starts_with($next, '//') || str_contains($next, '\\')) {
        return $fallback;
    }
    $base = base_path();
    if ($base !== '' && str_starts_with($next, $base . '/')) {
        $next = substr($next, strlen($base));
    }
    return $next;
}

/** For API handlers: the logged-in user or a 401 JSON error. */
function api_user(): array
{
    $u = Auth::user();
    if (!$u) {
        fail('অনুগ্রহ করে আবার লগইন করুন।', 401, ['redirect' => url('/login')]);
    }
    return $u;
}

/** Block money movement until the e-mail is verified (when required by Admin). */
function require_verified(array $user): void
{
    if (Auth::needsVerification($user)) {
        fail('লেনদেনের আগে আপনার ইমেইল ভেরিফাই করুন। প্রোফাইল থেকে ভেরিফিকেশন লিংক পাঠাতে পারবেন।');
    }
}

/** Create a one-time token row and return the raw token. */
function issue_user_token(int $userId, string $type, int $ttlSeconds): string
{
    db()->q('DELETE FROM user_tokens WHERE user_id = ? AND type = ?', [$userId, $type]);
    $raw = b64url_encode(random_bytes(32));
    db()->insert('user_tokens', ['user_id' => $userId, 'type' => $type, 'token_hash' => hash('sha256', $raw), 'expires_at' => date('Y-m-d H:i:s', time() + $ttlSeconds)]);
    return $raw;
}

function send_verification_email(array $user): void
{
    $token = issue_user_token((int) $user['id'], 'verify_email', 86400);
    Mailer::sendTemplate($user['email'], 'verify_email', ['name' => $user['name'], 'url' => abs_url('/verify-email?token=' . $token)]);
}
