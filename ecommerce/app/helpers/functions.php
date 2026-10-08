<?php
/**
 * Global helper functions used by views, controllers and services.
 */

/** HTML-escape for output. */
function e(mixed $value): string
{
    return htmlspecialchars((string)($value ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Escape for use inside a JSON <script> data block. */
function json_attr(mixed $value): string
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?: 'null';
}

function config(string $key, mixed $default = null): mixed
{
    static $config = null;
    $config ??= require APP_PATH . '/config/app.php';
    return $config[$key] ?? $default;
}

function setting(string $key, mixed $default = null): mixed
{
    return Setting::get($key, $default);
}

function base_path(): string
{
    return Request::current()->basePath;
}

/** Site origin + base path, e.g. https://shop.com or https://shop.com/store */
function base_url(): string
{
    if (defined('APP_URL') && APP_URL !== '') {
        return rtrim(APP_URL, '/');
    }
    $r = Request::current();
    $host = preg_replace('/[^a-z0-9.:\-\[\]]/i', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    return ($r->isSecure() ? 'https' : 'http') . '://' . $host . $r->basePath;
}

/** Root-relative URL inside the app. */
function url(string $path = '/', array $query = []): string
{
    $path = '/' . ltrim($path, '/');
    $q = array_filter($query, static fn($v) => $v !== null && $v !== '');
    return base_path() . ($path === '/' && base_path() !== '' ? '' : $path) . ($q ? '?' . http_build_query($q) : '');
}

function absolute_url(string $pathOrUrl): string
{
    if (preg_match('#^https?://#i', $pathOrUrl)) {
        return $pathOrUrl;
    }
    $origin = preg_replace('#^(https?://[^/]+).*$#', '$1', base_url());
    if (base_path() !== '' && str_starts_with($pathOrUrl, base_path() . '/')) {
        return $origin . $pathOrUrl;
    }
    return base_url() . '/' . ltrim($pathOrUrl, '/');
}

/** Versioned static asset URL from /public/assets (cache-busted by mtime). */
function asset(string $path): string
{
    static $versions = [];
    $file = PUBLIC_PATH . '/assets/' . ltrim($path, '/');
    $versions[$path] ??= is_file($file) ? (string)filemtime($file) : '1';
    return base_path() . '/assets/' . ltrim($path, '/') . '?v=' . $versions[$path];
}

function admin_asset(string $path): string
{
    static $versions = [];
    $file = ADMIN_PATH . '/assets/' . ltrim($path, '/');
    $versions[$path] ??= is_file($file) ? (string)filemtime($file) : '1';
    return base_path() . '/admin/assets/' . ltrim($path, '/') . '?v=' . $versions[$path];
}

/** Public URL for an uploaded file path (relative to public/uploads). */
function upload_url(?string $path): string
{
    if (!$path) {
        return '';
    }
    if (preg_match('#^https?://#i', $path)) {
        return $path;
    }
    return base_path() . '/uploads/' . ltrim($path, '/');
}

/** URL of a resized image variant: base "products/2026/10/ab12" + size "md" → …-md.webp */
function image_url(?string $base, string $size = 'md', string $ext = 'webp'): string
{
    if (!$base) {
        return asset('images/placeholder.svg');
    }
    return upload_url($base . '-' . $size . '.' . $ext);
}

/** srcset string for a resized image. */
function image_srcset(?string $base, string $type = 'product', string $ext = 'webp'): string
{
    if (!$base) {
        return '';
    }
    $parts = [];
    foreach (config('image_sizes')[$type] as $size => $width) {
        $parts[] = image_url($base, $size, $ext) . ' ' . $width . 'w';
    }
    return implode(', ', $parts);
}

function bn_digits(string|int|float $value): string
{
    return strtr((string)$value, ['0' => '০', '1' => '১', '2' => '২', '3' => '৩', '4' => '৪', '5' => '৫', '6' => '৬', '7' => '৭', '8' => '৮', '9' => '৯']);
}

function en_digits(string $value): string
{
    return strtr($value, ['০' => '0', '১' => '1', '২' => '2', '৩' => '3', '৪' => '4', '৫' => '5', '৬' => '6', '৭' => '7', '৮' => '8', '৯' => '9']);
}

/** Money for customers, e.g. ৳১,২৫০ */
function money(float|int|string|null $amount, bool $symbol = true): string
{
    $amount = (float)$amount;
    $formatted = number_format($amount, fmod($amount, 1.0) == 0.0 ? 0 : 2);
    if (setting('bengali_digits', '1') === '1') {
        $formatted = bn_digits($formatted);
    }
    return ($symbol ? setting('currency_symbol', '৳') : '') . $formatted;
}

/** Money for admin screens — always Latin digits. */
function money_en(float|int|string|null $amount): string
{
    $amount = (float)$amount;
    return '৳' . number_format($amount, fmod($amount, 1.0) == 0.0 ? 0 : 2);
}

function num(int|float|string $n): string
{
    return setting('bengali_digits', '1') === '1' ? bn_digits((string)$n) : (string)$n;
}

/** Normalize a Bangladeshi mobile number to 01XXXXXXXXX, or null if invalid. */
function normalize_phone(string $phone): ?string
{
    $digits = preg_replace('/\D+/', '', en_digits($phone));
    if (str_starts_with($digits, '880')) {
        $digits = substr($digits, 2);
    } elseif (str_starts_with($digits, '88') && strlen($digits) === 13) {
        $digits = substr($digits, 2);
    }
    return preg_match('/^01[3-9]\d{8}$/', $digits) ? $digits : null;
}

function mask_phone(string $phone): string
{
    return strlen($phone) >= 11 ? substr($phone, 0, 3) . '*****' . substr($phone, -3) : '***';
}

/** Remove control characters (keeps newlines/tabs) and invalid UTF-8. */
function clean_text(string $value): string
{
    $value = mb_convert_encoding($value, 'UTF-8', 'UTF-8');
    return preg_replace('/[^\P{C}\n\t\x{200C}\x{200D}]/u', '', $value) ?? '';
}

/** URL slug with Bengali transliteration so Bengali names produce readable slugs. */
function slugify(string $text): string
{
    static $map = [
        'অ' => 'o', 'আ' => 'a', 'ই' => 'i', 'ঈ' => 'i', 'উ' => 'u', 'ঊ' => 'u', 'ঋ' => 'ri', 'এ' => 'e', 'ঐ' => 'oi', 'ও' => 'o', 'ঔ' => 'ou',
        'ক' => 'k', 'খ' => 'kh', 'গ' => 'g', 'ঘ' => 'gh', 'ঙ' => 'ng', 'চ' => 'ch', 'ছ' => 'chh', 'জ' => 'j', 'ঝ' => 'jh', 'ঞ' => 'n',
        'ট' => 't', 'ঠ' => 'th', 'ড' => 'd', 'ঢ' => 'dh', 'ণ' => 'n', 'ত' => 't', 'থ' => 'th', 'দ' => 'd', 'ধ' => 'dh', 'ন' => 'n',
        'প' => 'p', 'ফ' => 'f', 'ব' => 'b', 'ভ' => 'bh', 'ম' => 'm', 'য' => 'j', 'র' => 'r', 'ল' => 'l', 'শ' => 'sh', 'ষ' => 'sh',
        'স' => 's', 'হ' => 'h', 'ড়' => 'r', 'ঢ়' => 'rh', 'য়' => 'y', 'ৎ' => 't', 'ং' => 'ng', 'ঃ' => 'h', 'ঁ' => 'n',
        'া' => 'a', 'ি' => 'i', 'ী' => 'i', 'ু' => 'u', 'ূ' => 'u', 'ৃ' => 'ri', 'ে' => 'e', 'ৈ' => 'oi', 'ো' => 'o', 'ৌ' => 'ou', '্' => '',
        '০' => '0', '১' => '1', '২' => '2', '৩' => '3', '৪' => '4', '৫' => '5', '৬' => '6', '৭' => '7', '৮' => '8', '৯' => '9',
    ];
    $text = strtr(mb_strtolower(trim($text)), $map);
    if (function_exists('transliterator_transliterate')) {
        $text = (string)transliterator_transliterate('Any-Latin; Latin-ASCII', $text);
    }
    $text = preg_replace('/[^a-z0-9]+/', '-', strtolower($text));
    $text = trim((string)$text, '-');
    return $text !== '' ? mb_substr($text, 0, 120) : 'item-' . substr(Crypto::token(3), 0, 6);
}

/** Make a slug unique within a table (ignores the record's own id). */
function unique_slug(string $table, string $slug, int $ignoreId = 0): string
{
    $base = $slug;
    $i = 1;
    while (DB::value("SELECT id FROM `$table` WHERE slug = ? AND id <> ? LIMIT 1", [$slug, $ignoreId])) {
        $slug = $base . '-' . (++$i);
    }
    return $slug;
}

function set_cookie(string $name, string $value, int $ttlSeconds = 0, bool $httpOnly = true): void
{
    if (headers_sent()) {
        return;
    }
    setcookie($name, $value, [
        'expires'  => $ttlSeconds > 0 ? time() + $ttlSeconds : 0,
        'path'     => base_path() ?: '/',
        'secure'   => Request::current()->isSecure(),
        'httponly' => $httpOnly,
        'samesite' => 'Lax',
    ]);
}

/** Anonymous per-device id (random, HttpOnly). Used for duplicate checks & safe autofill. */
function device_id(): string
{
    static $id = null;
    if ($id !== null) {
        return $id;
    }
    $existing = Crypto::unsign($_COOKIE['ns_did'] ?? null);
    if ($existing !== null && preg_match('/^[a-f0-9]{32}$/', $existing)) {
        return $id = $existing;
    }
    $id = Crypto::token(16);
    set_cookie('ns_did', Crypto::sign($id), 400 * 86400);
    return $id;
}

function device_hash(): string
{
    return hash_hmac('sha256', device_id(), APP_KEY);
}

function device_type(string $ua): string
{
    if (preg_match('/tablet|ipad|playbook|silk/i', $ua)) {
        return 'tablet';
    }
    if (preg_match('/mobile|android|iphone|ipod|opera mini|iemobile/i', $ua)) {
        return 'mobile';
    }
    if (preg_match('/bot|crawl|spider|slurp/i', $ua)) {
        return 'bot';
    }
    return 'desktop';
}

function status_badge(string $status, bool $bn = false): string
{
    $s = config('order_statuses')[$status] ?? ['label' => ucfirst($status), 'bn' => $status, 'color' => 'muted'];
    return '<span class="badge badge-' . e($s['color']) . '">' . e($bn ? $s['bn'] : $s['label']) . '</span>';
}

function time_ago(?string $datetime): string
{
    if (!$datetime) {
        return '—';
    }
    $diff = time() - strtotime($datetime);
    return match (true) {
        $diff < 60     => 'just now',
        $diff < 3600   => floor($diff / 60) . 'm ago',
        $diff < 86400  => floor($diff / 3600) . 'h ago',
        $diff < 604800 => floor($diff / 86400) . 'd ago',
        default        => date('d M Y', strtotime($datetime)),
    };
}

function bn_date(?string $datetime, bool $withTime = false): string
{
    if (!$datetime) {
        return '';
    }
    $months = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
    $t = strtotime($datetime);
    $out = bn_digits(date('j', $t)) . ' ' . $months[(int)date('n', $t) - 1] . ' ' . bn_digits(date('Y', $t));
    return $withTime ? $out . ', ' . bn_digits(date('g:i', $t)) . (date('A', $t) === 'AM' ? ' এএম' : ' পিএম') : $out;
}

function json_list(?string $json): array
{
    if (!$json) {
        return [];
    }
    $data = json_decode($json, true);
    return is_array($data) ? $data : [];
}

function str_limit(string $text, int $limit = 100): string
{
    $text = trim(preg_replace('/\s+/u', ' ', strip_tags($text)) ?? '');
    return mb_strlen($text) > $limit ? mb_substr($text, 0, $limit - 1) . '…' : $text;
}

function whatsapp_link(string $number, string $message = ''): string
{
    $digits = preg_replace('/\D+/', '', en_digits($number));
    if (str_starts_with($digits, '01')) {
        $digits = '88' . $digits;
    }
    return 'https://wa.me/' . $digits . ($message !== '' ? '?text=' . rawurlencode($message) : '');
}

function admin(): ?array
{
    return AdminAuth::user();
}

function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . e(Csrf::adminToken()) . '">';
}

/** Inline SVG-free icon helper (Font Awesome). */
function icon(string $class, string $label = ''): string
{
    return '<i class="' . e($class) . '" aria-hidden="true"></i>' . ($label !== '' ? '<span class="sr-only">' . e($label) . '</span>' : '');
}

/** Image URL from a packed "path|ext" value (product card subqueries, order items). */
function packed_image_url(?string $packed, string $size = 'sm'): string
{
    [$path, $ext] = array_pad(explode('|', (string)$packed), 2, 'webp');
    return image_url($path !== '' ? $path : null, $size, $ext ?: 'webp');
}
