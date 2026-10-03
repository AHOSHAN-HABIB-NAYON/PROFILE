<?php
/** Minimal clean-URL router with middleware and named params: /news/{id:\d+} */
final class Router
{
    private array $routes = [];
    private array $group = ['prefix' => '', 'mw' => []];

    public function add(string $methods, string $pattern, callable|array $handler, array $mw = []): void
    {
        $pattern = rtrim($this->group['prefix'] . $pattern, '/') ?: '/';
        $regex = preg_replace_callback('/\{(\w+)(?::((?:[^{}]|\{\d+(?:,\d*)?\})+))?\}/', fn($m) => '(?P<' . $m[1] . '>' . ($m[2] ?? '[^/]+') . ')', $pattern);
        foreach (explode('|', $methods) as $m) {
            $this->routes[$m][] = ['re' => '#^' . $regex . '$#u', 'h' => $handler, 'mw' => [...$this->group['mw'], ...$mw]];
        }
    }

    public function get(string $p, callable|array $h, array $mw = []): void { $this->add('GET', $p, $h, $mw); }
    public function post(string $p, callable|array $h, array $mw = []): void { $this->add('POST', $p, $h, $mw); }

    public function group(string $prefix, array $mw, callable $fn): void
    {
        $prev = $this->group;
        $this->group = ['prefix' => $prev['prefix'] . $prefix, 'mw' => [...$prev['mw'], ...$mw]];
        $fn($this);
        $this->group = $prev;
    }

    public function dispatch(string $method, string $path): void
    {
        $path = '/' . trim(rawurldecode($path), '/');
        if ($method === 'HEAD') $method = 'GET';
        foreach ($this->routes[$method] ?? [] as $r) {
            if (!preg_match($r['re'], $path, $m)) continue;
            $params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
            foreach ($r['mw'] as $mw) Middleware::run($mw);
            if ($method === 'POST') Csrf::verify();
            $h = $r['h'];
            if (is_array($h)) { [$cls, $fn] = $h; (new $cls())->$fn(...$params); }
            else $h(...$params);
            return;
        }
        // Same path with another method?
        foreach ($this->routes as $m => $list) {
            if ($m === $method) continue;
            foreach ($list as $r) if (preg_match($r['re'], $path)) throw new HttpException(t('error.method'), 405);
        }
        throw new HttpException(t('error.404'), 404);
    }
}
