<?php
/**
 * Tiny pattern router: "/products/{slug}" style placeholders.
 */
declare(strict_types=1);

final class Router
{
    /** @return array{0: ?array, 1: array} [route, params] */
    public static function match(array $routes, string $method, string $path): array
    {
        foreach ($routes as $pattern => $route) {
            [$m, $p] = explode(' ', $pattern, 2);
            if ($m !== 'ANY' && $m !== $method && !($m === 'GET' && $method === 'HEAD')) {
                continue;
            }
            $regex = '#^' . preg_replace('#\{([a-z_]+)\}#', '(?P<$1>[A-Za-z0-9_\-]+)', $p) . '$#';
            if (preg_match($regex, $path, $mm)) {
                return [$route, array_filter($mm, 'is_string', ARRAY_FILTER_USE_KEY)];
            }
        }
        return [null, []];
    }
}
