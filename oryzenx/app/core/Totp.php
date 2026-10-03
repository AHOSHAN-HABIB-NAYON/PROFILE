<?php
/** RFC 6238 TOTP (Google Authenticator compatible). */
final class Totp
{
    private const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function secret(): string
    {
        $s = '';
        foreach (str_split(random_bytes(20)) as $c) $s .= self::ALPHA[ord($c) & 31];
        return $s;
    }

    private static function b32decode(string $s): string
    {
        $s = strtoupper(preg_replace('/[^A-Z2-7]/i', '', $s));
        $bits = '';
        foreach (str_split($s) as $c) $bits .= str_pad(decbin(strpos(self::ALPHA, $c)), 5, '0', STR_PAD_LEFT);
        $out = '';
        foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
        return $out;
    }

    public static function code(string $secret, int $step): string
    {
        $h = hash_hmac('sha1', pack('N*', 0, $step), self::b32decode($secret), true);
        $o = ord($h[19]) & 0xf;
        $n = ((ord($h[$o]) & 0x7f) << 24 | ord($h[$o + 1]) << 16 | ord($h[$o + 2]) << 8 | ord($h[$o + 3])) % 1000000;
        return str_pad((string)$n, 6, '0', STR_PAD_LEFT);
    }

    /** Returns the matched time step (for replay protection) or null. */
    public static function verify(string $secret, string $code, int $lastStep = 0): ?int
    {
        $code = preg_replace('/\D/', '', $code);
        if (strlen($code) !== 6) return null;
        $now = intdiv(time(), 30);
        for ($i = -1; $i <= 1; $i++) {
            $step = $now + $i;
            if ($step > $lastStep && hash_equals(self::code($secret, $step), $code)) return $step;
        }
        return null;
    }

    public static function uri(string $secret, string $email): string
    {
        $issuer = rawurlencode(setting('site_name'));
        return "otpauth://totp/$issuer:" . rawurlencode($email) . "?secret=$secret&issuer=$issuer&digits=6&period=30";
    }
}
