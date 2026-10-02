<?php
abstract class BaseCourier implements CourierDriver
{
    protected array $extra;

    public function __construct(protected array $account)
    {
        $this->extra = json_decode((string) ($account['extra'] ?? ''), true) ?: [];
    }

    protected function base(string $default): string
    {
        return rtrim((string) ($this->account['base_url'] ?: $default), '/');
    }

    protected function errorFrom(array $res): string
    {
        $j = $res['json'] ?? [];
        $msg = $j['message'] ?? $j['error'] ?? ($j['errors'] ?? null);
        if (is_array($msg)) {
            $msg = implode(', ', array_map(static fn ($m) => is_array($m) ? implode(', ', $m) : (string) $m, $msg));
        }
        return (string) ($msg ?: ($res['error'] ?: 'HTTP ' . $res['status']));
    }
}
