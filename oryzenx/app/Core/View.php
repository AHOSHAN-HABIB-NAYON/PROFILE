<?php
declare(strict_types=1);

namespace OryzenX\Core;

/** Plain-PHP templates from resources/views with automatic escaping helper $e(). */
final class View
{
    public static function render(string $template, array $vars = []): string
    {
        $file = Config::basePath('resources/views/' . $template . '.php');
        if (!is_file($file) || str_contains($template, '..')) {
            throw new \RuntimeException('View not found');
        }
        $e = [Security::class, 'e'];
        extract($vars, EXTR_SKIP);
        ob_start();
        try {
            include $file;
            return (string) ob_get_clean();
        } catch (\Throwable $t) {
            ob_end_clean();
            throw $t;
        }
    }

    /** Versioned asset URL for cache-busting (filemtime based). */
    public static function asset(string $path): string
    {
        $file = Config::basePath('public/assets/' . ltrim($path, '/'));
        $v = is_file($file) ? substr(md5((string) filemtime($file)), 0, 8) : '0';
        $base = rtrim((string) Config::get('base_path', ''), '/');
        return $base . '/assets/' . ltrim($path, '/') . '?v=' . $v;
    }

    public static function url(string $path): string
    {
        $base = rtrim((string) Config::get('base_path', ''), '/');
        return $base . '/' . ltrim($path, '/');
    }
}
