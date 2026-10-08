<?php
/**
 * Work that should run AFTER the response is delivered to the browser
 * (Meta CAPI calls, analytics counters, GeoIP lookups) so customers never wait.
 */
final class Deferred
{
    private static array $tasks = [];

    public static function add(callable $task): void
    {
        self::$tasks[] = $task;
    }

    public static function run(): void
    {
        if (!self::$tasks) {
            return;
        }
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } elseif (function_exists('litespeed_finish_request')) {
            litespeed_finish_request();
        } else {
            @ob_end_flush();
            @flush();
        }
        ignore_user_abort(true);
        foreach (self::$tasks as $task) {
            try {
                $task();
            } catch (Throwable $e) {
                Logger::error('Deferred task failed: ' . $e->getMessage());
            }
        }
        self::$tasks = [];
    }
}
