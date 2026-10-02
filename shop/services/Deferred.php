<?php
/** Runs slow side-effects (Meta CAPI, fraud check) after the response is sent to the customer. */
final class Deferred
{
    private static array $tasks = [];

    public static function add(callable $task): void
    {
        self::$tasks[] = $task;
    }

    public static function has(): bool
    {
        return self::$tasks !== [];
    }

    public static function run(): void
    {
        if (!self::$tasks) {
            return;
        }
        ignore_user_abort(true);
        if (function_exists('fastcgi_finish_request')) {
            fastcgi_finish_request();
        } elseif (function_exists('litespeed_finish_request')) {
            litespeed_finish_request();
        }
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
