<?php
/**
 * Web Push (VAPID, RFC 8292).
 * Messages are sent as "tickles" without a payload; the service worker
 * then fetches the newest notification from /api/notification. This
 * avoids payload encryption while still showing native notifications.
 */
defined('APP') || exit;

function vapid_generate(): array
{
    $key = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
    openssl_pkey_export($key, $pem);
    $d = openssl_pkey_get_details($key)['ec'];
    $pub = "\x04" . str_pad($d['x'], 32, "\0", STR_PAD_LEFT) . str_pad($d['y'], 32, "\0", STR_PAD_LEFT);
    return ['public' => b64url_encode($pub), 'private' => $pem];
}

function push_ready(): bool
{
    return setting_bool('notify.push_enabled') && setting('pwa.vapid_public') && setting('pwa.vapid_private');
}

/** DER ECDSA signature → raw 64-byte R||S (JOSE format). */
function ecdsa_der_to_raw(string $der): string
{
    $o = 2;
    if (ord($der[1]) & 0x80) $o += ord($der[1]) & 0x7f;
    $o++; // 0x02
    $rl = ord($der[$o++]);
    $r = substr($der, $o, $rl);
    $o += $rl + 1;
    $sl = ord($der[$o++]);
    $s = substr($der, $o, $sl);
    return str_pad(ltrim($r, "\0"), 32, "\0", STR_PAD_LEFT) . str_pad(ltrim($s, "\0"), 32, "\0", STR_PAD_LEFT);
}

function vapid_header(string $endpoint): string
{
    $p = parse_url($endpoint);
    $aud = $p['scheme'] . '://' . $p['host'];
    $sub = (string)setting('pwa.vapid_subject');
    if (!preg_match('~^(mailto:|https://)~', $sub)) $sub = 'mailto:' . (setting('contact.email') ?: 'admin@' . wa_safe_host());
    $h = b64url_encode(json_encode(['typ' => 'JWT', 'alg' => 'ES256']));
    $c = b64url_encode(json_encode(['aud' => $aud, 'exp' => time() + 43200, 'sub' => $sub], JSON_UNESCAPED_SLASHES));
    openssl_sign("$h.$c", $sig, (string)setting('pwa.vapid_private'), OPENSSL_ALGO_SHA256);
    return 'vapid t=' . "$h.$c." . b64url_encode(ecdsa_der_to_raw($sig)) . ', k=' . setting('pwa.vapid_public');
}

function wa_safe_host(): string
{
    return (string)(parse_url(BASE_URL, PHP_URL_HOST) ?: 'localhost');
}

/** Send to many subscriptions in parallel; prunes expired ones. Returns delivered count. */
function push_send_many(array $subs): int
{
    if (!push_ready() || !$subs) return 0;
    $ok = 0;
    foreach (array_chunk($subs, 50) as $batch) {
        $mh = curl_multi_init();
        $handles = [];
        foreach ($batch as $s) {
            if (!preg_match('~^https://~', $s['endpoint'])) continue;
            $ch = curl_init($s['endpoint']);
            curl_setopt_array($ch, [
                CURLOPT_POST => true, CURLOPT_POSTFIELDS => '', CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
                CURLOPT_HTTPHEADER => ['Authorization: ' . vapid_header($s['endpoint']), 'TTL: 86400', 'Urgency: normal', 'Content-Length: 0'],
            ]);
            curl_multi_add_handle($mh, $ch);
            $handles[] = [$ch, $s];
        }
        do {
            $status = curl_multi_exec($mh, $running);
            if ($running) curl_multi_select($mh, 1.0);
        } while ($running && $status === CURLM_OK);
        foreach ($handles as [$ch, $s]) {
            $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            if ($code >= 200 && $code < 300) {
                $ok++;
                q('UPDATE push_subscriptions SET last_ok_at = NOW() WHERE id = ?', [$s['id']]);
            } elseif (in_array($code, [404, 410], true)) {
                q('DELETE FROM push_subscriptions WHERE id = ?', [$s['id']]);
            }
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);
        }
        curl_multi_close($mh);
    }
    return $ok;
}
