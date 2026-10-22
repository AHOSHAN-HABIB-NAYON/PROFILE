<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Security;

/**
 * Firebase Cloud Messaging (HTTP v1). Requires a service-account JSON stored (encrypted) in settings
 * and fcm_enabled=1. Without configuration every send is logged as "skipped" — nothing is faked.
 */
final class PushService
{
    public function __construct(private Database $db, private SettingsService $settings)
    {
    }

    public function configured(): bool
    {
        if (!$this->settings->bool('fcm_enabled')) {
            return false;
        }
        $sa = $this->serviceAccount();
        return $sa !== null && $this->settings->has('fcm_project_id');
    }

    public function serviceAccount(): ?array
    {
        $json = $this->settings->get('fcm_service_account');
        if (!$json) {
            return null;
        }
        $sa = json_decode($json, true);
        if (!is_array($sa) || empty($sa['client_email']) || empty($sa['private_key'])) {
            return null;
        }
        return $sa;
    }

    public function registerToken(int $userId, string $token, string $platform, ?string $device): void
    {
        if (!preg_match('/^[A-Za-z0-9:_\-.]{20,4096}$/', $token)) {
            throw new \OryzenX\Core\HttpException(422, 'invalid_token', 'Invalid push token.');
        }
        $hash = hash('sha256', $token);
        $now = Database::now();
        // A device token belongs to exactly one account: re-registering moves it to the current user.
        $this->db->run(
            'INSERT INTO push_tokens (user_id, token_hash, token_encrypted, platform, device_name, last_seen_at, created_at)
             VALUES (:u, :h, :t, :p, :d, :n, :n)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), token_encrypted = VALUES(token_encrypted), platform = VALUES(platform),
                device_name = VALUES(device_name), last_seen_at = VALUES(last_seen_at), invalidated_at = NULL',
            ['u' => $userId, 'h' => $hash, 't' => Security::encrypt($token), 'p' => in_array($platform, ['android', 'ios', 'web'], true) ? $platform : 'android',
             'd' => $device ? mb_substr(strip_tags($device), 0, 100) : null, 'n' => $now]
        );
    }

    public function unregisterToken(int $userId, string $token): void
    {
        $this->db->run('DELETE FROM push_tokens WHERE user_id = :u AND token_hash = :h', ['u' => $userId, 'h' => hash('sha256', $token)]);
    }

    /**
     * Sends a notification to all active devices of a user.
     * Lock-screen text is generic; details stay inside the app (data payload carries only ids/types).
     */
    public function sendToUser(int $userId, string $title, string $body, array $data, string $eventKey): array
    {
        $tokens = $this->db->all('SELECT id, token_encrypted FROM push_tokens WHERE user_id = :u AND invalidated_at IS NULL', ['u' => $userId]);
        $result = ['sent' => 0, 'failed' => 0, 'skipped' => 0];
        if (!$tokens) {
            return $result;
        }
        if (!$this->configured()) {
            foreach ($tokens as $t) {
                $this->log($userId, (int) $t['id'], $eventKey, $title, 'skipped', 'FCM is not configured');
                $result['skipped']++;
            }
            return $result;
        }
        try {
            $access = $this->accessToken();
        } catch (\Throwable $e) {
            foreach ($tokens as $t) {
                $this->log($userId, (int) $t['id'], $eventKey, $title, 'failed', 'OAuth: ' . $e->getMessage());
                $result['failed']++;
            }
            return $result;
        }
        $project = (string) $this->settings->get('fcm_project_id');
        foreach ($tokens as $t) {
            // de-duplicate per event/device
            $exists = $this->db->value('SELECT id FROM push_logs WHERE event_key = :e AND push_token_id = :t AND status = "sent"', ['e' => $eventKey, 't' => $t['id']]);
            if ($exists) {
                continue;
            }
            $deviceToken = Security::decrypt($t['token_encrypted']);
            if ($deviceToken === null) {
                continue;
            }
            $payload = [
                'message' => [
                    'token' => $deviceToken,
                    'notification' => ['title' => $title, 'body' => $body],
                    'data' => array_map('strval', $data + ['event_key' => $eventKey]),
                    'android' => ['priority' => 'high', 'notification' => ['channel_id' => 'account_updates', 'visibility' => 'PRIVATE']],
                ],
            ];
            $res = HttpClient::post(
                "https://fcm.googleapis.com/v1/projects/" . rawurlencode($project) . "/messages:send",
                (string) json_encode($payload),
                ['Authorization' => 'Bearer ' . $access, 'Content-Type' => 'application/json'],
                10
            );
            if ($res['status'] === 200) {
                $this->log($userId, (int) $t['id'], $eventKey, $title, 'sent', null);
                $result['sent']++;
            } elseif (in_array($res['status'], [404, 400], true)
                && (str_contains($res['body'], 'UNREGISTERED') || (str_contains($res['body'], 'INVALID_ARGUMENT') && str_contains($res['body'], 'registration token')))) {
                $this->db->update('push_tokens', ['invalidated_at' => Database::now()], 'id = :id', ['id' => $t['id']]);
                $this->log($userId, (int) $t['id'], $eventKey, $title, 'invalid_token', 'Token no longer valid; removed');
                $result['failed']++;
            } else {
                $this->log($userId, (int) $t['id'], $eventKey, $title, 'failed', 'HTTP ' . $res['status'] . ' ' . mb_substr($res['body'] ?: (string) $res['error'], 0, 300));
                $result['failed']++;
            }
        }
        return $result;
    }

    /** OAuth2 access token from the service account (JWT bearer grant), cached ~50 minutes. */
    private function accessToken(): string
    {
        $cached = $this->db->value('SELECT value FROM cache_items WHERE cache_key = "fcm_access_token" AND expires_at > UTC_TIMESTAMP()');
        if ($cached) {
            $plain = Security::decrypt($cached);
            if ($plain) {
                return $plain;
            }
        }
        $sa = $this->serviceAccount();
        if ($sa === null) {
            throw new \RuntimeException('Service account missing');
        }
        $now = time();
        $b64 = fn (string $s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
        $header = $b64((string) json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $claims = $b64((string) json_encode([
            'iss' => $sa['client_email'],
            'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
            'aud' => $sa['token_uri'] ?? 'https://oauth2.googleapis.com/token',
            'iat' => $now,
            'exp' => $now + 3600,
        ]));
        $sig = '';
        if (!openssl_sign($header . '.' . $claims, $sig, $sa['private_key'], OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('Could not sign JWT with the service account key');
        }
        $jwt = $header . '.' . $claims . '.' . $b64($sig);
        $res = HttpClient::post(
            $sa['token_uri'] ?? 'https://oauth2.googleapis.com/token',
            http_build_query(['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $jwt]),
            ['Content-Type' => 'application/x-www-form-urlencoded'],
            10
        );
        $data = json_decode($res['body'], true);
        if ($res['status'] !== 200 || empty($data['access_token'])) {
            throw new \RuntimeException('Token request failed (HTTP ' . $res['status'] . ')');
        }
        $this->db->run(
            'REPLACE INTO cache_items (cache_key, value, expires_at) VALUES ("fcm_access_token", :v, :e)',
            ['v' => Security::encrypt($data['access_token']), 'e' => gmdate('Y-m-d H:i:s', $now + 3000)]
        );
        return $data['access_token'];
    }

    private function log(?int $userId, ?int $tokenId, string $eventKey, string $title, string $status, ?string $detail): void
    {
        $this->db->run(
            'INSERT INTO push_logs (user_id, push_token_id, event_key, title, status, detail, created_at)
             VALUES (:u, :t, :e, :ti, :s, :d, :c)
             ON DUPLICATE KEY UPDATE status = VALUES(status), detail = VALUES(detail), created_at = VALUES(created_at)',
            ['u' => $userId, 't' => $tokenId, 'e' => $eventKey, 'ti' => mb_substr($title, 0, 150), 's' => $status, 'd' => $detail ? mb_substr($detail, 0, 500) : null, 'c' => Database::now()]
        );
    }
}
