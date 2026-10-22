<?php
declare(strict_types=1);

namespace OryzenX\Core;

/** Token generation, hashing, secret encryption and output escaping helpers. */
final class Security
{
    public static function randomToken(int $bytes = 32): string
    {
        return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
    }

    public static function numericCode(int $digits = 6): string
    {
        $max = (10 ** $digits) - 1;
        return str_pad((string) random_int(0, $max), $digits, '0', STR_PAD_LEFT);
    }

    /** Tokens are stored as SHA-256 hashes, never in plain text. */
    public static function hashToken(string $token): string
    {
        return hash_hmac('sha256', $token, self::appKey());
    }

    public static function uuid(): string
    {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }

    public static function appKey(): string
    {
        $key = (string) Config::get('app_key', '');
        if ($key === '') {
            throw new \RuntimeException('app_key is not configured');
        }
        $raw = base64_decode($key, true);
        return $raw !== false && strlen($raw) >= 32 ? $raw : hash('sha256', $key, true);
    }

    /** Encrypts a secret for storage in the database (libsodium secretbox, or AES-256-GCM fallback). */
    public static function encrypt(string $plain): string
    {
        $key = substr(hash('sha256', self::appKey() . '|secrets', true), 0, 32);
        if (function_exists('sodium_crypto_secretbox')) {
            $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
            return 'v1s:' . base64_encode($nonce . sodium_crypto_secretbox($plain, $nonce, $key));
        }
        $iv = random_bytes(12);
        $tag = '';
        $ct = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
        return 'v1g:' . base64_encode($iv . $tag . $ct);
    }

    public static function decrypt(string $stored): ?string
    {
        $key = substr(hash('sha256', self::appKey() . '|secrets', true), 0, 32);
        if (str_starts_with($stored, 'v1s:') && function_exists('sodium_crypto_secretbox_open')) {
            $raw = base64_decode(substr($stored, 4), true);
            if ($raw === false || strlen($raw) < SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
                return null;
            }
            $nonce = substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
            $out = sodium_crypto_secretbox_open(substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), $nonce, $key);
            return $out === false ? null : $out;
        }
        if (str_starts_with($stored, 'v1g:')) {
            $raw = base64_decode(substr($stored, 4), true);
            if ($raw === false || strlen($raw) < 28) {
                return null;
            }
            $out = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
            return $out === false ? null : $out;
        }
        return null;
    }

    public static function e(mixed $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    public static function mask(string $value, int $visible = 2): string
    {
        $len = mb_strlen($value);
        if ($len === 0) {
            return '';
        }
        if ($len <= $visible * 2) {
            return str_repeat('•', $len);
        }
        return mb_substr($value, 0, $visible) . str_repeat('•', max(4, $len - $visible * 2)) . mb_substr($value, -$visible);
    }

    public static function maskEmail(string $email): string
    {
        [$user, $domain] = array_pad(explode('@', $email, 2), 2, '');
        return mb_substr($user, 0, 1) . '•••@' . $domain;
    }

    /** Removes secrets from arrays before logging. */
    public static function redact(array $data): array
    {
        $out = [];
        foreach ($data as $k => $v) {
            if (is_array($v)) {
                $out[$k] = self::redact($v);
            } elseif (preg_match('/pass|secret|token|key|credential|authorization/i', (string) $k)) {
                $out[$k] = '[redacted]';
            } else {
                $out[$k] = $v;
            }
        }
        return $out;
    }
}
