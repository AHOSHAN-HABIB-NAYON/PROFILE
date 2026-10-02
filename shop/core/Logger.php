<?php
final class Logger
{
    private const SECRET_KEYS = '/(api[_-]?key|secret|token|password|pass|authorization|access_token)/i';

    public static function log(string $channel, string $message, array $context = []): void
    {
        $dir = BASE_PATH . '/storage/logs';
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        $line = sprintf("[%s] %s: %s %s\n", date('Y-m-d H:i:s'), strtoupper($channel), $message, $context ? json_encode(self::redact($context), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : '');
        @file_put_contents($dir . '/' . preg_replace('/[^a-z]/', '', $channel) . '-' . date('Y-m-d') . '.log', $line, FILE_APPEND | LOCK_EX);
    }

    public static function error(string $m, array $c = []): void    { self::log('error', $m, $c); }
    public static function security(string $m, array $c = []): void { self::log('security', $m, $c); }
    public static function courier(string $m, array $c = []): void  { self::log('courier', $m, $c); }
    public static function api(string $m, array $c = []): void      { self::log('api', $m, $c); }
    public static function order(string $m, array $c = []): void    { self::log('order', $m, $c); }

    /** Never write credentials to disk. */
    public static function redact(mixed $data): mixed
    {
        if (!is_array($data)) {
            return $data;
        }
        foreach ($data as $k => $v) {
            if (is_string($k) && preg_match(self::SECRET_KEYS, $k)) {
                $data[$k] = '***';
            } elseif (is_array($v)) {
                $data[$k] = self::redact($v);
            }
        }
        return $data;
    }
}
