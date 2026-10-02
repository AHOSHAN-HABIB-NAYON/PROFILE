<?php
/**
 * General helpers: escaping, URLs, request/response, formatting.
 */
defined('APP') || exit;

/** HTTP error that is rendered as a friendly page / JSON error. */
class HttpError extends RuntimeException {}

/** Escape for HTML output. */
function e(mixed $v): string
{
    return htmlspecialchars((string)($v ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Absolute-path URL inside the app, e.g. url('/news/5'). */
function url(string $path = '/'): string
{
    if (preg_match('~^(https?:)?//~i', $path)) return $path;
    return BASE_PATH . '/' . ltrim($path, '/');
}

/** Fully-qualified URL (for emails, OG tags, sitemap). */
function abs_url(string $path = '/'): string
{
    if (preg_match('~^https?://~i', $path)) return $path;
    return BASE_URL . '/' . ltrim($path, '/');
}

/** Versioned static asset URL for long-term browser caching. */
function asset(string $path): string
{
    $file = ROOT . '/assets/' . ltrim($path, '/');
    $v = is_file($file) ? (string)filemtime($file) : APP_VERSION;
    return url('/assets/' . ltrim($path, '/')) . '?v=' . $v;
}

/** URL for an uploaded/public media path stored in DB (assets/uploads/...). */
function media_url(?string $path, string $fallback = ''): string
{
    if (!$path) return $fallback;
    if (preg_match('~^https?://~i', $path)) return $path;
    return url('/' . ltrim($path, '/'));
}

function log_error(Throwable|string $e): void
{
    $msg = $e instanceof Throwable
        ? get_class($e) . ': ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine() . "\n" . $e->getTraceAsString()
        : $e;
    error_log('[' . date('c') . '] ' . $msg);
}

function abort(int $code, string $message = ''): never
{
    throw new HttpError($message, $code);
}

// ---------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------
function request_path(): string
{
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $uri = rawurldecode($uri);
    if (BASE_PATH !== '' && str_starts_with($uri, BASE_PATH)) $uri = substr($uri, strlen(BASE_PATH));
    $uri = '/' . trim($uri, '/');
    return $uri;
}

function is_post(): bool
{
    return ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
}

function is_ajax(): bool
{
    return ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') === 'fetch';
}

/** Trimmed POST/GET input as string. */
function input(string $key, string $default = ''): string
{
    $v = $_POST[$key] ?? $_GET[$key] ?? $default;
    if (is_array($v)) return $default;
    return trim(str_replace("\0", '', (string)$v));
}

function input_int(string $key, int $default = 0): int
{
    $v = $_POST[$key] ?? $_GET[$key] ?? null;
    return is_numeric($v) ? (int)$v : $default;
}

function input_bool(string $key): bool
{
    $v = $_POST[$key] ?? $_GET[$key] ?? '';
    return in_array($v, ['1', 'on', 'true', 'yes'], true);
}

function client_ip(): string
{
    // Only trust Cloudflare's header when the site is configured to sit behind it.
    if (!empty(ENV['behind_cloudflare']) && !empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        $ip = $_SERVER['HTTP_CF_CONNECTING_IP'];
    } else {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
}

function user_agent(): string
{
    return mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
}

// ---------------------------------------------------------------------
// JSON / redirect responses
// ---------------------------------------------------------------------
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

/**
 * Successful API response. Non-JS form posts get a flash + redirect instead
 * of raw JSON so the site keeps working without JavaScript.
 */
function ok(string $message = '', array $extra = []): never
{
    if (!is_ajax() && is_post()) {
        if ($message) flash('success', $message);
        redirect($extra['redirect'] ?? ($_SERVER['HTTP_REFERER'] ?? url('/')));
    }
    $data = array_merge(['ok' => true, 'message' => $message], $extra);
    if ($message !== '') $data['message'] = $message;
    json_out($data);
}

function fail(string $message, int $code = 422, array $errors = [], array $extra = []): never
{
    if (!is_ajax() && is_post()) {
        flash('error', $message);
        redirect($_SERVER['HTTP_REFERER'] ?? url('/'));
    }
    json_out(['ok' => false, 'message' => $message, 'errors' => $errors] + $extra, $code);
}

function redirect(string $to, int $code = 302): never
{
    if (!preg_match('~^https?://~i', $to) && !str_starts_with($to, BASE_PATH . '/')) $to = url($to);
    header('Location: ' . $to, true, $code);
    exit;
}

function flash(string $type, ?string $message = null): ?array
{
    if ($message !== null) {
        $_SESSION['_flash'][] = ['type' => $type, 'message' => $message];
        return null;
    }
    $all = $_SESSION['_flash'] ?? [];
    unset($_SESSION['_flash']);
    return $all;
}

/** Only allow local redirect targets (prevents open redirects). */
function safe_next(string $next, string $fallback = '/'): string
{
    if ($next === '' || !str_starts_with($next, '/') || str_starts_with($next, '//') || str_contains($next, '\\')) return $fallback;
    return $next;
}

// ---------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------
function bn_digits(string $s): string
{
    return strtr($s, ['0' => '০', '1' => '১', '2' => '২', '3' => '৩', '4' => '৪', '5' => '৫', '6' => '৬', '7' => '৭', '8' => '৮', '9' => '৯']);
}

/** Number localised for the current language. */
function num(float|int $n, int $dec = 0): string
{
    $s = number_format((float)$n, $dec);
    return lang() === 'bn' ? bn_digits($s) : $s;
}

function money(float|int|string|null $amount, string $currency = 'USD'): string
{
    $amount = (float)$amount;
    $dec = (floor($amount) == $amount) ? 0 : 2;
    if (strtoupper($currency) === 'BDT') return '৳' . num($amount, $dec);
    return '$' . num($amount, $dec);
}

function time_ago(?string $datetime): string
{
    if (!$datetime) return '';
    $ts = strtotime($datetime);
    $diff = max(0, time() - $ts);
    if ($diff < 60) return t('time.just_now');
    $units = [31536000 => 'year', 2592000 => 'month', 604800 => 'week', 86400 => 'day', 3600 => 'hour', 60 => 'minute'];
    foreach ($units as $secs => $unit) {
        if ($diff >= $secs) {
            $n = (int)floor($diff / $secs);
            return t('time.' . $unit . ($n > 1 ? 's' : ''), ['n' => num($n)]);
        }
    }
    return '';
}

function fmt_date(?string $datetime, bool $withTime = false): string
{
    if (!$datetime) return '—';
    $ts = strtotime($datetime);
    if (lang() === 'bn') {
        $months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
        $s = bn_digits(date('j', $ts)) . ' ' . $months[(int)date('n', $ts) - 1] . ' ' . bn_digits(date('Y', $ts));
        return $withTime ? $s . ', ' . bn_digits(date('g:i', $ts)) . (date('a', $ts) === 'am' ? ' AM' : ' PM') : $s;
    }
    return date($withTime ? 'M j, Y g:i A' : 'M j, Y', $ts);
}

function human_bytes(int|float $bytes): string
{
    $u = ['B', 'KB', 'MB', 'GB'];
    $i = 0;
    while ($bytes >= 1024 && $i < 3) { $bytes /= 1024; $i++; }
    return round($bytes, $i ? 1 : 0) . ' ' . $u[$i];
}

function slugify(string $s): string
{
    $s = mb_strtolower(trim($s));
    $s = preg_replace('~[^\p{L}\p{N}]+~u', '-', $s);
    $s = trim((string)$s, '-');
    // keep URLs ASCII-friendly: drop non-latin chars, fall back to random id
    $ascii = trim((string)preg_replace('~[^a-z0-9-]+~', '', $s), '-');
    $ascii = preg_replace('~-+~', '-', $ascii);
    return $ascii !== '' ? mb_substr($ascii, 0, 120) : 'item-' . bin2hex(random_bytes(3));
}

/** Split a textarea (one item per line) into a clean array. */
function lines(?string $text): array
{
    if (!$text) return [];
    return array_values(array_filter(array_map('trim', preg_split('~\r?\n~', $text)), fn($l) => $l !== ''));
}

/** Font Awesome class sanitiser – only allows "fa-..." tokens. */
function fa(?string $icon, string $fallback = 'fa-solid fa-circle'): string
{
    $icon = trim((string)$icon);
    if ($icon === '') return $fallback;
    $parts = array_filter(explode(' ', $icon), fn($p) => preg_match('~^fa[a-z0-9-]*$~', $p));
    if (!$parts) return $fallback;
    if (!array_intersect($parts, ['fa-solid', 'fa-regular', 'fa-brands', 'fas', 'far', 'fab'])) array_unshift($parts, 'fa-solid');
    return implode(' ', $parts);
}

function random_code(int $len = 8, string $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'): string
{
    $out = '';
    $max = strlen($alphabet) - 1;
    for ($i = 0; $i < $len; $i++) $out .= $alphabet[random_int(0, $max)];
    return $out;
}

function b64url_encode(string $bin): string
{
    return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
}

function b64url_decode(string $s): string
{
    return (string)base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4));
}

/** Small HTTP client used for OAuth / AI / push / reCAPTCHA. */
function http_request(string $method, string $url, array $opts = []): array
{
    $ch = curl_init($url);
    $headers = $opts['headers'] ?? [];
    $body = $opts['body'] ?? null;
    if (isset($opts['json'])) {
        $body = json_encode($opts['json'], JSON_UNESCAPED_UNICODE);
        $headers[] = 'Content-Type: application/json';
    } elseif (isset($opts['form'])) {
        $body = http_build_query($opts['form']);
        $headers[] = 'Content-Type: application/x-www-form-urlencoded';
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => $opts['timeout'] ?? 20,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $resp = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return ['status' => $status, 'body' => $resp === false ? '' : (string)$resp, 'error' => $err,
        'json' => $resp ? json_decode((string)$resp, true) : null];
}

/** Effective price of a product in a currency (discount applied). */
function product_price(array $p, string $cur): float
{
    $usd = (float)$p['price_usd'];
    $bdt = $p['price_bdt'] !== null && (float)$p['price_bdt'] > 0 ? (float)$p['price_bdt'] : round($usd * (float)setting('usd_bdt_rate', 122));
    $base = $cur === 'BDT' ? $bdt : $usd;
    $d = max(0, min(100, (float)$p['discount_percent']));
    $v = $base * (1 - $d / 100);
    return $cur === 'BDT' ? round($v) : round($v, 2);
}

/** Send the response to the browser now and keep working in the background (FPM / LiteSpeed). */
function finish_response(): void
{
    if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
    elseif (function_exists('litespeed_finish_request')) @litespeed_finish_request();
}
