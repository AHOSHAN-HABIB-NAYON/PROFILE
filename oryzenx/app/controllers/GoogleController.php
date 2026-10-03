<?php
/** Google OAuth 2.0 / OpenID Connect sign-in. */
final class GoogleController
{
    public static function enabled(): bool
    {
        return setting('google_enabled') === '1' && setting('google_client_id') !== '' && setting('google_client_secret') !== '';
    }

    public static function redirectUri(): string { return rtrim(setting('canonical_base') ?: base_url(), '/') . '/auth/google/callback'; }

    public function redirect(): void
    {
        if (!self::enabled()) throw new HttpException(t('error.404'), 404);
        $_SESSION['google_state'] = bin2hex(random_bytes(16));
        $q = http_build_query([
            'client_id' => setting('google_client_id'), 'redirect_uri' => self::redirectUri(), 'response_type' => 'code',
            'scope' => 'openid email profile', 'state' => $_SESSION['google_state'], 'prompt' => 'select_account', 'access_type' => 'online',
        ]);
        header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . $q);
        exit;
    }

    public function callback(): void
    {
        if (!self::enabled()) throw new HttpException(t('error.404'), 404);
        $state = (string)input('state');
        if (empty($_SESSION['google_state']) || !hash_equals($_SESSION['google_state'], $state) || input('code') === '') {
            unset($_SESSION['google_state']);
            Session::flash('error', t('auth.google_failed'));
            redirect('/login');
        }
        unset($_SESSION['google_state']);
        $tok = Http::request('POST', 'https://oauth2.googleapis.com/token', [], [
            'code' => input('code'), 'client_id' => setting('google_client_id'), 'client_secret' => setting('google_client_secret'),
            'redirect_uri' => self::redirectUri(), 'grant_type' => 'authorization_code',
        ], 15);
        $access = json_decode($tok['body'], true)['access_token'] ?? null;
        $info = $access ? json_decode(Http::request('GET', 'https://openidconnect.googleapis.com/v1/userinfo', ['Authorization' => 'Bearer ' . $access], null, 15)['body'], true) : null;
        if (empty($info['sub']) || empty($info['email']) || empty($info['email_verified'])) {
            ErrorHandler::log('google', 'OAuth failed', ['status' => $tok['status'], 'body' => mb_substr($tok['body'], 0, 300)]);
            Session::flash('error', t('auth.google_failed'));
            redirect('/login');
        }
        $email = mb_strtolower($info['email']);
        $u = DB::row('SELECT * FROM users WHERE google_id = ?', [$info['sub']]) ?: DB::row('SELECT * FROM users WHERE email = ?', [$email]);
        if ($u) {
            if (!$u['google_id']) DB::q('UPDATE users SET google_id = ?, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?', [$info['sub'], $u['id']]);
        } else {
            if (setting('registration_enabled') !== '1') { Session::flash('error', t('auth.reg_closed')); redirect('/login'); }
            $id = DB::tx(function () use ($info, $email) {
                $hasAdmin = (int)DB::val("SELECT COUNT(*) FROM users WHERE role = 'admin' FOR UPDATE") > 0;
                $id = DB::insert('users', ['name' => mb_substr($info['name'] ?? strtok($email, '@'), 0, 100), 'email' => $email, 'google_id' => $info['sub'],
                    'role' => $hasAdmin ? 'user' : 'admin', 'email_verified_at' => now(), 'lang' => lang()]);
                DB::insert('user_security', ['user_id' => $id]);
                return $id;
            });
            DB::q('INSERT INTO analytics (day, signups) VALUES (CURDATE(), 1) ON DUPLICATE KEY UPDATE signups = signups + 1');
            Auth::activity('register', 'google', $id);
        }
        $u = DB::row('SELECT * FROM users WHERE email = ?', [$email]);
        if (!Auth::isAllowed($u)) { Session::flash('error', Auth::blockedMessage($u)); redirect('/login'); }

        $tfa = DB::val('SELECT 1 FROM user_2fa WHERE user_id = ? AND enabled_at IS NOT NULL', [$u['id']]);
        if ($tfa) {
            $_SESSION['pending_login'] = ['uid' => (int)$u['id'], 'method' => 'totp', 'via' => 'google', 'remember' => true, 't' => time()];
            redirect('/login/verify');
        }
        Auth::login($u, 'google', true);
        $to = safe_redirect_path($_SESSION['intended'] ?? null, $u['role'] === 'admin' ? '/admin' : '/profile');
        unset($_SESSION['intended']);
        redirect($to);
    }
}
