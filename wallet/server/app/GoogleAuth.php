<?php
declare(strict_types=1);

/**
 * Verifies Google ID tokens from the website's Google button and from the
 * Android app's Credential Manager sign-in. The signature is checked against
 * Google's published keys, which are cached on disk.
 */
final class GoogleAuth
{
    private const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

    /** @return array{sub: string, email: string, name: string, picture: ?string} */
    public static function verify(string $idToken): array
    {
        $clientId = (string) config('google_client_id', '');
        if ($clientId === '') {
            throw new ApiError(503, 'google_not_configured', 'Google লগইন এখনো চালু করা হয়নি।');
        }

        $parts = explode('.', $idToken);
        if (count($parts) !== 3) {
            throw self::invalid();
        }
        [$headerB64, $payloadB64, $signatureB64] = $parts;
        $header = json_decode(base64url_decode($headerB64), true);
        $payload = json_decode(base64url_decode($payloadB64), true);
        if (!is_array($header) || !is_array($payload) || ($header['alg'] ?? '') !== 'RS256') {
            throw self::invalid();
        }

        $pem = self::publicKey((string) ($header['kid'] ?? ''));
        $ok = openssl_verify("{$headerB64}.{$payloadB64}", base64url_decode($signatureB64), $pem, OPENSSL_ALGO_SHA256);
        if ($ok !== 1) {
            throw self::invalid();
        }

        $now = time();
        if (!in_array($payload['iss'] ?? '', self::ISSUERS, true)
            || ($payload['aud'] ?? '') !== $clientId
            || (int) ($payload['exp'] ?? 0) < $now - 60
            || (int) ($payload['iat'] ?? 0) > $now + 300
            || empty($payload['sub'])
        ) {
            throw self::invalid();
        }
        if (empty($payload['email']) || ($payload['email_verified'] ?? false) !== true) {
            throw new ApiError(401, 'google_email_unverified', 'Google অ্যাকাউন্টের ইমেইল যাচাই করা নেই।');
        }

        return [
            'sub' => (string) $payload['sub'],
            'email' => (string) $payload['email'],
            'name' => trim((string) ($payload['name'] ?? '')),
            'picture' => isset($payload['picture']) ? (string) $payload['picture'] : null,
        ];
    }

    private static function publicKey(string $kid): string
    {
        $keys = self::keys(false);
        if (!isset($keys[$kid])) {
            $keys = self::keys(true); // Google rotated its keys: fetch the new set.
        }
        if (!isset($keys[$kid])) {
            throw self::invalid();
        }
        return $keys[$kid];
    }

    /** @return array<string, string> kid => PEM */
    private static function keys(bool $refresh): array
    {
        $cacheFile = APP_ROOT . '/app/cache/google_keys.json';
        if (!$refresh && is_file($cacheFile)) {
            $cached = json_decode((string) file_get_contents($cacheFile), true);
            if (is_array($cached) && ($cached['expires'] ?? 0) > time()) {
                return $cached['keys'];
            }
        }

        $url = (string) config('google_jwks_url', 'https://www.googleapis.com/oauth2/v3/certs');
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HEADER => true,
        ]);
        $raw = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
        curl_close($ch);
        if ($raw === false || $status !== 200) {
            throw new ApiError(502, 'google_unreachable', 'Google-এর সাথে যোগাযোগ করা যায়নি। একটু পরে চেষ্টা করুন।');
        }

        $headers = substr($raw, 0, $headerSize);
        $jwks = json_decode(substr($raw, $headerSize), true);
        $keys = [];
        foreach ($jwks['keys'] ?? [] as $jwk) {
            if (($jwk['kty'] ?? '') === 'RSA' && isset($jwk['kid'], $jwk['n'], $jwk['e'])) {
                $keys[$jwk['kid']] = Crypto::rsaPem(base64url_decode($jwk['n']), base64url_decode($jwk['e']));
            }
        }
        $maxAge = preg_match('/max-age=(\d+)/i', $headers, $m) ? (int) $m[1] : 3600;

        if (!is_dir(dirname($cacheFile))) {
            @mkdir(dirname($cacheFile), 0700, true);
        }
        @file_put_contents($cacheFile, json_encode(['expires' => time() + $maxAge, 'keys' => $keys]), LOCK_EX);
        return $keys;
    }

    private static function invalid(): ApiError
    {
        return new ApiError(401, 'google_invalid', 'Google লগইন যাচাই করা যায়নি। আবার চেষ্টা করুন।');
    }
}
