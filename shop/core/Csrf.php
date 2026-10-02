<?php
final class Csrf
{
    public static function token(): string
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            return '';
        }
        if (empty($_SESSION['_csrf'])) {
            $_SESSION['_csrf'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['_csrf'];
    }

    public static function field(): string
    {
        return '<input type="hidden" name="_csrf" value="' . e(self::token()) . '">';
    }

    public static function verify(): void
    {
        $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? (string) Request::input('_csrf', '');
        if (!is_string($sent) || $sent === '' || !hash_equals(self::token(), $sent)) {
            Logger::security('CSRF mismatch', ['ip' => Request::ip(), 'path' => Request::path()]);
            Response::fail('সেশনের মেয়াদ শেষ হয়েছে। পাতাটি রিফ্রেশ করে আবার চেষ্টা করুন।', [], 419);
        }
    }
}
