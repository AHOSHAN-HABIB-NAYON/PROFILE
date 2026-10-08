<?php
/**
 * CSRF protection.
 *  - Admin: synchronizer token stored in the session.
 *  - Storefront (session-less): signed double-submit cookie + Origin check.
 */
final class Csrf
{
    public const PUBLIC_COOKIE = 'ns_csrf';

    public static function adminToken(): string
    {
        $token = Session::get('_csrf');
        if (!$token) {
            $token = Crypto::token(24);
            Session::set('_csrf', $token);
        }
        return $token;
    }

    public static function verifyAdmin(Request $r): bool
    {
        $sent = $r->header('X-CSRF-Token') ?? (string)$r->input('_csrf', '');
        $token = Session::get('_csrf');
        return is_string($token) && $sent !== '' && hash_equals($token, $sent) && $r->sameOrigin();
    }

    /** Ensures the storefront has a signed CSRF cookie readable by JS. */
    public static function publicToken(): string
    {
        $existing = Crypto::unsign($_COOKIE[self::PUBLIC_COOKIE] ?? null);
        if ($existing !== null) {
            return $existing;
        }
        $token = Crypto::token(16);
        set_cookie(self::PUBLIC_COOKIE, Crypto::sign($token), 0, false);
        $_COOKIE[self::PUBLIC_COOKIE] = Crypto::sign($token);
        return $token;
    }

    public static function verifyPublic(Request $r): bool
    {
        $raw = (string)($_COOKIE[self::PUBLIC_COOKIE] ?? '');
        $sent = (string)($r->header('X-CSRF-Token') ?? '');
        return $raw !== '' && Crypto::unsign($raw) !== null && hash_equals($raw, $sent) && $r->sameOrigin();
    }
}
