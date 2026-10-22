<?php
declare(strict_types=1);

namespace OryzenX\Core;

/**
 * Minimal router. Routes are declared in routes/*.php as
 *   $r->get('/api/assets/{id:\d+}', [Controller::class, 'method'], ['auth' => true]);
 * Options: auth (bool), verified (bool), perm (string permission), csrf (bool, default true for writes),
 *          guest_csrf (bool) for anonymous form posts.
 */
final class Router
{
    private array $routes = [];

    public function add(string $method, string $pattern, callable|array $handler, array $opts = []): void
    {
        $regex = preg_replace_callback('/\{(\w+)(?::([^}]+))?\}/', function ($m) {
            $re = $m[2] ?? '[^/]+';
            return '(?P<' . $m[1] . '>' . $re . ')';
        }, $pattern);
        $this->routes[] = [$method, '#^' . $regex . '$#', $handler, $opts, $pattern];
    }

    public function get(string $p, callable|array $h, array $o = []): void
    {
        $this->add('GET', $p, $h, $o);
    }

    public function post(string $p, callable|array $h, array $o = []): void
    {
        $this->add('POST', $p, $h, $o);
    }

    public function put(string $p, callable|array $h, array $o = []): void
    {
        $this->add('PUT', $p, $h, $o);
    }

    public function patch(string $p, callable|array $h, array $o = []): void
    {
        $this->add('PATCH', $p, $h, $o);
    }

    public function delete(string $p, callable|array $h, array $o = []): void
    {
        $this->add('DELETE', $p, $h, $o);
    }

    /** @return array{0:callable|array,1:array,2:array}|null handler, params, options */
    public function match(string $method, string $path): ?array
    {
        $allowed = false;
        foreach ($this->routes as [$m, $regex, $handler, $opts]) {
            if (preg_match($regex, $path, $mm)) {
                if ($m !== $method && !($method === 'HEAD' && $m === 'GET')) {
                    $allowed = true;
                    continue;
                }
                $params = array_filter($mm, 'is_string', ARRAY_FILTER_USE_KEY);
                return [$handler, $params, $opts];
            }
        }
        if ($allowed) {
            throw new HttpException(405, 'method_not_allowed', 'Method not allowed.');
        }
        return null;
    }

    public function routes(): array
    {
        return $this->routes;
    }
}
