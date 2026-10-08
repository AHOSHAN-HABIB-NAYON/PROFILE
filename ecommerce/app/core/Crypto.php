<?php
/**
 * Authenticated encryption for stored secrets (API tokens, 2FA seeds) and
 * HMAC signing for cookies. Key derived from APP_KEY in config.php.
 */
final class Crypto
{
    private static function key(string $purpose): string
    {
        return hash_hmac('sha256', $purpose, APP_KEY, true);
    }

    /**
     * Encrypt with libsodium when available ("v1:"), otherwise OpenSSL AES-256-GCM ("v2:").
     * Many shared hosts (e.g. some Hostinger plans) disable the sodium extension.
     */
    public static function encrypt(string $plain): string
    {
        if ($plain === '') {
            return '';
        }
        if (function_exists('sodium_crypto_secretbox')) {
            $nonce = random_bytes(24);
            return 'v1:' . base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, self::key('encryption')));
        }
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', self::key('encryption'), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) {
            throw new RuntimeException('Encryption unavailable: enable the sodium or openssl PHP extension.');
        }
        return 'v2:' . base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(?string $cipher): string
    {
        if (!$cipher || strlen($cipher) < 4) {
            return '';
        }
        $raw = base64_decode(substr($cipher, 3), true);
        if ($raw === false) {
            return '';
        }
        if (str_starts_with($cipher, 'v1:') && function_exists('sodium_crypto_secretbox_open') && strlen($raw) > 24) {
            $plain = sodium_crypto_secretbox_open(substr($raw, 24), substr($raw, 0, 24), self::key('encryption'));
            return $plain === false ? '' : $plain;
        }
        if (str_starts_with($cipher, 'v2:') && strlen($raw) > 28) {
            $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', self::key('encryption'), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
            return $plain === false ? '' : $plain;
        }
        return '';
    }

    public static function encryptArray(array $data): string
    {
        return self::encrypt(json_encode($data, JSON_UNESCAPED_UNICODE));
    }

    public static function decryptArray(?string $cipher): array
    {
        $json = self::decrypt($cipher);
        $data = $json !== '' ? json_decode($json, true) : null;
        return is_array($data) ? $data : [];
    }

    public static function sign(string $value): string
    {
        return $value . '.' . substr(hash_hmac('sha256', $value, self::key('signing')), 0, 32);
    }

    public static function unsign(?string $signed): ?string
    {
        if (!$signed || !str_contains($signed, '.')) {
            return null;
        }
        $pos = strrpos($signed, '.');
        $value = substr($signed, 0, $pos);
        return hash_equals(self::sign($value), $signed) ? $value : null;
    }

    public static function token(int $bytes = 32): string
    {
        return bin2hex(random_bytes($bytes));
    }
}
