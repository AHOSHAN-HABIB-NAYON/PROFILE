<?php
/**
 * Two-factor authentication (RFC 6238 TOTP, compatible with Google
 * Authenticator, Authy, Microsoft Authenticator…). Secrets are stored
 * encrypted; recovery codes are stored as hashes.
 */
defined('APP') || exit;

function base32_encode(string $bin): string
{
    $alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
    $out = '';
    foreach (str_split($bits, 5) as $chunk) $out .= $alpha[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}

function base32_decode(string $b32): string
{
    $alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    foreach (str_split(strtoupper(preg_replace('~[^A-Za-z2-7]~', '', $b32))) as $c) $bits .= str_pad(decbin(strpos($alpha, $c)), 5, '0', STR_PAD_LEFT);
    $out = '';
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
    return $out;
}

function totp_code(string $secret, int $step): string
{
    $h = hash_hmac('sha1', pack('J', $step), base32_decode($secret), true);
    $o = ord($h[19]) & 0xf;
    $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string)($n % 1000000), 6, '0', STR_PAD_LEFT);
}

/** Returns the matched time-step (±1 window) or null. */
function totp_verify(string $secret, string $code, ?int $lastStep = null): ?int
{
    $code = preg_replace('~\D~', '', $code);
    if (strlen($code) !== 6) return null;
    $now = (int)floor(time() / 30);
    for ($i = -1; $i <= 1; $i++) {
        $step = $now + $i;
        if ($lastStep !== null && $step <= $lastStep) continue; // no replay
        if (hash_equals(totp_code($secret, $step), $code)) return $step;
    }
    return null;
}

function twofa_enabled(int $uid): bool
{
    return (bool)val('SELECT enabled FROM user_2fa WHERE user_id = ?', [$uid]);
}

/** Start setup: create (or reuse) a pending secret. */
function twofa_setup(array $u): array
{
    $r = row('SELECT * FROM user_2fa WHERE user_id = ?', [$u['id']]);
    if ($r && $r['enabled']) return ['enabled' => true];
    $secret = base32_encode(random_bytes(20));
    q('INSERT INTO user_2fa (user_id, secret_enc, enabled) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE secret_enc = VALUES(secret_enc), enabled = 0',
        [$u['id'], encrypt_value($secret)]);
    $issuer = rawurlencode((string)setting('site_name'));
    return [
        'secret' => $secret,
        'uri' => 'otpauth://totp/' . $issuer . ':' . rawurlencode($u['email']) . '?secret=' . $secret . '&issuer=' . $issuer . '&digits=6&period=30',
    ];
}

/** Confirm setup with a code; returns plain recovery codes (shown once). */
function twofa_enable(int $uid, string $code): ?array
{
    $r = row('SELECT * FROM user_2fa WHERE user_id = ?', [$uid]);
    if (!$r || $r['enabled']) return null;
    $step = totp_verify(decrypt_value($r['secret_enc']), $code);
    if ($step === null) return null;
    $codes = [];
    for ($i = 0; $i < 8; $i++) $codes[] = strtolower(random_code(5, 'abcdefghjkmnpqrstuvwxyz23456789') . '-' . random_code(5, 'abcdefghjkmnpqrstuvwxyz23456789'));
    q('UPDATE user_2fa SET enabled = 1, enabled_at = NOW(), last_used_step = ?, recovery_codes = ? WHERE user_id = ?',
        [$step, json_encode(array_map(fn($c) => password_hash($c, PASSWORD_BCRYPT, ['cost' => 10]), $codes)), $uid]);
    return $codes;
}

/** Verify a login code or a one-time recovery code. */
function twofa_check(int $uid, string $code): bool
{
    $r = row('SELECT * FROM user_2fa WHERE user_id = ? AND enabled = 1', [$uid]);
    if (!$r) return false;
    $code = trim(strtolower($code));
    if (preg_match('~^\d{6}$~', preg_replace('~\s~', '', $code))) {
        $step = totp_verify(decrypt_value($r['secret_enc']), $code, $r['last_used_step'] !== null ? (int)$r['last_used_step'] : null);
        if ($step === null) return false;
        q('UPDATE user_2fa SET last_used_step = ? WHERE user_id = ?', [$step, $uid]);
        return true;
    }
    $hashes = json_decode((string)$r['recovery_codes'], true) ?: [];
    foreach ($hashes as $i => $h) {
        if (password_verify($code, $h)) {
            unset($hashes[$i]);
            q('UPDATE user_2fa SET recovery_codes = ? WHERE user_id = ?', [json_encode(array_values($hashes)), $uid]);
            return true;
        }
    }
    return false;
}

function twofa_disable(int $uid): void
{
    q('DELETE FROM user_2fa WHERE user_id = ?', [$uid]);
}
