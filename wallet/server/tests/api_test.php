<?php
declare(strict_types=1);

/**
 * End-to-end API tests against a running server with a fresh database.
 *
 *   php tests/api_test.php http://localhost:8080 /path/to/jwks-dir
 *
 * The server's config must use rp_id "localhost", base_url = the URL above,
 * google_client_id "test-client.apps.googleusercontent.com", and a
 * google_jwks_url that serves <jwks-dir>/jwks.json. The test signs its own
 * Google tokens with a key it publishes there, and plays the part of a
 * passkey authenticator with its own P-256 key.
 *
 * Each run records one failed login, so clear login_attempts between many
 * runs (the server pauses logins after repeated failures, by design).
 */

$base = rtrim($argv[1] ?? 'http://localhost:8080', '/');
$jwksDir = $argv[2] ?? null;
$origin = $base;
$rpId = parse_url($base, PHP_URL_HOST);
$failures = 0;
$passes = 0;

function check(bool $ok, string $what, mixed $detail = null): void
{
    global $failures, $passes;
    if ($ok) {
        $passes++;
        echo "  ✓ {$what}\n";
    } else {
        $failures++;
        echo "  ✗ {$what}" . ($detail !== null ? ' — ' . json_encode($detail, JSON_UNESCAPED_UNICODE) : '') . "\n";
    }
}

/** @return array{0:int,1:array,2:array} status, json body, response headers */
function call(string $method, string $path, ?array $body = null, array $opts = []): array
{
    global $base;
    $headers = ['Accept: application/json'];
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
    }
    if (($opts['xhr'] ?? true) && !isset($opts['token'])) {
        $headers[] = 'X-Requested-With: XMLHttpRequest';
    }
    if (isset($opts['token'])) {
        $headers[] = 'Authorization: Bearer ' . $opts['token'];
        $headers[] = 'X-Client: android';
    }
    if ($opts['app'] ?? false) {
        $headers[] = 'X-Client: android';
    }
    if (isset($opts['cookie'])) {
        $headers[] = 'Cookie: joma_session=' . $opts['cookie'];
    }
    $ch = curl_init($base . $path);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_HEADER => true,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    curl_close($ch);
    $json = json_decode(substr($raw, $headerSize), true) ?? [];
    return [$status, $json, explode("\r\n", substr($raw, 0, $headerSize))];
}

function cookieFrom(array $headers): ?string
{
    foreach ($headers as $line) {
        if (preg_match('/^Set-Cookie: joma_session=([a-f0-9]{64})/i', $line, $m)) {
            return $m[1];
        }
    }
    return null;
}

function b64u(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function b64u_dec(string $data): string
{
    return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
}

function idem(): string
{
    return bin2hex(random_bytes(12));
}

// ------------------------------------------------------------ CBOR encoder

function cbor(mixed $v): string
{
    $head = function (int $major, int $n): string {
        if ($n < 24) {
            return chr(($major << 5) | $n);
        }
        if ($n < 256) {
            return chr(($major << 5) | 24) . chr($n);
        }
        if ($n < 65536) {
            return chr(($major << 5) | 25) . pack('n', $n);
        }
        return chr(($major << 5) | 26) . pack('N', $n);
    };
    if (is_int($v)) {
        return $v >= 0 ? $head(0, $v) : $head(1, -1 - $v);
    }
    if ($v instanceof Bytes) {
        return $head(2, strlen($v->b)) . $v->b;
    }
    if (is_string($v)) {
        return $head(3, strlen($v)) . $v;
    }
    if (is_array($v)) {
        $out = $head(5, count($v));
        foreach ($v as $k => $item) {
            $out .= cbor($k) . cbor($item);
        }
        return $out;
    }
    throw new LogicException('cannot encode');
}

final class Bytes
{
    public function __construct(public string $b)
    {
    }
}

// ------------------------------------------------------------ fake authenticator

final class Authenticator
{
    public OpenSSLAsymmetricKey $key;
    public string $credentialId;
    public int $counter = 0;
    public string $userHandle = '';

    public function __construct(public string $rpId, public string $origin)
    {
        $this->key = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_EC, 'curve_name' => 'prime256v1']);
        $this->credentialId = random_bytes(32);
    }

    public function create(array $options, ?string $origin = null): array
    {
        $this->userHandle = b64u_dec($options['user']['id']);
        $clientData = json_encode(['type' => 'webauthn.create', 'challenge' => $options['challenge'],
            'origin' => $origin ?? $this->origin, 'crossOrigin' => false]);
        $details = openssl_pkey_get_details($this->key)['ec'];
        $cose = [1 => 2, 3 => -7, -1 => 1, -2 => new Bytes($details['x']), -3 => new Bytes($details['y'])];
        $authData = hash('sha256', $this->rpId, true) . chr(0x45) . pack('N', $this->counter)
            . str_repeat("\0", 16) . pack('n', strlen($this->credentialId)) . $this->credentialId . cbor($cose);
        $attestation = cbor(['fmt' => 'none', 'attStmt' => [], 'authData' => new Bytes($authData)]);
        return [
            'id' => b64u($this->credentialId),
            'rawId' => b64u($this->credentialId),
            'type' => 'public-key',
            'response' => ['clientDataJSON' => b64u($clientData), 'attestationObject' => b64u($attestation)],
        ];
    }

    public function get(array $options, ?string $origin = null, ?int $counter = null): array
    {
        $this->counter = $counter ?? $this->counter + 1;
        $clientData = json_encode(['type' => 'webauthn.get', 'challenge' => $options['challenge'],
            'origin' => $origin ?? $this->origin]);
        $authData = hash('sha256', $this->rpId, true) . chr(0x05) . pack('N', $this->counter);
        openssl_sign($authData . hash('sha256', $clientData, true), $signature, $this->key, OPENSSL_ALGO_SHA256);
        return [
            'id' => b64u($this->credentialId),
            'rawId' => b64u($this->credentialId),
            'type' => 'public-key',
            'response' => [
                'clientDataJSON' => b64u($clientData),
                'authenticatorData' => b64u($authData),
                'signature' => b64u($signature),
                'userHandle' => b64u($this->userHandle),
            ],
        ];
    }
}

// ------------------------------------------------------------ tests

echo "Accounts\n";
$emailA = 'rahim' . bin2hex(random_bytes(3)) . '@example.com';
$emailB = 'karim' . bin2hex(random_bytes(3)) . '@example.com';

[$s] = call('POST', '/api/auth/register', ['name' => 'রহিম', 'email' => $emailA, 'password' => 'secret-pass-1'], ['xhr' => false]);
check($s === 403, 'cookie request without X-Requested-With is rejected (CSRF)', $s);

[$s, $j, $h] = call('POST', '/api/auth/register', ['name' => 'রহিম', 'email' => $emailA, 'password' => 'secret-pass-1']);
$cookieA = cookieFrom($h);
check($s === 201 && $cookieA !== null && !isset($j['token']), 'web register sets an HttpOnly cookie, no token in body', [$s, $j]);
check(implode("\n", $h) !== '' && stripos(implode("\n", $h), 'HttpOnly') !== false
    && stripos(implode("\n", $h), 'SameSite=Strict') !== false, 'session cookie is HttpOnly and SameSite=Strict');

[$s, $j] = call('POST', '/api/auth/register', ['name' => 'করিম', 'email' => $emailB, 'password' => 'secret-pass-2'], ['app' => true]);
$tokenB = $j['token'] ?? null;
check($s === 201 && is_string($tokenB) && strlen($tokenB) === 64, 'app register returns a bearer token', [$s, $j]);

[$s, $j] = call('POST', '/api/auth/register', ['name' => 'আবার', 'email' => strtoupper($emailA), 'password' => 'secret-pass-1']);
check($s === 409, 'duplicate email (any case) is refused', [$s, $j]);
[$s] = call('POST', '/api/auth/register', ['name' => 'নতুন', 'email' => 'n' . $emailA, 'password' => 'short']);
check($s === 422, 'short password is refused');
[$s] = call('POST', '/api/auth/register', ['name' => 'নতুন', 'email' => 'not-an-email', 'password' => 'long-enough-1']);
check($s === 422, 'invalid email is refused');

[$s, $j] = call('POST', '/api/auth/login', ['email' => $emailA, 'password' => 'wrong-password'], ['app' => true]);
check($s === 401 && $j['error']['code'] === 'bad_credentials', 'wrong password is refused', [$s, $j]);
[$s, $j] = call('POST', '/api/auth/login', ['email' => $emailA, 'password' => 'secret-pass-1'], ['app' => true]);
$tokenA = $j['token'] ?? null;
check($s === 200 && $tokenA !== null, 'correct password logs in', [$s, $j]);

$emailC = 'locked' . bin2hex(random_bytes(3)) . '@example.com';
call('POST', '/api/auth/register', ['name' => 'লক', 'email' => $emailC, 'password' => 'right-pass-123'], ['app' => true]);
for ($i = 0; $i < 5; $i++) {
    call('POST', '/api/auth/login', ['email' => $emailC, 'password' => 'guess-' . $i], ['app' => true]);
}
[$s, $j] = call('POST', '/api/auth/login', ['email' => $emailC, 'password' => 'right-pass-123'], ['app' => true]);
check($s === 429, 'five wrong passwords pause logins for that email', [$s, $j]);
[$s] = call('POST', '/api/auth/login', ['email' => $emailA, 'password' => 'secret-pass-1'], ['app' => true]);
check($s === 200, 'other accounts on the same network can still log in');

[$s, $j] = call('GET', '/api/me', null, ['cookie' => $cookieA]);
check($s === 200 && $j['user']['email'] === $emailA && $j['user']['name'] === 'রহিম', '/me works with the web cookie', $j);
[$s] = call('GET', '/api/me');
check($s === 401, '/me without a session is 401');

echo "Wallet\n";
$k1 = idem();
[$s, $j] = call('POST', '/api/wallet/deposit', ['amount' => '1000.50', 'method' => 'bkash', 'idempotency_key' => $k1], ['token' => $tokenA]);
check($s === 200 && $j['balance'] === '1000.50' && $j['transaction']['amount'] === '1000.50', 'deposit 1000.50 via bKash', $j);
$firstTx = $j['transaction']['id'] ?? null;
[$s, $j] = call('POST', '/api/wallet/deposit', ['amount' => '1000.50', 'method' => 'bkash', 'idempotency_key' => $k1], ['token' => $tokenA]);
check($s === 200 && ($j['replayed'] ?? false) && $j['transaction']['id'] === $firstTx && $j['balance'] === '1000.50',
    'repeating the same request does not deposit twice', $j);

foreach ([['abc', 'invalid_amount'], ['10.555', 'invalid_amount'], ['5', 'amount_too_small'], ['50000.01', 'amount_too_large'], ['-20', 'invalid_amount']] as [$amount, $code]) {
    [$s, $j] = call('POST', '/api/wallet/deposit', ['amount' => $amount, 'method' => 'bkash', 'idempotency_key' => idem()], ['token' => $tokenA]);
    check($s === 422 && $j['error']['code'] === $code, "deposit amount '{$amount}' is refused ({$code})", $j);
}
[$s, $j] = call('POST', '/api/wallet/deposit', ['amount' => '100', 'method' => 'paypal', 'idempotency_key' => idem()], ['token' => $tokenA]);
check($s === 422, 'unknown payment method is refused');

[$s, $j] = call('GET', '/api/users/lookup?email=' . urlencode($emailB), null, ['token' => $tokenA]);
check($s === 200 && $j['name'] === 'করিম', 'recipient lookup shows the name', $j);
[$s, $j] = call('GET', '/api/users/lookup?email=nobody@example.com', null, ['token' => $tokenA]);
check($s === 404, 'lookup of an unknown email is 404');

[$s, $j] = call('POST', '/api/wallet/transfer', ['to_email' => $emailB, 'amount' => '300', 'note' => 'বাজারের টাকা', 'idempotency_key' => idem()], ['token' => $tokenA]);
check($s === 200 && $j['balance'] === '700.50', 'send 300 to B', $j);
[$s, $j] = call('GET', '/api/wallet', null, ['token' => $tokenB]);
check($s === 200 && $j['balance'] === '300.00' && $j['month_in'] === '300.00', 'B received 300', $j);
[$s, $j] = call('POST', '/api/wallet/transfer', ['to_email' => $emailB, 'amount' => '800', 'idempotency_key' => idem()], ['token' => $tokenA]);
check($s === 422 && $j['error']['code'] === 'insufficient_funds', 'cannot send more than the balance', $j);
[$s, $j] = call('POST', '/api/wallet/transfer', ['to_email' => $emailA, 'amount' => '10', 'idempotency_key' => idem()], ['token' => $tokenA]);
check($s === 422 && $j['error']['code'] === 'self_transfer', 'cannot send to yourself', $j);
[$s, $j] = call('POST', '/api/wallet/transfer', ['to_email' => 'ghost@example.com', 'amount' => '10', 'idempotency_key' => idem()], ['token' => $tokenA]);
check($s === 404, 'cannot send to an unknown email', $j);

[$s, $j] = call('POST', '/api/wallet/withdraw', ['amount' => '50', 'method' => 'nagad', 'idempotency_key' => idem()], ['token' => $tokenB]);
check($s === 200 && $j['balance'] === '250.00', 'B withdraws 50', $j);
[$s, $j] = call('POST', '/api/wallet/withdraw', ['amount' => '1000', 'method' => 'nagad', 'idempotency_key' => idem()], ['token' => $tokenB]);
check($s === 422 && $j['error']['code'] === 'insufficient_funds', 'cannot withdraw more than the balance', $j);

[$s, $j] = call('GET', '/api/transactions', null, ['token' => $tokenA]);
$types = array_column($j['transactions'] ?? [], 'type');
check($s === 200 && $types === ['transfer_out', 'deposit'], 'A history is newest first', $types);
check(($j['transactions'][0]['counterparty']['name'] ?? '') === 'করিম' && $j['transactions'][0]['note'] === 'বাজারের টাকা',
    'history shows the recipient and the note');
[$s, $j] = call('GET', '/api/transactions?limit=1', null, ['token' => $tokenA]);
$next = $j['next_before'] ?? null;
[$s2, $j2] = call('GET', '/api/transactions?limit=1&before=' . $next, null, ['token' => $tokenA]);
check(count($j['transactions']) === 1 && $next !== null && $j2['transactions'][0]['type'] === 'deposit' && $j2['next_before'] === null,
    'history pages with next_before', [$j, $j2]);

echo "Concurrency\n";
// Ten simultaneous 100 taka transfers from an account holding 250: exactly two may succeed.
$mh = curl_multi_init();
$handles = [];
for ($i = 0; $i < 10; $i++) {
    $ch = curl_init($base . '/api/wallet/transfer');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $tokenB, 'X-Client: android'],
        CURLOPT_POSTFIELDS => json_encode(['to_email' => $emailA, 'amount' => '100', 'idempotency_key' => idem()]),
    ]);
    curl_multi_add_handle($mh, $ch);
    $handles[] = $ch;
}
do {
    curl_multi_exec($mh, $running);
    curl_multi_select($mh);
} while ($running > 0);
$ok = 0;
foreach ($handles as $ch) {
    $ok += curl_getinfo($ch, CURLINFO_RESPONSE_CODE) === 200 ? 1 : 0;
}
[$s, $j] = call('GET', '/api/wallet', null, ['token' => $tokenB]);
check($ok === 2 && $j['balance'] === '50.00', "parallel transfers never overdraw ({$ok} of 10 succeeded, balance {$j['balance']})");

echo "Google sign-in\n";
if ($jwksDir === null) {
    echo "  (skipped: no JWKS directory given)\n";
} else {
    $google = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_RSA, 'private_key_bits' => 2048]);
    $rsa = openssl_pkey_get_details($google)['rsa'];
    // A new key id each run: the server caches Google's keys by id, and Google never reuses one.
    $kid = 'test-' . bin2hex(random_bytes(4));
    file_put_contents("{$jwksDir}/jwks.json", json_encode(['keys' => [
        ['kty' => 'RSA', 'kid' => $kid, 'alg' => 'RS256', 'use' => 'sig', 'n' => b64u($rsa['n']), 'e' => b64u($rsa['e'])],
    ]]));
    $makeToken = function (array $claims, $signingKey = null) use ($google, $kid): string {
        $payload = $claims + ['iss' => 'https://accounts.google.com', 'aud' => 'test-client.apps.googleusercontent.com',
            'iat' => time(), 'exp' => time() + 3600, 'email_verified' => true];
        $input = b64u(json_encode(['alg' => 'RS256', 'kid' => $kid, 'typ' => 'JWT'])) . '.' . b64u(json_encode($payload));
        openssl_sign($input, $sig, $signingKey ?? $google, OPENSSL_ALGO_SHA256);
        return $input . '.' . b64u($sig);
    };

    $gEmail = 'g' . bin2hex(random_bytes(3)) . '@gmail.com';
    [$s, $j] = call('POST', '/api/auth/google', ['id_token' => $makeToken(['sub' => 'g-1-' . $gEmail, 'email' => $gEmail, 'name' => 'গুগল ইউজার'])], ['app' => true]);
    check($s === 200 && $j['user']['email'] === $gEmail && $j['user']['google_linked'] && !$j['user']['has_password'],
        'valid Google token creates an account', $j);
    [$s, $j2] = call('POST', '/api/auth/google', ['id_token' => $makeToken(['sub' => 'g-1-' . $gEmail, 'email' => $gEmail, 'name' => 'x'])], ['app' => true]);
    check($s === 200 && $j2['user']['id'] === $j['user']['id'], 'signing in again finds the same account');

    [$s, $j] = call('POST', '/api/auth/google', ['id_token' => $makeToken(['sub' => 'g-2-' . $emailA, 'email' => $emailA, 'name' => 'রহিম'])], ['app' => true]);
    check($s === 200 && $j['user']['email'] === $emailA && $j['user']['google_linked'] && $j['user']['has_password'],
        'Google sign-in with an existing email links to that account', $j);

    [$s, $j] = call('POST', '/api/auth/google', ['id_token' => $makeToken(['sub' => 'g-3', 'email' => 'x@gmail.com', 'aud' => 'someone-else'])], ['app' => true]);
    check($s === 401, 'token for another app (wrong aud) is refused', $j);
    [$s] = call('POST', '/api/auth/google', ['id_token' => $makeToken(['sub' => 'g-3', 'email' => 'x@gmail.com', 'exp' => time() - 3600])], ['app' => true]);
    check($s === 401, 'expired token is refused');
    [$s] = call('POST', '/api/auth/google', ['id_token' => $makeToken(['sub' => 'g-3', 'email' => 'x@gmail.com', 'iss' => 'evil.example'])], ['app' => true]);
    check($s === 401, 'token from another issuer is refused');
    $other = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_RSA, 'private_key_bits' => 2048]);
    [$s] = call('POST', '/api/auth/google', ['id_token' => $makeToken(['sub' => 'g-3', 'email' => 'x@gmail.com'], $other)], ['app' => true]);
    check($s === 401, 'token signed by a different key is refused');
    [$s] = call('POST', '/api/auth/google', ['id_token' => $makeToken(['sub' => 'g-3', 'email' => 'x@gmail.com', 'email_verified' => false])], ['app' => true]);
    check($s === 401, 'unverified Google email is refused');
}

echo "Passkeys\n";
$device = new Authenticator($rpId, $origin);
[$s, $j] = call('POST', '/api/passkeys/options', [], ['token' => $tokenA]);
check($s === 200 && $j['options']['rp']['id'] === $rpId && $j['options']['authenticatorSelection']['residentKey'] === 'required',
    'registration options', $j);
[$s, $reg] = call('POST', '/api/passkeys', ['challenge_id' => $j['challenge_id'], 'credential' => $device->create($j['options']), 'name' => 'টেস্ট ফোন'], ['token' => $tokenA]);
check($s === 201 && $reg['passkey']['name'] === 'টেস্ট ফোন', 'passkey is registered', $reg);
[$s, $j2] = call('POST', '/api/passkeys', ['challenge_id' => $j['challenge_id'], 'credential' => $device->create($j['options'])], ['token' => $tokenA]);
check($s === 400 && $j2['error']['code'] === 'challenge_expired', 'a registration challenge works only once', $j2);

[$s, $j] = call('POST', '/api/passkeys/options', [], ['token' => $tokenA]);
check(count($j['options']['excludeCredentials']) === 1, 'existing passkey is excluded from new registrations');
$evil = new Authenticator($rpId, 'https://evil.example');
[$s, $j2] = call('POST', '/api/passkeys', ['challenge_id' => $j['challenge_id'], 'credential' => $evil->create($j['options'])], ['token' => $tokenA]);
check($s === 400 && $j2['error']['code'] === 'bad_origin', 'passkey from another website is refused', $j2);

[$s, $opts] = call('POST', '/api/auth/passkey/options', [], ['app' => true]);
check($s === 200 && $opts['options']['rpId'] === $rpId && $opts['options']['allowCredentials'] === [], 'login options (discoverable)', $opts);
$assertion = $device->get($opts['options']);
[$s, $j] = call('POST', '/api/auth/passkey/verify', ['challenge_id' => $opts['challenge_id'], 'credential' => $assertion], ['app' => true]);
check($s === 200 && $j['user']['email'] === $emailA && strlen($j['token'] ?? '') === 64, 'passkey login signs in as the owner', $j);
[$s, $j] = call('POST', '/api/auth/passkey/verify', ['challenge_id' => $opts['challenge_id'], 'credential' => $assertion], ['app' => true]);
check($s === 400 && $j['error']['code'] === 'challenge_expired', 'a replayed passkey login is refused', $j);

[$s, $opts] = call('POST', '/api/auth/passkey/options', [], ['app' => true]);
$bad = $device->get($opts['options']);
$bad['response']['signature'] = b64u(str_repeat("\x30", 70));
[$s, $j] = call('POST', '/api/auth/passkey/verify', ['challenge_id' => $opts['challenge_id'], 'credential' => $bad], ['app' => true]);
check($s === 400 && $j['error']['code'] === 'passkey_invalid', 'a forged signature is refused', $j);

[$s, $opts] = call('POST', '/api/auth/passkey/options', [], ['app' => true]);
[$s, $j] = call('POST', '/api/auth/passkey/verify', ['challenge_id' => $opts['challenge_id'], 'credential' => $device->get($opts['options'], null, 1)], ['app' => true]);
check($s === 400, 'a signature counter that goes backwards is refused (cloned key)', $j);

[$s, $opts] = call('POST', '/api/auth/passkey/options', [], ['app' => true]);
$stranger = new Authenticator($rpId, $origin);
[$s, $j] = call('POST', '/api/auth/passkey/verify', ['challenge_id' => $opts['challenge_id'], 'credential' => $stranger->get($opts['options'])], ['app' => true]);
check($s === 401 && $j['error']['code'] === 'passkey_unknown', 'an unregistered passkey is refused', $j);

[$s, $j] = call('GET', '/api/passkeys', null, ['token' => $tokenA]);
$pkId = $j['passkeys'][0]['id'] ?? 0;
check($s === 200 && count($j['passkeys']) === 1, 'passkeys are listed', $j);
[$s] = call('DELETE', "/api/passkeys/{$pkId}", null, ['token' => $tokenB]);
check($s === 404, "another user cannot delete someone's passkey");
[$s] = call('DELETE', "/api/passkeys/{$pkId}", null, ['token' => $tokenA]);
check($s === 200, 'owner deletes the passkey');

echo "Sessions\n";
[$s] = call('POST', '/api/auth/logout', [], ['token' => $tokenB]);
[$s2] = call('GET', '/api/me', null, ['token' => $tokenB]);
check($s === 200 && $s2 === 401, 'logout ends the session');
[$s, $j] = call('GET', '/.well-known/assetlinks.json');
check($s === 200 && in_array('delegate_permission/common.get_login_creds', $j[0]['relation'] ?? [], true),
    'assetlinks.json is served for the Android app', $j);
[$s] = call('GET', '/config.php');
[$s2] = call('GET', '/app/Auth.php');
check($s === 403 && $s2 === 403, 'config and app code are not downloadable', [$s, $s2]);

echo "\n{$passes} passed, {$failures} failed\n";
exit($failures > 0 ? 1 : 0);
