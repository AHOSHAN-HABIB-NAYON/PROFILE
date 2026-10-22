<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Config;
use OryzenX\Core\Database;
use OryzenX\Core\HttpException;
use OryzenX\Core\RateLimiter;
use OryzenX\Core\Request;
use OryzenX\Core\Security;
use OryzenX\Core\Validator;

final class AuthService
{
    public const WEB_COOKIE = 'oryx_sid';
    private const WEB_TTL = 7 * 86400;          // sliding idle window for web sessions
    private const ADMIN_WEB_TTL = 4 * 3600;     // shorter idle window for admins
    private const API_TTL = 30 * 86400;         // mobile app tokens
    private const VERIFY_TTL = 24 * 3600;
    private const RESET_TTL = 3600;
    private const REAUTH_WINDOW = 600;
    private const LOCK_AFTER = 8;
    private const LOCK_MINUTES = 15;

    private array $permCache = [];

    public function __construct(
        private Database $db,
        private RateLimiter $limiter,
        private AuditService $audit,
        private SettingsService $settings,
        private NotificationService $notify
    ) {
    }

    // ------------------------------------------------------------------ registration

    public function register(array $input, string $ip): array
    {
        if (!$this->settings->bool('registration_open', true)) {
            throw new HttpException(403, 'registration_closed', 'Registration is currently closed.');
        }
        $this->limiter->hit('register', $ip, 10, 3600);
        $data = Validator::make($input, [
            'full_name' => 'required|string|min:2|max:120',
            'email' => 'required|email',
            'phone' => 'nullable|phone',
            'password' => 'required|password',
            'password_confirmation' => 'required|same:password',
            'address' => 'nullable|string|max:255',
            'city' => 'nullable|string|max:100',
            'country' => 'nullable|string|max:100',
            'locale' => 'nullable|in:en,bn',
            'accept_terms' => 'accepted',
        ])->validated();

        if ($this->db->value('SELECT id FROM users WHERE email = :e', ['e' => $data['email']])) {
            // Same generic message the UI shows for any failure; does not confirm the address exists to scrapers
            throw HttpException::validation(['email' => 'An account with this email already exists. Try signing in or resetting your password.']);
        }
        $now = Database::now();
        $userId = $this->db->transaction(function (Database $db) use ($data, $now) {
            $id = $db->insert('users', [
                'uuid' => Security::uuid(),
                'email' => $data['email'],
                'password_hash' => password_hash($data['password'], PASSWORD_DEFAULT),
                'full_name' => strip_tags($data['full_name']),
                'phone' => $data['phone'],
                'locale' => $data['locale'] ?? 'en',
                'terms_accepted_at' => $now,
                'password_changed_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $db->insert('user_profiles', [
                'user_id' => $id,
                'address_line' => $data['address'] ? strip_tags($data['address']) : null,
                'city' => $data['city'] ? strip_tags($data['city']) : null,
                'country' => $data['country'] ? strip_tags($data['country']) : null,
                'updated_at' => $now,
            ]);
            $db->insert('notification_preferences', ['user_id' => $id, 'updated_at' => $now]);
            return $id;
        });
        $user = $this->findUser($userId);
        $this->sendVerification($user);
        return $user;
    }

    // ------------------------------------------------------------------ login

    /** @return array{user:array, token:string, session:array} */
    public function login(string $email, string $password, Request $req, string $kind = 'web', ?string $deviceName = null): array
    {
        $email = mb_strtolower(trim($email));
        $ip = $req->ip();
        $this->limiter->hit('login_ip', $ip, 30, 900);
        $this->limiter->hit('login_email', $email, 10, 900);

        $user = $this->db->one('SELECT * FROM users WHERE email = :e', ['e' => $email]);
        $fail = function (string $reason) use ($user, $email, $req) {
            $this->recordLogin($user['id'] ?? null, $email, $req, false, $reason, 'password');
            throw new HttpException(401, 'invalid_credentials', 'The email or password is incorrect.');
        };
        if (!$user || !$user['password_hash']) {
            // constant-time-ish: still run a hash verification
            password_verify($password, '$2y$10$usesomesillystringfore7hnbRJHxXVLeakoG8K30oukPsA.ztMG');
            $fail($user ? 'no_password' : 'unknown_email');
        }
        if ($user['locked_until'] && strtotime($user['locked_until'] . ' UTC') > time()) {
            $this->recordLogin((int) $user['id'], $email, $req, false, 'locked', 'password');
            throw new HttpException(423, 'account_locked', 'Too many failed attempts. Try again in a few minutes or reset your password.');
        }
        if (!password_verify($password, $user['password_hash'])) {
            $fails = (int) $user['failed_logins'] + 1;
            $lock = $fails >= self::LOCK_AFTER ? gmdate('Y-m-d H:i:s', time() + self::LOCK_MINUTES * 60) : null;
            $this->db->update('users', ['failed_logins' => $lock ? 0 : $fails, 'locked_until' => $lock], 'id = :id', ['id' => $user['id']]);
            $fail('bad_password');
        }
        if ($user['status'] !== 'active') {
            $this->recordLogin((int) $user['id'], $email, $req, false, 'suspended', 'password');
            throw new HttpException(403, 'account_suspended', 'This account is suspended. Please contact support.');
        }
        if (password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT)) {
            $this->db->update('users', ['password_hash' => password_hash($password, PASSWORD_DEFAULT)], 'id = :id', ['id' => $user['id']]);
        }
        return $this->completeLogin($user, $req, $kind, $deviceName, 'password');
    }

    public function completeLogin(array $user, Request $req, string $kind, ?string $deviceName, string $method): array
    {
        $this->limiter->clear('login_email', $user['email']);
        $this->db->update('users', ['failed_logins' => 0, 'locked_until' => null, 'last_login_at' => Database::now()], 'id = :id', ['id' => $user['id']]);
        $suspicious = $this->isSuspicious((int) $user['id'], $req);
        $this->recordLogin((int) $user['id'], $user['email'], $req, true, null, $method, $suspicious);
        if ($suspicious) {
            $this->notify->securityEvent((int) $user['id'], 'new_device_login', [
                'ip' => $req->ip(),
                'device' => $deviceName ?: $req->userAgent(),
            ]);
        }
        [$token, $session] = $this->createSession((int) $user['id'], $req, $kind, $deviceName, (bool) $user['is_admin']);
        return ['user' => $this->findUser((int) $user['id']), 'token' => $token, 'session' => $session];
    }

    private function isSuspicious(int $userId, Request $req): bool
    {
        $prev = $this->db->all(
            'SELECT ip, user_agent FROM login_history WHERE user_id = :u AND success = 1 ORDER BY id DESC LIMIT 20',
            ['u' => $userId]
        );
        if (!$prev) {
            return false; // first login
        }
        foreach ($prev as $p) {
            if ($p['ip'] === $req->ip() || $p['user_agent'] === $req->userAgent()) {
                return false;
            }
        }
        return true;
    }

    private function recordLogin(?int $userId, string $email, Request $req, bool $ok, ?string $reason, string $method, bool $suspicious = false): void
    {
        $this->db->insert('login_history', [
            'user_id' => $userId,
            'email' => mb_substr($email, 0, 190),
            'method' => $method,
            'ip' => $req->ip(),
            'user_agent' => $req->userAgent(),
            'success' => $ok ? 1 : 0,
            'reason' => $reason,
            'suspicious' => $suspicious ? 1 : 0,
            'created_at' => Database::now(),
        ]);
    }

    /** @return array{0:string,1:array} */
    public function createSession(int $userId, Request $req, string $kind, ?string $deviceName, bool $isAdmin = false): array
    {
        $token = Security::randomToken(32);
        $ttl = $kind === 'api' ? self::API_TTL : ($isAdmin ? self::ADMIN_WEB_TTL : self::WEB_TTL);
        $now = Database::now();
        $row = [
            'user_id' => $userId,
            'token_hash' => Security::hashToken($token),
            'kind' => $kind,
            'csrf_token' => $kind === 'web' ? Security::randomToken(32) : null,
            'device_name' => $deviceName ? mb_substr(strip_tags($deviceName), 0, 100) : null,
            'ip' => $req->ip(),
            'user_agent' => $req->userAgent(),
            'reauth_at' => $now,
            'created_at' => $now,
            'last_seen_at' => $now,
            'expires_at' => gmdate('Y-m-d H:i:s', time() + $ttl),
        ];
        $row['id'] = $this->db->insert('user_sessions', $row);
        return [$token, $row];
    }

    /** Resolve the authenticated user from the bearer token (app) or session cookie (web). */
    public function resolve(Request $req): ?array
    {
        $token = $req->bearerToken();
        $kind = 'api';
        if ($token === null) {
            $token = (string) ($req->cookies[self::WEB_COOKIE] ?? '');
            $kind = 'web';
            if ($token === '' || strlen($token) > 200) {
                return null;
            }
        }
        $session = $this->db->one(
            'SELECT * FROM user_sessions WHERE token_hash = :h AND kind = :k AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()',
            ['h' => Security::hashToken($token), 'k' => $kind]
        );
        if (!$session) {
            return null;
        }
        $user = $this->findUser((int) $session['user_id']);
        if (!$user) {
            return null;
        }
        // sliding expiry, written at most once per 5 minutes
        if (strtotime($session['last_seen_at'] . ' UTC') < time() - 300) {
            $ttl = $kind === 'api' ? self::API_TTL : ((int) $user['is_admin'] ? self::ADMIN_WEB_TTL : self::WEB_TTL);
            $this->db->update('user_sessions', [
                'last_seen_at' => Database::now(),
                'expires_at' => gmdate('Y-m-d H:i:s', time() + $ttl),
                'ip' => $req->ip(),
            ], 'id = :id', ['id' => $session['id']]);
        }
        return ['user' => $user, 'session' => $session];
    }

    public function logout(array $session): void
    {
        $this->db->update('user_sessions', ['revoked_at' => Database::now()], 'id = :id', ['id' => $session['id']]);
    }

    public function revokeOtherSessions(int $userId, ?int $keepSessionId): int
    {
        return $this->db->run(
            'UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = :u AND revoked_at IS NULL AND id <> :k',
            ['u' => $userId, 'k' => $keepSessionId ?? 0]
        )->rowCount();
    }

    public function revokeSession(int $userId, int $sessionId): bool
    {
        return $this->db->run(
            'UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = :u AND id = :id AND revoked_at IS NULL',
            ['u' => $userId, 'id' => $sessionId]
        )->rowCount() > 0;
    }

    public function sessions(int $userId): array
    {
        return $this->db->all(
            'SELECT id, kind, device_name, ip, user_agent, created_at, last_seen_at, expires_at FROM user_sessions
             WHERE user_id = :u AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY last_seen_at DESC LIMIT 50',
            ['u' => $userId]
        );
    }

    public function loginHistory(int $userId, int $limit = 30): array
    {
        return $this->db->all(
            'SELECT method, ip, user_agent, success, reason, suspicious, created_at FROM login_history WHERE user_id = :u ORDER BY id DESC LIMIT :l',
            ['u' => $userId, 'l' => $limit]
        );
    }

    /** Confirms the password again before sensitive admin/security actions. */
    public function reauthenticate(array $user, array $session, string $password, Request $req): void
    {
        $this->limiter->hit('reauth', (string) $user['id'], 10, 900);
        $row = $this->db->one('SELECT password_hash FROM users WHERE id = :id', ['id' => $user['id']]);
        if (!$row || !$row['password_hash'] || !password_verify($password, $row['password_hash'])) {
            throw new HttpException(401, 'invalid_password', 'The password is incorrect.');
        }
        $this->db->update('user_sessions', ['reauth_at' => Database::now()], 'id = :id', ['id' => $session['id']]);
    }

    public function requireRecentReauth(array $session): void
    {
        $fresh = $this->db->value('SELECT reauth_at FROM user_sessions WHERE id = :id', ['id' => $session['id']]);
        if (!$fresh || strtotime($fresh . ' UTC') < time() - self::REAUTH_WINDOW) {
            throw new HttpException(428, 'reauth_required', 'Please confirm your password to continue.');
        }
    }

    // ------------------------------------------------------------------ email verification

    public function sendVerification(array $user, bool $isResend = false): void
    {
        if ($user['email_verified_at'] !== null) {
            return;
        }
        if ($isResend) {
            $this->limiter->hit('verify_resend', (string) $user['id'], 3, 900);
        }
        $token = Security::randomToken(32);
        $code = Security::numericCode(6);
        $this->db->run('UPDATE verification_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = :u AND used_at IS NULL', ['u' => $user['id']]);
        $this->db->insert('verification_tokens', [
            'user_id' => $user['id'],
            'purpose' => 'email_verify',
            'token_hash' => Security::hashToken($token),
            'code_hash' => Security::hashToken($user['id'] . ':' . $code),
            'expires_at' => gmdate('Y-m-d H:i:s', time() + self::VERIFY_TTL),
            'created_at' => Database::now(),
        ]);
        $this->notify->emailNow((int) $user['id'], 'verify_email', [
            'name' => $user['full_name'],
            'code' => $code,
            'link' => Config::appUrl('verify-email?token=' . $token),
            'hours' => self::VERIFY_TTL / 3600,
        ], 'verify:' . $user['id'] . ':' . substr(hash('sha256', $token), 0, 16));
    }

    public function verifyEmailByToken(string $token): array
    {
        $row = $this->db->one(
            'SELECT * FROM verification_tokens WHERE token_hash = :h AND purpose = "email_verify"',
            ['h' => Security::hashToken($token)]
        );
        if (!$row || $row['used_at'] !== null || strtotime($row['expires_at'] . ' UTC') < time()) {
            throw new HttpException(400, 'invalid_token', 'This verification link is invalid or has expired. Request a new one from the app.');
        }
        return $this->markVerified($row);
    }

    public function verifyEmailByCode(int $userId, string $code): array
    {
        $this->limiter->hit('verify_code', (string) $userId, 10, 900);
        $row = $this->db->one(
            'SELECT * FROM verification_tokens WHERE user_id = :u AND purpose = "email_verify" AND used_at IS NULL ORDER BY id DESC LIMIT 1',
            ['u' => $userId]
        );
        if (!$row || strtotime($row['expires_at'] . ' UTC') < time()) {
            throw new HttpException(400, 'invalid_code', 'This code has expired. Request a new code.');
        }
        if ((int) $row['attempts'] >= 5) {
            throw new HttpException(400, 'invalid_code', 'Too many incorrect codes. Request a new code.');
        }
        if (!hash_equals($row['code_hash'], Security::hashToken($userId . ':' . preg_replace('/\D/', '', $code)))) {
            $this->db->run('UPDATE verification_tokens SET attempts = attempts + 1 WHERE id = :id', ['id' => $row['id']]);
            throw new HttpException(400, 'invalid_code', 'The code is incorrect.');
        }
        return $this->markVerified($row);
    }

    private function markVerified(array $tokenRow): array
    {
        $this->db->transaction(function (Database $db) use ($tokenRow) {
            $db->update('verification_tokens', ['used_at' => Database::now()], 'id = :id', ['id' => $tokenRow['id']]);
            $db->run('UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()), updated_at = UTC_TIMESTAMP() WHERE id = :id', ['id' => $tokenRow['user_id']]);
        });
        $this->audit->log((int) $tokenRow['user_id'], 'auth.email_verified', 'user', $tokenRow['user_id']);
        return $this->findUser((int) $tokenRow['user_id']);
    }

    // ------------------------------------------------------------------ password reset

    public function requestPasswordReset(string $email, string $ip): void
    {
        $email = mb_strtolower(trim($email));
        $this->limiter->hit('reset_ip', $ip, 10, 3600);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw HttpException::validation(['email' => 'Enter a valid email address.']);
        }
        if ($this->limiter->attempt('reset_email', $email, 3, 3600) < 0) {
            return; // silently ignore to avoid account enumeration
        }
        $user = $this->db->one('SELECT * FROM users WHERE email = :e AND status = "active"', ['e' => $email]);
        if (!$user) {
            return;
        }
        $token = Security::randomToken(32);
        $this->db->run('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = :u AND used_at IS NULL', ['u' => $user['id']]);
        $this->db->insert('password_reset_tokens', [
            'user_id' => $user['id'],
            'token_hash' => Security::hashToken($token),
            'ip' => $ip,
            'expires_at' => gmdate('Y-m-d H:i:s', time() + self::RESET_TTL),
            'created_at' => Database::now(),
        ]);
        $this->notify->emailNow((int) $user['id'], 'password_reset', [
            'name' => $user['full_name'],
            'link' => Config::appUrl('reset-password?token=' . $token),
            'minutes' => self::RESET_TTL / 60,
            'ip' => $ip,
        ], 'reset:' . $user['id'] . ':' . substr(hash('sha256', $token), 0, 16));
    }

    public function resetPassword(string $token, string $password, string $confirmation): void
    {
        Validator::make(['password' => $password, 'password_confirmation' => $confirmation], [
            'password' => 'required|password',
            'password_confirmation' => 'required|same:password',
        ])->validated();
        $row = $this->db->one('SELECT * FROM password_reset_tokens WHERE token_hash = :h', ['h' => Security::hashToken($token)]);
        if (!$row || $row['used_at'] !== null || strtotime($row['expires_at'] . ' UTC') < time()) {
            throw new HttpException(400, 'invalid_token', 'This reset link is invalid or has expired. Request a new one.');
        }
        $this->db->transaction(function (Database $db) use ($row, $password) {
            $db->update('password_reset_tokens', ['used_at' => Database::now()], 'id = :id', ['id' => $row['id']]);
            $db->update('users', [
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'password_changed_at' => Database::now(),
                'failed_logins' => 0,
                'locked_until' => null,
                'updated_at' => Database::now(),
            ], 'id = :id', ['id' => $row['user_id']]);
            // a password reset signs out every device
            $db->run('UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = :u AND revoked_at IS NULL', ['u' => $row['user_id']]);
        });
        $this->audit->log((int) $row['user_id'], 'auth.password_reset', 'user', $row['user_id']);
        $this->notify->securityEvent((int) $row['user_id'], 'password_changed', []);
    }

    public function changePassword(array $user, array $session, string $current, string $new, string $confirmation): void
    {
        $this->limiter->hit('change_password', (string) $user['id'], 5, 900);
        $row = $this->db->one('SELECT password_hash FROM users WHERE id = :id', ['id' => $user['id']]);
        if ($row['password_hash'] && !password_verify($current, $row['password_hash'])) {
            throw HttpException::validation(['current_password' => 'Your current password is incorrect.']);
        }
        Validator::make(['password' => $new, 'password_confirmation' => $confirmation], [
            'password' => 'required|password',
            'password_confirmation' => 'required|same:password',
        ])->validated();
        $this->db->update('users', [
            'password_hash' => password_hash($new, PASSWORD_DEFAULT),
            'password_changed_at' => Database::now(),
            'updated_at' => Database::now(),
        ], 'id = :id', ['id' => $user['id']]);
        $this->revokeOtherSessions((int) $user['id'], (int) $session['id']);
        $this->audit->log((int) $user['id'], 'auth.password_changed', 'user', $user['id']);
        $this->notify->securityEvent((int) $user['id'], 'password_changed', []);
    }

    // ------------------------------------------------------------------ Google sign-in

    /** Verifies a Google ID token (from Google Identity Services / Android Credential Manager). */
    public function googleLogin(string $idToken, Request $req, string $kind, ?string $device): array
    {
        $clientIds = $this->settings->googleClientIds();
        if (!$clientIds) {
            throw new HttpException(503, 'google_not_configured', 'Google sign-in is not configured for this platform yet.');
        }
        $this->limiter->hit('google_login', $req->ip(), 30, 900);
        $claims = $this->verifyGoogleToken($idToken, $clientIds);
        $email = mb_strtolower((string) $claims['email']);
        $user = $this->db->one('SELECT * FROM users WHERE google_sub = :s', ['s' => $claims['sub']])
            ?? $this->db->one('SELECT * FROM users WHERE email = :e', ['e' => $email]);
        $now = Database::now();
        if (!$user) {
            if (!$this->settings->bool('registration_open', true)) {
                throw new HttpException(403, 'registration_closed', 'Registration is currently closed.');
            }
            $id = $this->db->transaction(function (Database $db) use ($claims, $email, $now) {
                $id = $db->insert('users', [
                    'uuid' => Security::uuid(),
                    'email' => $email,
                    'password_hash' => null,
                    'full_name' => mb_substr(strip_tags((string) ($claims['name'] ?? $email)), 0, 120),
                    'google_sub' => $claims['sub'],
                    'email_verified_at' => $now, // Google asserted email_verified=true
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $db->insert('user_profiles', ['user_id' => $id, 'updated_at' => $now]);
                $db->insert('notification_preferences', ['user_id' => $id, 'updated_at' => $now]);
                return $id;
            });
            $user = $this->db->one('SELECT * FROM users WHERE id = :id', ['id' => $id]);
        } else {
            $upd = [];
            if (!$user['google_sub']) {
                $upd['google_sub'] = $claims['sub'];
            }
            if (!$user['email_verified_at'] && strcasecmp($user['email'], $email) === 0) {
                $upd['email_verified_at'] = $now;
            }
            if ($upd) {
                $this->db->update('users', $upd, 'id = :id', ['id' => $user['id']]);
            }
        }
        if ($user['status'] !== 'active') {
            throw new HttpException(403, 'account_suspended', 'This account is suspended. Please contact support.');
        }
        return $this->completeLogin($user, $req, $kind, $device, 'google');
    }

    private function verifyGoogleToken(string $idToken, array $clientIds): array
    {
        if (!preg_match('/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/', $idToken)) {
            throw new HttpException(400, 'invalid_google_token', 'Google sign-in failed. Please try again.');
        }
        // Google's tokeninfo endpoint validates the signature and expiry server-side.
        $res = HttpClient::get('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($idToken), [], 10);
        $claims = $res['status'] === 200 ? json_decode($res['body'], true) : null;
        if (!is_array($claims)
            || !in_array($claims['aud'] ?? '', $clientIds, true)
            || !in_array($claims['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)
            || ($claims['email_verified'] ?? '') !== 'true' && ($claims['email_verified'] ?? false) !== true
            || (int) ($claims['exp'] ?? 0) < time()
            || empty($claims['sub']) || empty($claims['email'])) {
            throw new HttpException(401, 'invalid_google_token', 'Google sign-in could not be verified. Please try again.');
        }
        return $claims;
    }

    // ------------------------------------------------------------------ users & permissions

    public function findUser(int $id): ?array
    {
        return $this->db->one(
            'SELECT id, uuid, email, full_name, username, phone, status, email_verified_at, identity_status, is_admin, locale, theme,
                    avatar_path, last_login_at, created_at, google_sub IS NOT NULL AS has_google, password_hash IS NOT NULL AS has_password, is_demo
             FROM users WHERE id = :id',
            ['id' => $id]
        );
    }

    public function permissions(array $user): array
    {
        if (!(int) $user['is_admin']) {
            return [];
        }
        $id = (int) $user['id'];
        if (!isset($this->permCache[$id])) {
            $this->permCache[$id] = array_column($this->db->all(
                'SELECT DISTINCT p.slug FROM user_roles ur
                 JOIN role_permissions rp ON rp.role_id = ur.role_id
                 JOIN permissions p ON p.id = rp.permission_id
                 WHERE ur.user_id = :u',
                ['u' => $id]
            ), 'slug');
        }
        return $this->permCache[$id];
    }

    public function can(array $user, string $permission): bool
    {
        return in_array($permission, $this->permissions($user), true);
    }

    public function flushPermissionCache(): void
    {
        $this->permCache = [];
    }

    /** Public, client-safe representation of the current user. */
    public function present(array $user): array
    {
        $ver = [
            'email_verified' => $user['email_verified_at'] !== null,
            'identity_status' => $user['identity_status'],
            'identity_required' => $this->settings->bool('require_identity_verification', true),
        ];
        $ver['fully_verified'] = $ver['email_verified'] && (!$ver['identity_required'] || $user['identity_status'] === 'approved');
        return [
            'id' => (int) $user['id'],
            'uuid' => $user['uuid'],
            'email' => $user['email'],
            'full_name' => $user['full_name'],
            'phone' => $user['phone'],
            'status' => $user['status'],
            'locale' => $user['locale'],
            'theme' => $user['theme'],
            'avatar_url' => $user['avatar_path'] ? \OryzenX\Core\View::url('api/me/avatar') : null,
            'is_admin' => (bool) $user['is_admin'],
            'is_demo' => (bool) $user['is_demo'],
            'has_password' => (bool) $user['has_password'],
            'has_google' => (bool) $user['has_google'],
            'verification' => $ver,
            'permissions' => $this->permissions($user),
            'created_at' => $user['created_at'],
        ];
    }
}
