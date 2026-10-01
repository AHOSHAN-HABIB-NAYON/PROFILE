<?php
/**
 * WebAuthn / Passkey relying-party implementation (ES256 + RS256).
 * Only the credential public key, id and counter are stored — never any
 * biometric data (that never leaves the user's authenticator).
 */
declare(strict_types=1);

final class WebAuthn
{
    private const TIMEOUT = 120000;

    public static function enabled(): bool
    {
        return setting_on('auth_passkey');
    }

    // ---------------------------------------------------------------- options

    public static function registrationOptions(array $user): array
    {
        $challenge = random_bytes(32);
        $_SESSION['webauthn_reg'] = ['challenge' => b64url_encode($challenge), 'user_id' => (int) $user['id'], 'time' => time()];
        $exclude = array_map(static fn ($id) => ['type' => 'public-key', 'id' => $id], db()->col('SELECT credential_id FROM passkeys WHERE user_id = ?', [$user['id']]));
        return [
            'challenge' => b64url_encode($challenge),
            'rp'        => ['name' => (string) setting('site_name', 'Probaho'), 'id' => rp_id()],
            'user'      => ['id' => $user['webauthn_handle'], 'name' => $user['email'], 'displayName' => $user['name']],
            'pubKeyCredParams' => [['type' => 'public-key', 'alg' => -7], ['type' => 'public-key', 'alg' => -257]],
            'authenticatorSelection' => ['residentKey' => 'required', 'requireResidentKey' => true, 'userVerification' => 'preferred'],
            'timeout'   => self::TIMEOUT,
            'attestation' => 'none',
            'excludeCredentials' => $exclude,
        ];
    }

    public static function loginOptions(): array
    {
        $challenge = random_bytes(32);
        $_SESSION['webauthn_auth'] = ['challenge' => b64url_encode($challenge), 'time' => time()];
        return [
            'challenge' => b64url_encode($challenge),
            'rpId' => rp_id(),
            'timeout' => self::TIMEOUT,
            'userVerification' => 'preferred',
            'allowCredentials' => [],
        ];
    }

    // ----------------------------------------------------------- verification

    private static function checkClientData(string $clientDataJSON, string $type, string $expectedChallenge): void
    {
        $c = json_decode($clientDataJSON, true);
        if (!is_array($c) || ($c['type'] ?? '') !== $type) {
            throw new RuntimeException('clientData type mismatch');
        }
        if (!hash_equals($expectedChallenge, (string) ($c['challenge'] ?? ''))) {
            throw new RuntimeException('challenge mismatch');
        }
        if (rtrim((string) ($c['origin'] ?? ''), '/') !== origin()) {
            throw new RuntimeException('origin mismatch: ' . ($c['origin'] ?? ''));
        }
    }

    private static function parseAuthData(string $authData): array
    {
        if (strlen($authData) < 37) {
            throw new RuntimeException('authData too short');
        }
        $out = [
            'rpIdHash'  => substr($authData, 0, 32),
            'flags'     => ord($authData[32]),
            'signCount' => unpack('N', substr($authData, 33, 4))[1],
        ];
        if (!hash_equals(hash('sha256', rp_id(), true), $out['rpIdHash'])) {
            throw new RuntimeException('rpIdHash mismatch');
        }
        if (!($out['flags'] & 0x01)) {
            throw new RuntimeException('user not present');
        }
        $out['uv'] = (bool) ($out['flags'] & 0x04);
        $out['be'] = (bool) ($out['flags'] & 0x08);
        $out['bs'] = (bool) ($out['flags'] & 0x10);
        if ($out['flags'] & 0x40) {
            $aaguid = substr($authData, 37, 16);
            $len = unpack('n', substr($authData, 53, 2))[1];
            $out['credentialId'] = substr($authData, 55, $len);
            $out['aaguid'] = vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($aaguid), 4));
            $out['cose'] = Cbor::decode(substr($authData, 55 + $len));
        }
        return $out;
    }

    /** Convert a COSE_Key into a PEM public key. */
    public static function coseToPem(array $cose): string
    {
        $kty = $cose[1] ?? null;
        if ($kty === 2) { // EC2 / P-256
            $x = Cbor::bytes($cose[-2] ?? null);
            $y = Cbor::bytes($cose[-3] ?? null);
            if (($cose[-1] ?? null) !== 1 || strlen($x) !== 32 || strlen($y) !== 32) {
                throw new RuntimeException('unsupported EC key');
            }
            return WebPush::p256PublicPem("\x04" . $x . $y);
        }
        if ($kty === 3) { // RSA
            $n = Cbor::bytes($cose[-1] ?? null);
            $e = Cbor::bytes($cose[-2] ?? null);
            $int = static function (string $b): string {
                if (ord($b[0]) > 0x7f) {
                    $b = "\0" . $b;
                }
                return "\x02" . self::derLen(strlen($b)) . $b;
            };
            $seq = $int($n) . $int($e);
            $rsaKey = "\x30" . self::derLen(strlen($seq)) . $seq;
            $bitString = "\x03" . self::derLen(strlen($rsaKey) + 1) . "\x00" . $rsaKey;
            $algId = hex2bin('300d06092a864886f70d0101010500');
            $spki = "\x30" . self::derLen(strlen($algId . $bitString)) . $algId . $bitString;
            return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
        }
        throw new RuntimeException('unsupported key type');
    }

    private static function derLen(int $len): string
    {
        if ($len < 128) {
            return chr($len);
        }
        $bytes = ltrim(pack('N', $len), "\0");
        return chr(0x80 | strlen($bytes)) . $bytes;
    }

    /** Verify navigator.credentials.create() output and store the passkey. */
    public static function register(array $user, array $cred, string $name): array
    {
        $state = $_SESSION['webauthn_reg'] ?? null;
        unset($_SESSION['webauthn_reg']);
        if (!$state || $state['user_id'] !== (int) $user['id'] || time() - $state['time'] > 300) {
            throw new RuntimeException('registration session expired');
        }
        $clientData = b64url_decode((string) ($cred['response']['clientDataJSON'] ?? ''));
        self::checkClientData($clientData, 'webauthn.create', $state['challenge']);
        $att = Cbor::decode(b64url_decode((string) ($cred['response']['attestationObject'] ?? '')));
        $auth = self::parseAuthData(Cbor::bytes($att['authData'] ?? null));
        if (empty($auth['credentialId']) || empty($auth['cose'])) {
            throw new RuntimeException('no attested credential data');
        }
        $credId = b64url_encode($auth['credentialId']);
        if ($credId !== ($cred['rawId'] ?? $cred['id'] ?? '')) {
            throw new RuntimeException('credential id mismatch');
        }
        if (db()->val('SELECT 1 FROM passkeys WHERE credential_id = ?', [$credId])) {
            throw new RuntimeException('credential already registered');
        }
        $transports = is_array($cred['response']['transports'] ?? null) ? implode(',', array_slice($cred['response']['transports'], 0, 6)) : null;
        $id = db()->insert('passkeys', [
            'user_id'       => $user['id'],
            'credential_id' => $credId,
            'public_key'    => self::coseToPem($auth['cose']),
            'sign_count'    => $auth['signCount'],
            'transports'    => $transports ? mb_substr($transports, 0, 100) : null,
            'aaguid'        => $auth['aaguid'] ?? null,
            'name'          => $name !== '' ? mb_substr($name, 0, 100) : device_label(user_agent()),
            'device_info'   => device_label(user_agent()),
            'backed_up'     => $auth['bs'] ? 1 : 0,
        ]);
        return db()->row('SELECT * FROM passkeys WHERE id = ?', [$id]);
    }

    /** Verify navigator.credentials.get() output; returns the user row. */
    public static function authenticate(array $cred): array
    {
        $state = $_SESSION['webauthn_auth'] ?? null;
        unset($_SESSION['webauthn_auth']);
        if (!$state || time() - $state['time'] > 300) {
            throw new RuntimeException('login session expired');
        }
        $credId = (string) ($cred['rawId'] ?? $cred['id'] ?? '');
        $passkey = db()->row('SELECT * FROM passkeys WHERE credential_id = ?', [$credId]);
        if (!$passkey) {
            throw new DomainException('unknown credential');
        }
        $clientData = b64url_decode((string) ($cred['response']['clientDataJSON'] ?? ''));
        self::checkClientData($clientData, 'webauthn.get', $state['challenge']);
        $authDataRaw = b64url_decode((string) ($cred['response']['authenticatorData'] ?? ''));
        $auth = self::parseAuthData($authDataRaw);
        $signature = b64url_decode((string) ($cred['response']['signature'] ?? ''));
        $ok = openssl_verify($authDataRaw . hash('sha256', $clientData, true), $signature, $passkey['public_key'], OPENSSL_ALGO_SHA256);
        if ($ok !== 1) {
            throw new RuntimeException('signature invalid');
        }
        $userHandle = (string) ($cred['response']['userHandle'] ?? '');
        $user = db()->row('SELECT * FROM users WHERE id = ?', [$passkey['user_id']]);
        if (!$user || ($userHandle !== '' && !hash_equals($user['webauthn_handle'], $userHandle))) {
            throw new RuntimeException('user handle mismatch');
        }
        if ($auth['signCount'] > 0 && (int) $passkey['sign_count'] > 0 && $auth['signCount'] <= (int) $passkey['sign_count']) {
            Logger::write('SECURITY', 'Passkey sign counter regression', ['passkey' => $passkey['id']]);
            throw new RuntimeException('sign counter regression');
        }
        db()->q('UPDATE passkeys SET sign_count = ?, last_used_at = NOW(), backed_up = ? WHERE id = ?', [$auth['signCount'], $auth['bs'] ? 1 : 0, $passkey['id']]);
        return $user;
    }
}
