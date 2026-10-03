<?php
final class ProfileController
{
    private function user(): array { return DB::row('SELECT * FROM users WHERE id = ?', [Auth::id()]); }

    private function show(string $tab, array $data, string $title): never
    {
        $u = $this->user();
        View::page('pages/profile/' . $tab, $data + ['u' => $u, 'tab' => $tab], [
            'title' => $title, 'nav' => $tab === 'security' ? 'security' : 'profile', 'css' => ['profile'],
            'js' => $tab === 'security' ? ['webauthn'] : [], 'cache' => false, 'noindex' => true,
        ]);
    }

    public function overview(): void
    {
        $id = Auth::id();
        $stats = DB::row("SELECT COUNT(*) AS total, SUM(status = 'approved') AS approved, SUM(status = 'pending') AS pending,
            COALESCE(SUM(CASE WHEN status = 'approved' AND currency = 'USD' THEN amount END), 0) AS spent_usd,
            COALESCE(SUM(CASE WHEN status = 'approved' AND currency = 'BDT' THEN amount END), 0) AS spent_bdt FROM payments WHERE user_id = ?", [$id]);
        $services = (int)DB::val("SELECT COUNT(DISTINCT service_id) FROM orders WHERE user_id = ? AND status IN ('processing','completed')", [$id]);
        $recent = DB::all('SELECT p.*, o.service_title, o.order_no FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 4', [$id]);
        $activity = DB::all('SELECT action, details, created_at FROM activity_logs WHERE user_id = ? ORDER BY id DESC LIMIT 5', [$id]);
        $this->show('overview', ['stats' => $stats, 'services' => $services, 'recent' => $recent, 'activity' => $activity, 'security' => $this->securityScore()], t('nav.profile'));
    }

    public function edit(): void { $this->show('edit', [], t('profile.edit')); }

    public function update(): void
    {
        validate(['name' => 'required|min:2|max:100', 'email' => 'required|email|max:190', 'phone' => 'max:30', 'bio' => 'max:500', 'lang' => 'in:bn,en']);
        $u = $this->user();
        $email = mb_strtolower((string)input('email'));
        $data = ['name' => input('name'), 'phone' => input('phone') ?: null, 'bio' => input('bio') ?: null, 'lang' => input('lang') ?: null];
        $msg = t('common.saved');
        if ($email !== $u['email']) {
            if ($u['password_hash'] && !password_verify((string)($_POST['current_password'] ?? ''), $u['password_hash'])) {
                fail(t('profile.pw_required_email'), ['current_password' => t('auth.invalid_password')]);
            }
            if (DB::val('SELECT 1 FROM users WHERE email = ? AND id <> ?', [$email, $u['id']])) fail(t('auth.email_taken'), ['email' => t('auth.email_taken')]);
            $data += ['email' => $email, 'email_verified_at' => null];
            Auth::activity('email_changed', $u['email'] . ' → ' . $email);
            $msg = t('profile.email_changed');
        }
        DB::update('users', $data, 'id = ?', [$u['id']]);
        if (isset($data['email'])) AuthController::sendVerification($this->user());
        if ($data['lang']) Lang::set($data['lang']);
        respond(true, $msg, '/profile', ['reload' => true]);
    }

    public function avatar(): void
    {
        if (input('remove') === '1') {
            Upload::delete($this->user()['avatar']);
            DB::q('UPDATE users SET avatar = NULL WHERE id = ?', [Auth::id()]);
            respond(true, t('common.saved'), '/profile/edit', ['reload' => true]);
        }
        if (!Upload::present('avatar')) fail(t('upload.choose'));
        try { $path = Upload::image('avatar', 'avatars', ['square' => 256, 'max_mb' => 4, 'format' => 'webp', 'quality' => 80]); }
        catch (UploadError $e) { fail($e->getMessage(), ['avatar' => $e->getMessage()]); }
        Upload::delete($this->user()['avatar']);
        DB::q('UPDATE users SET avatar = ? WHERE id = ?', [$path, Auth::id()]);
        respond(true, t('common.saved'), '/profile/edit', ['reload' => true]);
    }

    private function securityScore(): array
    {
        $u = $this->user();
        $checks = [
            'email' => (bool)$u['email_verified_at'],
            '2fa' => (bool)DB::val('SELECT 1 FROM user_2fa WHERE user_id = ? AND enabled_at IS NOT NULL', [$u['id']]),
            'passkey' => (bool)DB::val('SELECT 1 FROM passkeys WHERE user_id = ? LIMIT 1', [$u['id']]),
            'login_verify' => (int)DB::val('SELECT login_email_verify FROM user_security WHERE user_id = ?', [$u['id']]) === 1,
            'password' => (bool)$u['password_hash'],
        ];
        $score = (int)round(array_sum(array_map('intval', $checks)) / count($checks) * 100);
        return ['checks' => $checks, 'score' => $score];
    }

    public function security(): void
    {
        $id = Auth::id();
        $this->show('security', [
            'sec' => $this->securityScore(),
            'sessions' => DB::all('SELECT * FROM user_sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 20', [$id]),
            'history' => DB::all('SELECT * FROM login_attempts WHERE user_id = ? ORDER BY id DESC LIMIT 15', [$id]),
            'passkeys' => DB::all('SELECT id, name, created_at, last_used_at FROM passkeys WHERE user_id = ? ORDER BY id DESC', [$id]),
            'current' => Auth::currentSessionHash(),
            'loginVerify' => (int)DB::val('SELECT login_email_verify FROM user_security WHERE user_id = ?', [$id]) === 1,
            'recoveryLeft' => count(json_decode((string)DB::val('SELECT recovery_codes FROM user_2fa WHERE user_id = ?', [$id]), true) ?: []),
        ], t('nav.security'));
    }

    public function password(): void
    {
        $u = $this->user();
        if ($u['password_hash'] && !password_verify((string)($_POST['current_password'] ?? ''), $u['password_hash'])) {
            fail(t('auth.invalid_password'), ['current_password' => t('auth.invalid_password')]);
        }
        $pw = (string)($_POST['password'] ?? '');
        if (($err = Auth::validatePassword($pw)) !== null) fail($err, ['password' => $err]);
        if (!hash_equals($pw, (string)($_POST['password_confirmation'] ?? ''))) fail(t('auth.pw_mismatch'), ['password_confirmation' => t('auth.pw_mismatch')]);
        DB::q('UPDATE users SET password_hash = ? WHERE id = ?', [Auth::hash($pw), $u['id']]);
        DB::q('INSERT INTO user_security (user_id, password_changed_at) VALUES (?, NOW()) ON DUPLICATE KEY UPDATE password_changed_at = NOW()', [$u['id']]);
        $n = Auth::revokeOthers((int)$u['id']);
        Auth::activity('password_changed', $n ? "$n other sessions signed out" : '');
        if (Mailer::configured()) Mailer::send($u['email'], t('mail.pw_changed_subject'), '<p>' . e(t('mail.pw_changed_body')) . '</p>');
        respond(true, t('profile.pw_changed'), null, ['reset' => true]);
    }

    public function loginVerify(): void
    {
        $on = input('enabled') === '1' ? 1 : 0;
        if ($on && !Mailer::configured()) fail(t('auth.mail_unavailable'));
        DB::q('INSERT INTO user_security (user_id, login_email_verify) VALUES (?, ?) ON DUPLICATE KEY UPDATE login_email_verify = VALUES(login_email_verify)', [Auth::id(), $on]);
        Auth::activity('login_verification_' . ($on ? 'on' : 'off'));
        respond(true, t('common.saved'), '/profile/security');
    }

    public function twoFactorSetup(): void
    {
        if (DB::val('SELECT 1 FROM user_2fa WHERE user_id = ? AND enabled_at IS NOT NULL', [Auth::id()])) redirect('/profile/security');
        $_SESSION['tfa_secret'] ??= Totp::secret();
        $u = $this->user();
        View::page('pages/profile/twofactor', ['u' => $u, 'tab' => 'security', 'secret' => $_SESSION['tfa_secret'], 'uri' => Totp::uri($_SESSION['tfa_secret'], $u['email'])],
            ['title' => t('profile.2fa'), 'nav' => 'security', 'css' => ['profile'], 'js' => ['webauthn'], 'cache' => false, 'noindex' => true]);
    }

    public function twoFactorEnable(): void
    {
        $secret = $_SESSION['tfa_secret'] ?? null;
        if (!$secret) fail(t('auth.link_invalid'), [], 422);
        $step = Totp::verify($secret, (string)input('code'));
        if ($step === null) fail(t('auth.bad_code'), ['code' => t('auth.bad_code')]);
        $codes = $this->newRecoveryCodes();
        DB::q('REPLACE INTO user_2fa (user_id, secret_enc, enabled_at, recovery_codes, last_step) VALUES (?, ?, NOW(), ?, ?)',
            [Auth::id(), Crypto::encrypt($secret), json_encode(array_map(fn($c) => password_hash($c, PASSWORD_BCRYPT, ['cost' => 10]), $codes)), $step]);
        unset($_SESSION['tfa_secret']);
        Auth::activity('2fa_enabled');
        json_out(['ok' => true, 'message' => t('profile.2fa_on'), 'codes' => array_map(fn($c) => substr($c, 0, 5) . '-' . substr($c, 5), $codes)]);
    }

    private function newRecoveryCodes(): array
    {
        $codes = [];
        for ($i = 0; $i < 8; $i++) $codes[] = strtoupper(substr(bin2hex(random_bytes(8)), 0, 10));
        return $codes;
    }

    private function confirmIdentity(): void
    {
        $u = $this->user();
        $row = DB::row('SELECT * FROM user_2fa WHERE user_id = ?', [$u['id']]);
        $code = (string)input('code');
        $okCode = $row && ($s = Crypto::decrypt((string)$row['secret_enc'])) && Totp::verify($s, $code) !== null;
        $okPw = $u['password_hash'] && password_verify((string)($_POST['password'] ?? ''), $u['password_hash']);
        if (!$okCode && !$okPw) fail(t('profile.confirm_identity'), ['code' => t('profile.confirm_identity')]);
    }

    public function twoFactorDisable(): void
    {
        $this->confirmIdentity();
        DB::q('DELETE FROM user_2fa WHERE user_id = ?', [Auth::id()]);
        Auth::activity('2fa_disabled');
        respond(true, t('profile.2fa_off'), '/profile/security');
    }

    public function twoFactorRecovery(): void
    {
        $this->confirmIdentity();
        $codes = $this->newRecoveryCodes();
        DB::q('UPDATE user_2fa SET recovery_codes = ? WHERE user_id = ?', [json_encode(array_map(fn($c) => password_hash($c, PASSWORD_BCRYPT, ['cost' => 10]), $codes)), Auth::id()]);
        Auth::activity('2fa_recovery_regenerated');
        json_out(['ok' => true, 'message' => t('profile.codes_new'), 'codes' => array_map(fn($c) => substr($c, 0, 5) . '-' . substr($c, 5), $codes)]);
    }

    public function revokeSession(string $id): void
    {
        DB::q('UPDATE user_sessions SET revoked_at = NOW() WHERE id = ? AND user_id = ? AND session_hash <> ?', [(int)$id, Auth::id(), Auth::currentSessionHash()]);
        Auth::activity('session_revoked', "#$id");
        respond(true, t('profile.session_revoked'), '/profile/security');
    }

    public function revokeAll(): void
    {
        $n = Auth::revokeOthers((int)Auth::id());
        Auth::activity('sessions_revoked_all', (string)$n);
        respond(true, t('profile.sessions_revoked', ['n' => num($n)]), '/profile/security');
    }

    public function deletePasskey(string $id): void
    {
        DB::q('DELETE FROM passkeys WHERE id = ? AND user_id = ?', [(int)$id, Auth::id()]);
        Auth::activity('passkey_removed', "#$id");
        respond(true, t('profile.passkey_removed'), '/profile/security');
    }

    public function payments(): void
    {
        $status = (string)input('status');
        $where = 'p.user_id = ?'; $params = [Auth::id()];
        if (in_array($status, ['pending', 'approved', 'rejected', 'refunded'], true)) { $where .= ' AND p.status = ?'; $params[] = $status; }
        $p = DB::paginate('p.*, o.service_title, o.order_no, o.status AS order_status', "FROM payments p JOIN orders o ON o.id = p.order_id WHERE $where ORDER BY p.id DESC", $params, input_int('page', 1), 15);
        $this->show('payments', ['p' => $p, 'status' => $status, 'methods' => array_column(DB::all('SELECT code, name, logo FROM payment_methods'), null, 'code')], t('profile.payments'));
    }

    public function payment(string $id): void
    {
        $pay = DB::row('SELECT p.*, o.service_title, o.order_no, o.status AS order_status, o.note, s.slug FROM payments p JOIN orders o ON o.id = p.order_id
            LEFT JOIN services s ON s.id = o.service_id WHERE p.id = ? AND p.user_id = ?', [(int)$id, Auth::id()]);
        if (!$pay) throw new HttpException(t('error.404'), 404);
        $method = DB::row('SELECT * FROM payment_methods WHERE code = ?', [$pay['method_code']]);
        $this->show('payment', ['pay' => $pay, 'method' => $method], t('profile.payment') . ' #' . $pay['id']);
    }
}
