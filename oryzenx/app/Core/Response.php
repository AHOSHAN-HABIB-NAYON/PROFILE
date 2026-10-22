<?php
declare(strict_types=1);

namespace OryzenX\Core;

final class Response
{
    private array $headers = [];
    private array $cookies = [];

    public function __construct(
        public string $body = '',
        public int $status = 200,
        array $headers = []
    ) {
        foreach ($headers as $k => $v) {
            $this->headers[$k] = $v;
        }
    }

    public static function json(mixed $data, int $status = 200): self
    {
        return new self(
            (string) json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION),
            $status,
            ['Content-Type' => 'application/json; charset=utf-8', 'Cache-Control' => 'no-store']
        );
    }

    public static function ok(mixed $data = null, array $meta = []): self
    {
        $out = ['ok' => true, 'data' => $data];
        if ($meta) {
            $out['meta'] = $meta;
        }
        return self::json($out);
    }

    public static function error(string $code, string $message, int $status = 400, array $fields = []): self
    {
        $out = ['ok' => false, 'error' => ['code' => $code, 'message' => $message]];
        if ($fields) {
            $out['error']['fields'] = $fields;
        }
        return self::json($out, $status);
    }

    public static function html(string $html, int $status = 200): self
    {
        return new self($html, $status, ['Content-Type' => 'text/html; charset=utf-8']);
    }

    public static function redirect(string $url, int $status = 302): self
    {
        return new self('', $status, ['Location' => $url]);
    }

    public function header(string $name, string $value): self
    {
        $this->headers[$name] = $value;
        return $this;
    }

    public function getHeader(string $name): ?string
    {
        return $this->headers[$name] ?? null;
    }

    public function cookie(string $name, string $value, array $opts = []): self
    {
        $this->cookies[] = [$name, $value, $opts];
        return $this;
    }

    public function cookies(): array
    {
        return $this->cookies;
    }

    public function send(): void
    {
        if (!headers_sent()) {
            http_response_code($this->status);
            foreach ($this->headers as $k => $v) {
                header($k . ': ' . $v);
            }
            foreach ($this->cookies as [$name, $value, $opts]) {
                setcookie($name, $value, $opts);
            }
        }
        echo $this->body;
    }
}
