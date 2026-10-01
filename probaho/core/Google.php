<?php
/**
 * "Continue with Google" — OAuth 2.0 authorization-code flow (server side).
 */
declare(strict_types=1);

final class Google
{
    public static function enabled(): bool
    {
        return setting_on('auth_google') && setting('google_client_id') !== '' && setting('google_client_secret') !== '';
    }

    public static function redirectUri(): string
    {
        return abs_url('/auth/google/callback');
    }

    public static function authUrl(): string
    {
        $state = bin2hex(random_bytes(16));
        $_SESSION['google_state'] = $state;
        return 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query([
            'client_id' => setting('google_client_id'),
            'redirect_uri' => self::redirectUri(),
            'response_type' => 'code',
            'scope' => 'openid email profile',
            'state' => $state,
            'prompt' => 'select_account',
            'access_type' => 'online',
        ]);
    }

    /** Exchange code → verified profile [sub, email, name, picture]. */
    public static function profile(string $code, string $state): array
    {
        $expected = (string) ($_SESSION['google_state'] ?? '');
        unset($_SESSION['google_state']);
        if ($expected === '' || !hash_equals($expected, $state)) {
            throw new RuntimeException('OAuth state mismatch');
        }
        $token = Http::post('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => setting('google_client_id'),
            'client_secret' => setting('google_client_secret'),
            'redirect_uri' => self::redirectUri(),
            'grant_type' => 'authorization_code',
        ], [], false);
        $access = $token['json']['access_token'] ?? '';
        if ($access === '') {
            throw new RuntimeException('Google token exchange failed: ' . mb_substr($token['body'], 0, 200));
        }
        $info = Http::get('https://openidconnect.googleapis.com/v1/userinfo', ['Authorization: Bearer ' . $access]);
        $p = $info['json'] ?? [];
        if (empty($p['sub']) || empty($p['email']) || empty($p['email_verified'])) {
            throw new RuntimeException('Google profile incomplete or email not verified');
        }
        return ['sub' => (string) $p['sub'], 'email' => strtolower((string) $p['email']), 'name' => (string) ($p['name'] ?? $p['email']), 'picture' => (string) ($p['picture'] ?? '')];
    }
}
