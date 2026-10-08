<?php
declare(strict_types=1);

// JSON API shared by the website (jQuery AJAX) and the Android app.

require __DIR__ . '/app/bootstrap.php';

$route = '/' . trim((string) ($_GET['route'] ?? ''), '/');
$method = Http::method();

try {
    if ($route === '/.well-known/assetlinks.json') {
        assetLinks();
    }

    Auth::checkCsrf();
    Http::body(); // reject malformed JSON early

    switch ("{$method} {$route}") {
        case 'GET /config':
            Http::json([
                'app_name' => config('app_name'),
                'google_client_id' => config('google_client_id') ?: null,
                'limits' => config('limits'),
                'methods' => Wallet::METHODS,
            ]);

        // ---------------------------------------------------------- sign-in
        case 'POST /auth/register':
            $id = Auth::register(Http::str('name', 100), Http::str('email', 190), Http::str('password', 200));
            Http::json(Auth::startSession($id), 201);

        case 'POST /auth/login':
            $id = Auth::loginWithPassword(Http::str('email', 190), Http::str('password', 200));
            Http::json(Auth::startSession($id));

        case 'POST /auth/google':
            $identity = GoogleAuth::verify(Http::str('id_token', 4096));
            Http::json(Auth::startSession(Auth::loginWithGoogle($identity)));

        case 'POST /auth/passkey/options':
            Http::json(WebAuthn::loginOptions());

        case 'POST /auth/passkey/verify':
            $id = WebAuthn::login(Http::str('challenge_id', 32), Http::arr('credential'));
            Http::json(Auth::startSession($id));

        case 'POST /auth/logout':
            Auth::logout();
            Http::json(['ok' => true]);

        // ---------------------------------------------------------- account
        case 'GET /me':
            Http::json(['user' => Auth::publicUser(Auth::requireUser())]);

        case 'GET /passkeys':
            Http::json(['passkeys' => WebAuthn::listFor((int) Auth::requireUser()['id'])]);

        case 'POST /passkeys/options':
            Http::json(WebAuthn::registrationOptions(Auth::requireUser()));

        case 'POST /passkeys':
            $user = Auth::requireUser();
            $passkey = WebAuthn::register($user, Http::str('challenge_id', 32), Http::arr('credential'),
                Http::str('name', 60, false));
            Http::json(['passkey' => $passkey], 201);

        // ----------------------------------------------------------- wallet
        case 'GET /wallet':
            Http::json(Wallet::summary((int) Auth::requireUser()['id']));

        case 'GET /transactions':
            $user = Auth::requireUser();
            $before = max(0, (int) ($_GET['before'] ?? 0));
            $limit = min(50, max(1, (int) ($_GET['limit'] ?? 20)));
            Http::json(Wallet::transactions((int) $user['id'], $before, $limit));

        case 'POST /wallet/deposit':
            $user = Auth::requireUser();
            Http::json(Wallet::deposit((int) $user['id'], Http::str('amount', 20), Http::str('method', 16),
                Http::str('idempotency_key', 64)));

        case 'POST /wallet/withdraw':
            $user = Auth::requireUser();
            Http::json(Wallet::withdraw((int) $user['id'], Http::str('amount', 20), Http::str('method', 16),
                Http::str('idempotency_key', 64)));

        case 'POST /wallet/transfer':
            $user = Auth::requireUser();
            Http::json(Wallet::transfer((int) $user['id'], Http::str('to_email', 190), Http::str('amount', 20),
                Http::str('note', 120, false), Http::str('idempotency_key', 64)));

        case 'GET /users/lookup':
            $user = Auth::requireUser();
            Http::json(Wallet::lookup((int) $user['id'], (string) ($_GET['email'] ?? '')));
    }

    // DELETE /passkeys/{id}
    if ($method === 'DELETE' && preg_match('#^/passkeys/(\d+)$#', $route, $m)) {
        WebAuthn::delete((int) Auth::requireUser()['id'], (int) $m[1]);
        Http::json(['ok' => true]);
    }

    throw new ApiError(404, 'not_found', 'এই ঠিকানায় কিছু নেই।');
} catch (ApiError $e) {
    Http::json(['error' => ['code' => $e->errorCode, 'message' => $e->getMessage()]], $e->status);
} catch (Throwable $e) {
    error_log('[wallet] ' . $e);
    $error = ['code' => 'server_error', 'message' => 'সার্ভারে সমস্যা হয়েছে। একটু পরে আবার চেষ্টা করুন।'];
    if (config('debug')) {
        $error['detail'] = $e->getMessage();
    }
    Http::json(['error' => $error], 500);
}

/** Digital Asset Links: lets the Android app use this site's passkeys and logins. */
function assetLinks(): never
{
    $fingerprints = array_values(array_filter(array_map(
        fn ($f) => strtoupper(trim((string) $f)),
        (array) config('webauthn.android_cert_sha256', [])
    )));
    Http::json([[
        'relation' => [
            'delegate_permission/common.handle_all_urls',
            'delegate_permission/common.get_login_creds',
        ],
        'target' => [
            'namespace' => 'android_app',
            'package_name' => config('webauthn.android_package'),
            'sha256_cert_fingerprints' => $fingerprints,
        ],
    ]]);
}
