<?php
declare(strict_types=1);

namespace OryzenX\Core;

/** File logger writing JSON lines to storage/logs (outside the web root). Context is redacted. */
final class Logger
{
    public static function log(string $level, string $message, array $context = []): void
    {
        $dir = Config::storagePath('logs');
        if (!is_dir($dir)) {
            @mkdir($dir, 0750, true);
        }
        $line = json_encode([
            'ts' => gmdate('c'),
            'level' => $level,
            'msg' => $message,
            'ctx' => Security::redact($context),
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
        @file_put_contents($dir . '/app-' . gmdate('Y-m-d') . '.log', $line, FILE_APPEND | LOCK_EX);
    }

    public static function error(string $m, array $c = []): void
    {
        self::log('error', $m, $c);
    }

    public static function warning(string $m, array $c = []): void
    {
        self::log('warning', $m, $c);
    }

    public static function info(string $m, array $c = []): void
    {
        self::log('info', $m, $c);
    }
}
