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

    public static function encrypt(string $plain): string
    {
        if ($plain === '') {
            return '';
        }
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return 'v1:' . base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, self::key('encryption')));
    }

    public static function decrypt(?string $cipher): string
    {
        if (!$cipher || !str_starts_with($cipher, 'v1:')) {
            return '';
        }
        $raw = base64_decode(substr($cipher, 3), true);
        if ($raw === false || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            return '';
        }
        $nonce = substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $plain = sodium_crypto_secretbox_open(substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), $nonce, self::key('encryption'));
        return $plain === false ? '' : $plain;
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
