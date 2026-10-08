<?php
/**
 * HTTP response value object. Controllers return one; index.php sends it.
 */
final class Response
{
    public function __construct(
        public string $body = '',
        public int $status = 200,
        public array $headers = []
    ) {
    }

    public static function html(string $html, int $status = 200, array $headers = []): self
    {
        return new self($html, $status, $headers + ['Content-Type' => 'text/html; charset=utf-8']);
    }

    public static function json(array $payload, int $status = 200, array $headers = []): self
    {
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        return new self($body ?: '{"success":false}', $status, $headers + [
            'Content-Type'  => 'application/json; charset=utf-8',
            'Cache-Control' => 'no-store',
        ]);
    }

    /** Standard success envelope: {success, message, data}. */
    public static function success(string $message = 'সফল হয়েছে', array $data = [], int $status = 200): self
    {
        return self::json(['success' => true, 'message' => $message, 'data' => (object)$data], $status);
    }

    /** Standard error envelope: {success:false, message[, errors]}. */
    public static function error(string $message, int $status = 400, array $errors = []): self
    {
        $payload = ['success' => false, 'message' => $message];
        if ($errors) {
            $payload['errors'] = $errors;
        }
        return self::json($payload, $status);
    }

    public static function redirect(string $url, int $status = 302): self
    {
        if (Request::current()->expectsJson()) {
            return self::json(['success' => true, 'redirect' => $url]);
        }
        return new self('', $status, ['Location' => $url]);
    }

    public static function text(string $text, string $type = 'text/plain', array $headers = []): self
    {
        return new self($text, 200, $headers + ['Content-Type' => $type . '; charset=utf-8']);
    }

    public function withHeader(string $name, string $value): self
    {
        $this->headers[$name] = $value;
        return $this;
    }

    public function send(): void
    {
        if (!headers_sent()) {
            http_response_code($this->status);
            foreach ($this->headers as $name => $value) {
                header($name . ': ' . $value);
            }
        }
        echo $this->body;
    }
}
