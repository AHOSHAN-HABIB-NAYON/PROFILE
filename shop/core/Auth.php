<?php
/** Admin-only authentication (customers never log in). */
final class Auth
{
    public static function attempt(string $username, string $password): bool|string
    {
        $ip = Request::ip();
        $key = 'login:' . $ip;
        if (RateLimiter::tooMany($key, 5, 900)) {
            Logger::security('Login locked', ['ip' => $ip, 'user' => $username]);
            return 'অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পর আবার চেষ্টা করুন।';
        }
        $admin = DB::one('SELECT * FROM admins WHERE username = ?', [$username]);
        // Constant-ish time: verify against a dummy hash when user is unknown.
        $hash = $admin['password_hash'] ?? '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG';
        if (!password_verify($password, $hash) || !$admin) {
            RateLimiter::hit($key, 5, 900);
            Logger::security('Login failed', ['ip' => $ip, 'user' => $username]);
            return false;
        }
        RateLimiter::clear($key);
        if (password_needs_rehash($admin['password_hash'], PASSWORD_DEFAULT)) {
            DB::update('admins', ['password_hash' => password_hash($password, PASSWORD_DEFAULT)], 'id = ?', [$admin['id']]);
        }
        Session::regenerate();
        Session::set('admin_id', (int) $admin['id']);
        Session::set('admin_name', $admin['name'] ?: $admin['username']);
        Session::set('admin_last', time());
        Session::set('admin_fp', self::fingerprint());
        DB::update('admins', ['last_login_at' => date('Y-m-d H:i:s'), 'last_login_ip' => $ip], 'id = ?', [$admin['id']]);
        Logger::security('Login success', ['ip' => $ip, 'user' => $username]);
        return true;
    }

    private static function fingerprint(): string
    {
        return hash('sha256', Request::userAgent() . '|' . Config::get('key'));
    }

    public static function check(): bool
    {
        $id = Session::get('admin_id');
        if (!$id) {
            return false;
        }
        $timeout = (int) Config::get('session.admin_timeout', 7200);
        if (time() - (int) Session::get('admin_last', 0) > $timeout || !hash_equals((string) Session::get('admin_fp'), self::fingerprint())) {
            self::logout();
            return false;
        }
        Session::set('admin_last', time());
        return true;
    }

    public static function id(): ?int
    {
        return Session::get('admin_id');
    }

    public static function require(): void
    {
        if (!self::check()) {
            if (Request::wantsJson()) {
                Response::json(false, 'লগইন সেশনের মেয়াদ শেষ। আবার লগইন করুন।', null, [], '/admin/login', 401);
            }
            Response::redirect('/admin/login');
        }
    }

    public static function logout(): void
    {
        Session::forget('admin_id');
        Session::forget('admin_name');
        Session::regenerate();
    }
}
