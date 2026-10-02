<?php
/** Escape for HTML output. */
function e(mixed $v): string
{
    return htmlspecialchars((string) ($v ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function setting(string $key, mixed $default = null): mixed
{
    return Settings::get($key, $default);
}

function url(string $path = ''): string
{
    return '/' . ltrim($path, '/');
}

function abs_url(string $path = ''): string
{
    $base = Config::get('url') ?: Request::origin();
    return rtrim($base, '/') . '/' . ltrim($path, '/');
}

function asset(string $path): string
{
    $file = BASE_PATH . '/assets/' . ltrim($path, '/');
    $v = is_file($file) ? substr(md5((string) filemtime($file)), 0, 8) : APP_VERSION;
    return '/assets/' . ltrim($path, '/') . '?v=' . $v;
}

/** Bengali digits for display. */
function bn_num(mixed $n): string
{
    return strtr((string) $n, ['0' => '০', '1' => '১', '2' => '২', '3' => '৩', '4' => '৪', '5' => '৫', '6' => '৬', '7' => '৭', '8' => '৮', '9' => '৯']);
}

function money(mixed $amount): string
{
    $n = (float) $amount;
    $s = number_format($n, fmod($n, 1.0) == 0.0 ? 0 : 2);
    return '৳' . bn_num($s);
}

function slugify(string $text): string
{
    $text = mb_strtolower(trim($text));
    // Keep Bengali letters, latin letters, digits; collapse others to hyphen.
    $text = preg_replace('/[^\p{Bengali}\p{L}\p{N}]+/u', '-', $text) ?? '';
    $text = trim($text, '-');
    return $text !== '' ? mb_substr($text, 0, 180) : bin2hex(random_bytes(4));
}

function unique_slug(string $table, string $name, ?int $ignoreId = null): string
{
    $base = slugify($name);
    $slug = $base;
    $i = 2;
    while (DB::val("SELECT id FROM `{$table}` WHERE slug = ? AND id <> ?", [$slug, $ignoreId ?? 0]) !== null) {
        $slug = $base . '-' . $i++;
    }
    return $slug;
}

/** Normalise Bangladeshi mobile numbers to 01XXXXXXXXX; returns null if invalid. */
function normalize_phone(string $phone): ?string
{
    $p = strtr(trim($phone), ['০' => '0', '১' => '1', '২' => '2', '৩' => '3', '৪' => '4', '৫' => '5', '৬' => '6', '৭' => '7', '৮' => '8', '৯' => '9']);
    $p = preg_replace('/[\s\-()]/', '', $p) ?? '';
    if (str_starts_with($p, '+880')) {
        $p = substr($p, 3);
    } elseif (str_starts_with($p, '880')) {
        $p = substr($p, 2);
    }
    return preg_match('/^01[3-9]\d{8}$/', $p) ? $p : null;
}

function img_url(?string $base, string $variant = 'md', string $ext = 'webp'): string
{
    if (!$base) {
        return '/assets/images/placeholder.svg';
    }
    if (preg_match('/\.(svg|png|jpe?g|webp|ico)$/i', $base)) {
        return '/' . ltrim($base, '/');
    }
    return '/' . ltrim($base, '/') . '-' . $variant . '.' . $ext;
}

/** Responsive <picture> with WebP + JPEG fallback and fixed aspect ratio (no CLS). */
function picture(?string $base, string $alt, int $w = 400, int $h = 400, string $class = '', bool $lazy = true, string $variant = 'sm'): string
{
    $loading = $lazy ? 'loading="lazy" decoding="async"' : 'fetchpriority="high" decoding="async"';
    if (!$base || preg_match('/\.(svg|png|jpe?g|webp)$/i', $base)) {
        return '<img src="' . e(img_url($base)) . '" alt="' . e($alt) . '" width="' . $w . '" height="' . $h . '" class="' . e($class) . '" ' . $loading . '>';
    }
    $sm = img_url($base, 'sm');
    $md = img_url($base, 'md');
    return '<picture><source type="image/webp" srcset="' . e($sm) . ' 400w, ' . e($md) . ' 1200w" sizes="' . ($variant === 'md' ? '(max-width:768px) 100vw, 600px' : '(max-width:768px) 50vw, 240px') . '">'
        . '<img src="' . e(img_url($base, $variant, 'jpg')) . '" alt="' . e($alt) . '" width="' . $w . '" height="' . $h . '" class="' . e($class) . '" ' . $loading . '></picture>';
}

function time_ago(string $datetime): string
{
    $diff = time() - strtotime($datetime);
    return match (true) {
        $diff < 60     => 'এইমাত্র',
        $diff < 3600   => bn_num((int) ($diff / 60)) . ' মিনিট আগে',
        $diff < 86400  => bn_num((int) ($diff / 3600)) . ' ঘণ্টা আগে',
        $diff < 604800 => bn_num((int) ($diff / 86400)) . ' দিন আগে',
        default        => date('d M Y', strtotime($datetime)),
    };
}

function str_limit(string $s, int $n): string
{
    return mb_strlen($s) > $n ? mb_substr($s, 0, $n - 1) . '…' : $s;
}

function order_status_label(string $status): string
{
    return [
        'pending' => 'পেন্ডিং', 'confirmed' => 'কনফার্মড', 'processing' => 'প্রসেসিং',
        'courier_sent' => 'কুরিয়ারে পাঠানো', 'delivered' => 'ডেলিভারড', 'cancelled' => 'বাতিল',
        'returned' => 'রিটার্ন', 'failed' => 'ব্যর্থ',
    ][$status] ?? $status;
}

function risk_label(?string $risk): string
{
    return ['new' => 'নতুন', 'normal' => 'স্বাভাবিক', 'review' => 'যাচাই প্রয়োজন', 'high' => 'উচ্চ ঝুঁকি'][$risk ?? ''] ?? 'অপরীক্ষিত';
}

const GENERIC_ERROR = 'দুঃখিত, এই মুহূর্তে অনুরোধটি সম্পন্ন করা যাচ্ছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।';
