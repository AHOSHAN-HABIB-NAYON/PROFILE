<?php
/**
 * RFC 6238 TOTP (Google Authenticator compatible) for user & admin 2FA.
 */
declare(strict_types=1);

final class Totp
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function secret(): string
    {
        $s = '';
        for ($i = 0; $i < 32; $i++) {
            $s .= self::ALPHABET[random_int(0, 31)];
        }
        return $s;
    }

    private static function base32Decode(string $b32): string
    {
        $b32 = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $b32));
        $bits = '';
        foreach (str_split($b32) as $c) {
            $bits .= str_pad(decbin(strpos(self::ALPHABET, $c)), 5, '0', STR_PAD_LEFT);
        }
        $out = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) === 8) {
                $out .= chr(bindec($byte));
            }
        }
        return $out;
    }

    public static function code(string $secret, ?int $slice = null): string
    {
        $slice ??= (int) floor(time() / 30);
        $hash = hash_hmac('sha1', pack('N*', 0, $slice), self::base32Decode($secret), true);
        $offset = ord($hash[19]) & 0x0f;
        $num = ((ord($hash[$offset]) & 0x7f) << 24) | (ord($hash[$offset + 1]) << 16) | (ord($hash[$offset + 2]) << 8) | ord($hash[$offset + 3]);
        return str_pad((string) ($num % 1000000), 6, '0', STR_PAD_LEFT);
    }

    public static function verify(string $secret, string $code): bool
    {
        $code = preg_replace('/\D/', '', bn_to_en_digits($code));
        if (strlen((string) $code) !== 6) {
            return false;
        }
        $slice = (int) floor(time() / 30);
        for ($i = -1; $i <= 1; $i++) {
            if (hash_equals(self::code($secret, $slice + $i), (string) $code)) {
                return true;
            }
        }
        return false;
    }

    public static function uri(string $secret, string $account): string
    {
        $issuer = (string) setting('site_name', 'Probaho');
        return 'otpauth://totp/' . rawurlencode($issuer . ':' . $account) . '?secret=' . $secret . '&issuer=' . rawurlencode($issuer) . '&digits=6&period=30';
    }
}
