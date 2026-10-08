<?php
/**
 * Admin authentication: one-time setup, email/password (bcrypt/argon via
 * password_hash), Google Sign-In, optional TOTP 2FA, throttling and lockout.
 */
final class AdminAuthController extends AdminController
{
    private const MAX_FAILURES = 5;
    private const LOCK_MINUTES = 15;

    public function loginForm(Request $r): Response
    {
        if (!$this->hasAdmins()) {
            return Response::redirect(url('/admin/setup'));
        }
        if (AdminAuth::user()) {
            return Response::redirect(url('/admin'));
        }
        return $this->auth('login', ['next' => $this->safeNext((string)$r->get('next', '/admin')), 'googleClient' => GoogleAuth::clientId()]);
    }

    public function login(Request $r): Response
    {
        $email = strtolower($r->str('email', 191));
        $password = (string)$r->input('password', '');
        $ip = $r->ip();
        if ($this->locked($ip, $email)) {
            return $this->fail('অনেকবার ভুল চেষ্টা হয়েছে। ' . self::LOCK_MINUTES . ' মিনিট পর আবার চেষ্টা করুন।', 429);
        }
        $admin = $email !== '' ? DB::one('SELECT * FROM admins WHERE email = ?', [$email]) : null;
        // Always run password_verify to keep timing uniform for unknown emails.
        $hash = $admin['password_hash'] ?? '$2y$10$g7koKDLua0BLXq7Wtk11Oee4qInkGcqLvX.l24OqG0r7CPZhyvC9O';
        $valid = password_verify($password, $hash) && $admin && $admin['status'] === 'active';
        DB::insert('login_attempts', ['ip' => $ip, 'email' => $email ?: null, 'success' => $valid ? 1 : 0]);
        if (!$valid) {
            $this->maybeAlert($ip, $email);
            return $this->fail('ইমেইল বা পাসওয়ার্ড সঠিক নয়।', 401);
        }
        if (password_needs_rehash($admin['password_hash'], PASSWORD_DEFAULT)) {
            DB::exec('UPDATE admins SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $admin['id']]);
        }
        return $this->complete($admin, (string)$r->input('next', '/admin'));
    }

    public function google(Request $r): Response
    {
        $info = GoogleAuth::verify((string)$r->input('credential', ''));
        if (!$info) {
            return $this->fail('Google যাচাই ব্যর্থ হয়েছে।', 401);
        }
        $admin = DB::one('SELECT * FROM admins WHERE email = ? AND status = "active" AND allow_google = 1', [$info['email']]);
        DB::insert('login_attempts', ['ip' => $r->ip(), 'email' => $info['email'], 'success' => $admin ? 1 : 0]);
        if (!$admin || ($admin['google_sub'] && !hash_equals($admin['google_sub'], $info['sub']))) {
            return $this->fail('এই Google অ্যাকাউন্টের অ্যাডমিন অনুমতি নেই।', 403);
        }
        if (!$admin['google_sub']) {
            DB::exec('UPDATE admins SET google_sub = ? WHERE id = ?', [$info['sub'], $admin['id']]);
        }
        return $this->complete($admin, (string)$r->input('next', '/admin'));
    }

    public function twoFactorForm(Request $r): Response
    {
        if (!Session::get('admin_pending_2fa')) {
            return Response::redirect(url('/admin/login'));
        }
        return $this->auth('two-factor', []);
    }

    public function twoFactor(Request $r): Response
    {
        $pending = Session::get('admin_pending_2fa');
        if (!$pending || $pending['expires'] < time()) {
            Session::forget('admin_pending_2fa');
            return $this->fail('সময় শেষ। আবার লগইন করুন।', 401);
        }
        $admin = DB::one('SELECT * FROM admins WHERE id = ? AND status = "active"', [$pending['id']]);
        $secret = $admin ? Crypto::decrypt($admin['two_factor_secret']) : '';
        $ok = $secret !== '' && Totp::verify($secret, $r->str('code', 10));
        DB::insert('login_attempts', ['ip' => $r->ip(), 'email' => $admin['email'] ?? null, 'success' => $ok ? 1 : 0]);
        if (!$ok) {
            return $this->fail('কোডটি সঠিক নয়।', 401);
        }
        AdminAuth::login($admin);
        return $this->done('স্বাগতম!', ['redirect' => url($this->safeNext($pending['next']))]);
    }

    public function setupForm(Request $r): Response
    {
        if ($this->hasAdmins()) {
            return Response::redirect(url('/admin/login'));
        }
        return $this->auth('setup', []);
    }

    public function setup(Request $r): Response
    {
        if ($this->hasAdmins()) {
            return $this->fail('Setup already completed.', 403);
        }
        if (!hash_equals((string)INSTALL_KEY, (string)$r->input('install_key', '')) || INSTALL_KEY === 'CHANGE_ME_INSTALL_KEY') {
            return $this->fail('Install key does not match INSTALL_KEY in config.php (and it must be changed from the default).', 403);
        }
        $data = ['name' => $r->str('name', 120), 'email' => strtolower($r->str('email', 191)), 'password' => (string)$r->input('password', '')];
        $this->validate($data, ['name' => 'required|max:120', 'email' => 'required|email', 'password' => 'required|min:10'], ['name' => 'Name', 'email' => 'Email', 'password' => 'Password']);
        if (!self::strongPassword($data['password'])) {
            return $this->fail('Password must be 10+ characters with upper & lower case letters, a number and a symbol.');
        }
        $id = DB::insert('admins', ['name' => $data['name'], 'email' => $data['email'], 'password_hash' => password_hash($data['password'], PASSWORD_DEFAULT), 'role' => 'owner']);
        AdminAuth::login(DB::one('SELECT * FROM admins WHERE id = ?', [$id]));
        return $this->done('Admin account created.', ['redirect' => url('/admin')]);
    }

    public function logout(Request $r): Response
    {
        Audit::log('admin.logout', 'admin', AdminAuth::id());
        AdminAuth::logout();
        return Response::redirect(url('/admin/login'));
    }

    public static function strongPassword(string $p): bool
    {
        return strlen($p) >= 10 && preg_match('/[a-z]/', $p) && preg_match('/[A-Z]/', $p) && preg_match('/\d/', $p) && preg_match('/[^A-Za-z0-9]/', $p);
    }

    // ------------------------------------------------------------------

    private function complete(array $admin, string $next): Response
    {
        if ((int)$admin['two_factor_enabled'] === 1 && $admin['two_factor_secret']) {
            Session::regenerate();
            Session::set('admin_pending_2fa', ['id' => (int)$admin['id'], 'next' => $next, 'expires' => time() + 300]);
            return $this->done('২-ধাপ যাচাই কোড দিন', ['redirect' => url('/admin/login/2fa')]);
        }
        AdminAuth::login($admin);
        return $this->done('স্বাগতম, ' . $admin['name'] . '!', ['redirect' => url($this->safeNext($next))]);
    }

    private function auth(string $view, array $data): Response
    {
        Csrf::adminToken();
        return Response::html(View::render('admin:pages/' . $view, $data, 'admin:layouts/auth'), 200, ['Cache-Control' => 'no-store']);
    }

    private function hasAdmins(): bool
    {
        return (bool)DB::value('SELECT 1 FROM admins LIMIT 1');
    }

    private function locked(string $ip, string $email): bool
    {
        $since = date('Y-m-d H:i:s', time() - self::LOCK_MINUTES * 60);
        $byIp = (int)DB::value('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND success = 0 AND created_at > ?', [$ip, $since]);
        $byEmail = $email !== '' ? (int)DB::value('SELECT COUNT(*) FROM login_attempts WHERE email = ? AND success = 0 AND created_at > ?', [$email, $since]) : 0;
        return $byIp >= self::MAX_FAILURES * 2 || $byEmail >= self::MAX_FAILURES;
    }

    private function maybeAlert(string $ip, string $email): void
    {
        $since = date('Y-m-d H:i:s', time() - self::LOCK_MINUTES * 60);
        $fails = (int)DB::value('SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND success = 0 AND created_at > ?', [$ip, $since]);
        if ($fails === self::MAX_FAILURES) {
            DB::insert('security_alerts', ['type' => 'admin_login_failures', 'severity' => 'high', 'title' => "Repeated failed admin logins from $ip",
                'message' => "$fails failed attempts" . ($email ? " (last email: $email)" : ''), 'ip' => $ip]);
            Notification::create('security', 'Failed admin logins', "$fails attempts from $ip", url('/admin/security'));
        }
    }

    private function safeNext(string $next): string
    {
        $next = '/' . ltrim(parse_url($next, PHP_URL_PATH) ?: '/admin', '/');
        if (base_path() !== '' && str_starts_with($next, base_path())) {
            $next = substr($next, strlen(base_path())) ?: '/admin';
        }
        return str_starts_with($next, '/admin') && !str_starts_with($next, '/admin/login') ? $next : '/admin';
    }
}
