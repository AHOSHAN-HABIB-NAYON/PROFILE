<?php
/**
 * Shared courier plumbing: credential access, HTTP calls, defaults for
 * unsupported operations and courier → order status normalization.
 */
abstract class AbstractCourier implements CourierPluginInterface
{
    protected array $credentials = [];
    protected array $settings = [];

    public function configure(array $credentials, array $settings): void
    {
        $this->credentials = $credentials;
        $this->settings = $settings;
    }

    public function settingFields(): array
    {
        return [];
    }

    protected function cred(string $key): string
    {
        return trim((string)($this->credentials[$key] ?? ''));
    }

    protected function opt(string $key): string
    {
        $value = trim((string)($this->settings[$key] ?? ''));
        return $value !== '' ? $value : (string)($this->settingFields()[$key]['default'] ?? '');
    }

    protected function requireCreds(array $keys): ?CourierResult
    {
        foreach ($keys as $k) {
            if ($this->cred($k) === '') {
                return CourierResult::fail('Missing credential: ' . ($this->credentialFields()[$k]['label'] ?? $k));
            }
        }
        return null;
    }

    protected function http(string $method, string $url, array $options = []): array
    {
        $res = HttpClient::request($method, $url, $options + ['timeout' => 25]);
        if ($res['error']) {
            Logger::warning($this->slug() . ' courier network error', ['error' => $res['error']]);
        }
        return $res;
    }

    protected function apiError(array $res, string $fallback = 'Courier API error'): string
    {
        $j = $res['json'] ?? [];
        $msg = $j['message'] ?? ($j['error'] ?? ($j['errors'] ?? null));
        if (is_array($msg)) {
            $msg = implode('; ', array_map(static fn($m) => is_array($m) ? implode(', ', $m) : (string)$m, $msg));
        }
        return $msg ? (string)$msg : ($res['error'] ?: $fallback . ' (HTTP ' . $res['status'] . ')');
    }

    /** Normalized: pending | in_transit | delivered | cancelled | returned | unknown */
    public static function normalizeStatus(string $status): string
    {
        $s = strtolower($status);
        return match (true) {
            $s === '' => 'unknown',
            str_contains($s, 'partial') => 'in_transit',
            str_contains($s, 'deliver') && !str_contains($s, 'undeliver') && !str_contains($s, 'pending') => 'delivered',
            str_contains($s, 'return') => 'returned',
            str_contains($s, 'cancel') => 'cancelled',
            str_contains($s, 'transit') || str_contains($s, 'picked') || str_contains($s, 'hub') || str_contains($s, 'shipped') || str_contains($s, 'out-for') => 'in_transit',
            default => 'pending',
        };
    }

    public function checkStatus(array $courierOrder): CourierResult
    {
        return CourierResult::unsupported('status check');
    }

    public function trackingUrl(array $courierOrder): ?string
    {
        return null;
    }

    public function createOrder(array $parcel): CourierResult
    {
        return CourierResult::unsupported('order creation');
    }

    public function fraudCheck(string $phone): CourierResult
    {
        return CourierResult::unsupported('fraud check');
    }

    public function balance(): CourierResult
    {
        return CourierResult::unsupported('balance');
    }

    public function cancel(array $courierOrder): CourierResult
    {
        return CourierResult::unsupported('cancellation');
    }
}
