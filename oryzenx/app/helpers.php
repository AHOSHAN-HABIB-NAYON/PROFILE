<?php
// ---------- Output / escaping ----------
function e(mixed $s): string { return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

function json_out(array $data, int $code = 200): never
{
    if (!headers_sent()) {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

/** Unified response for form posts: JSON for fetch(), flash + redirect for plain HTML forms. */
function respond(bool $ok, string $message = '', ?string $redirect = null, array $extra = []): never
{
    if (is_json_request()) {
        json_out(['ok' => $ok, 'message' => $message] + ($redirect !== null ? ['redirect' => url($redirect)] : []) + $extra, $ok ? 200 : 422);
    }
    if ($message !== '') Session::flash($ok ? 'success' : 'error', $message);
    redirect($redirect ?? ($_SERVER['HTTP_REFERER'] ?? '/'), $redirect === null);
}

function fail(string $message, array $errors = [], int $code = 422): never
{
    if (is_json_request()) json_out(['ok' => false, 'message' => $message, 'errors' => $errors], $code);
    Session::flash('error', $message);
    redirect($_SERVER['HTTP_REFERER'] ?? '/', true);
}

function redirect(string $to, bool $absolute = false): never
{
    $target = ($absolute || preg_match('#^https?://#', $to)) ? $to : url($to);
    if (is_spa() || is_json_request()) json_out(['ok' => true, 'redirect' => $target]);
    header('Location: ' . $target, true, 302);
    exit;
}

// ---------- Request ----------
function is_https(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
        || ($_SERVER['SERVER_PORT'] ?? '') === '443';
}
function is_spa(): bool { return ($_SERVER['HTTP_X_SPA'] ?? '') === '1'; }
function is_json_request(): bool
{
    return is_spa() || ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'fetch'
        || str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');
}
function input(string $key, mixed $default = ''): mixed
{
    $v = $_POST[$key] ?? $_GET[$key] ?? $default;
    return is_string($v) ? trim($v) : $v;
}
function input_int(string $key, int $default = 0): int { return filter_var(input($key, $default), FILTER_VALIDATE_INT) !== false ? (int)input($key) : $default; }
function json_body(): array
{
    static $b = null;
    if ($b === null) { $b = json_decode(file_get_contents('php://input') ?: '[]', true); if (!is_array($b)) $b = []; }
    return $b;
}
function client_ip(): string
{
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
}
function user_agent(): string { return (string)($_SERVER['HTTP_USER_AGENT'] ?? ''); }

// ---------- URLs ----------
function base_path(): string
{
    static $b = null;
    if ($b === null) {
        $b = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
        if ($b === '.' ) $b = '';
    }
    return $b;
}
function base_url(): string { return (is_https() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . base_path(); }
function url(string $path = '/'): string
{
    if (preg_match('#^(https?:)?//#', $path)) return $path;
    return base_path() . '/' . ltrim($path, '/');
}
function abs_url(string $path): string { return preg_match('#^https?://#', $path) ? $path : (is_https() ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $path; }
function asset(string $path): string
{
    $file = ROOT . '/assets/' . $path;
    return url('/assets/' . $path) . (is_file($file) ? '?v=' . filemtime($file) : '');
}
function upload_url(?string $path): string { return $path ? url('/assets/uploads/' . ltrim($path, '/')) : ''; }
function current_path(): string
{
    $p = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $b = base_path();
    if ($b !== '' && str_starts_with($p, $b)) $p = substr($p, strlen($b));
    return '/' . trim($p, '/');
}
function current_path_with_query(): string
{
    $q = $_SERVER['QUERY_STRING'] ?? '';
    return current_path() . ($q !== '' ? '?' . $q : '');
}
function safe_redirect_path(?string $p, string $fallback = '/'): string
{
    return ($p && str_starts_with($p, '/') && !str_starts_with($p, '//')) ? $p : $fallback;
}

// ---------- App state ----------
function setting(string $key, mixed $default = ''): mixed { return Settings::get($key, $default); }
function auth(): ?array { return Auth::user(); }
function is_admin(): bool { return Auth::isAdmin(); }
function csrf_token(): string { return Csrf::token(); }
function csrf_field(): string { return '<input type="hidden" name="_csrf" value="' . e(Csrf::token()) . '">'; }
function now(): string { return date('Y-m-d H:i:s'); }

// ---------- i18n ----------
function lang(): string { return Lang::current(); }
function t(string $key, array $repl = []): string { return Lang::get($key, $repl); }
/** Picks the Bengali column (field_bn) when the UI is in Bengali and it is filled. */
function tr(array $row, string $field): string
{
    if (lang() === 'bn' && !empty($row[$field . '_bn'])) return (string)$row[$field . '_bn'];
    return (string)($row[$field] ?? '');
}
function sl(string $key): string { return (string)(lang() === 'bn' && setting($key . '_bn') !== '' ? setting($key . '_bn') : setting($key)); }
function num(mixed $n): string
{
    $s = (string)$n;
    if (lang() === 'bn' && setting('bengali_digits') === '1') $s = strtr($s, ['0' => '০', '1' => '১', '2' => '২', '3' => '৩', '4' => '৪', '5' => '৫', '6' => '৬', '7' => '৭', '8' => '৮', '9' => '৯']);
    return $s;
}
function money(float|string|null $amount, string $currency = 'USD', bool $plus = false): string
{
    $a = (float)$amount;
    $fmt = number_format($a, fmod($a, 1.0) == 0.0 ? 0 : 2);
    $s = $currency === 'BDT' ? '৳' . $fmt : '$' . $fmt;
    return num($s . ($plus ? '+' : ''));
}
function time_ago(?string $dt): string
{
    if (!$dt) return '';
    $d = max(0, time() - strtotime($dt));
    [$n, $u] = match (true) {
        $d < 60 => [0, 'now'],
        $d < 3600 => [intdiv($d, 60), 'm'],
        $d < 86400 => [intdiv($d, 3600), 'h'],
        $d < 2592000 => [intdiv($d, 86400), 'd'],
        $d < 31536000 => [intdiv($d, 2592000), 'mo'],
        default => [intdiv($d, 31536000), 'y'],
    };
    return $u === 'now' ? t('time.now') : num($n) . t('time.' . $u);
}
function fmt_date(?string $dt, bool $time = false): string
{
    if (!$dt) return '—';
    $ts = strtotime($dt);
    $s = date('d M Y' . ($time ? ', h:i A' : ''), $ts);
    if (lang() === 'bn') {
        $s = strtr($s, ['Jan' => 'জানু', 'Feb' => 'ফেব্রু', 'Mar' => 'মার্চ', 'Apr' => 'এপ্রি', 'May' => 'মে', 'Jun' => 'জুন', 'Jul' => 'জুলা',
            'Aug' => 'আগ', 'Sep' => 'সেপ্টে', 'Oct' => 'অক্টো', 'Nov' => 'নভে', 'Dec' => 'ডিসে', 'AM' => 'AM', 'PM' => 'PM']);
    }
    return num($s);
}

// ---------- Misc ----------
function slugify(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = preg_replace('/[^\p{L}\p{M}\p{N}]+/u', '-', $s);
    return trim(mb_substr((string)$s, 0, 120), '-') ?: bin2hex(random_bytes(4));
}
function str_limit(?string $s, int $n): string { $s = trim(strip_tags((string)$s)); return mb_strlen($s) > $n ? rtrim(mb_substr($s, 0, $n - 1)) . '…' : $s; }
function fmt_bytes(int|float $b): string
{
    $u = ['B', 'KB', 'MB', 'GB']; $i = 0;
    while ($b >= 1024 && $i < 3) { $b /= 1024; $i++; }
    return round($b, $i ? 1 : 0) . ' ' . $u[$i];
}
function initials(string $name): string { return mb_strtoupper(mb_substr(trim($name) ?: '?', 0, 1)); }
function country_flag(?string $cc): string
{
    if (!$cc || !preg_match('/^[A-Z]{2}$/', $cc)) return '🌐';
    return mb_chr(0x1F1E6 + ord($cc[0]) - 65) . mb_chr(0x1F1E6 + ord($cc[1]) - 65);
}
/** Font Awesome icon or uploaded image icon. Only safe class characters are allowed. */
function icon_html(?string $fa, ?string $image = null, string $extra = ''): string
{
    if ($image) return '<img src="' . e(upload_url($image)) . '" alt="" class="ic-img ' . e($extra) . '" loading="lazy" width="22" height="22">';
    $fa = preg_replace('/[^a-z0-9\- ]/', '', strtolower((string)$fa)) ?: 'fa-solid fa-code';
    if (!str_contains($fa, 'fa-solid') && !str_contains($fa, 'fa-brands') && !str_contains($fa, 'fa-regular')) $fa = 'fa-solid ' . $fa;
    return '<i class="' . $fa . ' ' . e($extra) . '" aria-hidden="true"></i>';
}
function status_badge(string $status): string
{
    $map = ['pending' => 'warning', 'approved' => 'success', 'completed' => 'success', 'rejected' => 'danger', 'cancelled' => 'danger',
        'refunded' => 'muted', 'processing' => 'info', 'active' => 'success', 'banned' => 'danger', 'suspended' => 'danger',
        'published' => 'success', 'draft' => 'muted', 'new' => 'info', 'read' => 'muted', 'replied' => 'success', 'closed' => 'muted'];
    return '<span class="badge badge-' . ($map[$status] ?? 'muted') . '">' . e(t('status.' . $status)) . '</span>';
}
function avatar_html(array $u, string $size = ''): string
{
    if (!empty($u['avatar'])) return '<img class="avatar ' . $size . '" src="' . e(upload_url($u['avatar'])) . '" alt="">';
    $hue = crc32((string)($u['email'] ?? $u['name'] ?? '')) % 360;
    return '<span class="avatar ' . $size . '" style="--h:' . $hue . '">' . e(initials((string)($u['name'] ?? '?'))) . '</span>';
}
function emoji_fx(string $html): string
{
    // Subtle animation for a few highlight emojis inside rich content.
    return preg_replace('/(🔥|🚀|📈|⚡|👑|✅|❌)/u', '<span class="fx-emoji">$1</span>', $html);
}
function paginate_links(array $p, string $base): string
{
    if ($p['pages'] <= 1) return '';
    $sep = str_contains($base, '?') ? '&' : '?';
    $h = '<nav class="pager" aria-label="Pagination">';
    if ($p['page'] > 1) $h .= '<a class="btn btn-sm btn-ghost" href="' . e(url($base . $sep . 'page=' . ($p['page'] - 1))) . '"><i class="fa-solid fa-chevron-left"></i></a>';
    $h .= '<span class="pager-info">' . num($p['page']) . ' / ' . num($p['pages']) . '</span>';
    if ($p['page'] < $p['pages']) $h .= '<a class="btn btn-sm btn-ghost" href="' . e(url($base . $sep . 'page=' . ($p['page'] + 1))) . '"><i class="fa-solid fa-chevron-right"></i></a>';
    return $h . '</nav>';
}
function validate(array $rules): array
{
    $errors = [];
    foreach ($rules as $field => $spec) {
        $v = input($field);
        foreach (explode('|', $spec) as $r) {
            [$name, $arg] = array_pad(explode(':', $r, 2), 2, null);
            $bad = match ($name) {
                'required' => $v === '' || $v === null,
                'email' => $v !== '' && !filter_var($v, FILTER_VALIDATE_EMAIL),
                'max' => mb_strlen((string)$v) > (int)$arg,
                'min' => $v !== '' && mb_strlen((string)$v) < (int)$arg,
                'numeric' => $v !== '' && !is_numeric($v),
                'url' => $v !== '' && !filter_var($v, FILTER_VALIDATE_URL),
                'in' => $v !== '' && !in_array($v, explode(',', (string)$arg), true),
                default => false,
            };
            if ($bad) { $errors[$field] = t('valid.' . $name, ['n' => (string)$arg]); break; }
        }
    }
    if ($errors) fail(t('valid.fix'), $errors);
    return $errors;
}
