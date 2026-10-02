<?php
/**
 * Security layer: headers/CSP, CSRF, rate limiting, encryption at rest,
 * HTML sanitising, password policy, reCAPTCHA.
 */
defined('APP') || exit;

// ---------------------------------------------------------------------
// Security headers + Content Security Policy
// ---------------------------------------------------------------------
function csp_nonce(): string
{
    static $n = null;
    return $n ??= b64url_encode(random_bytes(16));
}

function send_security_headers(): void
{
    if (headers_sent()) return;
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()');
    header('Cross-Origin-Opener-Policy: same-origin-allow-popups');
    if (IS_HTTPS) header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
    $n = csp_nonce();
    header("Content-Security-Policy: default-src 'self'; "
        . "script-src 'self' 'nonce-$n' https://cdnjs.cloudflare.com https://www.google.com https://www.gstatic.com; "
        . "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
        . "font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
        . "img-src 'self' data: blob: https:; "
        . "connect-src 'self' https://www.google.com; "
        . "frame-src https://www.google.com https://www.youtube-nocookie.com https://www.youtube.com; "
        . "media-src 'self' data: blob:; worker-src 'self'; manifest-src 'self'; object-src 'none'; "
        . "base-uri 'self'; form-action 'self' https://accounts.google.com; frame-ancestors 'self'");
}

// ---------------------------------------------------------------------
// Sessions (secure cookie flags, own save path so other apps' GC can't
// wipe our sessions on shared hosting)
// ---------------------------------------------------------------------
function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $days = INSTALLED ? max(1, (int)setting('security.session_days', 30)) : 1;
    $lifetime = $days * 86400;
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', (string)$lifetime);
    ini_set('session.sid_length', '48');
    ini_set('session.sid_bits_per_character', '6');
    $path = ROOT . '/storage/sessions';
    if (is_dir($path) && is_writable($path)) session_save_path($path);
    session_name(IS_HTTPS ? '__Host-sid' : 'sid');
    session_set_cookie_params([
        'lifetime' => $lifetime,
        'path' => '/',
        'secure' => IS_HTTPS,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

// ---------------------------------------------------------------------
// CSRF
// ---------------------------------------------------------------------
function csrf_token(): string
{
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = b64url_encode(random_bytes(32));
    return $_SESSION['csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="_token" value="' . e(csrf_token()) . '">';
}

function csrf_check(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? ($_POST['_token'] ?? '');
    if (!is_string($sent) || empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $sent)) {
        fail(t('err.csrf'), 419);
    }
}

// ---------------------------------------------------------------------
// Rate limiting (fixed window, stored in MySQL – works on shared hosting)
// ---------------------------------------------------------------------
function rate_hit(string $bucket, int $max, int $seconds): bool
{
    $k = hash('sha256', $bucket);
    $now = time();
    q('INSERT INTO rate_limits (k, hits, reset_at) VALUES (?, 1, ?)
       ON DUPLICATE KEY UPDATE hits = IF(reset_at < ?, 1, hits + 1), reset_at = IF(reset_at < ?, ?, reset_at)',
        [$k, $now + $seconds, $now, $now, $now + $seconds]);
    $hits = (int)val('SELECT hits FROM rate_limits WHERE k = ?', [$k]);
    if (random_int(1, 200) === 1) q('DELETE FROM rate_limits WHERE reset_at < ?', [$now]);
    return $hits <= $max;
}

/** Abort with 429 when the limit is exceeded. */
function rate_limit(string $bucket, int $max, int $seconds): void
{
    if (!rate_hit($bucket, $max, $seconds)) {
        header('Retry-After: ' . $seconds);
        fail(t('err.too_many'), 429);
    }
}

// ---------------------------------------------------------------------
// Encryption at rest: AES-256-GCM via OpenSSL (available on every host).
// Values written by older builds with libsodium ("enc:") are still readable
// when the sodium extension exists.
// ---------------------------------------------------------------------
function app_key(): string
{
    $k = base64_decode((string)(ENV['app_key'] ?? ''), true);
    if (!$k || strlen($k) !== 32) throw new RuntimeException('APP key missing');
    return $k;
}

/** Encrypt with an explicit 32-byte key (also used by the installer). */
function encrypt_with_key(string $plain, string $key): string
{
    $iv = random_bytes(12);
    $cipher = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) throw new RuntimeException('Encryption failed');
    return 'gcm:' . base64_encode($iv . $tag . $cipher);
}

function encrypt_value(string $plain): string
{
    return encrypt_with_key($plain, app_key());
}

function decrypt_value(string $stored): string
{
    if (str_starts_with($stored, 'gcm:')) {
        $raw = base64_decode(substr($stored, 4), true);
        if ($raw === false || strlen($raw) < 29) return '';
        $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', app_key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        return $plain === false ? '' : $plain;
    }
    if (str_starts_with($stored, 'enc:')) {
        if (!function_exists('sodium_crypto_secretbox_open')) return '';
        $raw = base64_decode(substr($stored, 4), true);
        if ($raw === false || strlen($raw) < 24) return '';
        $plain = sodium_crypto_secretbox_open(substr($raw, 24), substr($raw, 0, 24), app_key());
        return $plain === false ? '' : $plain;
    }
    return $stored;
}

/** Keyed hash for tokens/visitor ids (never store raw tokens). */
function token_hash(string $token): string
{
    return hash_hmac('sha256', $token, (string)(ENV['app_key'] ?? 'k'));
}

// ---------------------------------------------------------------------
// Password policy
// ---------------------------------------------------------------------
function password_problem(string $pw): ?string
{
    $min = max(6, (int)setting('security.password_min', 8));
    if (mb_strlen($pw) < $min) return t('err.password_short', ['n' => num($min)]);
    if (mb_strlen($pw) > 200) return t('err.password_long');
    if (setting_bool('security.password_mixed') && (!preg_match('~\p{L}~u', $pw) || !preg_match('~\d~', $pw))) return t('err.password_mixed');
    return null;
}

function hash_password(string $pw): string
{
    return password_hash($pw, PASSWORD_BCRYPT, ['cost' => 12]);
}

// ---------------------------------------------------------------------
// reCAPTCHA v3
// ---------------------------------------------------------------------
function recaptcha_enabled(): bool
{
    return setting_bool('security.recaptcha_enabled') && setting('security.recaptcha_site_key') && setting('security.recaptcha_secret');
}

function recaptcha_check(string $action): void
{
    if (!recaptcha_enabled()) return;
    $token = input('g_token');
    if ($token === '') fail(t('err.captcha'), 422);
    $r = http_request('POST', 'https://www.google.com/recaptcha/api/siteverify', ['form' => [
        'secret' => setting('security.recaptcha_secret'), 'response' => $token, 'remoteip' => client_ip(),
    ], 'timeout' => 8]);
    $j = $r['json'] ?? [];
    $min = (float)setting('security.recaptcha_min_score', '0.5');
    if (empty($j['success']) || (isset($j['score']) && (float)$j['score'] < $min) || (isset($j['action']) && $j['action'] !== $action)) {
        fail(t('err.captcha'), 422);
    }
}

// ---------------------------------------------------------------------
// Rich-text HTML sanitiser (allow-list based, DOM powered)
// ---------------------------------------------------------------------
function sanitize_html(string $html): string
{
    $html = trim($html);
    if ($html === '') return '';
    $allowed = [
        'p' => [], 'br' => [], 'strong' => [], 'b' => [], 'em' => [], 'i' => [], 'u' => [], 's' => [], 'mark' => [], 'small' => [],
        'sub' => [], 'sup' => [], 'code' => [], 'pre' => [], 'blockquote' => [], 'hr' => [],
        'h2' => ['id'], 'h3' => ['id'], 'h4' => ['id'], 'ul' => [], 'ol' => [], 'li' => [],
        'a' => ['href', 'target', 'rel', 'title'], 'img' => ['src', 'alt', 'width', 'height', 'loading'],
        'span' => [], 'div' => [], 'figure' => [], 'figcaption' => [],
        'table' => [], 'thead' => [], 'tbody' => [], 'tr' => [], 'th' => [], 'td' => [],
        'iframe' => ['src', 'width', 'height', 'allowfullscreen', 'title'],
    ];
    $drop = ['script', 'style', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base', 'svg', 'math', 'template', 'noscript'];

    $doc = new DOMDocument('1.0', 'UTF-8');
    libxml_use_internal_errors(true);
    $doc->loadHTML('<?xml encoding="UTF-8"><div id="__r">' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
    libxml_clear_errors();
    $root = $doc->getElementById('__r');
    if (!$root) return '';

    $walk = function (DOMNode $node) use (&$walk, $allowed, $drop, $doc) {
        foreach (iterator_to_array($node->childNodes) as $child) {
            if ($child instanceof DOMComment) { $node->removeChild($child); continue; }
            if (!$child instanceof DOMElement) continue;
            $tag = strtolower($child->tagName);
            if (in_array($tag, $drop, true)) { $node->removeChild($child); continue; }
            if (!isset($allowed[$tag])) {
                // unknown tag: keep its content, drop the wrapper
                $walk($child);
                while ($child->firstChild) $node->insertBefore($child->firstChild, $child);
                $node->removeChild($child);
                continue;
            }
            foreach (iterator_to_array($child->attributes) as $attr) {
                $name = strtolower($attr->name);
                $val = trim($attr->value);
                $keep = false;
                if ($name === 'class') {
                    $tokens = array_filter(preg_split('~\s+~', $val), fn($c) => preg_match('~^(rt-[a-z0-9-]+|fa-[a-z0-9-]+|fa|fas|far|fab)$~', $c));
                    if ($tokens) { $child->setAttribute('class', implode(' ', $tokens)); $keep = true; }
                } elseif (in_array($name, $allowed[$tag], true)) {
                    $keep = true;
                    if (in_array($name, ['href', 'src'], true)) $keep = safe_url_attr($val, $tag);
                    if ($name === 'target') { $keep = $val === '_blank'; }
                    if (in_array($name, ['width', 'height'], true)) $keep = ctype_digit($val);
                }
                if (!$keep) $child->removeAttribute($attr->name);
            }
            if ($tag === 'a' && $child->getAttribute('target') === '_blank') $child->setAttribute('rel', 'noopener noreferrer nofollow');
            if ($tag === 'img') $child->setAttribute('loading', 'lazy');
            if ($tag === 'iframe') {
                if (!$child->hasAttribute('src')) { $node->removeChild($child); continue; }
                $child->setAttribute('loading', 'lazy');
            }
            $walk($child);
        }
    };
    $walk($root);
    $out = '';
    foreach ($root->childNodes as $c) $out .= $doc->saveHTML($c);
    return $out;
}

function safe_url_attr(string $url, string $tag): bool
{
    $u = strtolower(preg_replace('~[\x00-\x20]+~', '', $url));
    if ($tag === 'iframe') return (bool)preg_match('~^https://(www\.)?youtube(-nocookie)?\.com/embed/[a-z0-9_-]+~i', $url);
    if (str_starts_with($u, '/') || str_starts_with($u, '#')) return !str_starts_with($u, '//');
    if (preg_match('~^https?://~', $u)) return true;
    if ($tag === 'a' && preg_match('~^(mailto|tel):~', $u)) return true;
    if (!str_contains($u, ':')) return true; // relative path
    return false;
}
