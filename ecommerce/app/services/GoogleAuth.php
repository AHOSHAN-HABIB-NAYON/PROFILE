<?php
/**
 * Google Sign-In for admins (Google Identity Services ID token).
 * The token is verified server-side via Google's tokeninfo endpoint:
 * audience must equal our client ID, email must be verified and must belong
 * to an existing active admin who allows Google login. No auto-registration.
 */
final class GoogleAuth
{
    public static function clientId(): string
    {
        $id = (string)setting('google_client_id', '');
        return preg_match('/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/', $id) ? $id : '';
    }

    public static function verify(string $idToken): ?array
    {
        $clientId = self::clientId();
        if ($clientId === '' || !preg_match('/^[A-Za-z0-9_\-.]+$/', $idToken)) {
            return null;
        }
        $res = HttpClient::get('https://oauth2.googleapis.com/tokeninfo?id_token=' . rawurlencode($idToken), ['timeout' => 8]);
        $j = $res['json'];
        if ($res['status'] !== 200 || !is_array($j)) {
            return null;
        }
        $validIssuer = in_array($j['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true);
        if (!$validIssuer || ($j['aud'] ?? '') !== $clientId || ($j['email_verified'] ?? '') !== 'true' || (int)($j['exp'] ?? 0) < time()) {
            return null;
        }
        return ['sub' => (string)$j['sub'], 'email' => strtolower((string)$j['email']), 'name' => (string)($j['name'] ?? '')];
    }
}
