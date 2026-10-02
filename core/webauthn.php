<?php
/**
 * Passkeys (WebAuthn Level 2) – dependency-free server implementation.
 * Supports ES256 (P-256) and RS256 credentials, attestation "none",
 * discoverable (username-less) sign-in.
 */
defined('APP') || exit;

function wa_rp_id(): string
{
    return (string)parse_url(BASE_URL, PHP_URL_HOST);
}

function wa_origin(): string
{
    $p = parse_url(BASE_URL);
    return $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
}

function wa_challenge(string $purpose): string
{
    $c = random_bytes(32);
    $_SESSION['wa_' . $purpose] = ['c' => b64url_encode($c), 't' => time()];
    return b64url_encode($c);
}

function wa_take_challenge(string $purpose): ?string
{
    $c = $_SESSION['wa_' . $purpose] ?? null;
    unset($_SESSION['wa_' . $purpose]);
    if (!$c || time() - $c['t'] > 300) return null;
    return $c['c'];
}

function wa_register_options(array $u): array
{
    $exclude = array_map(fn($r) => ['type' => 'public-key', 'id' => $r['credential_id']],
        rows('SELECT credential_id FROM user_passkeys WHERE user_id = ?', [$u['id']]));
    return [
        'challenge' => wa_challenge('reg'),
        'rp' => ['name' => (string)setting('site_name'), 'id' => wa_rp_id()],
        'user' => ['id' => b64url_encode('uid:' . $u['id']), 'name' => $u['email'], 'displayName' => $u['name']],
        'pubKeyCredParams' => [['type' => 'public-key', 'alg' => -7], ['type' => 'public-key', 'alg' => -257]],
        'timeout' => 120000,
        'attestation' => 'none',
        'authenticatorSelection' => ['residentKey' => 'required', 'requireResidentKey' => true, 'userVerification' => 'preferred'],
        'excludeCredentials' => $exclude,
    ];
}

function wa_login_options(): array
{
    return ['challenge' => wa_challenge('login'), 'rpId' => wa_rp_id(), 'timeout' => 120000, 'userVerification' => 'preferred', 'allowCredentials' => []];
}

function wa_check_client_data(string $json, string $type, string $challenge): void
{
    $cd = json_decode($json, true);
    if (!is_array($cd) || ($cd['type'] ?? '') !== $type) throw new RuntimeException('type');
    if (!hash_equals($challenge, (string)($cd['challenge'] ?? ''))) throw new RuntimeException('challenge');
    if (($cd['origin'] ?? '') !== wa_origin()) throw new RuntimeException('origin');
}

/** Parse authenticator data. */
function wa_auth_data(string $ad): array
{
    if (strlen($ad) < 37) throw new RuntimeException('authData');
    if (!hash_equals(hash('sha256', wa_rp_id(), true), substr($ad, 0, 32))) throw new RuntimeException('rpId');
    $flags = ord($ad[32]);
    if (!($flags & 0x01)) throw new RuntimeException('user presence');
    $out = ['flags' => $flags, 'count' => unpack('N', substr($ad, 33, 4))[1]];
    if ($flags & 0x40) {
        $len = unpack('n', substr($ad, 53, 2))[1];
        $out['cred_id'] = substr($ad, 55, $len);
        $offset = 55 + $len;
        $out['cose'] = cbor_decode($ad, $offset);
    }
    return $out;
}

/** Verify a registration response, store the passkey. */
function wa_register_verify(array $u, array $resp, string $name): void
{
    $challenge = wa_take_challenge('reg') ?? throw new RuntimeException('expired');
    $clientJson = b64url_decode((string)($resp['clientDataJSON'] ?? ''));
    wa_check_client_data($clientJson, 'webauthn.create', $challenge);
    $off = 0;
    $att = cbor_decode(b64url_decode((string)($resp['attestationObject'] ?? '')), $off);
    if (!is_array($att) || !isset($att['authData'])) throw new RuntimeException('attestation');
    $ad = wa_auth_data($att['authData']);
    if (empty($ad['cred_id']) || empty($ad['cose'])) throw new RuntimeException('no credential');
    $pem = cose_to_pem($ad['cose']);
    $credId = b64url_encode($ad['cred_id']);
    if (val('SELECT 1 FROM user_passkeys WHERE credential_id = ?', [$credId])) throw new RuntimeException('exists');
    insert('user_passkeys', ['user_id' => $u['id'], 'credential_id' => $credId, 'public_key' => $pem, 'sign_count' => $ad['count'],
        'name' => mb_substr($name !== '' ? $name : device_label(), 0, 100)]);
}

/** Verify an assertion; returns the user row. */
function wa_login_verify(array $resp): array
{
    $challenge = wa_take_challenge('login') ?? throw new RuntimeException('expired');
    $pk = row('SELECT * FROM user_passkeys WHERE credential_id = ?', [(string)($resp['id'] ?? '')]) ?? throw new RuntimeException('unknown credential');
    $clientJson = b64url_decode((string)($resp['clientDataJSON'] ?? ''));
    wa_check_client_data($clientJson, 'webauthn.get', $challenge);
    $authData = b64url_decode((string)($resp['authenticatorData'] ?? ''));
    $ad = wa_auth_data($authData);
    $ok = openssl_verify($authData . hash('sha256', $clientJson, true), b64url_decode((string)($resp['signature'] ?? '')), $pk['public_key'], OPENSSL_ALGO_SHA256);
    if ($ok !== 1) throw new RuntimeException('signature');
    if ($pk['sign_count'] > 0 && $ad['count'] <= $pk['sign_count']) throw new RuntimeException('counter');
    q('UPDATE user_passkeys SET sign_count = ?, last_used_at = NOW() WHERE id = ?', [$ad['count'], $pk['id']]);
    return row('SELECT * FROM users WHERE id = ?', [$pk['user_id']]) ?? throw new RuntimeException('user');
}

// ---------------------------------------------------------------------
// Minimal CBOR decoder (RFC 8949) – enough for WebAuthn structures
// ---------------------------------------------------------------------
function cbor_decode(string $data, int &$o): mixed
{
    if ($o >= strlen($data)) throw new RuntimeException('cbor eof');
    $ib = ord($data[$o++]);
    $major = $ib >> 5;
    $info = $ib & 0x1f;
    $len = function () use ($data, &$o, $info): int {
        if ($info < 24) return $info;
        $n = [24 => 1, 25 => 2, 26 => 4, 27 => 8][$info] ?? throw new RuntimeException('cbor len');
        $v = 0;
        for ($i = 0; $i < $n; $i++) $v = ($v << 8) | ord($data[$o++]);
        return $v;
    };
    switch ($major) {
        case 0: return $len();
        case 1: return -1 - $len();
        case 2:
        case 3:
            $l = $len();
            $s = substr($data, $o, $l);
            $o += $l;
            return $s;
        case 4:
            $l = $len();
            $a = [];
            for ($i = 0; $i < $l; $i++) $a[] = cbor_decode($data, $o);
            return $a;
        case 5:
            $l = $len();
            $m = [];
            for ($i = 0; $i < $l; $i++) { $k = cbor_decode($data, $o); $m[$k] = cbor_decode($data, $o); }
            return $m;
        case 6:
            $len();
            return cbor_decode($data, $o);
        case 7:
            if ($info === 20) return false;
            if ($info === 21) return true;
            if ($info === 22 || $info === 23) return null;
            if ($info === 25) { $o += 2; return 0.0; }
            if ($info === 26) { $v = unpack('G', substr($data, $o, 4))[1]; $o += 4; return $v; }
            if ($info === 27) { $v = unpack('E', substr($data, $o, 8))[1]; $o += 8; return $v; }
            return null;
    }
    throw new RuntimeException('cbor type');
}

// ---------------------------------------------------------------------
// COSE key → PEM
// ---------------------------------------------------------------------
function der_len(int $l): string
{
    if ($l < 128) return chr($l);
    $b = ltrim(pack('N', $l), "\0");
    return chr(0x80 | strlen($b)) . $b;
}

function der(int $tag, string $body): string
{
    return chr($tag) . der_len(strlen($body)) . $body;
}

function der_int(string $bytes): string
{
    $bytes = ltrim($bytes, "\0");
    if ($bytes === '' || ord($bytes[0]) & 0x80) $bytes = "\0" . $bytes;
    return der(0x02, $bytes);
}

function cose_to_pem(array $k): string
{
    $kty = $k[1] ?? null;
    if ($kty === 2) { // EC2
        if (($k[-1] ?? null) !== 1 || strlen($k[-2] ?? '') !== 32 || strlen($k[-3] ?? '') !== 32) throw new RuntimeException('unsupported curve');
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . "\x04" . $k[-2] . $k[-3];
    } elseif ($kty === 3) { // RSA
        $rsa = der(0x30, der_int($k[-1]) . der_int($k[-2]));
        $der = der(0x30, der(0x30, der(0x06, hex2bin('2a864886f70d010101')) . "\x05\x00") . der(0x03, "\0" . $rsa));
    } else {
        throw new RuntimeException('unsupported key');
    }
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
}
