<?php
/**
 * Minimal regex router with named params ({slug}, {id:\d+}) and per-route middleware.
 */
final class Router
{
    private array $routes = [];
    private array $groupMiddleware = [];
    private string $groupPrefix = '';

    public function get(string $path, callable|array $handler, array $middleware = []): void
    {
        $this->add(['GET', 'HEAD'], $path, $handler, $middleware);
    }

    public function post(string $path, callable|array $handler, array $middleware = []): void
    {
        $this->add(['POST'], $path, $handler, $middleware);
    }

    public function group(string $prefix, array $middleware, callable $register): void
    {
        $prevPrefix = $this->groupPrefix;
        $prevMw = $this->groupMiddleware;
        $this->groupPrefix .= $prefix;
        $this->groupMiddleware = array_merge($this->groupMiddleware, $middleware);
        $register($this);
        $this->groupPrefix = $prevPrefix;
        $this->groupMiddleware = $prevMw;
    }

    private function add(array $methods, string $path, callable|array $handler, array $middleware): void
    {
        $full = rtrim($this->groupPrefix . $path, '/') ?: '/';
        $regex = preg_replace_callback('/\{(\w+)(?::([^}]+))?\}/', static function ($m) {
            return '(?P<' . $m[1] . '>' . ($m[2] ?? '[^/]+') . ')';
        }, $full);
        $this->routes[] = [
            'methods'    => $methods,
            'regex'      => '#^' . $regex . '$#u',
            'handler'    => $handler,
            'middleware' => array_merge($this->groupMiddleware, $middleware),
        ];
    }

    public function dispatch(Request $request): Response
    {
        $allowed = false;
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $request->path, $m)) {
                continue;
            }
            if (!in_array($request->method, $route['methods'], true)) {
                $allowed = true;
                continue;
            }
            $request->params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
            foreach ($route['middleware'] as $mw) {
                $result = Middleware::run($mw, $request);
                if ($result instanceof Response) {
                    return $result;
                }
            }
            $handler = $route['handler'];
            if (is_array($handler)) {
                [$class, $method] = $handler;
                $handler = [new $class(), $method];
            }
            $result = $handler($request, ...array_values($request->params));
            return $result instanceof Response ? $result : Response::html((string)$result);
        }
        throw new HttpException($allowed ? 405 : 404);
    }
}
