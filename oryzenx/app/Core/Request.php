<?php
declare(strict_types=1);

namespace OryzenX\Core;

final class Request
{
    public array $params = [];
    private ?array $jsonBody = null;
    /** @var array<string,mixed> request-scoped attributes (auth user, session, ...) */
    public array $attrs = [];

    public function __construct(
        public readonly string $method,
        public readonly string $path,
        public readonly array $query,
        public readonly array $post,
        public readonly array $server,
        public readonly array $cookies,
        public readonly array $files,
        private readonly string $rawBody = ''
    ) {
    }

    public static function fromGlobals(): self
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';
        $path = '/' . trim(rawurldecode($path), '/');
        // Support installs in a sub-directory (base_path in config).
        $base = rtrim((string) Config::get('base_path', ''), '/');
        if ($base !== '' && str_starts_with($path, $base)) {
            $path = '/' . ltrim(substr($path, strlen($base)), '/');
        }
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        return new self(
            $method,
            $path,
            $_GET,
            $_POST,
            $_SERVER,
            $_COOKIE,
            $_FILES,
            (string) file_get_contents('php://input')
        );
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        if ($name === 'Content-Type') {
            return $this->server['CONTENT_TYPE'] ?? $this->server[$key] ?? null;
        }
        if ($name === 'Authorization') {
            return $this->server['HTTP_AUTHORIZATION'] ?? $this->server['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
        }
        return $this->server[$key] ?? null;
    }

    public function json(): array
    {
        if ($this->jsonBody === null) {
            $ct = (string) $this->header('Content-Type');
            if (str_contains($ct, 'application/json') && $this->rawBody !== '') {
                $decoded = json_decode($this->rawBody, true, 32);
                $this->jsonBody = is_array($decoded) ? $decoded : [];
            } else {
                $this->jsonBody = $this->post;
            }
        }
        return $this->jsonBody;
    }

    /** Input value from JSON body/form, then query string. */
    public function input(string $key, mixed $default = null): mixed
    {
        $body = $this->json();
        if (array_key_exists($key, $body)) {
            return $body[$key];
        }
        return $this->query[$key] ?? $default;
    }

    public function str(string $key, string $default = ''): string
    {
        $v = $this->input($key, $default);
        return is_scalar($v) ? trim((string) $v) : $default;
    }

    public function int(string $key, int $default = 0): int
    {
        $v = $this->input($key, $default);
        return is_numeric($v) ? (int) $v : $default;
    }

    public function bool(string $key, bool $default = false): bool
    {
        $v = $this->input($key, $default);
        if (is_bool($v)) {
            return $v;
        }
        return in_array(strtolower((string) $v), ['1', 'true', 'on', 'yes'], true);
    }

    public function ip(): string
    {
        // Only trust proxy headers when explicitly configured.
        if (Config::get('trust_proxy', false)) {
            $fwd = $this->server['HTTP_X_FORWARDED_FOR'] ?? '';
            if ($fwd !== '') {
                $ip = trim(explode(',', $fwd)[0]);
                if (filter_var($ip, FILTER_VALIDATE_IP)) {
                    return $ip;
                }
            }
        }
        return $this->server['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    public function userAgent(): string
    {
        return mb_substr((string) ($this->server['HTTP_USER_AGENT'] ?? ''), 0, 255);
    }

    public function isHttps(): bool
    {
        if (($this->server['HTTPS'] ?? '') !== '' && strtolower((string) $this->server['HTTPS']) !== 'off') {
            return true;
        }
        if (Config::get('trust_proxy', false) && ($this->server['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') {
            return true;
        }
        return false;
    }

    public function bearerToken(): ?string
    {
        $h = $this->header('Authorization');
        if ($h && preg_match('/^Bearer\s+([A-Za-z0-9._~-]{20,200})$/', $h, $m)) {
            return $m[1];
        }
        return null;
    }

    public function wantsJson(): bool
    {
        return str_starts_with($this->path, '/api/') || str_contains((string) $this->header('Accept'), 'application/json');
    }
}
