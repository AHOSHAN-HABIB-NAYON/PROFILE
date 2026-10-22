<?php
declare(strict_types=1);

namespace OryzenX\Services;

use OryzenX\Core\Database;
use OryzenX\Core\Security;

/** Admin-editable runtime settings (app_settings). Secret values are encrypted at rest and never returned to clients. */
final class SettingsService
{
    /** Keys whose values are secrets. */
    public const SECRET_KEYS = ['smtp_password', 'market_api_key', 'fcm_service_account'];

    private ?array $cache = null;

    public function __construct(private Database $db)
    {
    }

    private function loadAll(): array
    {
        if ($this->cache === null) {
            $this->cache = [];
            foreach ($this->db->all('SELECT setting_key, value, is_secret FROM app_settings') as $row) {
                $this->cache[$row['setting_key']] = $row;
            }
        }
        return $this->cache;
    }

    public function get(string $key, ?string $default = null): ?string
    {
        $row = $this->loadAll()[$key] ?? null;
        if ($row === null || $row['value'] === null) {
            return $default;
        }
        if ((int) $row['is_secret'] === 1) {
            return Security::decrypt((string) $row['value']) ?? $default;
        }
        return (string) $row['value'];
    }

    public function bool(string $key, bool $default = false): bool
    {
        $v = $this->get($key);
        return $v === null ? $default : in_array($v, ['1', 'true', 'yes', 'on'], true);
    }

    public function int(string $key, int $default = 0): int
    {
        $v = $this->get($key);
        return $v === null || !is_numeric($v) ? $default : (int) $v;
    }

    public function has(string $key): bool
    {
        $v = $this->get($key);
        return $v !== null && $v !== '';
    }

    public function set(string $key, ?string $value, ?int $actorId = null): void
    {
        $secret = in_array($key, self::SECRET_KEYS, true);
        $stored = $value;
        if ($secret && $value !== null && $value !== '') {
            $stored = Security::encrypt($value);
        }
        $this->db->run(
            'INSERT INTO app_settings (setting_key, value, is_secret, updated_by, updated_at) VALUES (:k, :v, :s, :u, :t)
             ON DUPLICATE KEY UPDATE value = VALUES(value), is_secret = VALUES(is_secret), updated_by = VALUES(updated_by), updated_at = VALUES(updated_at)',
            ['k' => $key, 'v' => $stored, 's' => $secret ? 1 : 0, 'u' => $actorId, 't' => Database::now()]
        );
        $this->cache = null;
    }

    /** All settings for the admin UI; secrets reported only as configured/not configured. */
    public function forAdmin(): array
    {
        $out = [];
        foreach ($this->loadAll() as $key => $row) {
            if ((int) $row['is_secret'] === 1 || in_array($key, self::SECRET_KEYS, true)) {
                $out[$key] = ['secret' => true, 'configured' => ($row['value'] ?? '') !== ''];
            } else {
                $out[$key] = $row['value'];
            }
        }
        foreach (self::SECRET_KEYS as $k) {
            $out[$k] ??= ['secret' => true, 'configured' => false];
        }
        return $out;
    }

    public function timezone(): \DateTimeZone
    {
        try {
            return new \DateTimeZone($this->get('business_timezone', 'UTC') ?: 'UTC');
        } catch (\Exception) {
            return new \DateTimeZone('UTC');
        }
    }

    public function googleClientIds(): array
    {
        return array_values(array_filter(array_map('trim', explode(',', (string) $this->get('google_client_ids', '')))));
    }
}
