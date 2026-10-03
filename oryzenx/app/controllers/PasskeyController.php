<?php
/** Passkey (WebAuthn) registration and passwordless sign-in. */
final class PasskeyController
{
    public function loginOptions(): void
    {
        if (!RateLimit::hit('passkey|' . client_ip(), 30, 600)) json_out(['ok' => false, 'message' => t('error.429')], 429);
        json_out(['ok' => true, 'publicKey' => [
            'challenge' => WebAuthn::challenge('login'), 'rpId' => WebAuthn::rpId(), 'timeout' => 60000,
            'userVerification' => 'preferred', 'allowCredentials' => [],
        ]]);
    }

    public function login(): void
    {
        $b = json_body();
        $pk = DB::row('SELECT * FROM passkeys WHERE credential_id = ?', [(string)($b['rawId'] ?? '')]);
        if (!$pk) json_out(['ok' => false, 'message' => t('auth.passkey_unknown')], 422);
        try {
            $count = WebAuthn::verifyAssertion($b['response'] ?? [], $pk);
        } catch (Throwable $e) {
            Auth::logAttempt((int)$pk['user_id'], null, 'passkey', false, 'verify_failed');
            json_out(['ok' => false, 'message' => t('auth.passkey_failed')], 422);
        }
        DB::q('UPDATE passkeys SET sign_count = ?, last_used_at = NOW() WHERE id = ?', [$count, $pk['id']]);
        $u = DB::row('SELECT * FROM users WHERE id = ?', [$pk['user_id']]);
        if (!$u || !Auth::isAllowed($u)) json_out(['ok' => false, 'message' => $u ? Auth::blockedMessage($u) : t('auth.invalid')], 403);
        // A passkey is already multi-factor (possession + biometric/PIN), so 2FA is not asked again.
        Auth::login($u, 'passkey', true);
        $to = safe_redirect_path($_SESSION['intended'] ?? null, $u['role'] === 'admin' ? '/admin' : '/profile');
        unset($_SESSION['intended']);
        json_out(['ok' => true, 'message' => t('auth.welcome', ['name' => $u['name']]), 'redirect' => url($to), 'reload' => true]);
    }

    public function registerOptions(): void
    {
        $u = auth();
        $exclude = array_map(fn($c) => ['type' => 'public-key', 'id' => $c], DB::col('SELECT credential_id FROM passkeys WHERE user_id = ?', [$u['id']]));
        json_out(['ok' => true, 'publicKey' => [
            'challenge' => WebAuthn::challenge('register'),
            'rp' => ['name' => setting('site_name'), 'id' => WebAuthn::rpId()],
            'user' => ['id' => Crypto::b64u('ozx-user-' . $u['id']), 'name' => $u['email'], 'displayName' => $u['name']],
            'pubKeyCredParams' => [['type' => 'public-key', 'alg' => -7], ['type' => 'public-key', 'alg' => -257]],
            'authenticatorSelection' => ['residentKey' => 'required', 'requireResidentKey' => true, 'userVerification' => 'preferred'],
            'excludeCredentials' => $exclude, 'timeout' => 60000, 'attestation' => 'none',
        ]]);
    }

    public function register(): void
    {
        $b = json_body();
        try {
            $cred = WebAuthn::register($b['response'] ?? []);
        } catch (Throwable $e) {
            ErrorHandler::log('passkey', $e->getMessage());
            json_out(['ok' => false, 'message' => t('auth.passkey_failed')], 422);
        }
        $name = mb_substr(trim((string)($b['name'] ?? '')) ?: UA::summary(user_agent()), 0, 80);
        try {
            DB::insert('passkeys', ['user_id' => Auth::id(), 'credential_id' => $cred['credential_id'], 'public_key' => $cred['public_key'], 'sign_count' => $cred['sign_count'], 'name' => $name]);
        } catch (PDOException $e) {
            json_out(['ok' => false, 'message' => t('auth.passkey_exists')], 422);
        }
        Auth::activity('passkey_added', $name);
        json_out(['ok' => true, 'message' => t('auth.passkey_added')]);
    }
}
