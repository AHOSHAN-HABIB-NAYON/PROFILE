<?php
/**
 * Immutable view of the current HTTP request.
 */
final class Request
{
    private static ?Request $current = null;

    public string $method;
    public string $path;
    public string $basePath;
    public array $query;
    private ?array $body = null;
    public array $params = [];

    private function __construct()
    {
        $this->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/index.php'));
        $script = PHP_SAPI !== 'cli-server' && str_ends_with($scriptName, '/index.php') ? dirname($scriptName) : '/';
        $this->basePath = $script === '/' || $script === '.' ? '' : rtrim($script, '/');
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $uri = rawurldecode($uri);
        if ($this->basePath !== '' && str_starts_with($uri, $this->basePath)) {
            $uri = substr($uri, strlen($this->basePath));
        }
        $uri = '/' . trim($uri, '/');
        $this->path = $uri;
        $this->query = $_GET;
    }

    public static function current(): Request
    {
        return self::$current ??= new Request();
    }

    public function input(?string $key = null, mixed $default = null): mixed
    {
        if ($this->body === null) {
            $type = $_SERVER['CONTENT_TYPE'] ?? '';
            if (str_contains($type, 'application/json')) {
                $raw = file_get_contents('php://input', false, null, 0, 2_000_000);
                $decoded = json_decode($raw ?: '[]', true);
                $this->body = is_array($decoded) ? $decoded : [];
            } else {
                $this->body = $_POST;
            }
        }
        if ($key === null) {
            return $this->body;
        }
        return $this->body[$key] ?? $default;
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->query[$key] ?? $default;
    }

    public function str(string $key, int $max = 500, bool $fromQuery = false): string
    {
        $v = $fromQuery ? $this->get($key, '') : $this->input($key, '');
        if (!is_scalar($v)) {
            return '';
        }
        return mb_substr(trim(clean_text((string)$v)), 0, $max);
    }

    public function int(string $key, int $default = 0, bool $fromQuery = false): int
    {
        $v = $fromQuery ? $this->get($key) : $this->input($key);
        return is_numeric($v) ? (int)$v : $default;
    }

    public function bool(string $key): bool
    {
        $v = $this->input($key);
        return in_array($v, [true, 1, '1', 'on', 'true', 'yes'], true);
    }

    public function file(string $key): ?array
    {
        $f = $_FILES[$key] ?? null;
        return is_array($f) && isset($f['error']) && $f['error'] !== UPLOAD_ERR_NO_FILE ? $f : null;
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return isset($_SERVER[$key]) ? (string)$_SERVER[$key] : null;
    }

    public function isSpa(): bool
    {
        return $this->header('X-SPA') === '1';
    }

    /** Speculative prefetch by the client router — must not count as a real view. */
    public function isPrefetch(): bool
    {
        return $this->header('X-Prefetch') === '1' || str_contains((string)$this->header('Sec-Purpose'), 'prefetch');
    }

    public function isAjax(): bool
    {
        return $this->header('X-Requested-With') === 'XMLHttpRequest' || $this->isSpa();
    }

    public function expectsJson(): bool
    {
        return $this->isAjax()
            || str_starts_with($this->path, '/api/')
            || str_contains($this->header('Accept') ?? '', 'application/json');
    }

    public function ip(): string
    {
        // Only trust Cloudflare's header when the request actually came through Cloudflare.
        $remote = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $cf = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? null;
        if ($cf && isset($_SERVER['HTTP_CF_RAY']) && filter_var($cf, FILTER_VALIDATE_IP)) {
            return $cf;
        }
        return filter_var($remote, FILTER_VALIDATE_IP) ? $remote : '0.0.0.0';
    }

    public function userAgent(): string
    {
        return mb_substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 400);
    }

    public function isSecure(): bool
    {
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
            || (int)($_SERVER['SERVER_PORT'] ?? 80) === 443;
    }

    public function fullUrl(): string
    {
        return base_url() . ($_SERVER['REQUEST_URI'] ?? '/');
    }

    public function sameOrigin(): bool
    {
        $origin = $this->header('Origin') ?? $this->header('Referer');
        if (!$origin) {
            return true; // Non-browser or privacy-stripped; CSRF token still required.
        }
        $host = parse_url($origin, PHP_URL_HOST);
        return $host !== null && strcasecmp($host, (string)($_SERVER['HTTP_HOST'] ?? '')) === 0
            || $host !== null && strcasecmp($host, (string)parse_url('http://' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST)) === 0;
    }
}
