<?php
/**
 * Symmetric encryption for secrets stored in the database (SMTP password,
 * API keys, TOTP secrets...). Uses libsodium secretbox with the app key.
 */
declare(strict_types=1);

final class Crypto
{
    private static function key(): string
    {
        $raw = (string) config('app_key', '');
        if ($raw === '') {
            throw new RuntimeException('app_key is not configured');
        }
        return hash('sha256', 'probaho-enc|' . $raw, true);
    }

    public static function encrypt(string $plain): string
    {
        if ($plain === '') {
            return '';
        }
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        return 'enc:' . base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, self::key()));
    }

    public static function decrypt(?string $value): string
    {
        $value = (string) $value;
        if (!str_starts_with($value, 'enc:')) {
            return $value;
        }
        $raw = base64_decode(substr($value, 4), true);
        if ($raw === false || strlen($raw) < SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            return '';
        }
        $plain = sodium_crypto_secretbox_open(substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), self::key());
        return $plain === false ? '' : $plain;
    }

    public static function hmac(string $data): string
    {
        return hash_hmac('sha256', $data, self::key());
    }
}
