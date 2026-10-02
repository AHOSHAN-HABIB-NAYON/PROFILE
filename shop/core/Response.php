<?php
final class Response
{
    /** Consistent API envelope: success, message, data, errors, redirect, csrf. */
    public static function json(bool $success, string $message = '', mixed $data = null, array $errors = [], ?string $redirect = null, int $status = 200): never
    {
        if (!headers_sent()) {
            http_response_code($status);
            header('Content-Type: application/json; charset=utf-8');
            header('Cache-Control: no-store');
        }
        echo json_encode([
            'success'  => $success,
            'message'  => $message,
            'data'     => $data,
            'errors'   => (object) $errors,
            'redirect' => $redirect,
            'csrf'     => Csrf::token(),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function ok(mixed $data = null, string $message = ''): never
    {
        self::json(true, $message, $data);
    }

    public static function fail(string $message, array $errors = [], int $status = 422): never
    {
        self::json(false, $message, null, $errors, null, $status);
    }

    public static function redirect(string $to, int $code = 302): never
    {
        if (Request::wantsJson()) {
            self::json(true, '', null, [], $to);
        }
        header('Location: ' . $to, true, $code);
        exit;
    }

    public static function notFound(): never
    {
        http_response_code(404);
        if (str_starts_with(Request::path(), '/api/') || str_starts_with(Request::path(), '/admin/api/')) {
            self::fail('অনুরোধকৃত তথ্য পাওয়া যায়নি।', [], 404);
        }
        View::page('pages/404', ['title' => 'পাতা পাওয়া যায়নি'], ['title' => 'পাতা পাওয়া যায়নি', 'robots' => 'noindex']);
        exit;
    }

    public static function securityHeaders(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
        header('Cross-Origin-Opener-Policy: same-origin');
        if (Request::isHttps()) {
            header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
        }
        $csp = "default-src 'self'; "
            . "script-src 'self' https://connect.facebook.net https://www.googletagmanager.com https://www.google-analytics.com; "
            . "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
            . "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com; "
            . "img-src 'self' data: blob: https:; "
            . "connect-src 'self' https://www.facebook.com https://connect.facebook.net https://www.google-analytics.com https://*.google-analytics.com https://www.googletagmanager.com https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; "
            . "frame-src https://www.facebook.com https://www.googletagmanager.com; "
            . "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'";
        header('Content-Security-Policy: ' . $csp);
    }
}
