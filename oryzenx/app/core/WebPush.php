<?php
/** Dependency-free Web Push (RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID). */
final class WebPush
{
    private const EC_DER_PREFIX = '3059301306072a8648ce3d020106082a8648ce3d030107034200';

    public static function ensureKeys(): void
    {
        if (setting('vapid_public') !== '' && setting('vapid_private') !== '') return;
        $k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        if (!$k) return;
        openssl_pkey_export($k, $pem);
        $d = openssl_pkey_get_details($k)['ec'];
        Settings::set(['vapid_public' => Crypto::b64u("\x04" . self::pad($d['x']) . self::pad($d['y'])), 'vapid_private' => $pem]);
    }

    private static function pad(string $b): string { return str_pad($b, 32, "\0", STR_PAD_LEFT); }

    private static function publicKeyFromRaw(string $raw): OpenSSLAsymmetricKey
    {
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode(hex2bin(self::EC_DER_PREFIX) . $raw), 64, "\n") . "-----END PUBLIC KEY-----\n";
        $k = openssl_pkey_get_public($pem);
        if (!$k) throw new RuntimeException('Invalid subscription key');
        return $k;
    }

    /** Sends one push. Returns HTTP status (201 = ok, 404/410 = subscription gone). */
    public static function send(array $sub, array $payload): int
    {
        $uaPublic = Crypto::b64uDecode($sub['p256dh']);
        $authSecret = Crypto::b64uDecode($sub['auth']);
        if (strlen($uaPublic) !== 65 || strlen($authSecret) < 16) return 410;

        $local = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        $ld = openssl_pkey_get_details($local)['ec'];
        $asPublic = "\x04" . self::pad($ld['x']) . self::pad($ld['y']);
        $shared = openssl_pkey_derive(self::publicKeyFromRaw($uaPublic), $local, 32);
        if ($shared === false) throw new RuntimeException('ECDH failed');

        $ikm = hash_hkdf('sha256', $shared, 32, "WebPush: info\0" . $uaPublic . $asPublic, $authSecret);
        $salt = random_bytes(16);
        $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
        $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);
        $plain = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\x02";
        $ct = openssl_encrypt($plain, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
        $body = $salt . pack('N', 4096) . chr(65) . $asPublic . $ct . $tag;

        $u = parse_url($sub['endpoint']);
        $aud = $u['scheme'] . '://' . $u['host'] . (isset($u['port']) ? ':' . $u['port'] : '');
        $jwt = self::vapidJwt($aud);
        $r = Http::request('POST', $sub['endpoint'], [
            'Content-Type' => 'application/octet-stream', 'Content-Encoding' => 'aes128gcm', 'TTL' => '86400',
            'Urgency' => ($payload['priority'] ?? '') === 'high' ? 'high' : 'normal',
            'Authorization' => 'vapid t=' . $jwt . ', k=' . setting('vapid_public'),
        ], $body, 8);
        return $r['status'];
    }

    private static function vapidJwt(string $aud): string
    {
        $subject = setting('vapid_subject') ?: 'mailto:' . (setting('contact_email') ?: 'admin@example.com');
        $h = Crypto::b64u(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
        $c = Crypto::b64u(json_encode(['aud' => $aud, 'exp' => time() + 43200, 'sub' => $subject]));
        $key = openssl_pkey_get_private(setting('vapid_private'));
        openssl_sign("$h.$c", $der, $key, OPENSSL_ALGO_SHA256);
        return "$h.$c." . Crypto::b64u(self::derToRaw($der));
    }

    private static function derToRaw(string $der): string
    {
        $p = 2; if (ord($der[1]) & 0x80) $p += ord($der[1]) & 0x7f;
        $rl = ord($der[$p + 1]); $r = substr($der, $p + 2, $rl); $p += 2 + $rl;
        $sl = ord($der[$p + 1]); $s = substr($der, $p + 2, $sl);
        return str_pad(ltrim($r, "\0"), 32, "\0", STR_PAD_LEFT) . str_pad(ltrim($s, "\0"), 32, "\0", STR_PAD_LEFT);
    }
}
