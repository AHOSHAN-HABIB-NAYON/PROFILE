<?php
declare(strict_types=1);

/**
 * Sessions and accounts. The website uses an HttpOnly cookie; the Android app
 * sends "X-Client: android" and gets a bearer token in the response instead.
 */
final class Auth
{
    public const COOKIE = 'joma_session';
    private const DUMMY_HASH = '$2y$10$93mtySDWFQjEazeXPBgDE.4OZJyQRM5PSiYPRRYVitzYZjK4Broxe';

    private static ?array $user = null;

    public static function isAppClient(): bool
    {
        return strtolower(Http::header('X-Client')) === 'android';
    }

    /** Creates a session and returns the login response for the client. */
    public static function startSession(int $userId): array
    {
        $token = bin2hex(random_bytes(32));
        $days = (int) config('session_days', 30);
        $client = self::isAppClient() ? 'android' : 'web';
        Db::run(
            'INSERT INTO sessions (user_id, token_hash, client, user_agent, expires_at)
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
            [$userId, hash('sha256', $token), $client,
                substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255), $days]
        );

        $response = ['user' => self::publicUser(self::findUser($userId))];
        if ($client === 'android') {
            $response['token'] = $token;
        } else {
            setcookie(self::COOKIE, $token, [
                'expires' => time() + $days * 86400,
                'path' => '/',
                'secure' => is_https(),
                'httponly' => true,
                'samesite' => 'Strict',
            ]);
        }
        return $response;
    }

    public static function logout(): void
    {
        $token = self::presentedToken();
        if ($token !== null) {
            Db::run('DELETE FROM sessions WHERE token_hash = ?', [hash('sha256', $token)]);
        }
        if (isset($_COOKIE[self::COOKIE])) {
            setcookie(self::COOKIE, '', ['expires' => 1, 'path' => '/', 'secure' => is_https(),
                'httponly' => true, 'samesite' => 'Strict']);
        }
    }

    /** The signed-in user, or null. */
    public static function user(): ?array
    {
        if (self::$user !== null) {
            return self::$user;
        }
        $token = self::presentedToken();
        if ($token === null) {
            return null;
        }
        $session = Db::one(
            'SELECT id, user_id, last_used_at FROM sessions WHERE token_hash = ? AND expires_at > NOW()',
            [hash('sha256', $token)]
        );
        if ($session === null) {
            return null;
        }
        if (strtotime($session['last_used_at']) < time() - 300) {
            Db::run('UPDATE sessions SET last_used_at = NOW() WHERE id = ?', [$session['id']]);
        }
        return self::$user = self::findUser((int) $session['user_id']);
    }

    public static function requireUser(): array
    {
        $user = self::user();
        if ($user === null) {
            throw new ApiError(401, 'unauthenticated', 'অনুগ্রহ করে আবার লগইন করুন।');
        }
        return $user;
    }

    /**
     * Cookie sessions only accept state-changing requests that carry the
     * X-Requested-With header, which another site cannot add (CSRF protection).
     */
    public static function checkCsrf(): void
    {
        if (Http::method() === 'GET' || Http::header('Authorization') !== '') {
            return;
        }
        if (Http::header('X-Requested-With') !== 'XMLHttpRequest' && !self::isAppClient()) {
            throw new ApiError(403, 'csrf', 'অনুরোধটি গ্রহণ করা যায়নি।');
        }
    }

    private static function presentedToken(): ?string
    {
        $header = Http::header('Authorization');
        if (preg_match('/^Bearer\s+([a-f0-9]{64})$/i', $header, $m)) {
            return strtolower($m[1]);
        }
        $cookie = $_COOKIE[self::COOKIE] ?? '';
        if (is_string($cookie) && preg_match('/^[a-f0-9]{64}$/', $cookie)) {
            return $cookie;
        }
        return null;
    }

    // ------------------------------------------------------------ accounts

    public static function register(string $name, string $email, string $password): int
    {
        $email = self::normalizeEmail($email);
        if (mb_strlen($name) < 2) {
            throw new ApiError(422, 'invalid_name', 'নাম কমপক্ষে ২ অক্ষরের হতে হবে।');
        }
        if (strlen($password) < 8) {
            throw new ApiError(422, 'weak_password', 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।');
        }
        if (Db::one('SELECT id FROM users WHERE email = ?', [$email]) !== null) {
            throw new ApiError(409, 'email_taken', 'এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে।');
        }
        return self::createUser($name, $email, password_hash($password, PASSWORD_DEFAULT));
    }

    public static function loginWithPassword(string $email, string $password): int
    {
        $email = self::normalizeEmail($email);
        self::throttle($email);
        $user = Db::one('SELECT id, password_hash FROM users WHERE email = ?', [$email]);
        $hash = $user['password_hash'] ?? null;
        // Verify against a dummy hash too, so unknown emails take the same time.
        $ok = password_verify($password, $hash ?? self::DUMMY_HASH);
        if ($user === null || $hash === null || !$ok) {
            Db::run('INSERT INTO login_attempts (ip, email) VALUES (?, ?)', [Http::ip(), $email]);
            if ($user !== null && $hash === null) {
                throw new ApiError(401, 'no_password',
                    'এই অ্যাকাউন্টে পাসওয়ার্ড নেই। Google বা পাসকি দিয়ে লগইন করুন।');
            }
            throw new ApiError(401, 'bad_credentials', 'ইমেইল বা পাসওয়ার্ড ভুল।');
        }
        if (password_needs_rehash($hash, PASSWORD_DEFAULT)) {
            Db::run('UPDATE users SET password_hash = ? WHERE id = ?',
                [password_hash($password, PASSWORD_DEFAULT), $user['id']]);
        }
        return (int) $user['id'];
    }

    /** Finds the account for a verified Google identity, linking or creating it. */
    public static function loginWithGoogle(array $identity): int
    {
        $user = Db::one('SELECT id FROM users WHERE google_sub = ?', [$identity['sub']]);
        if ($user !== null) {
            return (int) $user['id'];
        }
        $email = self::normalizeEmail($identity['email']);
        $user = Db::one('SELECT id FROM users WHERE email = ?', [$email]);
        if ($user !== null) {
            Db::run('UPDATE users SET google_sub = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?',
                [$identity['sub'], $identity['picture'], $user['id']]);
            return (int) $user['id'];
        }
        $name = $identity['name'] !== '' ? $identity['name'] : strstr($email, '@', true);
        $id = self::createUser($name, $email, null);
        Db::run('UPDATE users SET google_sub = ?, avatar_url = ? WHERE id = ?',
            [$identity['sub'], $identity['picture'], $id]);
        return $id;
    }

    private static function createUser(string $name, string $email, ?string $passwordHash): int
    {
        Db::run(
            'INSERT INTO users (name, email, password_hash, webauthn_handle) VALUES (?, ?, ?, ?)',
            [mb_substr($name, 0, 100), $email, $passwordHash, random_bytes(16)]
        );
        return (int) Db::pdo()->lastInsertId();
    }

    /** Ten failures per IP or five per email in 15 minutes locks login for a while. */
    private static function throttle(string $email): void
    {
        $row = Db::one(
            'SELECT
                SUM(ip = ?) AS by_ip,
                SUM(email = ?) AS by_email
             FROM login_attempts
             WHERE created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE) AND (ip = ? OR email = ?)',
            [Http::ip(), $email, Http::ip(), $email]
        );
        if ((int) ($row['by_ip'] ?? 0) >= 10 || (int) ($row['by_email'] ?? 0) >= 5) {
            throw new ApiError(429, 'too_many_attempts',
                'অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।');
        }
    }

    public static function normalizeEmail(string $email): string
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new ApiError(422, 'invalid_email', 'সঠিক ইমেইল ঠিকানা দিন।');
        }
        return $email;
    }

    public static function findUser(int $id): array
    {
        $user = Db::one('SELECT * FROM users WHERE id = ?', [$id]);
        if ($user === null) {
            throw new ApiError(401, 'unauthenticated', 'অনুগ্রহ করে আবার লগইন করুন।');
        }
        return $user;
    }

    public static function publicUser(array $user): array
    {
        $passkeys = (int) Db::one('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?', [$user['id']])['n'];
        return [
            'id' => (int) $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'avatar_url' => $user['avatar_url'],
            'has_password' => $user['password_hash'] !== null,
            'google_linked' => $user['google_sub'] !== null,
            'passkey_count' => $passkeys,
            'member_since' => substr((string) $user['created_at'], 0, 10),
        ];
    }
}
