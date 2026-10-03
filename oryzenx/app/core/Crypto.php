<?php
final class Crypto
{
    private static function key(): string
    {
        $k = $GLOBALS['config']['app_key'] ?? '';
        if ($k === '') throw new RuntimeException('app_key missing in config');
        return hash('sha256', $k, true);
    }

    public static function encrypt(string $plain): string
    {
        $iv = random_bytes(12);
        $ct = openssl_encrypt($plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag);
        return 'enc:' . base64_encode($iv . $tag . $ct);
    }

    public static function decrypt(string $data): ?string
    {
        if (!str_starts_with($data, 'enc:')) return $data;
        $raw = base64_decode(substr($data, 4), true);
        if ($raw === false || strlen($raw) < 28) return null;
        $pt = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
        return $pt === false ? null : $pt;
    }

    public static function b64u(string $bin): string { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }
    public static function b64uDecode(string $s): string { return (string)base64_decode(strtr($s, '-_', '+/') . str_repeat('=', (4 - strlen($s) % 4) % 4)); }

    /** Daily-rotating, non-reversible visitor fingerprint (privacy friendly). */
    public static function visitorHash(): string
    {
        return hash('sha256', client_ip() . '|' . user_agent() . '|' . date('Y-m-d') . '|' . ($GLOBALS['config']['app_key'] ?? ''));
    }
}
