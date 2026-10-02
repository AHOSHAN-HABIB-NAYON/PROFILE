<?php
final class Router
{
    private array $routes = [];

    public function get(string $pattern, callable|array $handler): void  { $this->add('GET', $pattern, $handler); }
    public function post(string $pattern, callable|array $handler): void { $this->add('POST', $pattern, $handler); }

    public function add(string $method, string $pattern, callable|array $handler): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', rtrim($pattern, '/') ?: '/') . '$#u';
        $this->routes[$method][] = [$regex, $handler];
    }

    public function dispatch(string $method, string $path): void
    {
        $method = $method === 'HEAD' ? 'GET' : $method;
        foreach ($this->routes[$method] ?? [] as [$regex, $handler]) {
            if (preg_match($regex, $path, $m)) {
                $params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
                if (is_array($handler)) {
                    [$class, $action] = $handler;
                    (new $class())->$action(...array_values($params));
                } else {
                    $handler(...array_values($params));
                }
                return;
            }
        }
        // Allowed path but wrong method?
        foreach ($this->routes as $m => $list) {
            foreach ($list as [$regex]) {
                if ($m !== $method && preg_match($regex, $path)) {
                    http_response_code(405);
                    Response::fail('অনুমোদিত নয়।', [], 405);
                }
            }
        }
        Response::notFound();
    }
}
