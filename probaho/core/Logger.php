<?php
/**
 * Server-side logging. Technical details never reach the browser.
 */
declare(strict_types=1);

final class Logger
{
    public static function write(string $level, string $message, array $context = []): void
    {
        $line = sprintf(
            "[%s] %s %s %s%s\n",
            date('Y-m-d H:i:s'),
            $level,
            $_SERVER['REQUEST_METHOD'] ?? 'CLI',
            $_SERVER['REQUEST_URI'] ?? '',
            ' :: ' . $message . ($context ? ' ' . json_encode($context, JSON_UNESCAPED_UNICODE) : '')
        );
        @file_put_contents(ROOT . '/storage/logs/app-' . date('Y-m') . '.log', $line, FILE_APPEND | LOCK_EX);
    }

    public static function error(Throwable $e): void
    {
        self::write('ERROR', get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine() . "\n" . $e->getTraceAsString());
    }

    public static function info(string $message, array $context = []): void
    {
        self::write('INFO', $message, $context);
    }
}
