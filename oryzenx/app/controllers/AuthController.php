<?php
final class AuthController
{
    private const OPTS = ['css' => ['auth'], 'js' => ['webauthn'], 'cache' => false, 'noindex' => true, 'nav' => 'profile'];

    public function loginForm(): void
    {
        if (isset($_GET['claim'])) $_SESSION['offer_intent'] = 1;
        View::page('pages/auth/login', [], ['title' => t('auth.login')] + self::OPTS);
    }

    public function login(): void
    {
        validate(['email' => 'required|email|max:190', 'password' => 'required|max:200']);
        $email = mb_strtolower((string)input('email'));
        if (Auth::isLocked($email)) fail(t('auth.locked', ['n' => setting('security_lock_minutes')]), [], 429);
        Recaptcha::verify();
        $u = DB::row('SELECT * FROM users WHERE email = ?', [$email]);
        if (!$u || !$u['password_hash'] || !password_verify((string)$_POST['password'], $u['password_hash'])) {
            Auth::logAttempt($u ? (int)$u['id'] : null, $email, 'password', false, 'invalid');
            fail(t('auth.invalid'), ['password' => t('auth.invalid')]);
        }
        if (!Auth::isAllowed($u)) { Auth::logAttempt((int)$u['id'], $email, 'password', false, 'blocked'); fail(Auth::blockedMessage($u)); }
        if (password_needs_rehash($u['password_hash'], PASSWORD_BCRYPT, ['cost' => 12])) {
            DB::q('UPDATE users SET password_hash = ? WHERE id = ?', [Auth::hash((string)$_POST['password']), $u['id']]);
        }
        self::secondStepOrLogin($u, 'password', input('remember') === '1');
    }

    /** Applies 2FA / email login verification when enabled, otherwise signs in. */
    public static function secondStepOrLogin(array $u, string $method, bool $remember): never
    {
        $tfa = DB::row('SELECT enabled_at FROM user_2fa WHERE user_id = ? AND enabled_at IS NOT NULL', [$u['id']]);
        $emailVerify = (int)DB::val('SELECT login_email_verify FROM user_security WHERE user_id = ?', [$u['id']]) === 1;
        if ($tfa || ($emailVerify && Mailer::configured())) {
            $_SESSION['pending_login'] = ['uid' => (int)$u['id'], 'method' => $tfa ? 'totp' : 'email', 'via' => $method, 'remember' => $remember, 't' => time()];
            if (!$tfa) self::sendLoginCode($u);
            respond(true, '', '/login/verify');
        }
        Auth::login($u, $method, $remember);
        $to = safe_redirect_path($_SESSION['intended'] ?? null, $u['role'] === 'admin' ? '/admin' : '/profile');
        unset($_SESSION['intended']);
        respond(true, t('auth.welcome', ['name' => $u['name']]), $to, ['reload' => true]);
    }

    private static function sendLoginCode(array $u): void
    {
        $code = (string)random_int(100000, 999999);
        Auth::issueToken((int)$u['id'], 'login_code', 10, $code);
        Mailer::send($u['email'], t('mail.login_code_subject'), '<p>' . e(t('mail.login_code_body')) . '</p><p style="font-size:26px;font-weight:700;letter-spacing:6px">' . $code . '</p><p style="color:#64748b">' . e(t('mail.ignore')) . '</p>');
    }

    private function pending(): array
    {
        $p = $_SESSION['pending_login'] ?? null;
        if (!$p || time() - $p['t'] > 600) { unset($_SESSION['pending_login']); redirect('/login'); }
        return $p;
    }

    public function verifyForm(): void
    {
        $p = $this->pending();
        View::page('pages/auth/verify', ['method' => $p['method']], ['title' => t('auth.verify_title')] + self::OPTS);
    }

    public function verify(): void
    {
        $p = $this->pending();
        $u = DB::row('SELECT * FROM users WHERE id = ?', [$p['uid']]);
        if (!$u || !Auth::isAllowed($u)) { unset($_SESSION['pending_login']); fail(t('auth.invalid')); }
        if (!RateLimit::hit('2fa|' . $u['id'], 6, 600)) fail(t('error.429'), [], 429);
        $code = trim((string)input('code'));
        $ok = false;
        if ($p['method'] === 'totp') {
            $row = DB::row('SELECT * FROM user_2fa WHERE user_id = ?', [$u['id']]);
            $secret = Crypto::decrypt((string)$row['secret_enc']);
            if ($secret && ($step = Totp::verify($secret, $code, (int)$row['last_step'])) !== null) {
                DB::q('UPDATE user_2fa SET last_step = ? WHERE user_id = ?', [$step, $u['id']]);
                $ok = true;
            } elseif (self::useRecoveryCode($row, $code)) {
                $ok = true;
                Auth::activity('2fa_recovery_code_used', '', (int)$u['id']);
            }
        } else {
            $ok = Auth::consumeToken('login_code', preg_replace('/\D/', '', $code), (int)$u['id']) !== null;
        }
        if (!$ok) { Auth::logAttempt((int)$u['id'], $u['email'], $p['method'], false, 'bad_code'); fail(t('auth.bad_code'), ['code' => t('auth.bad_code')]); }
        Auth::login($u, $p['via'] . '+' . $p['method'], (bool)$p['remember']);
        $to = safe_redirect_path($_SESSION['intended'] ?? null, $u['role'] === 'admin' ? '/admin' : '/profile');
        unset($_SESSION['intended']);
        respond(true, t('auth.welcome', ['name' => $u['name']]), $to, ['reload' => true]);
    }

    private static function useRecoveryCode(array $row, string $code): bool
    {
        $code = strtoupper(preg_replace('/[^A-Z0-9]/i', '', $code));
        if (strlen($code) !== 10) return false;
        $codes = json_decode((string)$row['recovery_codes'], true) ?: [];
        foreach ($codes as $i => $hash) {
            if (password_verify($code, $hash)) {
                unset($codes[$i]);
                DB::q('UPDATE user_2fa SET recovery_codes = ? WHERE user_id = ?', [json_encode(array_values($codes)), $row['user_id']]);
                return true;
            }
        }
        return false;
    }

    public function resendLoginCode(): void
    {
        $p = $this->pending();
        if ($p['method'] !== 'email' || !RateLimit::hit('logincode|' . $p['uid'], 3, 600)) fail(t('error.429'));
        self::sendLoginCode(DB::row('SELECT * FROM users WHERE id = ?', [$p['uid']]));
        respond(true, t('auth.code_sent'));
    }

    public function registerForm(): void
    {
        if (isset($_GET['claim'])) $_SESSION['offer_intent'] = 1;
        View::page('pages/auth/register', [], ['title' => t('auth.register')] + self::OPTS);
    }

    public function register(): void
    {
        if (setting('registration_enabled') !== '1' && (int)DB::val("SELECT COUNT(*) FROM users WHERE role = 'admin'") > 0) fail(t('auth.reg_closed'));
        validate(['name' => 'required|min:2|max:100', 'email' => 'required|email|max:190', 'password' => 'required', 'password_confirmation' => 'required']);
        $pw = (string)$_POST['password'];
        if (($err = Auth::validatePassword($pw)) !== null) fail($err, ['password' => $err]);
        if (!hash_equals($pw, (string)$_POST['password_confirmation'])) fail(t('auth.pw_mismatch'), ['password_confirmation' => t('auth.pw_mismatch')]);
        if (input('terms') !== '1') fail(t('auth.accept_terms'), ['terms' => t('auth.accept_terms')]);
        if (!RateLimit::hit('register|' . client_ip(), 5, 3600)) fail(t('error.429'), [], 429);
        Recaptcha::verify();
        $email = mb_strtolower((string)input('email'));
        if (DB::val('SELECT 1 FROM users WHERE email = ?', [$email])) fail(t('auth.email_taken'), ['email' => t('auth.email_taken')]);

        // Secure bootstrap: the first account becomes admin only while no admin exists.
        $id = DB::tx(function () use ($email, $pw) {
            $hasAdmin = (int)DB::val("SELECT COUNT(*) FROM users WHERE role = 'admin' FOR UPDATE") > 0;
            $id = DB::insert('users', ['name' => mb_substr((string)input('name'), 0, 100), 'email' => $email, 'password_hash' => Auth::hash($pw),
                'role' => $hasAdmin ? 'user' : 'admin', 'lang' => lang()]);
            DB::insert('user_security', ['user_id' => $id, 'password_changed_at' => now()]);
            return $id;
        });
        DB::q('INSERT INTO analytics (day, signups) VALUES (CURDATE(), 1) ON DUPLICATE KEY UPDATE signups = signups + 1');
        $u = DB::row('SELECT * FROM users WHERE id = ?', [$id]);
        Auth::activity('register', $u['role'] === 'admin' ? 'initial administrator' : '', $id);
        self::sendVerification($u);
        Notifier::send([$id], t('notif.welcome_title', ['site' => setting('site_name')]), t('notif.welcome_text'), ['icon' => 'fa-solid fa-hand-sparkles', 'link' => '/services', 'push' => false, 'email' => false]);
        Auth::login($u, 'register');
        respond(true, t('auth.registered'), $u['role'] === 'admin' ? '/admin' : '/profile', ['reload' => true]);
    }

    public static function sendVerification(array $u): bool
    {
        if (!Mailer::configured() || $u['email_verified_at']) return false;
        $token = Auth::issueToken((int)$u['id'], 'verify_email', 60 * 24);
        return Mailer::send($u['email'], t('mail.verify_subject'), '<p>' . e(t('mail.verify_body', ['name' => $u['name']])) . '</p>'
            . Mailer::button(abs_url(url('/verify-email/' . $token)), t('mail.verify_btn')) . '<p style="color:#64748b">' . e(t('mail.ignore')) . '</p>');
    }

    public function verifyEmail(string $token): void
    {
        $uid = Auth::consumeToken('verify_email', $token);
        if (!$uid) { Session::flash('error', t('auth.link_invalid')); redirect(Auth::user() ? '/profile/security' : '/login'); }
        DB::q('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [$uid]);
        Auth::activity('email_verified', '', $uid);
        Session::flash('success', t('auth.email_verified'));
        redirect(Auth::user() ? '/profile/security' : '/login');
    }

    public function resendVerification(): void
    {
        $u = DB::row('SELECT * FROM users WHERE id = ?', [Auth::id()]);
        if ($u['email_verified_at']) respond(true, t('auth.email_verified'));
        if (!Mailer::configured()) fail(t('auth.mail_unavailable'));
        if (!RateLimit::hit('verify|' . $u['id'], 3, 3600)) fail(t('error.429'), [], 429);
        self::sendVerification($u) ? respond(true, t('auth.verify_sent')) : fail(t('auth.mail_failed'));
    }

    public function logout(): void
    {
        Auth::logout();
        respond(true, t('auth.logged_out'), '/', ['reload' => true]);
    }

    public function forgotForm(): void
    {
        View::page('pages/auth/forgot', [], ['title' => t('auth.forgot')] + self::OPTS);
    }

    public function forgot(): void
    {
        validate(['email' => 'required|email|max:190']);
        if (!RateLimit::hit('forgot|' . client_ip(), 5, 3600)) fail(t('error.429'), [], 429);
        Recaptcha::verify();
        if (!Mailer::configured()) fail(t('auth.mail_unavailable'));
        $u = DB::row('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [mb_strtolower((string)input('email'))]);
        if ($u && RateLimit::hit('forgot-user|' . $u['id'], 3, 3600)) {
            $token = Auth::issueToken((int)$u['id'], 'reset_password', 60);
            Mailer::send($u['email'], t('mail.reset_subject'), '<p>' . e(t('mail.reset_body', ['name' => $u['name']])) . '</p>'
                . Mailer::button(abs_url(url('/reset-password/' . $token)), t('mail.reset_btn')) . '<p style="color:#64748b">' . e(t('mail.ignore')) . '</p>');
            Auth::activity('password_reset_requested', '', (int)$u['id']);
        }
        respond(true, t('auth.reset_sent'));
    }

    public function resetForm(string $token): void
    {
        $valid = Auth::consumeToken('reset_password', $token, null, false) !== null;
        View::page('pages/auth/reset', ['token' => $token, 'valid' => $valid], ['title' => t('auth.reset')] + self::OPTS);
    }

    public function reset(): void
    {
        $pw = (string)($_POST['password'] ?? '');
        if (($err = Auth::validatePassword($pw)) !== null) fail($err, ['password' => $err]);
        if (!hash_equals($pw, (string)($_POST['password_confirmation'] ?? ''))) fail(t('auth.pw_mismatch'), ['password_confirmation' => t('auth.pw_mismatch')]);
        $uid = Auth::consumeToken('reset_password', (string)input('token'));
        if (!$uid) fail(t('auth.link_invalid'));
        DB::q('UPDATE users SET password_hash = ? WHERE id = ?', [Auth::hash($pw), $uid]);
        DB::q('INSERT INTO user_security (user_id, password_changed_at) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE password_changed_at = NOW()', [$uid]);
        DB::q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$uid]);
        Auth::activity('password_reset', '', $uid);
        respond(true, t('auth.reset_done'), '/login');
    }

    /** "Lost my authenticator": emails a one-time link that removes 2FA after proving inbox access. */
    public function recover2faRequest(): void
    {
        $p = $this->pending();
        if (!Mailer::configured()) fail(t('auth.mail_unavailable'));
        if (!RateLimit::hit('recover2fa|' . $p['uid'], 2, 3600)) fail(t('error.429'), [], 429);
        $u = DB::row('SELECT * FROM users WHERE id = ?', [$p['uid']]);
        $token = Auth::issueToken((int)$u['id'], 'recover_2fa', 30);
        Mailer::send($u['email'], t('mail.recover_subject'), '<p>' . e(t('mail.recover_body')) . '</p>' . Mailer::button(abs_url(url('/recover-2fa/' . $token)), t('mail.recover_btn')));
        respond(true, t('auth.recover_sent'));
    }

    public function recover2fa(string $token): void
    {
        $uid = Auth::consumeToken('recover_2fa', $token);
        if (!$uid) { Session::flash('error', t('auth.link_invalid')); redirect('/login'); }
        DB::q('DELETE FROM user_2fa WHERE user_id = ?', [$uid]);
        DB::q('UPDATE user_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [$uid]);
        Auth::activity('2fa_reset_by_email', '', $uid);
        unset($_SESSION['pending_login']);
        Session::flash('success', t('auth.recover_done'));
        redirect('/login');
    }
}
