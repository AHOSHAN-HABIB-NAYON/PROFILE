<?php
/**
 * Web Push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload
 * encryption (RFC 8291) — implemented with ext-openssl only.
 */
declare(strict_types=1);

final class WebPush
{
    public static function enabled(): bool
    {
        return setting_on('push_enabled') && self::publicKey() !== '';
    }

    public static function publicKey(): string
    {
        return (string) setting('push_vapid_public', '');
    }

    /** Create and store a new VAPID key pair. */
    public static function generateKeys(): string
    {
        $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        if (!$key) {
            throw new RuntimeException('Unable to create EC key');
        }
        openssl_pkey_export($key, $pem);
        $d = openssl_pkey_get_details($key);
        $public = "\x04" . str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
        Settings::set('push_vapid_private', $pem);
        Settings::set('push_vapid_public', b64url_encode($public));
        return b64url_encode($public);
    }

    /** DER SubjectPublicKeyInfo for a raw uncompressed P-256 point. */
    public static function p256PublicPem(string $point): string
    {
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $point;
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    /** Convert an ASN.1 DER ECDSA signature into raw r||s (64 bytes) for JWS. */
    public static function derToRaw(string $der): string
    {
        $offset = 3 + (ord($der[1]) & 0x80 ? (ord($der[1]) & 0x7f) : 0);
        $rLen = ord($der[$offset]);
        $r = substr($der, $offset + 1, $rLen);
        $offset += 1 + $rLen + 1;
        $sLen = ord($der[$offset]);
        $s = substr($der, $offset + 1, $sLen);
        return str_pad(ltrim($r, "\0"), 32, "\0", STR_PAD_LEFT) . str_pad(ltrim($s, "\0"), 32, "\0", STR_PAD_LEFT);
    }

    private static function vapidHeader(string $endpoint): string
    {
        $parts = parse_url($endpoint);
        $aud = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
        $header = b64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
        $claims = b64url_encode(json_encode(['aud' => $aud, 'exp' => time() + 12 * 3600, 'sub' => (string) setting('push_subject', 'mailto:admin@example.com')]));
        $input = $header . '.' . $claims;
        $key = openssl_pkey_get_private((string) setting('push_vapid_private'));
        if (!$key || !openssl_sign($input, $sig, $key, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('VAPID signing failed');
        }
        return 'vapid t=' . $input . '.' . b64url_encode(self::derToRaw($sig)) . ', k=' . self::publicKey();
    }

    /** aes128gcm encryption of $payload for a subscription. */
    public static function encrypt(string $payload, string $p256dh, string $authSecret): string
    {
        $uaPublic = b64url_decode($p256dh);
        $auth = b64url_decode($authSecret);
        if (strlen($uaPublic) !== 65 || strlen($auth) !== 16) {
            throw new InvalidArgumentException('Invalid subscription keys');
        }
        $local = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        $d = openssl_pkey_get_details($local);
        $asPublic = "\x04" . str_pad($d['ec']['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\0", STR_PAD_LEFT);
        $shared = openssl_pkey_derive(openssl_pkey_get_public(self::p256PublicPem($uaPublic)), $local, 32);
        if ($shared === false) {
            throw new RuntimeException('ECDH failed');
        }
        $salt = random_bytes(16);
        $ikm = hash_hkdf('sha256', $shared, 32, "WebPush: info\0" . $uaPublic . $asPublic, $auth);
        $cek = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\0", $salt);
        $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\0", $salt);
        $cipher = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
        return $salt . pack('N', 4096) . chr(65) . $asPublic . $cipher . $tag;
    }

    /** @return int HTTP status from the push service (0 on network error). */
    public static function send(array $sub, array $message): int
    {
        $body = self::encrypt(json_encode($message, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $sub['p256dh'], $sub['auth']);
        $res = Http::request('POST', $sub['endpoint'], $body, [
            'Content-Type: application/octet-stream',
            'Content-Encoding: aes128gcm',
            'TTL: 86400',
            'Urgency: normal',
            'Authorization: ' . self::vapidHeader($sub['endpoint']),
        ], false, 10);
        if (in_array($res['status'], [404, 410], true)) {
            db()->q('DELETE FROM push_subscriptions WHERE id = ?', [$sub['id']]);
        } elseif ($res['status'] >= 200 && $res['status'] < 300) {
            db()->q('UPDATE push_subscriptions SET last_used_at = NOW() WHERE id = ?', [$sub['id']]);
        } else {
            Logger::write('PUSH', 'Push failed', ['status' => $res['status'], 'body' => mb_substr($res['body'], 0, 300), 'err' => $res['error']]);
        }
        return $res['status'];
    }

    /** @return array{sent:int, failed:int} */
    public static function sendToUser(int $userId, string $title, string $body, string $url = '/', string $tag = 'general'): array
    {
        $stats = ['sent' => 0, 'failed' => 0];
        if (!self::enabled()) {
            return $stats;
        }
        $message = [
            'title' => $title,
            'body'  => $body,
            'url'   => url($url),
            'tag'   => $tag,
            'icon'  => upload_url(setting('pwa_icon'), url('assets/icons/icon-192.png')),
            'badge' => url('assets/icons/badge-72.png'),
        ];
        foreach (db()->all('SELECT * FROM push_subscriptions WHERE user_id = ?', [$userId]) as $sub) {
            try {
                $status = self::send($sub, $message);
                $status >= 200 && $status < 300 ? $stats['sent']++ : $stats['failed']++;
            } catch (Throwable $e) {
                Logger::error($e);
                $stats['failed']++;
            }
        }
        return $stats;
    }
}
