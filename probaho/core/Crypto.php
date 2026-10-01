<?php
/**
 * Symmetric encryption for secrets stored in the database (SMTP password,
 * API keys, TOTP secrets...). Uses libsodium secretbox when available and
 * falls back to OpenSSL AES-256-GCM, so hosts without ext-sodium still work.
 * Values are prefixed: "enc:" = sodium, "enc2:" = OpenSSL. Both decrypt.
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
        if (function_exists('sodium_crypto_secretbox')) {
            $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
            return 'enc:' . base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, self::key()));
        }
        $iv = random_bytes(12);
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) {
            throw new RuntimeException('Encryption failed');
        }
        return 'enc2:' . base64_encode($iv . $tag . $cipher);
    }

    public static function decrypt(?string $value): string
    {
        $value = (string) $value;
        if (str_starts_with($value, 'enc2:')) {
            $raw = base64_decode(substr($value, 5), true);
            if ($raw === false || strlen($raw) < 28) {
                return '';
            }
            $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
            return $plain === false ? '' : $plain;
        }
        if (!str_starts_with($value, 'enc:')) {
            return $value;
        }
        if (!function_exists('sodium_crypto_secretbox_open')) {
            Logger::write('CRYPTO', 'Value encrypted with sodium but ext-sodium is not available');
            return '';
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
