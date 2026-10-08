<?php
declare(strict_types=1);

/**
 * Passkeys (WebAuthn Level 2) for the website and the Android app.
 *
 * Options are sent as WebAuthn JSON (binary fields base64url-encoded), which
 * Android's Credential Manager accepts as-is and the website converts for
 * navigator.credentials. Responses come back in the same JSON shape.
 */
final class WebAuthn
{
    private const CHALLENGE_TTL = 300;

    private const FLAG_UP = 0x01; // user present
    private const FLAG_UV = 0x04; // user verified (fingerprint, face, PIN)
    private const FLAG_AT = 0x40; // attested credential data included

    public static function registrationOptions(array $user): array
    {
        $existing = Db::all('SELECT credential_id FROM passkeys WHERE user_id = ?', [$user['id']]);
        [$challengeId, $challenge] = self::newChallenge('register', (int) $user['id']);

        return [
            'challenge_id' => $challengeId,
            'options' => [
                'challenge' => $challenge,
                'rp' => ['id' => self::rpId(), 'name' => (string) config('app_name')],
                'user' => [
                    'id' => base64url_encode($user['webauthn_handle']),
                    'name' => $user['email'],
                    'displayName' => $user['name'],
                ],
                'pubKeyCredParams' => [
                    ['type' => 'public-key', 'alg' => -7],
                    ['type' => 'public-key', 'alg' => -257],
                ],
                'timeout' => 120000,
                'attestation' => 'none',
                'authenticatorSelection' => [
                    'residentKey' => 'required',
                    'requireResidentKey' => true,
                    'userVerification' => 'required',
                ],
                'excludeCredentials' => array_map(
                    fn (array $row) => ['type' => 'public-key', 'id' => $row['credential_id']],
                    $existing
                ),
            ],
        ];
    }

    /** Verifies a new passkey and saves it to the user's account. */
    public static function register(array $user, string $challengeId, array $credential, string $name): array
    {
        $challenge = self::consumeChallenge($challengeId, 'register', (int) $user['id']);
        $response = self::responseOf($credential);

        $clientDataJson = base64url_decode((string) ($response['clientDataJSON'] ?? ''));
        self::checkClientData($clientDataJson, 'webauthn.create', $challenge);

        try {
            $attestation = Cbor::decode(base64url_decode((string) ($response['attestationObject'] ?? '')));
        } catch (UnexpectedValueException) {
            throw self::invalid();
        }
        if (!is_array($attestation) || !is_string($attestation['authData'] ?? null)) {
            throw self::invalid();
        }
        $auth = self::parseAuthData($attestation['authData']);
        if (!($auth['flags'] & self::FLAG_AT) || $auth['credentialId'] === null) {
            throw self::invalid();
        }

        $credentialId = base64url_encode($auth['credentialId']);
        $presentedId = (string) ($credential['rawId'] ?? $credential['id'] ?? '');
        if (!hash_equals($credentialId, rtrim($presentedId, '='))) {
            throw self::invalid();
        }
        try {
            $pem = Crypto::coseToPem($auth['publicKey']);
        } catch (UnexpectedValueException) {
            throw new ApiError(422, 'passkey_unsupported', 'এই ডিভাইসের পাসকি সমর্থিত নয়।');
        }
        if (Db::one('SELECT id FROM passkeys WHERE credential_id = ?', [$credentialId]) !== null) {
            throw new ApiError(409, 'passkey_exists', 'এই পাসকি আগেই যোগ করা আছে।');
        }

        $name = $name !== '' ? mb_substr($name, 0, 60) : self::defaultName();
        Db::run(
            'INSERT INTO passkeys (user_id, credential_id, public_key_pem, sign_count, name) VALUES (?, ?, ?, ?, ?)',
            [$user['id'], $credentialId, $pem, $auth['signCount'], $name]
        );
        return self::find((int) Db::pdo()->lastInsertId());
    }

    public static function loginOptions(): array
    {
        [$challengeId, $challenge] = self::newChallenge('login', null);
        return [
            'challenge_id' => $challengeId,
            'options' => [
                'challenge' => $challenge,
                'rpId' => self::rpId(),
                'timeout' => 120000,
                'userVerification' => 'required',
                'allowCredentials' => [],
            ],
        ];
    }

    /** Verifies a passkey sign-in and returns the user id. */
    public static function login(string $challengeId, array $credential): int
    {
        $challenge = self::consumeChallenge($challengeId, 'login', null);
        $response = self::responseOf($credential);

        $credentialId = rtrim((string) ($credential['rawId'] ?? $credential['id'] ?? ''), '=');
        $passkey = Db::one('SELECT * FROM passkeys WHERE credential_id = ?', [$credentialId]);
        if ($passkey === null) {
            throw new ApiError(401, 'passkey_unknown',
                'এই পাসকি কোনো অ্যাকাউন্টে যুক্ত নেই। আগে লগইন করে সেটিংস থেকে পাসকি যোগ করুন।');
        }

        $clientDataJson = base64url_decode((string) ($response['clientDataJSON'] ?? ''));
        self::checkClientData($clientDataJson, 'webauthn.get', $challenge);

        $authData = base64url_decode((string) ($response['authenticatorData'] ?? ''));
        $auth = self::parseAuthData($authData);

        $signature = base64url_decode((string) ($response['signature'] ?? ''));
        $signed = $authData . hash('sha256', $clientDataJson, true);
        if (openssl_verify($signed, $signature, $passkey['public_key_pem'], OPENSSL_ALGO_SHA256) !== 1) {
            throw self::invalid();
        }

        $userHandle = (string) ($response['userHandle'] ?? '');
        if ($userHandle !== '') {
            $owner = Db::one('SELECT webauthn_handle FROM users WHERE id = ?', [$passkey['user_id']]);
            if ($owner === null || !hash_equals($owner['webauthn_handle'], base64url_decode($userHandle))) {
                throw self::invalid();
            }
        }

        // A counter that fails to increase suggests a cloned authenticator.
        // Synced passkeys always report 0, which is allowed.
        $stored = (int) $passkey['sign_count'];
        if (($auth['signCount'] !== 0 || $stored !== 0) && $auth['signCount'] <= $stored) {
            throw self::invalid();
        }

        Db::run('UPDATE passkeys SET sign_count = ?, last_used_at = NOW() WHERE id = ?',
            [$auth['signCount'], $passkey['id']]);
        return (int) $passkey['user_id'];
    }

    public static function listFor(int $userId): array
    {
        $rows = Db::all('SELECT id FROM passkeys WHERE user_id = ? ORDER BY id DESC', [$userId]);
        return array_map(fn (array $row) => self::find((int) $row['id']), $rows);
    }

    public static function delete(int $userId, int $passkeyId): void
    {
        $user = Db::one('SELECT password_hash, google_sub FROM users WHERE id = ?', [$userId]);
        $count = (int) Db::one('SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?', [$userId])['n'];
        if ($count <= 1 && $user['password_hash'] === null && $user['google_sub'] === null) {
            throw new ApiError(409, 'last_login_method',
                'এটাই আপনার লগইন করার একমাত্র উপায়, তাই মুছে ফেলা যাবে না।');
        }
        $stmt = Db::run('DELETE FROM passkeys WHERE id = ? AND user_id = ?', [$passkeyId, $userId]);
        if ($stmt->rowCount() === 0) {
            throw new ApiError(404, 'not_found', 'পাসকিটি পাওয়া যায়নি।');
        }
    }

    /** The domain passkeys belong to, from config or base_url. */
    public static function rpId(): string
    {
        $rpId = (string) config('webauthn.rp_id', '');
        return $rpId !== '' ? $rpId : (string) parse_url((string) config('base_url'), PHP_URL_HOST);
    }

    /** Origins allowed in clientDataJSON: the website plus the signed Android app. */
    public static function allowedOrigins(): array
    {
        $origins = [rtrim((string) config('base_url'), '/')];
        foreach ((array) config('webauthn.origins', []) as $origin) {
            $origins[] = rtrim((string) $origin, '/');
        }
        foreach ((array) config('webauthn.android_cert_sha256', []) as $fingerprint) {
            $hex = preg_replace('/[^0-9a-f]/i', '', (string) $fingerprint);
            if (strlen($hex) === 64) {
                $origins[] = 'android:apk-key-hash:' . base64url_encode(hex2bin($hex));
            }
        }
        return $origins;
    }

    // ------------------------------------------------------------------ internals

    private static function newChallenge(string $purpose, ?int $userId): array
    {
        Db::run('DELETE FROM webauthn_challenges WHERE expires_at < NOW()');
        $id = bin2hex(random_bytes(16));
        $challenge = base64url_encode(random_bytes(32));
        Db::run(
            'INSERT INTO webauthn_challenges (id, user_id, purpose, challenge, expires_at)
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))',
            [$id, $userId, $purpose, $challenge, self::CHALLENGE_TTL]
        );
        return [$id, $challenge];
    }

    /** Loads a challenge and deletes it, so each one is single-use. */
    private static function consumeChallenge(string $id, string $purpose, ?int $userId): string
    {
        $row = Db::one(
            'SELECT * FROM webauthn_challenges WHERE id = ? AND purpose = ? AND expires_at > NOW()',
            [$id, $purpose]
        );
        if ($row !== null) {
            Db::run('DELETE FROM webauthn_challenges WHERE id = ?', [$id]);
        }
        if ($row === null || ($userId !== null && (int) $row['user_id'] !== $userId)) {
            throw new ApiError(400, 'challenge_expired', 'সময় শেষ হয়ে গেছে। আবার চেষ্টা করুন।');
        }
        return $row['challenge'];
    }

    private static function responseOf(array $credential): array
    {
        if (($credential['type'] ?? '') !== 'public-key' || !is_array($credential['response'] ?? null)) {
            throw self::invalid();
        }
        return $credential['response'];
    }

    private static function checkClientData(string $json, string $type, string $challenge): void
    {
        $data = json_decode($json, true);
        if (!is_array($data)
            || ($data['type'] ?? '') !== $type
            || !hash_equals($challenge, rtrim((string) ($data['challenge'] ?? ''), '='))
        ) {
            throw self::invalid();
        }
        if (!in_array(rtrim((string) ($data['origin'] ?? ''), '/'), self::allowedOrigins(), true)) {
            throw new ApiError(400, 'bad_origin', 'এই ঠিকানা থেকে পাসকি ব্যবহার করা যাবে না।');
        }
    }

    private static function parseAuthData(string $data): array
    {
        if (strlen($data) < 37) {
            throw self::invalid();
        }
        if (!hash_equals(hash('sha256', self::rpId(), true), substr($data, 0, 32))) {
            throw self::invalid();
        }
        $flags = ord($data[32]);
        if (!($flags & self::FLAG_UP) || !($flags & self::FLAG_UV)) {
            throw new ApiError(400, 'not_verified', 'আঙুলের ছাপ, ফেস বা পিন দিয়ে যাচাই করতে হবে।');
        }
        $result = [
            'flags' => $flags,
            'signCount' => unpack('N', substr($data, 33, 4))[1],
            'credentialId' => null,
            'publicKey' => null,
        ];
        if ($flags & self::FLAG_AT) {
            if (strlen($data) < 55) {
                throw self::invalid();
            }
            $idLength = unpack('n', substr($data, 53, 2))[1];
            $result['credentialId'] = substr($data, 55, $idLength);
            if (strlen($result['credentialId']) !== $idLength) {
                throw self::invalid();
            }
            $offset = 55 + $idLength;
            try {
                $result['publicKey'] = Cbor::decode($data, $offset);
            } catch (UnexpectedValueException) {
                throw self::invalid();
            }
            if (!is_array($result['publicKey'])) {
                throw self::invalid();
            }
        }
        return $result;
    }

    private static function find(int $id): array
    {
        $row = Db::one('SELECT id, name, created_at, last_used_at FROM passkeys WHERE id = ?', [$id]);
        return [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'created_at' => $row['created_at'],
            'last_used_at' => $row['last_used_at'],
        ];
    }

    private static function defaultName(): string
    {
        $agent = (string) ($_SERVER['HTTP_USER_AGENT'] ?? '');
        return match (true) {
            Auth::isAppClient(), str_contains($agent, 'Android') => 'Android ফোন',
            str_contains($agent, 'iPhone') => 'iPhone',
            str_contains($agent, 'Mac') => 'Mac',
            str_contains($agent, 'Windows') => 'Windows কম্পিউটার',
            default => 'পাসকি',
        };
    }

    private static function invalid(): ApiError
    {
        return new ApiError(400, 'passkey_invalid', 'পাসকি যাচাই করা যায়নি। আবার চেষ্টা করুন।');
    }
}
